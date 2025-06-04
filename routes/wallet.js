// routes/wallet.js
const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const auth = require("../middleware/auth");

// POST /api/wallet/withdraw
router.post("/withdraw", auth, async (req, res) => {
  const { coin, amount, pin } = req.body;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isWithdrawFrozen) {
      return res.status(403).json({ message: "Withdrawals are frozen" });
    }

    if (!user.withdrawalPin) return res.status(400).json({ message: "No PIN set" });

    // Check PIN
    const isMatch = await require("bcryptjs").compare(pin, user.withdrawalPin);
    if (!isMatch) return res.status(401).json({ message: "Invalid PIN" });

    if (user.coins[coin] < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct coin
    user.coins[coin] -= amount;
    await user.save();

    // Create transaction
    await Transaction.create({
      userId,
      type: "withdrawal",
      coin,
      amount,
      status: "pending"
    });

    res.json({ message: "Withdrawal request submitted" });
  } catch (err) {
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
