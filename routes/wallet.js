const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Swap = require("../models/Swap");
const axios = require("axios");
const auth = require("../middleware/auth");
const Big = require("big.js");
const mongoose = require("mongoose");
const RewardGrant = require("../models/RewardGrant");

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

    // Check PIN
    if (pin !== user.withdrawalPin) {
     return res.status(401).json({ message: "Invalid PIN" });
    }

    if (user.coins[coin] < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    if (!address || address.length < 8) {
      return res.status(400).json({ message: "Invalid wallet address" });
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
      status: "pending",
      address, // ✅ store the withdrawal address
    });

    res.json({ message: "Withdrawal request submitted" });
  } catch (err) {
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/wallet/swap
router.post("/swap", auth, async (req, res) => {
  const userId = req.user.userId;
  const { from, to, amount } = req.body;

  try {
    if (!from || !to || !amount || from === to || amount <= 0) {
      return res.status(400).json({ message: "Invalid swap request" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const keyMap = {
      btc: "bitcoin",
      eth: "ethereum",
      usdc: "usdc",
      usdt: "usdt",
    };

    const fromKey = from.toLowerCase();
    const toKey = to.toLowerCase();
    const fromCoin = keyMap[fromKey];
    const toCoin = keyMap[toKey];

    const priceRes = await axios.get(
      "https://api.allorigins.win/get?url=" +
        encodeURIComponent(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,usd-coin,tether&vs_currencies=usd"
        )
    );
    const parsed = JSON.parse(priceRes.data.contents);
    const prices = {
      bitcoin: parsed.bitcoin.usd,
      ethereum: parsed.ethereum.usd,
      usdc: 1,
      usdt: 1,
    };

    const fromPrice = prices[fromCoin];
    const toPrice = prices[toCoin];
    if (!fromPrice || !toPrice) {
      return res.status(400).json({ message: "Price lookup failed" });
    }

    // Ensure fields exist
    user.coins[fromCoin] = user.coins[fromCoin] || 0;
    user.coins[toCoin] = user.coins[toCoin] || 0;

    // Use Big.js for all math
    const inputAmount = Big(amount.toString().trim());
    const fromBalance = Big(user.coins[fromCoin].toString());
    const epsilon = Big("0.000000000000000001");

    console.log("🧪 SWAP CHECK:", {
      fromBalance: fromBalance.toString(),
      inputAmount: inputAmount.toString(),
      userBalanceField: user.coins[fromCoin],
    });

    if (fromBalance.plus(epsilon).lt(inputAmount)) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const fromValueUSD = inputAmount.times(fromPrice);
    const feeUSD = fromValueUSD.times(0.02);
    const netUSD = fromValueUSD.minus(feeUSD);
    const toAmount = netUSD.div(toPrice);

    user.coins[fromCoin] = fromBalance.minus(inputAmount).toFixed(18);
    user.coins[toCoin] = Big(user.coins[toCoin].toString())
      .plus(toAmount)
      .toFixed(18);

    await user.save();

    await Swap.create({
      userId,
      fromCoin,
      toCoin,
      fromAmount: inputAmount.toFixed(8),
      toAmount: toAmount.toFixed(8),
      feeUSD: feeUSD.toFixed(2),
    });

    res.json({
      message: "Swap successful",
      from,
      to,
      fromAmount: inputAmount.toFixed(8),
      toAmount: toAmount.toFixed(6),
      feeUSD: feeUSD.toFixed(2),
      newBalances: user.coins,
    });
  } catch (err) {
    console.error("🔥 SWAP ERROR:", err.message);
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

    // Use Big.js like your swap logic does
    const newBal = Big(user.coins[grant.coin].toString()).plus(Big(grant.amount.toString()));
    user.coins[grant.coin] = newBal.toFixed(18); // consistent with your swap storing toFixed(18)
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