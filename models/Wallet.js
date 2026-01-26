const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema({
  address: { type: String, required: true, trim: true },

  coin: { type: String, required: false, trim: true },
  network: { type: String, required: true, trim: true }, // "ERC20" | "BEP20" | "TRC20"
  status: { type: String, enum: ["available", "assigned", "disabled"], default: "available" },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedAt: { type: Date, default: null },
}, { timestamps: true });

WalletSchema.index({ address: 1, network: 1 }, { unique: true });

module.exports = mongoose.model("Wallet", WalletSchema);
