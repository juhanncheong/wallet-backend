const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  type: {
    type: String,
    enum: ["deposit", "withdrawal", "airdrop"],
    required: true,
  },

  coin: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },

  amount: {
    type: Number,
    required: true,
  },

  // Withdrawal method:
  // - CRYPTO: normal on-chain withdrawal
  // - USDT_WIRE: existing USA wire withdrawal
  // - USDT_UAE_BANK: UAE local bank withdrawal in AED
  method: {
    type: String,
    enum: ["CRYPTO", "USDT_WIRE", "USDT_UAE_BANK"],
    default: "CRYPTO",
  },

  // Existing crypto fields
  network: { type: String, default: "" },
  address: { type: String, default: "" },

  // Existing USA wire info (method === 'USDT_WIRE')
  wireInfo: {
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    swiftCode: { type: String, default: "" },
    bankAddress: { type: String, default: "" },
  },

  // UAE local bank info (method === 'USDT_UAE_BANK')
  uaeBankInfo: {
    name: { type: String, default: "" },
    bankName: { type: String, default: "" },
    iban: { type: String, default: "" },
    country: { type: String, default: "AE" },
    amountAED: { type: Number, default: null },
    exchangeRate: { type: Number, default: null },
    rateSource: { type: String, default: "" },
    quotedAt: { type: Date, default: null },
  },

  rewardGrantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RewardGrant",
    default: null,
  },

  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },

  approvedAt: { type: Date },
  rejectedAt: { type: Date },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Transaction", transactionSchema);
