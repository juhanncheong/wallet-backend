const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  withdrawalPin: { type: String },

  balance: {
    type: Number,
    default: 0,
  },

  coins: {
    bitcoin: { type: Number, default: 0 },
    ethereum: { type: Number, default: 0 },
    usdc: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 },
  },

  isFrozen: {
    type: Boolean,
    default: false,
  },

  isWithdrawFrozen: {
    type: Boolean,
    default: false,
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
