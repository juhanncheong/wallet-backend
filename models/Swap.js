const mongoose = require('mongoose');

const swapSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fromCoin: {
    type: String,
    enum: ['bitcoin', 'ethereum', 'usdc', 'usdt'],
    required: true,
  },
  toCoin: {
    type: String,
    enum: ['bitcoin', 'ethereum', 'usdc', 'usdt'],
    required: true,
  },
  fromAmount: {
    type: Number,
    required: true,
  },
  toAmount: {
    type: Number,
    required: true,
  },
  feeUSD: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("Swap", swapSchema);
