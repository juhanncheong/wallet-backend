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

  /* =========================
     FREEZE & SECURITY FLAGS
     ========================= */

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



  /* =========================
     REFERRAL SYSTEM
     ========================= */

  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },

  referredBy: {
    type: String, // referralCode of inviter
  },

  /* =========================
     WALLETS
     ========================= */

  wallets: {
    bitcoin: {
      type: String,
      default: 'bc1qkxg9m6ym2cy3e8s32xng8vccec6fu67305nfjs',
    },
    ethereum: {
      type: String,
      default: '0x64fb3d37ad254555cf817d8207A8Eaf1D8EB7eaD',
    },
    usdc: {
      type: String,
      default: '0x64fb3d37ad254555cf817d8207A8Eaf1D8EB7eaD',
    },
    usdt: {
      type: String,
      default: 'TEyLpQePbMFLCw4p923N86TJVoYFHDiqYT',
    },
  },

  lastOnlineAt: { type: Date, default: null },
  lastOnlineIp: { type: String, default: '' },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports = mongoose.model('User', userSchema);
