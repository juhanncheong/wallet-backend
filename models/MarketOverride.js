// models/MarketOverride.js
const mongoose = require("mongoose");

const MarketOverrideSchema = new mongoose.Schema(
  {
    instId: { type: String, required: true, unique: true, index: true },

    isActive: { type: Boolean, default: false, index: true },

    // For fixed-price override
    fixedPrice: { type: Number, default: null },

    // Tiny wick percent, e.g. 0.001 = 0.1%
    wickPct: { type: Number, default: 0.001 },

    // Smooth blend in/out duration in minutes (you chose 5)
    blendMinutes: { type: Number, default: 5 },

    // Override window
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    // optional: store last manual update time
    updatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketOverride", MarketOverrideSchema);
