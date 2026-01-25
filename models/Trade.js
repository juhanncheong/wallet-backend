// models/Trade.js
const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    instId: { type: String, required: true, uppercase: true },
    base: { type: String, required: true, uppercase: true },
    quote: { type: String, required: true, uppercase: true },

    side: { type: String, required: true, enum: ["buy", "sell"] },
    type: { type: String, required: true, enum: ["market", "limit"] },

    price: { type: Number, required: true },
    amountBase: { type: Number, required: true },

    feeRate: { type: Number, default: 0.001 },
    feeAsset: { type: String, required: true, uppercase: true },
    feeAmount: { type: Number, required: true },

    // helpful totals:
    grossQuote: { type: Number, required: true }, // price * amountBase
    netQuote: { type: Number, required: true },   // after fees (for sells)
    netBase: { type: Number, required: true },    // after fees (for buys)
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trade", tradeSchema);
