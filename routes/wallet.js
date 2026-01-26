const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Big = require("big.js");
const mongoose = require("mongoose");
const RewardGrant = require("../models/RewardGrant");
const Balance = require("../models/Balance");
const rewardGrantRoutes = require("./rewardGrants");

// POST /api/wallet/withdraw
router.post("/withdraw", auth, async (req, res) => {
  const { coin, amount, pin, address } = req.body; // ✅ include address
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isWithdrawFrozen) {
      return res.status(403).json({ message: "Withdrawals are frozen" });
    }
    if (user.isWithdrawLocked) {
    return res.status(403).json({ message: "Balance Unavailable." });
    }

    if (!user.withdrawalPin) return res.status(400).json({ message: "No PIN set" });

const MAX_PIN_TRIES = 3;

// ✅ PIN-lock check (separate from admin lock)
if (user.isWithdrawPinLocked) {
  return res.status(403).json({
    message: "Withdrawals locked due to 3 wrong PIN attempts. Contact admin to reset.",
    triesLeft: 0,
    isWithdrawPinLocked: true,
  });
}

// ✅ Check PIN
if (pin !== user.withdrawalPin) {
  user.withdrawalPinFailCount = (user.withdrawalPinFailCount || 0) + 1;

  const triesLeft = Math.max(0, MAX_PIN_TRIES - user.withdrawalPinFailCount);

  if (triesLeft === 0) {
    user.isWithdrawPinLocked = true;
  }

  await user.save();

  return res.status(401).json({
    message:
      triesLeft === 0
        ? "Too many wrong PIN attempts. Withdrawals are locked until admin resets."
        : `Invalid PIN. ${triesLeft} tries left.`,
    triesLeft,
    isWithdrawPinLocked: user.isWithdrawPinLocked,
  });
}

// ✅ Correct PIN: reset fail count
if ((user.withdrawalPinFailCount || 0) !== 0) {
  user.withdrawalPinFailCount = 0;
  await user.save();
}

    // Normalize coin param to your Balance.asset key (recommended: uppercase symbols)
function normalizeAssetKey(c) {
  const x = String(c || "").trim().toUpperCase();
  if (x === "BITCOIN") return "BTC";
  if (x === "ETHEREUM") return "ETH";
  return x; // USDT, USDC, DOGE, XRP, SOL...
}

const asset = normalizeAssetKey(coin);
const amt = Number(amount);

if (!Number.isFinite(amt) || amt <= 0) {
  return res.status(400).json({ message: "Invalid amount" });
}

// ✅ Atomic deduct from Balance.available
const updatedBal = await Balance.findOneAndUpdate(
  { userId, asset, available: { $gte: amt } },
  { $inc: { available: -amt } },
  { new: true }
);

if (!updatedBal) {
  return res.status(400).json({ message: "Insufficient balance" });
}

    // Create transaction
    await Transaction.create({
      userId,
      type: "withdrawal",
      coin: asset, 
      amount: amt,
      status: "pending",
      address,
    });

    res.json({ message: "Withdrawal request submitted" });
  } catch (err) {
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/wallet/usdt
router.get("/usdt", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);  // <- correct ID field

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Your real USDT balance
    const usdtBalance = user.coins?.usdt || 0;

    res.json({ balance: usdtBalance });
  } catch (err) {
    console.error("USDT balance error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.use("/", rewardGrantRoutes);

module.exports = router;