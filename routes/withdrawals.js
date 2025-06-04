const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// GET /admin/withdrawals
router.get("/withdrawals", async (req, res) => {
  try {
    // ✅ Get ALL withdrawals (not just pending), newest first
    const allWithdrawals = await Transaction.find({ type: "withdrawal" })
      .populate("userId", "email")      // Include user's email
      .sort({ createdAt: -1 });         // Latest first

    res.json(allWithdrawals);
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
