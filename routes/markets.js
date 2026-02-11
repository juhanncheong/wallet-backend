const express = require("express");
const router = express.Router();
const OKX_BASE = "https://www.okx.com";

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

const pairMapping = require("../config/pairMapping");
const MarketOverride = require("../models/MarketOverride");
const SyntheticCandle = require("../models/SyntheticCandle");

const candleMem = new Map(); // instId -> { t, o,h,l,c, v }
const lastDbWrite = new Map(); // instId -> ms

function round2(x) {
  return Math.round(x * 100) / 100;
}

async function recordSyntheticTick(instId, price, wickPct = 0.001) {
  // store only NEX
  if (instId !== "NEX-USDT") return;

  const nowMs = Date.now();
  const bucketSec = Math.floor(nowMs / 1000 / 60) * 60; // 1m bucket start in seconds
  const p = round2(Number(price));
  if (!Number.isFinite(p) || p <= 0) return;

  // update in-memory current candle
  let c = candleMem.get(instId);
  if (!c || c.t !== bucketSec) {
    c = { instId, tf: "1m", t: bucketSec, o: p, h: p, l: p, c: p, v: 0 };
    candleMem.set(instId, c);
  } else {
    c.h = Math.max(c.h, p);
    c.l = Math.min(c.l, p);
    c.c = p;
  }

  // add tiny “natural” wick noise so it doesn't look dead-flat
  const wiggle = Math.max(0, p * Number(wickPct || 0));
  if (wiggle > 0) {
    c.h = Math.max(c.h, round2(p + Math.random() * wiggle));
    c.l = Math.min(c.l, round2(p - Math.random() * wiggle));
  }

  // throttle DB writes (every ~2s per instId)
  const last = lastDbWrite.get(instId) || 0;
  if (nowMs - last < 2000) return;
  lastDbWrite.set(instId, nowMs);

  // upsert candle into Mongo (keeps open on first insert, updates high/low/close)
  await SyntheticCandle.updateOne(
    { instId, tf: "1m", t: bucketSec },
    {
      $setOnInsert: { o: c.o, v: 0 },
      $max: { h: c.h },
      $min: { l: c.l },
      $set: { c: c.c },
    },
    { upsert: true }
  ).catch(() => {});
}

// In-memory micro price state for override (random walk)
const overrideLive = new Map(); // instId -> { price, dir }

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function barToSec(bar) {
  const b = String(bar);
  if (b === "1m") return 60;
  if (b === "15m") return 900;
  if (b === "1H" || b === "1h") return 3600;
  if (b === "4H" || b === "4h") return 14400;
  if (b === "1D" || b === "1d") return 86400;
  return 60;
}

function aggregateCandlesFrom1m(oneMinCandles, barSec) {
  // input candles must be sorted ASC by time (seconds)
  const out = [];
  let cur = null;

  for (const c of oneMinCandles) {
    const bucket = c.time - (c.time % barSec);
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: (c.volume ?? 0),
      };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume = (cur.volume ?? 0) + (c.volume ?? 0);
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function loadSynthetic1m(instId, startSec, endSec) {
  // Only NEX has synthetics
  if (instId !== "NEX-USDT") return [];

  const docs = await SyntheticCandle.find(
    { instId, tf: "1m", t: { $gte: startSec, $lte: endSec } },
    { _id: 0, t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }
  )
    .sort({ t: 1 })
    .lean();

  return docs.map(d => ({
    time: d.t,
    open: d.o,
    high: d.h,
    low: d.l,
    close: d.c,
    volume: d.v ?? 0,
  }));
}

function overlayCandles(baseCandles, syntheticCandles) {
  // replace base candles by timestamp if synthetic has that bucket
  const m = new Map(baseCandles.map(c => [c.time, c]));
  for (const sc of syntheticCandles) m.set(sc.time, sc);
  return Array.from(m.values()).sort((a, b) => a.time - b.time);
}

// Returns a dynamic price within [base, base + band] using a random walk
function getDynamicOverridePrice(instId, base, band) {
  const key = instId;
  const min = base;
  const max = base + band;

  let st = overrideLive.get(key);
  if (!st || !Number.isFinite(st.price)) {
    st = { price: base, dir: 1 };
  }

  // step size: 0.01–0.06 (1–6 cents) per tick feels alive
  const step = (Math.random() * 0.05) + 0.01;

  // random direction flips sometimes
  if (Math.random() < 0.25) st.dir *= -1;

  let next = st.price + st.dir * step;

  // bounce off edges
  if (next >= max) { next = max; st.dir = -1; }
  if (next <= min) { next = min; st.dir = 1; }

  // keep 2 decimals
  next = Math.round(next * 100) / 100;

  st.price = clamp(next, min, max);
  overrideLive.set(key, st);

  return st.price;
}

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
          const base = Number(ov.fixedPrice);
          const p = getDynamicOverridePrice(instId, base, 0.50); // 50 cents band
          await recordSyntheticTick(instId, p, ov.wickPct);
          const t = {
            instId,
            last: String(p),
            open24h: String(p),
            high24h: String(p),
            low24h: String(p),
            volCcy24h: "0",
          };

          const blend = await getBlendState(instId);
           if (blend) {
             const base = Number(blend.doc.fixedPrice);         // override base
             const from = clamp(base + 0.25, base, base + 0.50); // start near middle of band
             const to = Number(t.last);                         // OKX current last
             const k = clamp((blend.nowMs - blend.endMs) / blend.blendMs, 0, 1);
             const p = round2(from + (to - from) * k);

             await recordSyntheticTick(instId, p, blend.doc.wickPct);

             // overwrite ticker last with blended p so UI matches candles
             t.last = String(p);
             t.open24h = t.open24h ?? String(p);
           }

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
          const base = Number(ov.fixedPrice);
          const p = getDynamicOverridePrice(instId, base, 0.50);
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

async function getBlendState(instId) {
  if (instId !== "NEX-USDT") return null;

  // last known override doc (even if inactive)
  const doc = await MarketOverride.findOne({ instId: "NEX-USDT" }).lean();
  if (!doc?.endAt || !doc?.startAt) return null;

  const endMs = new Date(doc.endAt).getTime();
  const nowMs = Date.now();
  if (nowMs <= endMs) return null;

  const blendMin = Number(doc.blendMinutes || 5);
  const blendMs = blendMin * 60 * 1000;

  // only blend within window
  if (nowMs > endMs + blendMs) return null;

  return { doc, endMs, nowMs, blendMs };
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

    const data = await fetchCandles(okxInstId, bar, limit, after, before);
    data.instId = requestedInstId;

     const barSec = barToSec(bar);

    // Overlay synthetic candles (persisted 1m) onto cloned OKX candles for NEX
    if (requestedInstId === "NEX-USDT" && data?.candles?.length) {
      const startSec = data.candles[0].time - (data.candles[0].time % 60);
      const endSec = data.candles[data.candles.length - 1].time;

      const syn1m = await loadSynthetic1m("NEX-USDT", startSec, endSec);

      if (syn1m.length) {
        const synAgg =
          barSec === 60 ? syn1m : aggregateCandlesFrom1m(syn1m, barSec);

        // synthetic buckets replace base buckets
        data.candles = overlayCandles(data.candles, synAgg);
      }
    }
   
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch OKX candles" });
  }
});

module.exports = router;
