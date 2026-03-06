const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance");
const User = require("../models/User");
const auth = require("../middleware/auth");

// ADMIN: GET /admin/withdrawals
router.get("/withdrawals", async (req, res) => {
  const withdrawals = await Transaction.find({ type: "withdrawal" })
    .populate("userId", "email")
    .sort({ createdAt: -1 });

  res.json(withdrawals);
});

// USER: POST /api/withdrawals
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    let {
      coin,
      amount,
      address,
      network,
      method,
      pin,
      bankName,
      accountName,
      accountNumber,
      swiftCode,
      bankAddress
    } = req.body;

    coin = String(coin || "").trim().toUpperCase();
    amount = Number(amount);
    method = String(method || "CRYPTO").trim().toUpperCase();
    pin = String(pin || "").trim();

    if (!coin) {
      return res.status(400).json({ message: "Coin required" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Same protection logic as /api/wallet/withdraw
    if (user.isWithdrawFrozen) {
      return res.status(403).json({ message: "Withdrawals are frozen" });
    }

    if (user.isWithdrawLocked) {
      return res.status(403).json({ message: "Balance Unavailable." });
    }

    if (!user.withdrawalPin) {
      return res.status(400).json({ message: "No PIN set" });
    }

    const MAX_PIN_TRIES = 3;

    if (user.isWithdrawPinLocked) {
      return res.status(403).json({
        message: "Withdrawals locked due to 3 wrong PIN attempts. Contact admin to reset.",
        triesLeft: 0,
        isWithdrawPinLocked: true,
      });
    }

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

    // Correct PIN: reset fail count
    if ((user.withdrawalPinFailCount || 0) !== 0) {
      user.withdrawalPinFailCount = 0;
      await user.save();
    }

    // USDT wire validation
    if (method === "USDT_WIRE") {
      if (coin !== "USDT") {
        return res.status(400).json({ message: "Wire withdrawal only allowed for USDT" });
      }

      if (!bankName || !accountName || !accountNumber || !swiftCode) {
        return res.status(400).json({ message: "Incomplete bank details" });
      }
    } else {
      // Normal crypto validation
      if (!address || String(address).trim().length < 8) {
        return res.status(400).json({ message: "Invalid address" });
      }

      if (!network || String(network).trim().length < 2) {
        return res.status(400).json({ message: "Network required" });
      }
    }

    // Deduct immediately
    const bal = await Balance.findOne({ userId, asset: coin });
    const available = Number(bal?.available || 0);

    if (!bal || available < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    bal.available = Number((available - amount).toFixed(12));
    await bal.save();

    const tx = await Transaction.create({
      userId,
      type: "withdrawal",
      coin,
      amount,
      method,

      network: method === "CRYPTO" ? String(network || "").trim() : "",
      address: method === "CRYPTO" ? String(address || "").trim() : "",

      wireInfo: method === "USDT_WIRE"
        ? {
            bankName: String(bankName || "").trim(),
            accountName: String(accountName || "").trim(),
            accountNumber: String(accountNumber || "").trim(),
            swiftCode: String(swiftCode || "").trim(),
            bankAddress: String(bankAddress || "").trim(),
          }
        : undefined,

      status: "pending",
    });

    res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Create withdrawal error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;