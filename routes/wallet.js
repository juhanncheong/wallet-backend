const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Swap = require("../models/Swap");
const axios = require("axios");
const auth = require("../middleware/auth");
const Big = require("big.js");

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

    if (!user.withdrawalPin) return res.status(400).json({ message: "No PIN set" });

    // Check PIN
    const isMatch = await require("bcryptjs").compare(pin, user.withdrawalPin);
    if (!isMatch) return res.status(401).json({ message: "Invalid PIN" });

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

    user.coins[fromKey] = user.coins[fromKey] || 0;
    user.coins[toKey] = user.coins[toKey] || 0;

    const fromBalance = Big(user.coins[fromKey]);
    const inputAmount = Big(amount);

    if (fromBalance.lt(inputAmount)) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const fromValueUSD = inputAmount.times(fromPrice);
    const feeUSD = fromValueUSD.times(0.02);
    const netUSD = fromValueUSD.minus(feeUSD);
    const toAmount = netUSD.div(toPrice);

    user.coins[fromKey] = fromBalance.minus(inputAmount).toFixed(18);
    user.coins[toKey] = Big(user.coins[toKey]).plus(toAmount).toFixed(18);

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

module.exports = router;