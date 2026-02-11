const express = require("express");
const router = express.Router();
const OKX_BASE = "https://www.okx.com";

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

const pairMapping = require("../config/pairMapping");
const MarketOverride = require("../models/MarketOverride");

function mapToOkxInstId(requestedInstId) {
  return pairMapping[requestedInstId] || requestedInstId;
}

// ✅ Tickers list cache 
let cache = { ts: 0, rows: null };
const CACHE_MS = 2000;

// ✅ GET /api/markets/tickers?quote=USDT&limit=50
router.get("/tickers", async (req, res) => {
  try {
    const quote = String(req.query.quote || "USDT").toUpperCase();
    const limit = Math.max(
      1,
      Math.min(parseInt(req.query.limit || "50", 10) || 50, 200)
    );

    const now = Date.now();
    if (cache.rows && now - cache.ts < CACHE_MS) {
      return res.json({ data: cache.rows.slice(0, limit) });
    }

    const url = `${OKX_BASE}/api/v5/market/tickers?instType=SPOT`;
    const r = await fetchFn(url, { headers: { accept: "application/json" } });

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: "OKX tickers failed", status: r.status });
    }

    const j = await r.json();
    const arr = Array.isArray(j?.data) ? j.data : [];

    const rows = arr
      .filter(
        (t) => typeof t?.instId === "string" && t.instId.endsWith(`-${quote}`)
      )
      .map((t) => {
        const [base, q] = t.instId.split("-");
        const last = Number(t.last);
        const open24h = Number(t.open24h);

        const volQuote24h = Number(t.volCcy24h);

        const change24hPct =
          Number.isFinite(last) && Number.isFinite(open24h) && open24h > 0
            ? ((last - open24h) / open24h) * 100
            : null;

        return {
          instId: t.instId,
          base,
          quote: q,
          pair: `${base}/${q}`,
          price: Number.isFinite(last) ? last : null,
          change24hPct,
          volQuote24h: Number.isFinite(volQuote24h) ? volQuote24h : null,
        };
      })
      .sort((a, b) => (b.volQuote24h ?? 0) - (a.volQuote24h ?? 0));

    // Inject NEX-USDT (cloned from OKB-USDT) so it appears in Spot list
    const okb = rows.find((x) => x.instId === "OKB-USDT");
    if (okb) {
      const nex = {
        ...okb,
        instId: "NEX-USDT",
        base: "NEX",
        quote: "USDT",
        pair: "NEX/USDT",
      };
      // Put it on top so limit slicing doesn't remove it
      rows.unshift(nex);
    }

    cache = { ts: now, rows };
    res.json({ data: rows.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch OKX tickers" });
  }
});

// ======================================================
// ✅ ONE SSE endpoint for Spot page: ticker + orderbook
// ======================================================
//
// GET /api/markets/stream/spot?instId=BTC-USDT&sz=20
//
// Sends SSE events:
// - event: ticker  { instId, ts, last, open24h, high24h, low24h, volCcy24h, change24hPct }
// - event: books   { instId, ts, bids: [[p,s]...], asks: [[p,s]...] }
//
// Lightweight: shared loop per instId (not per user).
//

const spotStreams = new Map();
// instId -> {
//   clients: Set<res>,
//   sz: number,
//   timer: Timeout,
//   hb: Timeout,
//   lastPushTs: number
// }

function sseInit(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function sseSend(res, event, dataObj) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

function remapBooksToPrice(books, targetMid) {
  if (!books || !Array.isArray(books.bids) || !Array.isArray(books.asks)) return books;

  const bestBid = Number(books.bids?.[0]?.[0]);
  const bestAsk = Number(books.asks?.[0]?.[0]);
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return books;

  const sourceMid = (bestBid + bestAsk) / 2;
  if (!Number.isFinite(sourceMid) || sourceMid <= 0) return books;

  const ratio = targetMid / sourceMid;

  const mapSide = (side) =>
    side.map(([px, sz, ...rest]) => [String(Number(px) * ratio), sz, ...rest]);

  return {
    ...books,
    bids: mapSide(books.bids),
    asks: mapSide(books.asks),
  };
}

async function fetchTicker(instId) {
  const url = `${OKX_BASE}/api/v5/market/ticker?instId=${encodeURIComponent(
    instId
  )}`;
  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`OKX ticker failed ${r.status}`);
  const j = await r.json();
  const row = j?.data?.[0] || {};

  const last = Number(row.last);
  const open24h = Number(row.open24h);
  const high24h = Number(row.high24h);
  const low24h = Number(row.low24h);
  const volCcy24h = Number(row.volCcy24h);
  const ts = Number(row.ts) || Date.now();

  const change24hPct =
    Number.isFinite(last) && Number.isFinite(open24h) && open24h > 0
      ? ((last - open24h) / open24h) * 100
      : null;

  return {
    instId,
    ts,
    last: Number.isFinite(last) ? last : null,
    open24h: Number.isFinite(open24h) ? open24h : null,
    high24h: Number.isFinite(high24h) ? high24h : null,
    low24h: Number.isFinite(low24h) ? low24h : null,
    volCcy24h: Number.isFinite(volCcy24h) ? volCcy24h : null,
    change24hPct,
  };
}

async function fetchBooks(instId, sz) {
  const url = `${OKX_BASE}/api/v5/market/books?instId=${encodeURIComponent(
    instId
  )}&sz=${sz}`;
  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`OKX books failed ${r.status}`);

  const j = await r.json();
  const row = j?.data?.[0] || {};

  const bidsRaw = Array.isArray(row.bids) ? row.bids : [];
  const asksRaw = Array.isArray(row.asks) ? row.asks : [];

  const bids = bidsRaw
    .map((x) => [Number(x[0]), Number(x[1])])
    .filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]));
  const asks = asksRaw
    .map((x) => [Number(x[0]), Number(x[1])])
    .filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]));

  const ts = Number(row.ts) || Date.now();
  return { instId, ts, bids, asks };
}

function startLoop(instId) {
  const entry = spotStreams.get(instId);
  if (!entry) return;

  // Tuned for MVP: books more frequent than ticker
  const BOOKS_MS = 800;
  const TICKER_MS = 1200;

  let lastBooksAt = 0;
  let lastTickerAt = 0;

  const loop = async () => {
    const e = spotStreams.get(instId);
    if (!e || e.clients.size === 0) return;

    const now = Date.now();
    const sz = e.sz;

    const ov = await getActiveOverride(instId);
    const okxInstId = mapToOkxInstId(instId);
    // Throttle OKX calls
    const doBooks = now - lastBooksAt >= BOOKS_MS;
    const doTicker = now - lastTickerAt >= TICKER_MS;

    try {
      if (doTicker) {
        if (ov) {
          const p = Number(ov.fixedPrice);
          const t = {
            instId,
            last: String(p),
            open24h: String(p),
            high24h: String(p),
            low24h: String(p),
            volCcy24h: "0",
          };
          lastTickerAt = now;
          for (const res of e.clients) sseSend(res, "ticker", t);
        } else {
          const t = await fetchTicker(okxInstId);
          t.instId = instId;
          lastTickerAt = now;
          for (const res of e.clients) sseSend(res, "ticker", t);
        }
      }
    } catch {
      for (const res of e.clients) sseSend(res, "error", { message: "ticker_fetch_failed" });
    }

    try {
      if (doBooks) {
        const b = await fetchBooks(okxInstId, sz);
        b.instId = instId;

        if (ov) {
          const p = Number(ov.fixedPrice);
          const bestBid = Number(b?.bids?.[0]?.[0]);
          const bestAsk = Number(b?.asks?.[0]?.[0]);
          if (Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0) {
            const sourceMid = (bestBid + bestAsk) / 2;
            const ratio = p / sourceMid;

            const mapSide = (side) =>
              side.map(([px, qty, ...rest]) => [String(Number(px) * ratio), qty, ...rest]);

            b.bids = mapSide(b.bids);
            b.asks = mapSide(b.asks);
          }
        }

        lastBooksAt = now;
        for (const res of e.clients) sseSend(res, "books", b);
      }
    } catch {
      for (const res of e.clients) sseSend(res, "error", { message: "books_fetch_failed" });
    }
  };

  // Run quickly
  entry.timer = setInterval(loop, 300);

  // Heartbeat
  entry.hb = setInterval(() => {
    const e = spotStreams.get(instId);
    if (!e) return;
    for (const res of e.clients) res.write(`: ping\n\n`);
  }, 15000);
}

function stopLoop(instId) {
  const entry = spotStreams.get(instId);
  if (!entry) return;
  if (entry.timer) clearInterval(entry.timer);
  if (entry.hb) clearInterval(entry.hb);
  spotStreams.delete(instId);
}

// ✅ SSE: GET /api/markets/stream/spot?instId=BTC-USDT&sz=20
router.get("/stream/spot", (req, res) => {
  const requestedInstId = String(req.query.instId || "").toUpperCase();
  const okxInstId = mapToOkxInstId(requestedInstId);
  const sz = Math.max(1, Math.min(parseInt(req.query.sz || "20", 10) || 20, 50));

  if (!requestedInstId || !requestedInstId.includes("-")) {
    return res.status(400).json({ error: "Bad instId" });
  }

  sseInit(res);
    sseSend(res, "hello", { requestedInstId: requestedInstId, sz });

  // Attach client
  let entry = spotStreams.get(requestedInstId);
  if (!entry) {
    entry = { clients: new Set(), sz, timer: null, hb: null };
    spotStreams.set(requestedInstId, entry);
    startLoop(requestedInstId);
  } else {
    // if new client requests bigger sz, upgrade stream depth (max across clients)
    entry.sz = Math.max(entry.sz, sz);
  }

  entry.clients.add(res);

  // Cleanup when client disconnects
  req.on("close", () => {
    const e = spotStreams.get(requestedInstId);
    if (!e) return;
    e.clients.delete(res);
    if (e.clients.size === 0) stopLoop(requestedInstId);
  });
});

async function fetchCandles(instId, bar, limit, after, before) {
  // OKX: /api/v5/market/candles?instId=BTC-USDT&bar=5m&limit=200
  const qp = new URLSearchParams();
  qp.set("instId", instId);
  qp.set("bar", bar);
  qp.set("limit", String(limit));

  // Optional pagination (OKX supports after/before as timestamps in ms)
  if (after) qp.set("after", String(after));
  if (before) qp.set("before", String(before));

  const url = `${OKX_BASE}/api/v5/market/candles?${qp.toString()}`;
  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`OKX candles failed ${r.status}`);

  const j = await r.json();
  const rows = Array.isArray(j?.data) ? j.data : [];

  // OKX candles format (array of arrays):
  // [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
  // Lightweight Charts wants:
  // { time: UNIX_SECONDS, open, high, low, close, volume }
  const out = rows
    .map((x) => {
      const tsMs = Number(x[0]);
      const o = Number(x[1]);
      const h = Number(x[2]);
      const l = Number(x[3]);
      const c = Number(x[4]);
      const v = Number(x[5]);

      if (![tsMs, o, h, l, c].every(Number.isFinite)) return null;
      return {
        time: Math.floor(tsMs / 1000), // seconds
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) ? v : undefined,
      };
    })
    .filter(Boolean)
    // OKX often returns newest -> oldest, chart wants oldest -> newest
    .sort((a, b) => a.time - b.time);

  return { instId, bar, candles: out };
}

async function getActiveOverride(instId) {
  if (instId !== "NEX-USDT") return null;
  const doc = await MarketOverride.findOne({ instId: "NEX-USDT", isActive: true }).lean();
  if (!doc) return null;
  if (doc.endAt && new Date(doc.endAt).getTime() <= Date.now()) return null;
  return doc;
}

// ✅ GET /api/markets/candles?instId=BTC-USDT&bar=5m&limit=300
router.get("/candles", async (req, res) => {
  try {
    const requestedInstId = String(req.query.instId || "").toUpperCase();
    const okxInstId = mapToOkxInstId(requestedInstId);
    const bar = String(req.query.bar || "5m");

    const limit = Math.max(
      10,
      Math.min(parseInt(req.query.limit || "300", 10) || 300, 1000)
    );

    const after = req.query.after ? Number(req.query.after) : null;
    const before = req.query.before ? Number(req.query.before) : null;

    if (!requestedInstId || !requestedInstId.includes("-")) {
      return res.status(400).json({ error: "Bad instId" });
    }

    const okBar = /^[0-9]+(m|H|D|W|M)$/.test(bar);
    if (!okBar) {
      return res.status(400).json({ error: "Bad bar" });
    }

    // If admin override is active for NEX-USDT, return override candles (no OKX call)
    const ov = await getActiveOverride(requestedInstId);
    if (ov) {
      const price = Number(ov.fixedPrice);
      const wickPct = Number(ov.wickPct || 0.001);
      const nowSec = Math.floor(Date.now() / 1000);

      const barSec =
        bar === "1m" ? 60 :
        bar === "15m" ? 900 :
        (bar === "1H" || bar === "1h") ? 3600 :
        (bar === "4H" || bar === "4h") ? 14400 :
        (bar === "1D" || bar === "1d") ? 86400 :
        60;

      const end = nowSec - (nowSec % barSec);
      const out = [];

      for (let i = limit - 1; i >= 0; i--) {
        const t = end - i * barSec;
        const wiggle = price * wickPct;
        const high = price + (Math.random() * wiggle);
        const low = price - (Math.random() * wiggle);

        out.push({ time: t, open: price, high, low, close: price, volume: 0 });
      }

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      return res.json({ data: { instId: requestedInstId, bar, candles: out } });
    }

    const data = await fetchCandles(okxInstId, bar, limit, after, before);
    data.instId = requestedInstId;

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch OKX candles" });
  }
});

module.exports = router;
