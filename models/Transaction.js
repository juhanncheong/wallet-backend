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
    enum: ['bitcoin', 'ethereum', 'usdc', 'usdt'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
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
  address: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  network: { type: String, default: "" },
  address: { type: String, default: "" },
});

module.exports = mongoose.model("Transaction", transactionSchema);
