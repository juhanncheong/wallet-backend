const express = require("express");
const router = express.Router();

const OKX_BASE = "https://www.okx.com";

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

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

    // Throttle OKX calls
    const doBooks = now - lastBooksAt >= BOOKS_MS;
    const doTicker = now - lastTickerAt >= TICKER_MS;

    try {
      if (doTicker) {
        const t = await fetchTicker(instId);
        lastTickerAt = now;
        for (const res of e.clients) sseSend(res, "ticker", t);
      }
    } catch {
      // keep stream alive
      for (const res of e.clients) sseSend(res, "error", { message: "ticker_fetch_failed" });
    }

    try {
      if (doBooks) {
        const b = await fetchBooks(instId, sz);
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
  const instId = String(req.query.instId || "").toUpperCase();
  const sz = Math.max(1, Math.min(parseInt(req.query.sz || "20", 10) || 20, 50));

  if (!instId || !instId.includes("-")) {
    return res.status(400).json({ error: "Bad instId" });
  }

  sseInit(res);
  sseSend(res, "hello", { instId, sz });

  // Attach client
  let entry = spotStreams.get(instId);
  if (!entry) {
    entry = { clients: new Set(), sz, timer: null, hb: null };
    spotStreams.set(instId, entry);
    startLoop(instId);
  } else {
    // if new client requests bigger sz, upgrade stream depth (max across clients)
    entry.sz = Math.max(entry.sz, sz);
  }

  entry.clients.add(res);

  // Cleanup when client disconnects
  req.on("close", () => {
    const e = spotStreams.get(instId);
    if (!e) return;
    e.clients.delete(res);
    if (e.clients.size === 0) stopLoop(instId);
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

// ✅ GET /api/markets/candles?instId=BTC-USDT&bar=5m&limit=300
router.get("/candles", async (req, res) => {
  try {
    const instId = String(req.query.instId || "").toUpperCase();
    const bar = String(req.query.bar || "5m");

    const limit = Math.max(
      10,
      Math.min(parseInt(req.query.limit || "300", 10) || 300, 1000)
    );

    const after = req.query.after ? Number(req.query.after) : null;
    const before = req.query.before ? Number(req.query.before) : null;

    if (!instId || !instId.includes("-")) {
      return res.status(400).json({ error: "Bad instId" });
    }

    const okBar = /^[0-9]+(m|H|D|W|M)$/.test(bar);
    if (!okBar) {
      return res.status(400).json({ error: "Bad bar" });
    }

    const data = await fetchCandles(instId, bar, limit, after, before);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch OKX candles" });
  }
});

module.exports = router;
