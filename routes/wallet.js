const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const auth = require("../middleware/auth");
const Big = require("big.js");
const mongoose = require("mongoose");
const RewardGrant = require("../models/RewardGrant");
const Balance = require("../models/Balance");

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

// Claimable Airdrops / Reward Grants (USER)
router.get("/reward-grants/active", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const grants = await RewardGrant.find({ userId, status: "active" })
      .sort({ activatedAt: -1, createdAt: -1 })
      .limit(5);

    // Frontend can show the modal if grants.length > 0 (use grants[0] for the modal)
    return res.json({ grants });
  } catch (err) {
    console.error("Active reward grants error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/wallet/reward-grants/:id/claim
router.post("/reward-grants/:id/claim", auth, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid grant id" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Find active grant for this user (one-time claim)
    const grant = await RewardGrant.findOne({ _id: id, userId, status: "active" }).session(session);
    if (!grant) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Grant not found or already claimed/cancelled" });
    }

    // Credit balance
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    user.coins[grant.coin] = user.coins[grant.coin] || 0;

    const newBal = Big(user.coins[grant.coin].toString()).plus(Big(grant.amount.toString()));
    user.coins[grant.coin] = newBal.toFixed(18);
    await user.save({ session });

    // Create transaction record (must have type "airdrop" in Transaction.js)
    const createdTx = await Transaction.create(
      [
        {
          userId,
          type: "airdrop",
          coin: grant.coin,
          amount: grant.amount,
          status: "completed",
          rewardGrantId: grant._id,
        },
      ],
      { session }
    );

    // Mark grant redeemed + link tx
    grant.status = "redeemed";
    grant.redeemedAt = new Date();
    grant.redeemedTransactionId = createdTx[0]._id;
    await grant.save({ session });

    await session.commitTransaction();
    return res.json({
      message: "Airdrop claimed",
      grantId: grant._id,
      transactionId: createdTx[0]._id,
      coin: grant.coin,
      amount: grant.amount,
      newBalance: user.coins[grant.coin],
    });
  } catch (err) {
    console.error("Claim reward grant error:", err);
    try { await session.abortTransaction(); } catch {}
    return res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    session.endSession();
  }
});

module.exports = router;