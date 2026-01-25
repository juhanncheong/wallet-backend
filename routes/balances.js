// routes/balances.js
const express = require("express");
const router = express.Router();

const Balance = require("../models/Balance");
const auth = require("../middleware/auth"); // <-- adjust path if your auth middleware is elsewhere

// GET /api/balances
router.get("/", auth, async (req, res) => {
  try {
    const rows = await Balance.find({ userId: req.userId }).sort({ asset: 1 }).lean();
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to load balances" });
  }
});

module.exports = router;
