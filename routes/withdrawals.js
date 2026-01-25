const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance"); // <-- NEW
const auth = require("./auth");               // <-- your auth middleware is routes/auth.js

// ✅ ADMIN: GET /admin/withdrawals  (your existing)
router.get("/withdrawals", async (req, res) => {
  try {
    const allWithdrawals = await Transaction.find({ type: "withdrawal" })
      .populate("userId", "email")
      .sort({ createdAt: -1 });

    res.json(allWithdrawals);
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ USER: POST /api/withdrawals
// body: { coin: "USDT", amount: 50, address: "...", network: "TRC20" }
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.userId; // your auth sets this
    let { coin, amount, address, network } = req.body;

    coin = String(coin || "").trim().toUpperCase();
    amount = Number(amount);

    if (!coin) return res.status(400).json({ message: "Coin required" });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    if (!address || String(address).trim().length < 8) {
      return res.status(400).json({ message: "Invalid address" });
    }
    if (!network || String(network).trim().length < 2) {
      return res.status(400).json({ message: "Network required" });
    }

    // ✅ Deduct immediately from Balance.available
    const bal = await Balance.findOne({ userId, asset: coin });
    const available = Number(bal?.available || 0);

    if (available < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    bal.available = Number((available - amount).toFixed(12));
    await bal.save();

    const tx = await Transaction.create({
      userId,
      type: "withdrawal",
      coin,
      amount,
      address: String(address).trim(),
      network: String(network).trim(),
      status: "pending",
    });

    res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Create withdrawal error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
