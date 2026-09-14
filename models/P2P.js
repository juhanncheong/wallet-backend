const mongoose = require("mongoose");

const { Schema } = mongoose;

// ============================================================
// P2P PROFILE
// ============================================================
const p2pProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    p2pEnabled: { type: Boolean, default: true },
    p2pFrozen: { type: Boolean, default: false, index: true },
    freezeReason: { type: String, default: "", maxlength: 300 },

    totalParticipations: { type: Number, default: 0, min: 0 },
    completedOrders: { type: Number, default: 0, min: 0 },
    cancelledByUser: { type: Number, default: 0, min: 0 },
    paymentExpiredAsBuyer: { type: Number, default: 0, min: 0 },
    completedVolumeUsdt: { type: Number, default: 0, min: 0 },
    positiveReviews: { type: Number, default: 0, min: 0 },
    negativeReviews: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// ============================================================
// PAYMENT METHOD
// Sensitive payment details are encrypted by p2pService.js.
// ============================================================
const p2pPaymentMethodSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      index: true,
    },
    methodType: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    maskedDetails: { type: Schema.Types.Mixed, default: {} },
    detailsEncrypted: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
p2pPaymentMethodSchema.index({ userId: 1, currency: 1, isActive: 1 });

// ============================================================
// ADVERTISEMENT
// BUY  = advertiser wants to buy USDT using fiat.
// SELL = advertiser wants to sell USDT for fiat.
// ============================================================
const p2pAdvertisementSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    advertiserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    side: { type: String, enum: ["BUY", "SELL"], required: true, index: true },
    asset: { type: String, enum: ["USDT"], default: "USDT", required: true },
    fiatCurrency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    totalUsdt: { type: Number, required: true, min: 0 },
    remainingUsdt: { type: Number, required: true, min: 0, index: true },
    openOrderUsdt: { type: Number, default: 0, min: 0 },
    cancelledUnfilledUsdt: { type: Number, default: 0, min: 0 },
    minFiat: { type: Number, required: true, min: 0 },
    maxFiat: { type: Number, required: true, min: 0 },

    paymentMethodIds: [
      { type: Schema.Types.ObjectId, ref: "P2PPaymentMethod" },
    ],
    paymentMethodTypes: [{ type: String, uppercase: true, trim: true }],

    terms: { type: String, default: "", maxlength: 1000 },
    status: {
      type: String,
      enum: ["active", "paused", "filled", "cancelled"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);
p2pAdvertisementSchema.index({ status: 1, side: 1, fiatCurrency: 1, price: 1 });
p2pAdvertisementSchema.index({ advertiserId: 1, status: 1, createdAt: -1 });
p2pAdvertisementSchema.index({ paymentMethodIds: 1, status: 1 });

// ============================================================
// ORDER / ESCROW
// ============================================================
const p2pOrderSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    adId: {
      type: Schema.Types.ObjectId,
      ref: "P2PAdvertisement",
      required: true,
      index: true,
    },
    advertiserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    takerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adSide: { type: String, enum: ["BUY", "SELL"], required: true },
    asset: { type: String, enum: ["USDT"], default: "USDT", required: true },
    fiatCurrency: { type: String, required: true, uppercase: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    usdtAmount: { type: Number, required: true, min: 0 },
    fiatAmount: { type: Number, required: true, min: 0 },

    paymentMethodId: {
      type: Schema.Types.ObjectId,
      ref: "P2PPaymentMethod",
      required: true,
    },
    paymentMethodSummary: { type: Schema.Types.Mixed, required: true },
    paymentDetailsEncrypted: { type: String, required: true, select: false },

    status: {
      type: String,
      enum: [
        "awaiting_payment",
        "paid",
        "completed",
        "cancelled",
        "expired",
        "appealed",
      ],
      default: "awaiting_payment",
      index: true,
    },
    paymentDeadlineAt: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    appealedAt: { type: Date, default: null },
    cancelReason: { type: String, default: "", maxlength: 500 },

    idempotencyKey: { type: String, required: true, maxlength: 128 },
  },
  { timestamps: true },
);
p2pOrderSchema.index({ takerId: 1, idempotencyKey: 1 }, { unique: true });
p2pOrderSchema.index({ buyerId: 1, createdAt: -1 });
p2pOrderSchema.index({ sellerId: 1, createdAt: -1 });
p2pOrderSchema.index({ status: 1, paymentDeadlineAt: 1 });

// ============================================================
// DISPUTE / APPEAL
// ============================================================
const evidenceSchema = new Schema(
  {
    uploadedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true, maxlength: 1000 },
    kind: { type: String, default: "file", maxlength: 40 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const p2pDisputeSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "P2POrder",
      required: true,
      unique: true,
      index: true,
    },
    openedById: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: [
        "PAYMENT_NOT_RECEIVED",
        "SELLER_NOT_RELEASED",
        "WRONG_AMOUNT",
        "THIRD_PARTY_PAYMENT",
        "OTHER",
      ],
      required: true,
    },
    message: { type: String, default: "", maxlength: 2000 },
    evidence: { type: [evidenceSchema], default: [] },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED_BUYER", "RESOLVED_SELLER", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    resolvedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    resolutionNote: { type: String, default: "", maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ============================================================
// IMMUTABLE AUDIT LEDGER
// ============================================================
const p2pLedgerSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    adId: {
      type: Schema.Types.ObjectId,
      ref: "P2PAdvertisement",
      default: null,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "P2POrder",
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    asset: { type: String, enum: ["USDT"], default: "USDT" },
    amount: { type: Number, default: 0 },
    availableDelta: { type: Number, default: 0 },
    lockedDelta: { type: Number, default: 0 },
    availableAfter: { type: Number, default: null },
    lockedAfter: { type: Number, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false, timestamps: false },
);
p2pLedgerSchema.index({ userId: 1, createdAt: -1 });
p2pLedgerSchema.index({ orderId: 1, createdAt: 1 });

// ============================================================
// REVIEW / REPUTATION
// ============================================================
const p2pReviewSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "P2POrder",
      required: true,
      index: true,
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    revieweeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: { type: String, enum: ["POSITIVE", "NEGATIVE"], required: true },
    comment: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true },
);
p2pReviewSchema.index({ orderId: 1, reviewerId: 1 }, { unique: true });

// Avoid model overwrite errors during dev reloads.
const P2PProfile =
  mongoose.models.P2PProfile || mongoose.model("P2PProfile", p2pProfileSchema);
const P2PPaymentMethod =
  mongoose.models.P2PPaymentMethod ||
  mongoose.model("P2PPaymentMethod", p2pPaymentMethodSchema);
const P2PAdvertisement =
  mongoose.models.P2PAdvertisement ||
  mongoose.model("P2PAdvertisement", p2pAdvertisementSchema);
const P2POrder =
  mongoose.models.P2POrder || mongoose.model("P2POrder", p2pOrderSchema);
const P2PDispute =
  mongoose.models.P2PDispute || mongoose.model("P2PDispute", p2pDisputeSchema);
const P2PLedger =
  mongoose.models.P2PLedger || mongoose.model("P2PLedger", p2pLedgerSchema);
const P2PReview =
  mongoose.models.P2PReview || mongoose.model("P2PReview", p2pReviewSchema);

module.exports = {
  P2PProfile,
  P2PPaymentMethod,
  P2PAdvertisement,
  P2POrder,
  P2PDispute,
  P2PLedger,
  P2PReview,
};
