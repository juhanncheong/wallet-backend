const mongoose = require('mongoose');

const rewardGrantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  coin: {
    type: String,
    enum: ['bitcoin', 'ethereum', 'usdc', 'usdt'], // same as your Transaction/User coins
    required: true,
  },

  amount: {
    type: Number,
    required: true,
    min: 0,
  },

  // Draft = created but not shown yet
  // Active = admin clicked "show" (modal should appear on refresh)
  // Redeemed = user claimed and balance was credited
  // Cancelled = admin revoked before claim
  status: {
    type: String,
    enum: ['draft', 'active', 'redeemed', 'cancelled'],
    default: 'draft',
    index: true,
  },

  note: { type: String, default: '' },

  // Track lifecycle times (helps admin dashboard + audits)
  createdAt: { type: Date, default: Date.now },
  activatedAt: { type: Date, default: null },
  redeemedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },

  // When redeemed, we’ll create a Transaction record and link it here
  redeemedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null,
  },
});

// Useful for “find active grants for this user quickly”
rewardGrantSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RewardGrant', rewardGrantSchema);
