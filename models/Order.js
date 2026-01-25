// models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    instId: { type: String, required: true, uppercase: true, index: true }, // e.g. ETH-USDT
    base: { type: String, required: true, uppercase: true },               // ETH
    quote: { type: String, required: true, uppercase: true },              // USDT

    side: { type: String, required: true, enum: ["buy", "sell"] },
    type: { type: String, required: true, enum: ["limit"] },

    price: { type: Number, required: true }, // USDT per 1 base
    amountBase: { type: Number, required: true }, // how much base to buy/sell
    feeRate: { type: Number, default: 0.001 }, // 0.1%

    status: { type: String, enum: ["open", "filled", "cancelled"], default: "open", index: true },

    // how much we locked when placing the order
    lockedAsset: { type: String, required: true, uppercase: true }, // USDT for buy, BASE for sell
    lockedAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
