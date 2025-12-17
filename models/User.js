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

  isWithdrawLocked: {
    type: Boolean,
    default: true, // 🔒 locked by default for new users
  },

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
      default: 'bc1qs2kpyusm2kcnzdg8ncwehzfjgj2ghll254s5q7',
    },
    ethereum: {
      type: String,
      default: '0x68952b8490087AE383E0B2ce6159ac38Bc0D7986',
    },
    usdc: {
      type: String,
      default: '0x68952b8490087AE383E0B2ce6159ac38Bc0D7986',
    },
    usdt: {
      type: String,
      default: 'TDJdJuyqRtF6j2jGicnceipDUJBTw42DcQ',
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports = mongoose.model('User', userSchema);
