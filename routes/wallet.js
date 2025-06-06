const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Swap = require("../models/Swap");
const axios = require("axios");
const auth = require("../middleware/auth");

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
    if (!from || !to || from === to || amount <= 0) {
      return res.status(400).json({ message: "Invalid swap request" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const fromKey = from.toLowerCase();
    const toKey = to.toLowerCase();

    if (user.coins[fromKey] < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ✅ Use proxy to fetch prices safely
    console.log("🌐 Fetching CoinGecko prices...");
    const proxyURL = "https://api.allorigins.win/get?url=" + encodeURIComponent(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,usd-coin,tether&vs_currencies=usd"
    );
    const priceRes = await axios.get(proxyURL);
    const parsed = JSON.parse(priceRes.data.contents);

    const prices = {
      bitcoin: parsed["bitcoin"]?.usd || 0,
      ethereum: parsed["ethereum"]?.usd || 0,
      usdc: parsed["usd-coin"]?.usd || 1,
      usdt: parsed["tether"]?.usd || 1,
    };

    const keyMap = {
      btc: "bitcoin",
      eth: "ethereum",
      usdc: "usdc",
      usdt: "usdt",
    };

    const normalizedFromKey = keyMap[fromKey];
    const normalizedToKey = keyMap[toKey];

    const fromPrice = prices[normalizedFromKey];
    const toPrice = prices[normalizedToKey];

    if (!fromPrice || !toPrice) {
      console.log("🛑 Price lookup failed", prices);
      return res.status(400).json({ message: "Price lookup failed" });
    }

    const fromValueUSD = amount * fromPrice;
    const feeUSD = fromValueUSD * 0.02;
    const netValueUSD = fromValueUSD - feeUSD;
    const toAmount = netValueUSD / toPrice;

    user.coins[fromKey] -= amount;
    user.coins[toKey] += toAmount;
    await user.save();

    await Swap.create({
      userId,
      fromCoin: fromKey,
      toCoin: toKey,
      fromAmount: amount,
      toAmount,
      feeUSD,
    });

    res.json({
      message: "Swap successful",
      from,
      to,
      fromAmount: amount,
      toAmount: toAmount.toFixed(6),
      feeUSD: feeUSD.toFixed(2),
      newBalances: user.coins,
    });

  } catch (err) {
    console.error("🔥 SWAP ERROR:", err.message);
    console.error("🔥 STACK TRACE:", err.stack);
    res.status(500).json({ message: "Internal server error" });
  }
});


module.exports = router;
