const mongoose = require("mongoose");

// models/MarketOverride.js
const MarketOverrideSchema = new mongoose.Schema({
  instId: { type: String, required: true, unique: true, index: true },
  isActive: { type: Boolean, default: false, index: true },

  fixedPrice: { type: Number, default: null },
  wickPct: { type: Number, default: 0.001 },
  blendMinutes: { type: Number, default: 5 },

  // ✅ NEW realism controls
  band: { type: Number, default: 0.5 },        // total band width in USDT (e.g. 0.5 means ±0.25)
  stepMin: { type: Number, default: 0.01 },    // min tick step
  stepMax: { type: Number, default: 0.06 },    // max tick step
  flipProb: { type: Number, default: 0.25 },   // chance to flip direction per tick
  meanRevert: { type: Number, default: 0.15 }, // pull back toward fixedPrice
  shockProb: { type: Number, default: 0.02 },  // occasional spikes
  shockSize: { type: Number, default: 0.25 },  // spike magnitude in USDT
  volMin: { type: Number, default: 1 },        // for fake volume
  volMax: { type: Number, default: 25 },       // for fake volume

  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  updatedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("MarketOverride", MarketOverrideSchema);
