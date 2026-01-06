// models/Wallet.js
const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    coin: { type: String, required: true, trim: true, lowercase: true },
    network: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["available", "assigned", "disabled"],
      default: "available",
      index: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAt: { type: Date, default: null },

    notes: { type: String, default: "" },

    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

WalletSchema.index({ address: 1, coin: 1, network: 1 }, { unique: true });
WalletSchema.index({ coin: 1, network: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model("Wallet", WalletSchema);
