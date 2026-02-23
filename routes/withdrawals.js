const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance");
const auth = require("../middleware/auth");

// ADMIN: GET /admin/withdrawals
router.get("/withdrawals", async (req, res) => {
  const withdrawals = await Transaction.find({ type: "withdrawal" })
    .populate("userId", "email")
    .sort({ createdAt: -1 });
  res.json(withdrawals);
});

// ✅ USER: POST /api/withdrawals
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.userId;

    let {
      coin,
      amount,
      address,
      network,
      method,
      bankName,
      accountName,
      accountNumber,
      swiftCode,
      bankAddress
    } = req.body;

    coin = String(coin || "").trim().toUpperCase();
    amount = Number(amount);
    method = method || "CRYPTO";

    if (!coin) return res.status(400).json({ message: "Coin required" });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // ✅ USDT WIRE VALIDATION
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

    // ✅ Deduct immediately
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
     method: method || "CRYPTO",

     network: method === "CRYPTO" ? network : "",
     address: method === "CRYPTO" ? address : "",

     wireInfo: method === "USDT_WIRE" ? {
       bankName,
       accountName,
       accountNumber,
       swiftCode,
       bankAddress
     } : undefined,

     status: "pending",
   });

    res.json({ success: true, transaction: tx });

  } catch (err) {
    console.error("Create withdrawal error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
