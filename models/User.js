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
  bitcoin: {
    available: { type: Number, default: 0 },
    unavailable: { type: Number, default: 0 }
  },
  ethereum: {
    available: { type: Number, default: 0 },
    unavailable: { type: Number, default: 0 }
  },
  usdc: {
    available: { type: Number, default: 0 },
    unavailable: { type: Number, default: 0 }
  },
  usdt: {
    available: { type: Number, default: 0 },
    unavailable: { type: Number, default: 0 }
  }
},


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
  default: true, // 🔒 Locked by default for all new users
},

  referralCode: {
  type: String,
  unique: true,
  sparse: true,
},
referredBy: {
  type: String, // referralCode of the user who invited them
},
  createdAt: {
    type: Date,
    default: Date.now,
  },
  wallets: {
  bitcoin: {
    type: String,
    default: '3DubijYfFz49XGHd9KijBH6PPVktcDVZi6'
  },
  ethereum: {
    type: String,
    default: '0xb40f9415faac0D0BE0BBf59B8d838Df4926CaC40'
  },
  usdc: {
    type: String,
    default: '0xb40f9415faac0D0BE0BBf59B8d838Df4926CaC40'
  },
  usdt: {
    type: String,
    default: 'TU9QiweNCczhS8VYgdFd9kGLScdYJqeWq4'
  }
},
});

module.exports = mongoose.model("User", userSchema);
