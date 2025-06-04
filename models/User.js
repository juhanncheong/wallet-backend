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

  isFrozen: {
    type: Boolean,
    default: false, // ✅ For freezing login access
  },

  isWithdrawFrozen: {
    type: Boolean,
    default: false, // ✅ For freezing withdrawals
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
