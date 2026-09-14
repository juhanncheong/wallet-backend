const mongoose = require("mongoose");

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
    default: "",
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
    BTC: { type: String, default: null },
    SOL: { type: String, default: null },
  },

  lastOnlineAt: { type: Date, default: null },
  lastOnlineIp: { type: String, default: "" },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
