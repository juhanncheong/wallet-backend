const mongoose = require("mongoose");

const balanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    asset: { type: String, required: true, uppercase: true, index: true }, // BTC, ETH, USDT...
    available: { type: Number, default: 0 },
    locked: { type: Number, default: 0 },
    // Admin withdrawal policy only. This is NOT part of the accounting total
    // and must never be mixed with `locked`, which is reserved for trading/orders.
    withdrawalReserve: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// one row per user per asset
balanceSchema.index({ userId: 1, asset: 1 }, { unique: true });

module.exports = mongoose.model("Balance", balanceSchema);
