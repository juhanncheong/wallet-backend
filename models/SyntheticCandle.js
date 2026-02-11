// models/SyntheticCandle.js
const mongoose = require("mongoose");

const SyntheticCandleSchema = new mongoose.Schema(
  {
    instId: { type: String, required: true, index: true }, // "NEX-USDT"
    tf: { type: String, default: "1m", index: true },      // keep "1m" as source
    t: { type: Number, required: true, index: true },      // unix seconds (bucket start)
    o: { type: Number, required: true },
    h: { type: Number, required: true },
    l: { type: Number, required: true },
    c: { type: Number, required: true },
    v: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Prevent duplicates for same candle bucket
SyntheticCandleSchema.index({ instId: 1, tf: 1, t: 1 }, { unique: true });

module.exports = mongoose.model("SyntheticCandle", SyntheticCandleSchema);
