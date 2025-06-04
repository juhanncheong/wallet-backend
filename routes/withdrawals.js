const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// GET /admin/withdrawals
router.get("/withdrawals", async (req, res) => {
  try {
    const pending = await Transaction.find({ type: "withdrawal", status: "pending" }).populate('userId', 'email');
    res.json(pending);
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
