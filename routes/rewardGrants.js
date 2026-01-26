const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const RewardGrant = require("../models/RewardGrant");
const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance");

// RewardGrant.coin (old style) -> Balance.asset (new style)
function coinToAsset(coin) {
  const c = String(coin || "").trim().toLowerCase();
  if (c === "bitcoin") return "BTC";
  if (c === "ethereum") return "ETH";
  if (c === "usdt") return "USDT";
  if (c === "usdc") return "USDC";
  return c.toUpperCase();
}

// USER: list active grants
router.get("/reward-grants/active", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const grants = await RewardGrant.find({ userId, status: "active" })
      .sort({ activatedAt: -1, createdAt: -1 })
      .limit(5);

    return res.json({ grants });
  } catch (err) {
    console.error("Active reward grants error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// USER: claim grant (credits Balance.available)
router.post("/reward-grants/:id/claim", auth, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid grant id" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const grant = await RewardGrant.findOne({ _id: id, userId, status: "active" }).session(session);
    if (!grant) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Grant not found or already claimed/cancelled" });
    }

    const asset = coinToAsset(grant.coin);
    const amt = Number(grant.amount);

    if (!Number.isFinite(amt) || amt <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid grant amount" });
    }

    // ✅ Upsert Balance row and add to available
    const updatedBalance = await Balance.findOneAndUpdate(
      { userId, asset },
      { $inc: { available: amt } },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );

    // ✅ Create transaction record
    const createdTx = await Transaction.create(
      [
        {
          userId,
          type: "airdrop",
          coin: asset,              // store as BTC/ETH/USDT/USDC
          amount: amt,
          status: "completed",
          rewardGrantId: grant._id,
        },
      ],
      { session }
    );

    // ✅ Mark grant redeemed
    grant.status = "redeemed";
    grant.redeemedAt = new Date();
    grant.redeemedTransactionId = createdTx[0]._id;
    await grant.save({ session });

    await session.commitTransaction();

    return res.json({
      message: "Airdrop claimed",
      grantId: grant._id,
      transactionId: createdTx[0]._id,
      asset,
      amount: amt,
      newBalance: updatedBalance, // includes available/locked
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
