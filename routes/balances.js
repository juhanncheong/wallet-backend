// routes/balances.js
const express = require("express");
const router = express.Router();

const Balance = require("../models/Balance");
const auth = require("../middleware/auth"); 

// GET /api/balances
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // show only coins user actually has (available>0 or locked>0)
    const rows = await Balance.find({
      userId,
      $or: [{ available: { $gt: 0 } }, { locked: { $gt: 0 } }],
    })
      .sort({ asset: 1 })
      .lean();

    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to load balances" });
  }
});

module.exports = router;
