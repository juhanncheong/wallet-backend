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

  // ✅ fake volume per tick (small random)
  const addV = 1 + Math.floor(Math.random() * 5);
  c.v = (c.v ?? 0) + addV;

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
      $inc: { v: addV },
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

// Returns a dynamic price within [base - band/2, base + band/2]
function getDynamicOverridePrice(instId, base, ov) {
  const band = Number(ov?.band ?? 0.5);
  const half = Math.max(0.01, band / 2);

  const min = base - half;
  const max = base + half;

  let st = overrideLive.get(instId);
  if (!st || !Number.isFinite(st.price)) st = { price: base, dir: 1 };

  const stepMin = Number(ov?.stepMin ?? 0.01);
  const stepMax = Number(ov?.stepMax ?? 0.06);
  const flipProb = Number(ov?.flipProb ?? 0.25);
  const meanRevert = Number(ov?.meanRevert ?? 0.15);
  const shockProb = Number(ov?.shockProb ?? 0.02);
  const shockSize = Number(ov?.shockSize ?? 0.25);

  if (Math.random() < flipProb) st.dir *= -1;

  const step = stepMin + Math.random() * Math.max(0.001, (stepMax - stepMin));
  let next = st.price + st.dir * step;

  next = next + (base - next) * meanRevert;

  if (Math.random() < shockProb) {
    next += (Math.random() < 0.5 ? -1 : 1) * (shockSize * (0.6 + Math.random() * 0.8));
  }

  if (next >= max) { next = max; st.dir = -1; }
  if (next <= min) { next = min; st.dir = 1; }

  next = Math.round(next * 100) / 100;
  st.price = clamp(next, min, max);

  overrideLive.set(instId, st);
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

    const doBooks = now - lastBooksAt >= BOOKS_MS;
    const doTicker = now - lastTickerAt >= TICKER_MS;

    // -------------------------
    // TICKER
    // -------------------------
    try {
      if (doTicker) {
        if (ov) {
          const target = Number(ov.fixedPrice);
          if (!Number.isFinite(target) || target <= 1) return;

         let start = Number(ov.startPrice);
         if (!Number.isFinite(start)) {
           const cached = overrideLive.get(instId)?.price;
           if (Number.isFinite(cached) && cached > 1) start = cached;

           if (!Number.isFinite(start)) {
             try {
               const tOkx = await fetchTicker(okxInstId);
               start = Number(tOkx?.last);
             } catch {}
           }
           if (!Number.isFinite(start) || start <= 1) start = target;

           await MarketOverride.updateOne(
            
             { instId, isActive: true },
             { $set: { startPrice: start } }
           ).catch(() => {});
         }

         // ✅ Reset micro-state when a NEW override session starts (prevents old state spikes)
         const live = overrideLive.get(instId);
           if (!live?.ovStartAt || live.ovStartAt !== String(ov.startAt)) {
            overrideLive.set(instId, { price: start, dir: 1, ovStartAt: String(ov.startAt) });
          }

          // Progress across the whole override window (minutes)
          const t0 = ov.startAt ? new Date(ov.startAt).getTime() : now;
          const t1 = ov.endAt ? new Date(ov.endAt).getTime() : (t0 + 60_000);
          const k = clamp((now - t0) / Math.max(1, (t1 - t0)), 0, 1);

          // Ease for a natural trend (no robotic linear)
          const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

          // Moving base (this is what prevents 1 big candle)
          const base = round2(start + (target - start) * eased);

          // Add micro realism around the moving base
          const p = getDynamicOverridePrice(instId, base, ov);

          await recordSyntheticTick(instId, p, ov.wickPct);

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
          // Normal OKX ticker
          const tOkx = await fetchTicker(okxInstId);
          tOkx.instId = instId;

          // After override ends: blend synthetic -> OKX over blendMinutes
          const blend = await getBlendState(instId);
          if (blend) {
            const from = overrideLive.get(instId)?.price ?? Number(blend.doc.fixedPrice);
            const to = Number(tOkx.last);

            if (Number.isFinite(to)) {
              const k = clamp((blend.nowMs - blend.endMs) / blend.blendMs, 0, 1);
              const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              const p = round2(from + (to - from) * eased);

              await recordSyntheticTick(instId, p, blend.doc.wickPct);

              // overwrite ticker shown to UI so line + candle match
              tOkx.last = String(p);
              if (tOkx.open24h == null) tOkx.open24h = String(p);
              if (tOkx.high24h == null) tOkx.high24h = String(p);
              if (tOkx.low24h == null) tOkx.low24h = String(p);
            }
          }

          lastTickerAt = now;
          for (const res of e.clients) sseSend(res, "ticker", tOkx);
        }
      }
    } catch {
      for (const res of e.clients) sseSend(res, "error", { message: "ticker_fetch_failed" });
    }

    // -------------------------
    // BOOKS
    // -------------------------
    try {
      if (doBooks) {
        const b = await fetchBooks(okxInstId, sz);
        b.instId = instId;

        if (ov) {
          // During override: follow latest synthetic price (so books match ticker)
          const p = overrideLive.get(instId)?.price ?? Number(ov.fixedPrice);
          const remapped = remapBooksToPrice(b, p);
          b.bids = remapped.bids;
          b.asks = remapped.asks;
        } else {
          // During blend window: remap books to blended mid too (so no snap)
          const blend = await getBlendState(instId);
          if (blend) {
            const from = overrideLive.get(instId)?.price ?? Number(blend.doc.fixedPrice);

            const bestBid = Number(b?.bids?.[0]?.[0]);
            const bestAsk = Number(b?.asks?.[0]?.[0]);
            const okxMid =
              Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0
                ? (bestBid + bestAsk) / 2
                : null;

            if (Number.isFinite(okxMid)) {
              const k = clamp((blend.nowMs - blend.endMs) / blend.blendMs, 0, 1);
              const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              const mid = round2(from + (okxMid - from) * eased);

              const remapped = remapBooksToPrice(b, mid);
              b.bids = remapped.bids;
              b.asks = remapped.asks;
            }
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
