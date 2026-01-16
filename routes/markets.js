const express = require("express");
const router = express.Router();

// ✅ GET /api/markets/global
router.get("/global", async (req, res) => {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/global", {
      headers: { accept: "application/json" },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: "CoinGecko global failed" });
    }

    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch global" });
  }
});

// ✅ GET /api/markets/top
router.get("/top", async (req, res) => {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1" +
      "&sparkline=true&price_change_percentage=24h,7d";

    const r = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: "CoinGecko markets failed" });
    }

    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch markets" });
  }
});

module.exports = router;
