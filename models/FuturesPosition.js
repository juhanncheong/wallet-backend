const mongoose = require("mongoose");

const futuresPositionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  symbol: {
    type: String,
    default: "BTCUSDT",
  },

  side: {
    type: String,
    enum: ["long", "short"],
    required: true,
  },

  // Notional size in USDT (e.g. 10 000 USDT)
  size: {
    type: Number,
    required: true,
  },

  leverage: {
    type: Number,
    required: true,
  },

  // Margin locked = size / leverage
  margin: {
    type: Number,
    required: true,
  },

  entryPrice: {
    type: Number,
    required: true,
  },

  liqPrice: {
    type: Number,
    required: true,
  },

  // Optional Take Profit & Stop Loss
  tp: {
    type: Number,
  },

  sl: {
    type: Number,
  },

  // If true – don’t allow adding more size (only reducing/closing)
  reduceOnly: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ["open", "closed"],
    default: "open",
  },

  openedAt: {
    type: Date,
    default: Date.now,
  },

  closedAt: Date,
  closePrice: Number,
  pnlUsd: Number,
  pnlPct: Number,
});

module.exports = mongoose.model("FuturesPosition", futuresPositionSchema);
