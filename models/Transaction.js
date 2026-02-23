const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'airdrop'],
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

  // ✅ NEW: withdrawal method
  method: {
    type: String,
    enum: ['CRYPTO', 'USDT_WIRE'],
    default: 'CRYPTO',
  },

  // ✅ Existing crypto fields
  network: { type: String, default: "" },
  address: { type: String, default: "" },

  // ✅ NEW: wire info (only used if method === 'USDT_WIRE')
  wireInfo: {
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    swiftCode: { type: String, default: "" },
    bankAddress: { type: String, default: "" },
  },

  rewardGrantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RewardGrant',
    default: null,
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },

  approvedAt: { type: Date },
  rejectedAt: { type: Date },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Transaction", transactionSchema);