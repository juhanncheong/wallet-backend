// routes/adminBalance.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Balance = require("../models/Balance");
const User = require("../models/User");
const verifyAdmin = require("../middleware/verifyAdmin");

const EPSILON = 0.00000001;
const ASSET_ALIASES = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  DOGECOIN: "DOGE",
};

function normalizeAsset(asset) {
  const raw = String(asset || "")
    .trim()
    .toUpperCase();
  return ASSET_ALIASES[raw] || raw;
}

// POST /api/admin/balance/set
// body: { userId, asset, amount }
router.post("/balance/set", verifyAdmin, async (req, res) => {
  try {
    const { userId, asset, amount } = req.body;
    const numericAmount = Number(amount);
    const normalizedAsset = normalizeAsset(asset);

    if (!mongoose.Types.ObjectId.isValid(userId) || !normalizedAsset) {
      return res.status(400).json({ error: "Invalid userId/asset" });
    }

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = await Balance.findOne({
      userId,
      asset: normalizedAsset,
    });

    if (numericAmount <= EPSILON) {
      const locked = Number(existing?.locked || 0);
      const withdrawalReserve = Math.max(
        0,
        Number(existing?.withdrawalReserve || 0),
      );

      if (!existing || (locked <= EPSILON && withdrawalReserve <= EPSILON)) {
        if (existing) await existing.deleteOne();

        return res.json({
          message: "Balance removed",
          data: {
            userId,
            asset: normalizedAsset,
            available: 0,
            locked: 0,
            withdrawalReserve: 0,
            deleted: true,
          },
        });
      }

      existing.available = 0;
      await existing.save();

      return res.json({
        message:
          "Available balance set to zero; locked funds/withdrawal reserve preserved",
        data: existing,
      });
    }

    const row = await Balance.findOneAndUpdate(
      { userId, asset: normalizedAsset },
      {
        $setOnInsert: { userId, asset: normalizedAsset },
        $set: { available: numericAmount },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res.json({
      message: "Balance set",
      data: row,
    });
  } catch (err) {
    console.error("Set balance error:", err);
    return res.status(500).json({ error: "Failed to set balance" });
  }
});

module.exports = router;
