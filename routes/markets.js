// routes/markets.js
const express = require("express");
const router = express.Router();

const OKX_BASE = "https://www.okx.com";

// Node 18+ has fetch. If not, auto-load node-fetch.
const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

// tiny in-memory cache to avoid hammering OKX on refresh / multiple users
let cache = { ts: 0, rows: null };
const CACHE_MS = 2000; // 2s cache is enough for "live prices" feeling

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

    // OKX spot tickers (24h stats for all spot instruments)
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
      .filter((t) => typeof t?.instId === "string" && t.instId.endsWith(`-${quote}`))
      .map((t) => {
        const [base, q] = t.instId.split("-");
        const last = Number(t.last);
        const open24h = Number(t.open24h);

        // quote currency 24h volume (matches your screenshot “Volume” feel)
        const volQuote24h = Number(t.volCcy24h);

        const change24hPct =
          Number.isFinite(last) && Number.isFinite(open24h) && open24h > 0
            ? ((last - open24h) / open24h) * 100
            : null;

        return {
          instId: t.instId,          // "BTC-USDT"
          base,                      // "BTC"
          quote: q,                  // "USDT"
          pair: `${base}/${q}`,      // "BTC/USDT"
          price: Number.isFinite(last) ? last : null,
          change24hPct,              // %
          volQuote24h: Number.isFinite(volQuote24h) ? volQuote24h : null
        };
      })
      // sort by volume desc (BTC/ETH top)
      .sort((a, b) => (b.volQuote24h ?? 0) - (a.volQuote24h ?? 0));

    cache = { ts: now, rows };
    res.json({ data: rows.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch OKX tickers" });
  }
});

module.exports = router;