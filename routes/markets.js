const express = require("express");
const router = express.Router();

const OKX_BASE = "https://www.okx.com";

// tiny in-memory cache to stop hammering OKX when users refresh
let cache = { ts: 0, rows: null };
const CACHE_MS = 2000; // 2s is enough for “live-ish” pages

// ✅ GET /api/markets/tickers?quote=USDT&limit=50
router.get("/tickers", async (req, res) => {
  try {
    const quote = String(req.query.quote || "USDT").toUpperCase();
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "50", 10) || 50, 200));

    const now = Date.now();
    if (cache.rows && now - cache.ts < CACHE_MS) {
      return res.json(cache.rows.slice(0, limit));
    }

    // OKX: latest snapshot + 24h stats for all SPOT instruments
    const url = `${OKX_BASE}/api/v5/market/tickers?instType=SPOT`;
    const r = await fetch(url, { headers: { accept: "application/json" } });

    if (!r.ok) {
      return res.status(r.status).json({ error: "OKX tickers failed" });
    }

    const j = await r.json();
    const data = Array.isArray(j?.data) ? j.data : [];

    // Keep only *-USDT (or your chosen quote)
    const rows = data
      .filter((t) => typeof t?.instId === "string" && t.instId.endsWith(`-${quote}`))
      .map((t) => {
        const [base, q] = t.instId.split("-");
        const last = Number(t.last);
        const open24h = Number(t.open24h);
        const volQuote24h = Number(t.volCcy24h); // quote currency volume (nice for your UI)

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
      // sort by 24h quote volume desc so BTC/ETH float to top like your screenshot
      .sort((a, b) => (b.volQuote24h ?? 0) - (a.volQuote24h ?? 0));

    cache = { ts: now, rows };

    res.json(rows.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch OKX tickers" });
  }
});

module.exports = router;
