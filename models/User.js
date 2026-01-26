const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

  username: {
    type: String,
    required: true,
    unique: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: true,
  },

  withdrawalPin: {
    type: String,
  },

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

  futuresBalance: {
    usdt: { type: Number, default: 0 },
  },

  creditScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },

  isFrozen: {
    type: Boolean,
    default: false,
  },

  isWithdrawFrozen: {
    type: Boolean,
    default: false,
  },

  isWithdrawLocked: { type: Boolean, default: true },
  withdrawalPinFailCount: { type: Number, default: 0 },
  isWithdrawPinLocked: { type: Boolean, default: false },

  freezeReason: {
    type: String,
    default: '',
  },

  frozenAt: {
    type: Date,
    default: null,
  },

  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },

  referredBy: {
    type: String,
  },

  wallets: {
    ERC20: { type: String, default: null },
    BEP20: { type: String, default: null },
    TRC20: { type: String, default: null },
  },

  lastOnlineAt: { type: Date, default: null },
  lastOnlineIp: { type: String, default: '' },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports = mongoose.model('User', userSchema);
