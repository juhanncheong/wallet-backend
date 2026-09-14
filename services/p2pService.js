const crypto = require("crypto");
const mongoose = require("mongoose");
const Big = require("big.js");

const User = require("../models/User");
const Balance = require("../models/Balance");
const {
  P2PProfile,
  P2PPaymentMethod,
  P2PAdvertisement,
  P2POrder,
  P2PDispute,
  P2PLedger,
  P2PReview,
} = require("../models/P2P");

class P2PError extends Error {
  constructor(message, status = 400, code = "P2P_ERROR", details = undefined) {
    super(message);
    this.name = "P2PError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================
// utils/p2pIds.js
// ============================================================
function makeReference(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${time}-${rand}`;
}

// ============================================================
// utils/p2pMoney.js
// ============================================================
const USDT_DECIMALS = 6;
const PRICE_DECIMALS = 8;

const ZERO_DECIMAL_FIAT = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const THREE_DECIMAL_FIAT = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

function fiatDecimals(currency) {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL_FIAT.has(code)) return 0;
  if (THREE_DECIMAL_FIAT.has(code)) return 3;
  return 2;
}

function normalizeCurrency(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new P2PError(
      "Invalid fiat currency code",
      400,
      "INVALID_FIAT_CURRENCY",
    );
  }
  return code;
}

function toBig(value, fieldName) {
  try {
    const b = new Big(String(value));
    if (!b.c || !Number.isFinite(Number(b.toString())))
      throw new Error("invalid");
    return b;
  } catch {
    throw new P2PError(`Invalid ${fieldName}`, 400, "INVALID_MONEY_VALUE");
  }
}

function positiveBig(value, fieldName) {
  const b = toBig(value, fieldName);
  if (b.lte(0)) {
    throw new P2PError(
      `${fieldName} must be greater than zero`,
      400,
      "INVALID_MONEY_VALUE",
    );
  }
  return b;
}

function toSafeNumber(bigValue, fieldName = "amount") {
  const n = Number(bigValue.toString());
  if (!Number.isFinite(n) || Math.abs(n) > 1e15) {
    throw new P2PError(
      `${fieldName} is too large`,
      400,
      "MONEY_VALUE_TOO_LARGE",
    );
  }
  return n;
}

function normalizeUsdt(value) {
  const b = positiveBig(value, "USDT amount").round(
    USDT_DECIMALS,
    Big.roundDown,
  );
  if (b.lte(0))
    throw new P2PError(
      "USDT amount is too small",
      400,
      "USDT_AMOUNT_TOO_SMALL",
    );
  return b;
}

function normalizePrice(value) {
  const b = positiveBig(value, "price").round(PRICE_DECIMALS, Big.roundHalfUp);
  if (b.lte(0))
    throw new P2PError("Price is too small", 400, "PRICE_TOO_SMALL");
  return b;
}

function normalizeFiatAmount(value, currency) {
  const decimals = fiatDecimals(currency);
  const b = positiveBig(value, "fiat amount").round(decimals, Big.roundHalfUp);
  if (b.lte(0))
    throw new P2PError(
      "Fiat amount is too small",
      400,
      "FIAT_AMOUNT_TOO_SMALL",
    );
  return b;
}

function calculateOrderAmounts({
  price,
  usdtAmount,
  fiatAmount,
  fiatCurrency,
}) {
  const p = normalizePrice(price);
  const code = normalizeCurrency(fiatCurrency);
  const hasUsdt =
    usdtAmount !== undefined &&
    usdtAmount !== null &&
    String(usdtAmount).trim() !== "";
  const hasFiat =
    fiatAmount !== undefined &&
    fiatAmount !== null &&
    String(fiatAmount).trim() !== "";

  if (hasUsdt === hasFiat) {
    throw new P2PError(
      "Provide exactly one of usdtAmount or fiatAmount",
      400,
      "ORDER_AMOUNT_REQUIRED",
    );
  }

  let usdt;
  let fiat;

  if (hasUsdt) {
    usdt = normalizeUsdt(usdtAmount);
    fiat = usdt.times(p).round(fiatDecimals(code), Big.roundHalfUp);
  } else {
    fiat = normalizeFiatAmount(fiatAmount, code);
    usdt = fiat.div(p).round(USDT_DECIMALS, Big.roundDown);
    if (usdt.lte(0)) {
      throw new P2PError(
        "Order amount is too small",
        400,
        "ORDER_AMOUNT_TOO_SMALL",
      );
    }
    // Recalculate the payable fiat from the exact USDT quantity locked by the backend.
    fiat = usdt.times(p).round(fiatDecimals(code), Big.roundHalfUp);
  }

  return {
    price: toSafeNumber(p, "price"),
    usdtAmount: toSafeNumber(usdt, "USDT amount"),
    fiatAmount: toSafeNumber(fiat, "fiat amount"),
  };
}

function compare(valueA, valueB) {
  return toBig(valueA, "amount").cmp(toBig(valueB, "amount"));
}

// ============================================================
// utils/p2pCrypto.js
// ============================================================
function parseKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const b = Buffer.from(value, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

function getEncryptionKeys() {
  const current = parseKey(process.env.P2P_ENCRYPTION_KEY);
  if (!current) {
    throw new P2PError(
      "P2P encryption is not configured",
      500,
      "P2P_ENCRYPTION_NOT_CONFIGURED",
    );
  }

  const previous = String(process.env.P2P_ENCRYPTION_KEY_PREVIOUS || "")
    .split(",")
    .map((x) => parseKey(x))
    .filter(Boolean);

  return [current, ...previous];
}

function encryptJson(payload) {
  const [key] = getEncryptionKeys();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptJson(ciphertext) {
  const value = String(ciphertext || "");
  const [version, ivText, tagText, dataText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !dataText) {
    throw new P2PError(
      "Invalid encrypted payment data",
      500,
      "P2P_ENCRYPTED_DATA_INVALID",
    );
  }

  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const encrypted = Buffer.from(dataText, "base64url");

  for (const key of getEncryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString("utf8"));
    } catch {
      // Try the next key. This allows safe key rotation.
    }
  }

  throw new P2PError(
    "Unable to decrypt payment data",
    500,
    "P2P_DECRYPT_FAILED",
  );
}

function maskValue(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (s.length <= 4) return "*".repeat(Math.max(1, s.length));
  return `${"*".repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}

function buildMaskedDetails(details = {}) {
  if (!details || typeof details !== "object" || Array.isArray(details))
    return {};

  const masked = {};
  const safePlainKeys = [
    "bankName",
    "provider",
    "network",
    "branch",
    "country",
  ];
  for (const key of safePlainKeys) {
    if (details[key]) masked[key] = String(details[key]).slice(0, 120);
  }

  const maskKeys = [
    "accountNumber",
    "phone",
    "email",
    "handle",
    "wallet",
    "iban",
  ];
  for (const key of maskKeys) {
    if (details[key]) masked[key] = maskValue(details[key]);
  }

  return masked;
}

// ============================================================
// utils/p2pTransaction.js
// ============================================================
function isRetryableTransactionError(err) {
  return Boolean(
    err?.hasErrorLabel?.("TransientTransactionError") ||
    err?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
    err?.code === 112 || // WriteConflict
    err?.code === 251, // NoSuchTransaction
  );
}

async function withMongoTransaction(work, { maxRetries = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(
        async () => {
          result = await work(session);
        },
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        },
      );
      return result;
    } catch (err) {
      lastError = err;
      if (!isRetryableTransactionError(err) || attempt === maxRetries)
        throw err;
    } finally {
      await session.endSession();
    }
  }

  throw lastError;
}

// ============================================================
// services/p2pLedgerService.js
// ============================================================
async function appendLedgerEvent(
  {
    userId = null,
    adId = null,
    orderId = null,
    eventType,
    amount = 0,
    availableDelta = 0,
    lockedDelta = 0,
    availableAfter = null,
    lockedAfter = null,
    metadata = {},
  },
  session = null,
) {
  const docs = await P2PLedger.create(
    [
      {
        userId,
        adId,
        orderId,
        eventType,
        amount,
        availableDelta,
        lockedDelta,
        availableAfter,
        lockedAfter,
        metadata,
      },
    ],
    session ? { session } : undefined,
  );
  return docs[0];
}

// ============================================================
// services/p2pProfileService.js
// ============================================================
async function getOrCreateProfile(userId, session = null) {
  const query = P2PProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  return query;
}

async function ensureEligible(userId, { session = null } = {}) {
  const userQuery = User.findById(userId).select("username isFrozen");
  if (session) userQuery.session(session);
  const user = await userQuery;

  if (!user) throw new P2PError("User not found", 404, "USER_NOT_FOUND");
  if (user.isFrozen) {
    throw new P2PError("Account is frozen", 403, "ACCOUNT_FROZEN");
  }

  const profile = await getOrCreateProfile(userId, session);
  if (!profile.p2pEnabled) {
    throw new P2PError("P2P is disabled for this account", 403, "P2P_DISABLED");
  }
  if (profile.p2pFrozen) {
    throw new P2PError(
      profile.freezeReason || "P2P access is frozen",
      403,
      "P2P_FROZEN",
    );
  }

  return { user, profile };
}

function completionRate(profile) {
  if (!profile) return null;
  const completed = Number(profile.completedOrders || 0);
  const failures =
    Number(profile.cancelledByUser || 0) +
    Number(profile.paymentExpiredAsBuyer || 0);
  const denominator = completed + failures;
  if (denominator === 0) return null;
  return Math.round((completed / denominator) * 10000) / 100;
}

function positiveRate(profile) {
  if (!profile) return null;
  const positive = Number(profile.positiveReviews || 0);
  const negative = Number(profile.negativeReviews || 0);
  const total = positive + negative;
  if (total === 0) return null;
  return Math.round((positive / total) * 10000) / 100;
}

function serializeProfile(profile) {
  if (!profile) {
    return {
      completedOrders: 0,
      completionRate: null,
      positiveRate: null,
      completedVolumeUsdt: 0,
    };
  }

  return {
    completedOrders: Number(profile.completedOrders || 0),
    completionRate: completionRate(profile),
    positiveRate: positiveRate(profile),
    completedVolumeUsdt: Number(profile.completedVolumeUsdt || 0),
  };
}

async function recordParticipation(userIds, session) {
  const uniqueIds = [...new Set(userIds.map(String))];
  await Promise.all(
    uniqueIds.map((userId) =>
      P2PProfile.updateOne(
        { userId },
        {
          $setOnInsert: { userId },
          $inc: { totalParticipations: 1 },
        },
        { upsert: true, session, setDefaultsOnInsert: true },
      ),
    ),
  );
}

async function recordCompleted(userIds, usdtAmount, session) {
  const uniqueIds = [...new Set(userIds.map(String))];
  await Promise.all(
    uniqueIds.map((userId) =>
      P2PProfile.updateOne(
        { userId },
        {
          $setOnInsert: { userId },
          $inc: {
            completedOrders: 1,
            completedVolumeUsdt: Number(usdtAmount),
          },
        },
        { upsert: true, session, setDefaultsOnInsert: true },
      ),
    ),
  );
}

async function recordBuyerCancellation(userId, session) {
  await P2PProfile.updateOne(
    { userId },
    { $setOnInsert: { userId }, $inc: { cancelledByUser: 1 } },
    { upsert: true, session, setDefaultsOnInsert: true },
  );
}

async function recordBuyerExpiry(userId, session) {
  await P2PProfile.updateOne(
    { userId },
    { $setOnInsert: { userId }, $inc: { paymentExpiredAsBuyer: 1 } },
    { upsert: true, session, setDefaultsOnInsert: true },
  );
}

// ============================================================
// services/p2pPaymentMethodService.js
// ============================================================
function normalizeMethodType(value) {
  const type = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_\-]{2,40}$/.test(type)) {
    throw new P2PError(
      "Invalid payment method type",
      400,
      "INVALID_PAYMENT_METHOD_TYPE",
    );
  }
  return type;
}

function validateDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new P2PError(
      "Payment details must be an object",
      400,
      "INVALID_PAYMENT_DETAILS",
    );
  }
  const serialized = JSON.stringify(details);
  if (serialized.length > 5000) {
    throw new P2PError(
      "Payment details are too large",
      400,
      "PAYMENT_DETAILS_TOO_LARGE",
    );
  }
  return details;
}

function serializeOwnMethod(method, details = undefined) {
  return {
    id: method._id,
    currency: method.currency,
    methodType: method.methodType,
    label: method.label,
    accountHolderName: method.accountHolderName,
    maskedDetails: method.maskedDetails || {},
    details,
    isActive: Boolean(method.isActive),
    createdAt: method.createdAt,
    updatedAt: method.updatedAt,
  };
}

function serializePublicMethod(method) {
  const masked = method.maskedDetails || {};
  const publicDetails = {};
  for (const key of ["bankName", "provider", "network", "country"]) {
    if (masked[key]) publicDetails[key] = masked[key];
  }

  return {
    id: method._id,
    currency: method.currency,
    methodType: method.methodType,
    label: method.label,
    publicDetails,
  };
}

async function createPaymentMethod(userId, payload) {
  await ensureEligible(userId);

  const currency = normalizeCurrency(payload.currency);
  const methodType = normalizeMethodType(payload.methodType);
  const label = String(payload.label || "").trim();
  const accountHolderName = String(payload.accountHolderName || "").trim();
  const details = validateDetails(payload.details);

  if (!label || label.length > 80) {
    throw new P2PError(
      "Payment method label is required",
      400,
      "PAYMENT_LABEL_REQUIRED",
    );
  }
  if (!accountHolderName || accountHolderName.length > 120) {
    throw new P2PError(
      "Account holder name is required",
      400,
      "ACCOUNT_HOLDER_REQUIRED",
    );
  }

  const method = await P2PPaymentMethod.create({
    userId,
    currency,
    methodType,
    label,
    accountHolderName,
    maskedDetails: buildMaskedDetails(details),
    detailsEncrypted: encryptJson(details),
  });

  return serializeOwnMethod(method, details);
}

async function listMyPaymentMethods(
  userId,
  { currency, activeOnly = false } = {},
) {
  const filter = { userId };
  if (currency) filter.currency = normalizeCurrency(currency);
  if (activeOnly) filter.isActive = true;

  const methods = await P2PPaymentMethod.find(filter)
    .select("+detailsEncrypted")
    .sort({ createdAt: -1 });

  return methods.map((method) =>
    serializeOwnMethod(method, decryptJson(method.detailsEncrypted)),
  );
}

async function updatePaymentMethod(userId, methodId, payload) {
  if (!mongoose.isValidObjectId(methodId)) {
    throw new P2PError(
      "Payment method not found",
      404,
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  await ensureEligible(userId);
  const method = await P2PPaymentMethod.findOne({
    _id: methodId,
    userId,
  }).select("+detailsEncrypted");
  if (!method) {
    throw new P2PError(
      "Payment method not found",
      404,
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  const nextCurrency =
    payload.currency !== undefined
      ? normalizeCurrency(payload.currency)
      : method.currency;
  const nextMethodType =
    payload.methodType !== undefined
      ? normalizeMethodType(payload.methodType)
      : method.methodType;

  if (
    nextCurrency !== method.currency ||
    nextMethodType !== method.methodType
  ) {
    const activeAd = await P2PAdvertisement.exists({
      advertiserId: userId,
      side: "SELL",
      status: { $in: ["active", "paused"] },
      paymentMethodIds: method._id,
    });
    if (activeAd) {
      throw new P2PError(
        "Pause or cancel SELL advertisements using this payment method before changing its currency or type",
        409,
        "PAYMENT_METHOD_IN_USE",
      );
    }
  }

  method.currency = nextCurrency;
  method.methodType = nextMethodType;
  if (payload.label !== undefined) {
    const label = String(payload.label || "").trim();
    if (!label || label.length > 80) {
      throw new P2PError(
        "Invalid payment method label",
        400,
        "INVALID_PAYMENT_LABEL",
      );
    }
    method.label = label;
  }
  if (payload.accountHolderName !== undefined) {
    const name = String(payload.accountHolderName || "").trim();
    if (!name || name.length > 120) {
      throw new P2PError(
        "Invalid account holder name",
        400,
        "INVALID_ACCOUNT_HOLDER",
      );
    }
    method.accountHolderName = name;
  }
  if (payload.details !== undefined) {
    const details = validateDetails(payload.details);
    method.detailsEncrypted = encryptJson(details);
    method.maskedDetails = buildMaskedDetails(details);
  }

  await method.save();
  const decrypted = decryptJson(method.detailsEncrypted);
  return serializeOwnMethod(method, decrypted);
}

async function setPaymentMethodActive(userId, methodId, isActive) {
  if (typeof isActive !== "boolean") {
    throw new P2PError(
      "isActive must be true or false",
      400,
      "INVALID_ACTIVE_FLAG",
    );
  }
  if (!mongoose.isValidObjectId(methodId)) {
    throw new P2PError(
      "Payment method not found",
      404,
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  await ensureEligible(userId);
  const method = await P2PPaymentMethod.findOne({ _id: methodId, userId });
  if (!method) {
    throw new P2PError(
      "Payment method not found",
      404,
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  if (!isActive) {
    const activeAd = await P2PAdvertisement.exists({
      advertiserId: userId,
      side: "SELL",
      status: { $in: ["active", "paused"] },
      paymentMethodIds: method._id,
    });
    if (activeAd) {
      throw new P2PError(
        "Pause or cancel SELL advertisements using this payment method first",
        409,
        "PAYMENT_METHOD_IN_USE",
      );
    }
  }

  method.isActive = Boolean(isActive);
  await method.save();
  return serializeOwnMethod(method);
}

async function getPaymentMethodForOrder({
  methodId,
  ownerId,
  currency,
  allowedTypes,
  session,
}) {
  if (!mongoose.isValidObjectId(methodId)) {
    throw new P2PError(
      "Payment method not found",
      404,
      "PAYMENT_METHOD_NOT_FOUND",
    );
  }

  const query = P2PPaymentMethod.findOne({
    _id: methodId,
    userId: ownerId,
    currency: normalizeCurrency(currency),
    isActive: true,
  }).select("+detailsEncrypted");
  if (session) query.session(session);
  const method = await query;

  if (!method) {
    throw new P2PError(
      "Payment method is not available",
      400,
      "PAYMENT_METHOD_UNAVAILABLE",
    );
  }

  if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
    const allowed = allowedTypes.map(normalizeMethodType);
    if (!allowed.includes(method.methodType)) {
      throw new P2PError(
        "This payment method is not accepted by the advertisement",
        400,
        "PAYMENT_METHOD_NOT_ACCEPTED",
      );
    }
  }

  return method;
}

// ============================================================
// services/p2pBalanceService.js
// ============================================================
function cleanAmount(value) {
  return toSafeNumber(normalizeUsdt(value), "USDT amount");
}

async function reserveUsdt(userId, amount, session) {
  const qty = cleanAmount(amount);
  const updated = await Balance.findOneAndUpdate(
    { userId, asset: "USDT", available: { $gte: qty } },
    { $inc: { available: -qty, locked: qty } },
    { new: true, session },
  );

  if (!updated) {
    throw new P2PError(
      "Insufficient available USDT balance",
      400,
      "INSUFFICIENT_USDT",
    );
  }
  return updated;
}

async function unlockUsdt(userId, amount, session) {
  const qty = cleanAmount(amount);
  const updated = await Balance.findOneAndUpdate(
    { userId, asset: "USDT", locked: { $gte: qty } },
    { $inc: { available: qty, locked: -qty } },
    { new: true, session },
  );

  if (!updated) {
    throw new P2PError(
      "USDT escrow balance is inconsistent",
      409,
      "P2P_ESCROW_INCONSISTENT",
    );
  }
  return updated;
}

async function creditUsdt(userId, amount, session) {
  const qty = cleanAmount(amount);

  try {
    return await Balance.findOneAndUpdate(
      { userId, asset: "USDT" },
      {
        $setOnInsert: { userId, asset: "USDT", locked: 0 },
        $inc: { available: qty },
      },
      { new: true, upsert: true, session, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return Balance.findOneAndUpdate(
      { userId, asset: "USDT" },
      { $inc: { available: qty } },
      { new: true, session },
    );
  }
}

async function settleEscrow({ sellerId, buyerId, amount, session }) {
  if (String(sellerId) === String(buyerId)) {
    throw new P2PError(
      "Buyer and seller cannot be the same user",
      400,
      "SELF_TRADE_BLOCKED",
    );
  }

  const qty = cleanAmount(amount);
  const sellerBalance = await Balance.findOneAndUpdate(
    { userId: sellerId, asset: "USDT", locked: { $gte: qty } },
    { $inc: { locked: -qty } },
    { new: true, session },
  );

  if (!sellerBalance) {
    throw new P2PError(
      "Seller escrow balance is inconsistent",
      409,
      "P2P_ESCROW_INCONSISTENT",
    );
  }

  const buyerBalance = await creditUsdt(buyerId, qty, session);
  return { sellerBalance, buyerBalance };
}

// ============================================================
// services/p2pAdService.js
// ============================================================
function normalizeSide(value) {
  const side = String(value || "")
    .trim()
    .toUpperCase();
  if (!["BUY", "SELL"].includes(side)) {
    throw new P2PError(
      "Advertisement side must be BUY or SELL",
      400,
      "INVALID_AD_SIDE",
    );
  }
  return side;
}

function normalizeIntent(value) {
  const intent = String(value || "")
    .trim()
    .toUpperCase();
  if (!["BUY", "SELL"].includes(intent)) {
    throw new P2PError(
      "intent must be BUY or SELL",
      400,
      "INVALID_MARKET_INTENT",
    );
  }
  return intent;
}

function cleanTerms(value) {
  const terms = String(value || "").trim();
  if (terms.length > 1000) {
    throw new P2PError(
      "Advertisement terms are too long",
      400,
      "AD_TERMS_TOO_LONG",
    );
  }
  return terms;
}

function normalizeIdArray(values) {
  if (!Array.isArray(values)) return [];
  const unique = [...new Set(values.map(String).filter(Boolean))];
  if (unique.some((id) => !mongoose.isValidObjectId(id))) {
    throw new P2PError(
      "Invalid payment method ID",
      400,
      "INVALID_PAYMENT_METHOD_ID",
    );
  }
  return unique;
}

async function loadSellPaymentMethods(
  userId,
  currency,
  paymentMethodIds,
  session = null,
) {
  const ids = normalizeIdArray(paymentMethodIds);
  if (ids.length === 0) {
    throw new P2PError(
      "SELL advertisements require at least one active payment method",
      400,
      "PAYMENT_METHOD_REQUIRED",
    );
  }

  const query = P2PPaymentMethod.find({
    _id: { $in: ids },
    userId,
    currency,
    isActive: true,
  });
  if (session) query.session(session);
  const methods = await query;

  if (methods.length !== ids.length) {
    throw new P2PError(
      "One or more payment methods are invalid, inactive, or use a different currency",
      400,
      "PAYMENT_METHOD_INVALID",
    );
  }

  return methods;
}

function normalizeMethodTypes(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeMethodType))];
}

function validateAdNumbers({
  price,
  totalUsdt,
  minFiat,
  maxFiat,
  fiatCurrency,
}) {
  const p = normalizePrice(price);
  const total = normalizeUsdt(totalUsdt);
  const min = normalizeFiatAmount(minFiat, fiatCurrency);
  const max = normalizeFiatAmount(maxFiat, fiatCurrency);

  if (max.lt(min)) {
    throw new P2PError(
      "Maximum order must be at least the minimum order",
      400,
      "INVALID_ORDER_LIMITS",
    );
  }

  const totalFiat = total.times(p);
  if (totalFiat.lt(min)) {
    throw new P2PError(
      "Advertisement total is smaller than its minimum order",
      400,
      "AD_TOTAL_BELOW_MINIMUM",
    );
  }

  return {
    price: toSafeNumber(p, "price"),
    totalUsdt: toSafeNumber(total, "USDT amount"),
    minFiat: toSafeNumber(min, "minimum fiat"),
    maxFiat: toSafeNumber(max, "maximum fiat"),
  };
}

async function createAdvertisement(userId, payload) {
  const side = normalizeSide(payload.side);
  const fiatCurrency = normalizeCurrency(payload.fiatCurrency);
  const terms = cleanTerms(payload.terms);
  const values = validateAdNumbers({
    price: payload.price,
    totalUsdt: payload.totalUsdt,
    minFiat: payload.minFiat,
    maxFiat: payload.maxFiat,
    fiatCurrency,
  });

  return withMongoTransaction(async (session) => {
    await ensureEligible(userId, { session });

    let paymentMethodIds = [];
    let paymentMethodTypes = [];

    if (side === "SELL") {
      const methods = await loadSellPaymentMethods(
        userId,
        fiatCurrency,
        payload.paymentMethodIds,
        session,
      );
      paymentMethodIds = methods.map((m) => m._id);
      paymentMethodTypes = [...new Set(methods.map((m) => m.methodType))];
    } else {
      paymentMethodTypes = normalizeMethodTypes(payload.paymentMethodTypes);
      if (paymentMethodTypes.length === 0) {
        throw new P2PError(
          "BUY advertisements require at least one accepted payment method type",
          400,
          "PAYMENT_METHOD_TYPE_REQUIRED",
        );
      }
    }

    let reservedBalance = null;
    if (side === "SELL") {
      reservedBalance = await reserveUsdt(userId, values.totalUsdt, session);
    }

    const [ad] = await P2PAdvertisement.create(
      [
        {
          reference: makeReference("P2PAD"),
          advertiserId: userId,
          side,
          fiatCurrency,
          price: values.price,
          totalUsdt: values.totalUsdt,
          remainingUsdt: values.totalUsdt,
          openOrderUsdt: 0,
          minFiat: values.minFiat,
          maxFiat: values.maxFiat,
          paymentMethodIds,
          paymentMethodTypes,
          terms,
          status: "active",
        },
      ],
      { session },
    );

    if (side === "SELL") {
      await appendLedgerEvent(
        {
          userId,
          adId: ad._id,
          eventType: "AD_RESERVE",
          amount: values.totalUsdt,
          availableDelta: -values.totalUsdt,
          lockedDelta: values.totalUsdt,
          availableAfter: reservedBalance.available,
          lockedAfter: reservedBalance.locked,
          metadata: { fiatCurrency, side },
        },
        session,
      );
    }

    return ad.toObject();
  });
}

async function buildMarketRows(ads) {
  if (ads.length === 0) return [];

  const advertiserIds = [...new Set(ads.map((a) => String(a.advertiserId)))];
  const paymentIds = [
    ...new Set(
      ads
        .filter((a) => a.side === "SELL")
        .flatMap((a) => (a.paymentMethodIds || []).map(String)),
    ),
  ];

  const [users, profiles, methods] = await Promise.all([
    User.find({ _id: { $in: advertiserIds } })
      .select("username isFrozen")
      .lean(),
    P2PProfile.find({ userId: { $in: advertiserIds } }).lean(),
    paymentIds.length
      ? P2PPaymentMethod.find({
          _id: { $in: paymentIds },
          isActive: true,
        }).lean()
      : [],
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));
  const methodMap = new Map(methods.map((m) => [String(m._id), m]));

  return ads
    .filter((ad) => {
      const user = userMap.get(String(ad.advertiserId));
      const profile = profileMap.get(String(ad.advertiserId));
      return (
        user &&
        !user.isFrozen &&
        profile?.p2pEnabled !== false &&
        profile?.p2pFrozen !== true
      );
    })
    .map((ad) => {
      const user = userMap.get(String(ad.advertiserId));
      const publicMethods =
        ad.side === "SELL"
          ? (ad.paymentMethodIds || [])
              .map((id) => methodMap.get(String(id)))
              .filter(Boolean)
              .map(serializePublicMethod)
          : [];

      return {
        id: ad._id,
        reference: ad.reference,
        side: ad.side,
        asset: "USDT",
        fiatCurrency: ad.fiatCurrency,
        price: ad.price,
        remainingUsdt: ad.remainingUsdt,
        minFiat: ad.minFiat,
        maxFiat: ad.maxFiat,
        effectiveMaxFiat: Math.min(
          Number(ad.maxFiat || 0),
          Number(ad.remainingUsdt || 0) * Number(ad.price || 0),
        ),
        status: ad.status,
        terms: ad.terms,
        paymentMethodTypes: ad.paymentMethodTypes || [],
        paymentMethods: publicMethods,
        advertiser: {
          id: ad.advertiserId,
          username: user.username,
          stats: serializeProfile(profileMap.get(String(ad.advertiserId))),
        },
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      };
    })
    .filter((ad) => ad.side !== "SELL" || ad.paymentMethods.length > 0);
}

async function listMarketAdvertisements({
  intent,
  fiatCurrency,
  fiatAmount,
  paymentMethodType,
  page = 1,
  limit = 20,
}) {
  const marketIntent = normalizeIntent(intent);
  const side = marketIntent === "BUY" ? "SELL" : "BUY";
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = {
    status: "active",
    side,
    remainingUsdt: { $gt: 0 },
  };

  if (fiatCurrency) filter.fiatCurrency = normalizeCurrency(fiatCurrency);
  if (paymentMethodType)
    filter.paymentMethodTypes = normalizeMethodType(paymentMethodType);
  if (
    fiatAmount !== undefined &&
    fiatAmount !== null &&
    String(fiatAmount).trim() !== ""
  ) {
    const currency = filter.fiatCurrency;
    if (!currency) {
      throw new P2PError(
        "fiatCurrency is required when filtering by amount",
        400,
        "FIAT_CURRENCY_REQUIRED",
      );
    }
    const amount = toSafeNumber(
      normalizeFiatAmount(fiatAmount, currency),
      "fiat amount",
    );
    filter.minFiat = { $lte: amount };
    filter.maxFiat = { $gte: amount };
    filter.$expr = {
      $gte: [{ $multiply: ["$remainingUsdt", "$price"] }, amount],
    };
  }

  const sort =
    marketIntent === "BUY"
      ? { price: 1, createdAt: 1 }
      : { price: -1, createdAt: 1 };

  const [ads, total] = await Promise.all([
    P2PAdvertisement.find(filter)
      .sort(sort)
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    P2PAdvertisement.countDocuments(filter),
  ]);

  return {
    data: await buildMarketRows(ads),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

async function listActiveCurrencies(intent) {
  const marketIntent = normalizeIntent(intent);
  const side = marketIntent === "BUY" ? "SELL" : "BUY";

  const rows = await P2PAdvertisement.aggregate([
    {
      $match: {
        status: "active",
        side,
        remainingUsdt: { $gt: 0 },
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "advertiserId",
        foreignField: "_id",
        as: "advertiserUser",
      },
    },
    { $unwind: "$advertiserUser" },
    { $match: { "advertiserUser.isFrozen": { $ne: true } } },
    {
      $lookup: {
        from: P2PProfile.collection.name,
        localField: "advertiserId",
        foreignField: "userId",
        as: "advertiserProfile",
      },
    },
    {
      $match: {
        "advertiserProfile.p2pFrozen": { $ne: true },
        "advertiserProfile.p2pEnabled": { $ne: false },
      },
    },
    {
      $group: {
        _id: "$fiatCurrency",
        activeAds: { $sum: 1 },
        advertisers: { $addToSet: "$advertiserId" },
        totalUsdt: { $sum: "$remainingUsdt" },
      },
    },
    {
      $project: {
        _id: 0,
        currency: "$_id",
        activeAds: 1,
        advertiserCount: { $size: "$advertisers" },
        totalUsdt: 1,
      },
    },
    { $sort: { advertiserCount: -1, activeAds: -1, currency: 1 } },
  ]);

  return rows;
}

async function listMyAdvertisements(
  userId,
  { status, page = 1, limit = 50 } = {},
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const filter = { advertiserId: userId };
  if (status) filter.status = String(status).toLowerCase();

  const [data, total] = await Promise.all([
    P2PAdvertisement.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    P2PAdvertisement.countDocuments(filter),
  ]);

  return { data, total, page: safePage, limit: safeLimit };
}

async function getAdvertisement(adId) {
  if (!mongoose.isValidObjectId(adId)) {
    throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
  }
  const ad = await P2PAdvertisement.findById(adId).lean();
  if (!ad) throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
  const rows = await buildMarketRows([ad]);
  return rows[0] || null;
}

async function updateAdvertisement(userId, adId, payload) {
  if (!mongoose.isValidObjectId(adId)) {
    throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
  }

  return withMongoTransaction(async (session) => {
    await ensureEligible(userId, { session });
    const ad = await P2PAdvertisement.findOne({
      _id: adId,
      advertiserId: userId,
    }).session(session);
    if (!ad) throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
    if (!["active", "paused"].includes(ad.status)) {
      throw new P2PError(
        "This advertisement can no longer be edited",
        409,
        "AD_NOT_EDITABLE",
      );
    }

    if (payload.price !== undefined) {
      ad.price = toSafeNumber(normalizePrice(payload.price), "price");
    }
    if (payload.minFiat !== undefined) {
      ad.minFiat = toSafeNumber(
        normalizeFiatAmount(payload.minFiat, ad.fiatCurrency),
        "minimum fiat",
      );
    }
    if (payload.maxFiat !== undefined) {
      ad.maxFiat = toSafeNumber(
        normalizeFiatAmount(payload.maxFiat, ad.fiatCurrency),
        "maximum fiat",
      );
    }
    if (
      toBig(ad.maxFiat, "maximum fiat").lt(toBig(ad.minFiat, "minimum fiat"))
    ) {
      throw new P2PError(
        "Maximum order must be at least the minimum order",
        400,
        "INVALID_ORDER_LIMITS",
      );
    }
    if (payload.terms !== undefined) ad.terms = cleanTerms(payload.terms);

    if (ad.side === "SELL" && payload.paymentMethodIds !== undefined) {
      const methods = await loadSellPaymentMethods(
        userId,
        ad.fiatCurrency,
        payload.paymentMethodIds,
        session,
      );
      ad.paymentMethodIds = methods.map((m) => m._id);
      ad.paymentMethodTypes = [...new Set(methods.map((m) => m.methodType))];
    }

    if (ad.side === "BUY" && payload.paymentMethodTypes !== undefined) {
      const types = normalizeMethodTypes(payload.paymentMethodTypes);
      if (types.length === 0) {
        throw new P2PError(
          "BUY advertisements require at least one accepted payment method type",
          400,
          "PAYMENT_METHOD_TYPE_REQUIRED",
        );
      }
      ad.paymentMethodTypes = types;
    }

    const remainingFiat = toBig(ad.remainingUsdt || 0, "remaining USDT").times(
      toBig(ad.price, "price"),
    );
    if (
      ad.remainingUsdt > 0 &&
      remainingFiat.lt(toBig(ad.minFiat, "minimum fiat"))
    ) {
      throw new P2PError(
        "Minimum order is larger than the advertisement's remaining value",
        400,
        "MINIMUM_ABOVE_REMAINING",
      );
    }

    await ad.save({ session });
    return ad.toObject();
  });
}

async function setAdvertisementStatus(userId, adId, action) {
  if (!mongoose.isValidObjectId(adId)) {
    throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
  }

  return withMongoTransaction(async (session) => {
    const ad = await P2PAdvertisement.findOne({
      _id: adId,
      advertiserId: userId,
    }).session(session);
    if (!ad) throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");

    if (action === "pause") {
      if (ad.status !== "active") {
        throw new P2PError(
          "Only active advertisements can be paused",
          409,
          "AD_NOT_ACTIVE",
        );
      }
      ad.status = "paused";
      await ad.save({ session });
      return ad.toObject();
    }

    if (action === "resume") {
      await ensureEligible(userId, { session });
      if (ad.status !== "paused") {
        throw new P2PError(
          "Only paused advertisements can be resumed",
          409,
          "AD_NOT_PAUSED",
        );
      }
      if (Number(ad.remainingUsdt || 0) <= 0) {
        throw new P2PError(
          "Advertisement has no remaining amount",
          409,
          "AD_EMPTY",
        );
      }
      ad.status = "active";
      await ad.save({ session });
      return ad.toObject();
    }

    if (action === "cancel") {
      if (!["active", "paused"].includes(ad.status)) {
        throw new P2PError(
          "Advertisement cannot be cancelled",
          409,
          "AD_NOT_CANCELLABLE",
        );
      }

      const unfilled = Number(ad.remainingUsdt || 0);
      ad.cancelledUnfilledUsdt = unfilled;
      ad.remainingUsdt = 0;
      ad.status = "cancelled";

      if (ad.side === "SELL" && unfilled > 0) {
        const balance = await unlockUsdt(userId, unfilled, session);
        await appendLedgerEvent(
          {
            userId,
            adId: ad._id,
            eventType: "AD_UNLOCK",
            amount: unfilled,
            availableDelta: unfilled,
            lockedDelta: -unfilled,
            availableAfter: balance.available,
            lockedAfter: balance.locked,
            metadata: { reason: "ADVERTISEMENT_CANCELLED" },
          },
          session,
        );
      }

      await ad.save({ session });
      return ad.toObject();
    }

    throw new P2PError(
      "Invalid advertisement action",
      400,
      "INVALID_AD_ACTION",
    );
  });
}

// ============================================================
// services/p2pOrderService.js
// ============================================================
function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:\-]{8,128}$/.test(key)) {
    throw new P2PError(
      "A valid Idempotency-Key is required for order creation",
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  return key;
}

function paymentWindowMinutes() {
  const raw = Number(process.env.P2P_PAYMENT_WINDOW_MINUTES || 15);
  if (!Number.isFinite(raw)) return 15;
  return Math.min(120, Math.max(5, Math.floor(raw)));
}

function cleanUsdtNumber(value) {
  return toSafeNumber(normalizeUsdt(value), "USDT amount");
}

function addUsdt(a, b) {
  return Number(
    toBig(a || 0, "USDT amount")
      .plus(toBig(b || 0, "USDT amount"))
      .round(6)
      .toString(),
  );
}

function subtractUsdt(a, b) {
  const result = toBig(a || 0, "USDT amount")
    .minus(toBig(b || 0, "USDT amount"))
    .round(6);
  return Number(
    (result.lt(0) && result.gt(-0.000001)
      ? toBig(0, "USDT amount")
      : result
    ).toString(),
  );
}

async function createPaymentSnapshot(method) {
  const details = decryptJson(method.detailsEncrypted);
  return {
    summary: serializePublicMethod(method),
    encrypted: encryptJson({
      accountHolderName: method.accountHolderName,
      details,
    }),
  };
}

async function createOrder(takerId, payload, idempotencyKeyInput) {
  const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyInput);
  if (!mongoose.isValidObjectId(payload.adId)) {
    throw new P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
  }

  const existing = await P2POrder.findOne({ takerId, idempotencyKey });
  if (existing) return getOrderForUser(takerId, existing._id);

  let createdOrderId;

  try {
    await withMongoTransaction(async (session) => {
      const duplicate = await P2POrder.findOne({
        takerId,
        idempotencyKey,
      }).session(session);
      if (duplicate) {
        createdOrderId = duplicate._id;
        return;
      }

      await ensureEligible(takerId, { session });

      const ad = await P2PAdvertisement.findOne({
        _id: payload.adId,
        status: "active",
        remainingUsdt: { $gt: 0 },
      }).session(session);

      if (!ad) {
        throw new P2PError(
          "Advertisement is no longer available",
          409,
          "AD_UNAVAILABLE",
        );
      }
      if (String(ad.advertiserId) === String(takerId)) {
        throw new P2PError(
          "You cannot trade with your own advertisement",
          400,
          "SELF_TRADE_BLOCKED",
        );
      }

      await ensureEligible(ad.advertiserId, { session });

      const amounts = calculateOrderAmounts({
        price: ad.price,
        usdtAmount: payload.usdtAmount,
        fiatAmount: payload.fiatAmount,
        fiatCurrency: ad.fiatCurrency,
      });

      if (
        toBig(amounts.usdtAmount, "USDT amount").gt(
          toBig(ad.remainingUsdt, "remaining USDT"),
        )
      ) {
        throw new P2PError(
          "Advertisement does not have enough remaining USDT",
          409,
          "AD_INSUFFICIENT_REMAINING",
        );
      }
      if (
        toBig(amounts.fiatAmount, "fiat amount").lt(
          toBig(ad.minFiat, "minimum fiat"),
        )
      ) {
        throw new P2PError(
          "Order is below the advertisement minimum",
          400,
          "ORDER_BELOW_MINIMUM",
        );
      }
      if (
        toBig(amounts.fiatAmount, "fiat amount").gt(
          toBig(ad.maxFiat, "maximum fiat"),
        )
      ) {
        throw new P2PError(
          "Order exceeds the advertisement maximum",
          400,
          "ORDER_ABOVE_MAXIMUM",
        );
      }

      let buyerId;
      let sellerId;
      let method;

      if (ad.side === "SELL") {
        sellerId = ad.advertiserId;
        buyerId = takerId;

        const allowedIds = (ad.paymentMethodIds || []).map(String);
        let methodId = payload.paymentMethodId
          ? String(payload.paymentMethodId)
          : "";
        if (!methodId && allowedIds.length === 1) methodId = allowedIds[0];
        if (!methodId || !allowedIds.includes(methodId)) {
          throw new P2PError(
            "Select one of the advertiser's payment methods",
            400,
            "PAYMENT_METHOD_REQUIRED",
          );
        }

        method = await getPaymentMethodForOrder({
          methodId,
          ownerId: ad.advertiserId,
          currency: ad.fiatCurrency,
          allowedTypes: ad.paymentMethodTypes,
          session,
        });
      } else {
        buyerId = ad.advertiserId;
        sellerId = takerId;

        if (!payload.paymentMethodId) {
          throw new P2PError(
            "A receiving payment method is required when selling USDT",
            400,
            "PAYMENT_METHOD_REQUIRED",
          );
        }

        method = await getPaymentMethodForOrder({
          methodId: payload.paymentMethodId,
          ownerId: takerId,
          currency: ad.fiatCurrency,
          allowedTypes: ad.paymentMethodTypes,
          session,
        });
      }

      const updatedAd = await P2PAdvertisement.findOneAndUpdate(
        {
          _id: ad._id,
          status: "active",
          remainingUsdt: { $gte: amounts.usdtAmount },
        },
        {
          $inc: {
            remainingUsdt: -amounts.usdtAmount,
            openOrderUsdt: amounts.usdtAmount,
          },
        },
        { new: true, session },
      );

      if (!updatedAd) {
        throw new P2PError(
          "Advertisement changed while creating the order. Please try again.",
          409,
          "AD_CHANGED",
        );
      }

      let escrowBalance = null;
      if (ad.side === "BUY") {
        escrowBalance = await reserveUsdt(
          sellerId,
          amounts.usdtAmount,
          session,
        );
      }

      const paymentSnapshot = await createPaymentSnapshot(method);
      const now = new Date();
      const paymentDeadlineAt = new Date(
        now.getTime() + paymentWindowMinutes() * 60 * 1000,
      );

      const [order] = await P2POrder.create(
        [
          {
            reference: makeReference("P2P"),
            adId: ad._id,
            advertiserId: ad.advertiserId,
            takerId,
            buyerId,
            sellerId,
            adSide: ad.side,
            fiatCurrency: ad.fiatCurrency,
            price: amounts.price,
            usdtAmount: amounts.usdtAmount,
            fiatAmount: amounts.fiatAmount,
            paymentMethodId: method._id,
            paymentMethodSummary: paymentSnapshot.summary,
            paymentDetailsEncrypted: paymentSnapshot.encrypted,
            status: "awaiting_payment",
            paymentDeadlineAt,
            idempotencyKey,
          },
        ],
        { session },
      );

      createdOrderId = order._id;

      if (ad.side === "BUY") {
        await appendLedgerEvent(
          {
            userId: sellerId,
            adId: ad._id,
            orderId: order._id,
            eventType: "ORDER_ESCROW_LOCK",
            amount: amounts.usdtAmount,
            availableDelta: -amounts.usdtAmount,
            lockedDelta: amounts.usdtAmount,
            availableAfter: escrowBalance.available,
            lockedAfter: escrowBalance.locked,
          },
          session,
        );
      } else {
        await appendLedgerEvent(
          {
            userId: sellerId,
            adId: ad._id,
            orderId: order._id,
            eventType: "ORDER_ALLOCATED_FROM_AD_ESCROW",
            amount: amounts.usdtAmount,
            metadata: { balanceMovement: false },
          },
          session,
        );
      }

      await appendLedgerEvent(
        {
          userId: buyerId,
          adId: ad._id,
          orderId: order._id,
          eventType: "ORDER_CREATED",
          amount: amounts.usdtAmount,
          metadata: {
            fiatCurrency: ad.fiatCurrency,
            fiatAmount: amounts.fiatAmount,
            price: amounts.price,
          },
        },
        session,
      );

      await recordParticipation([buyerId, sellerId], session);
    });
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await P2POrder.findOne({ takerId, idempotencyKey });
      if (duplicate) return getOrderForUser(takerId, duplicate._id);
    }
    throw err;
  }

  return getOrderForUser(takerId, createdOrderId);
}

async function hydrateUsers(orders) {
  const ids = [
    ...new Set(orders.flatMap((o) => [String(o.buyerId), String(o.sellerId)])),
  ];
  const users = await User.find({ _id: { $in: ids } })
    .select("username")
    .lean();
  const map = new Map(users.map((u) => [String(u._id), u]));
  return map;
}

function serializeOrderBase(order, userMap) {
  const buyer = userMap?.get(String(order.buyerId));
  const seller = userMap?.get(String(order.sellerId));
  return {
    id: order._id,
    reference: order.reference,
    adId: order.adId,
    advertiserId: order.advertiserId,
    takerId: order.takerId,
    buyer: { id: order.buyerId, username: buyer?.username || null },
    seller: { id: order.sellerId, username: seller?.username || null },
    adSide: order.adSide,
    asset: "USDT",
    fiatCurrency: order.fiatCurrency,
    price: order.price,
    usdtAmount: order.usdtAmount,
    fiatAmount: order.fiatAmount,
    paymentMethodSummary: order.paymentMethodSummary,
    status: order.status,
    paymentDeadlineAt: order.paymentDeadlineAt,
    paidAt: order.paidAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    expiredAt: order.expiredAt,
    appealedAt: order.appealedAt,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function getOrderForUser(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const order = await P2POrder.findOne({
    _id: orderId,
    $or: [{ buyerId: userId }, { sellerId: userId }],
  }).select("+paymentDetailsEncrypted");

  if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  const userMap = await hydrateUsers([order]);
  const result = serializeOrderBase(order, userMap);

  const privatePayment = decryptJson(order.paymentDetailsEncrypted);
  result.paymentMethod = {
    ...order.paymentMethodSummary,
    accountHolderName: privatePayment.accountHolderName,
    details: privatePayment.details,
  };

  result.role = String(order.buyerId) === String(userId) ? "BUYER" : "SELLER";
  return result;
}

async function listMyOrders(userId, { status, page = 1, limit = 30 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const filter = { $or: [{ buyerId: userId }, { sellerId: userId }] };
  if (status) filter.status = String(status).toLowerCase();

  const [orders, total] = await Promise.all([
    P2POrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    P2POrder.countDocuments(filter),
  ]);

  const userMap = await hydrateUsers(orders);
  return {
    data: orders.map((o) => ({
      ...serializeOrderBase(o, userMap),
      role: String(o.buyerId) === String(userId) ? "BUYER" : "SELLER",
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

async function updateAdAfterTerminalOrder(
  order,
  session,
  { restoreRemaining },
) {
  const ad = await P2PAdvertisement.findById(order.adId).session(session);
  if (!ad) {
    throw new P2PError(
      "Advertisement record is missing",
      409,
      "AD_RECORD_MISSING",
    );
  }

  ad.openOrderUsdt = Math.max(
    0,
    subtractUsdt(ad.openOrderUsdt, order.usdtAmount),
  );
  if (restoreRemaining && ["active", "paused"].includes(ad.status)) {
    ad.remainingUsdt = addUsdt(ad.remainingUsdt, order.usdtAmount);
  }

  if (
    ["active", "paused"].includes(ad.status) &&
    Number(ad.remainingUsdt || 0) <= 0.0000001 &&
    Number(ad.openOrderUsdt || 0) <= 0.0000001
  ) {
    ad.remainingUsdt = 0;
    ad.openOrderUsdt = 0;
    ad.status = "filled";
  }

  await ad.save({ session });
  return ad;
}

async function releaseEscrowForCancelledOrder(order, ad, session, eventType) {
  let shouldUnlock = false;

  if (order.adSide === "BUY") {
    // The taker/seller locked USDT specifically for this order.
    shouldUnlock = true;
  } else if (!["active", "paused"].includes(ad.status)) {
    // SELL ad escrow only stays locked if the advertisement still owns the inventory.
    shouldUnlock = true;
  }

  if (!shouldUnlock) {
    await appendLedgerEvent(
      {
        userId: order.sellerId,
        adId: order.adId,
        orderId: order._id,
        eventType: "ORDER_RETURNED_TO_AD_ESCROW",
        amount: order.usdtAmount,
        metadata: { reason: eventType },
      },
      session,
    );
    return;
  }

  const balance = await unlockUsdt(order.sellerId, order.usdtAmount, session);
  await appendLedgerEvent(
    {
      userId: order.sellerId,
      adId: order.adId,
      orderId: order._id,
      eventType: "ORDER_ESCROW_UNLOCK",
      amount: order.usdtAmount,
      availableDelta: order.usdtAmount,
      lockedDelta: -order.usdtAmount,
      availableAfter: balance.available,
      lockedAfter: balance.locked,
      metadata: { reason: eventType },
    },
    session,
  );
}

async function expireOrderInSession(order, session) {
  if (order.status !== "awaiting_payment") return false;

  const ad = await P2PAdvertisement.findById(order.adId).session(session);
  if (!ad)
    throw new P2PError(
      "Advertisement record is missing",
      409,
      "AD_RECORD_MISSING",
    );

  order.status = "expired";
  order.expiredAt = new Date();
  order.cancelReason = "PAYMENT_TIMEOUT";

  await updateAdAfterTerminalOrder(order, session, { restoreRemaining: true });
  await releaseEscrowForCancelledOrder(order, ad, session, "PAYMENT_TIMEOUT");
  await order.save({ session });
  await recordBuyerExpiry(order.buyerId, session);

  await appendLedgerEvent(
    {
      userId: order.buyerId,
      adId: order.adId,
      orderId: order._id,
      eventType: "ORDER_EXPIRED",
      amount: order.usdtAmount,
    },
    session,
  );
  return true;
}

async function markPaid(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  let expired = false;
  await withMongoTransaction(async (session) => {
    const order = await P2POrder.findOne({
      _id: orderId,
      buyerId: userId,
    }).session(session);
    if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.status === "paid") return;
    if (order.status !== "awaiting_payment") {
      throw new P2PError(
        "Order cannot be marked paid in its current state",
        409,
        "ORDER_STATE_INVALID",
      );
    }

    if (new Date(order.paymentDeadlineAt).getTime() <= Date.now()) {
      expired = await expireOrderInSession(order, session);
      return;
    }

    order.status = "paid";
    order.paidAt = new Date();
    await order.save({ session });

    await appendLedgerEvent(
      {
        userId,
        adId: order.adId,
        orderId: order._id,
        eventType: "ORDER_MARKED_PAID",
        amount: order.usdtAmount,
      },
      session,
    );
  });

  if (expired) {
    throw new P2PError(
      "Payment window expired and the order was released",
      409,
      "ORDER_EXPIRED",
    );
  }
  return getOrderForUser(userId, orderId);
}

async function releaseOrder(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  await withMongoTransaction(async (session) => {
    const order = await P2POrder.findOne({
      _id: orderId,
      sellerId: userId,
    }).session(session);
    if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.status === "completed") return;
    if (order.status !== "paid") {
      throw new P2PError(
        "USDT can only be released after payment is marked paid",
        409,
        "ORDER_NOT_PAID",
      );
    }

    const balances = await settleEscrow({
      sellerId: order.sellerId,
      buyerId: order.buyerId,
      amount: order.usdtAmount,
      session,
    });

    order.status = "completed";
    order.completedAt = new Date();
    await order.save({ session });

    await updateAdAfterTerminalOrder(order, session, {
      restoreRemaining: false,
    });

    await appendLedgerEvent(
      {
        userId: order.sellerId,
        adId: order.adId,
        orderId: order._id,
        eventType: "ORDER_RELEASE_DEBIT",
        amount: order.usdtAmount,
        lockedDelta: -order.usdtAmount,
        availableAfter: balances.sellerBalance.available,
        lockedAfter: balances.sellerBalance.locked,
      },
      session,
    );

    await appendLedgerEvent(
      {
        userId: order.buyerId,
        adId: order.adId,
        orderId: order._id,
        eventType: "ORDER_RELEASE_CREDIT",
        amount: order.usdtAmount,
        availableDelta: order.usdtAmount,
        availableAfter: balances.buyerBalance.available,
        lockedAfter: balances.buyerBalance.locked,
      },
      session,
    );

    await recordCompleted(
      [order.buyerId, order.sellerId],
      order.usdtAmount,
      session,
    );
  });

  return getOrderForUser(userId, orderId);
}

async function cancelOrder(userId, orderId, reason = "") {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const cleanReason = String(reason || "")
    .trim()
    .slice(0, 500);

  await withMongoTransaction(async (session) => {
    const order = await P2POrder.findOne({
      _id: orderId,
      buyerId: userId,
    }).session(session);
    if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.status !== "awaiting_payment") {
      throw new P2PError(
        "Only an unpaid order can be cancelled. Use appeal after marking paid.",
        409,
        "ORDER_NOT_CANCELLABLE",
      );
    }

    const ad = await P2PAdvertisement.findById(order.adId).session(session);
    if (!ad)
      throw new P2PError(
        "Advertisement record is missing",
        409,
        "AD_RECORD_MISSING",
      );

    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelReason = cleanReason || "CANCELLED_BY_BUYER";

    await updateAdAfterTerminalOrder(order, session, {
      restoreRemaining: true,
    });
    await releaseEscrowForCancelledOrder(
      order,
      ad,
      session,
      "CANCELLED_BY_BUYER",
    );
    await order.save({ session });
    await recordBuyerCancellation(order.buyerId, session);

    await appendLedgerEvent(
      {
        userId: order.buyerId,
        adId: order.adId,
        orderId: order._id,
        eventType: "ORDER_CANCELLED",
        amount: order.usdtAmount,
        metadata: { reason: order.cancelReason },
      },
      session,
    );
  });

  return getOrderForUser(userId, orderId);
}

async function expireOrder(orderId) {
  if (!mongoose.isValidObjectId(orderId)) return false;
  let changed = false;

  await withMongoTransaction(async (session) => {
    const order = await P2POrder.findById(orderId).session(session);
    if (!order || order.status !== "awaiting_payment") return;
    if (new Date(order.paymentDeadlineAt).getTime() > Date.now()) return;
    changed = await expireOrderInSession(order, session);
  });

  return changed;
}

// ============================================================
// services/p2pDisputeService.js
// ============================================================
const REASONS = new Set([
  "PAYMENT_NOT_RECEIVED",
  "SELLER_NOT_RELEASED",
  "WRONG_AMOUNT",
  "THIRD_PARTY_PAYMENT",
  "OTHER",
]);

function normalizeReason(value) {
  const reason = String(value || "")
    .trim()
    .toUpperCase();
  if (!REASONS.has(reason)) {
    throw new P2PError("Invalid appeal reason", 400, "INVALID_APPEAL_REASON");
  }
  return reason;
}

async function openDispute(userId, orderId, payload = {}) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const reason = normalizeReason(payload.reason);
  const message = String(payload.message || "").trim();
  if (message.length > 2000) {
    throw new P2PError(
      "Appeal message is too long",
      400,
      "APPEAL_MESSAGE_TOO_LONG",
    );
  }

  let disputeId;

  try {
    await withMongoTransaction(async (session) => {
      const order = await P2POrder.findOne({
        _id: orderId,
        $or: [{ buyerId: userId }, { sellerId: userId }],
      }).session(session);

      if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
      if (order.status === "appealed") {
        const existing = await P2PDispute.findOne({
          orderId: order._id,
        }).session(session);
        if (existing) {
          disputeId = existing._id;
          return;
        }
      }
      if (order.status !== "paid") {
        throw new P2PError(
          "Appeals can be opened only after the order is marked paid",
          409,
          "ORDER_NOT_APPEALABLE",
        );
      }

      const [dispute] = await P2PDispute.create(
        [
          {
            orderId: order._id,
            openedById: userId,
            reason,
            message,
            status: "OPEN",
          },
        ],
        { session },
      );

      disputeId = dispute._id;
      order.status = "appealed";
      order.appealedAt = new Date();
      await order.save({ session });

      await appendLedgerEvent(
        {
          userId,
          adId: order.adId,
          orderId: order._id,
          eventType: "APPEAL_OPENED",
          amount: order.usdtAmount,
          metadata: { reason },
        },
        session,
      );
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await P2PDispute.findOne({ orderId });
      if (existing) return existing.toObject();
    }
    throw err;
  }

  return P2PDispute.findById(disputeId).lean();
}

async function getDisputeForUser(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  const order = await P2POrder.findOne({
    _id: orderId,
    $or: [{ buyerId: userId }, { sellerId: userId }],
  }).select("_id");
  if (!order) throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  return P2PDispute.findOne({ orderId }).lean();
}

// ============================================================
// services/p2pReviewService.js
// ============================================================
async function createReview(userId, orderId, payload = {}) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new P2PError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const rating = String(payload.rating || "")
    .trim()
    .toUpperCase();
  if (!["POSITIVE", "NEGATIVE"].includes(rating)) {
    throw new P2PError(
      "rating must be POSITIVE or NEGATIVE",
      400,
      "INVALID_REVIEW_RATING",
    );
  }

  const comment = String(payload.comment || "").trim();
  if (comment.length > 500) {
    throw new P2PError(
      "Review comment is too long",
      400,
      "REVIEW_COMMENT_TOO_LONG",
    );
  }

  let reviewId;
  await withMongoTransaction(async (session) => {
    const order = await P2POrder.findOne({
      _id: orderId,
      status: "completed",
      $or: [{ buyerId: userId }, { sellerId: userId }],
    }).session(session);

    if (!order) {
      throw new P2PError(
        "Only completed orders can be reviewed",
        409,
        "ORDER_NOT_REVIEWABLE",
      );
    }

    const revieweeId =
      String(order.buyerId) === String(userId) ? order.sellerId : order.buyerId;

    try {
      const [review] = await P2PReview.create(
        [
          {
            orderId: order._id,
            reviewerId: userId,
            revieweeId,
            rating,
            comment,
          },
        ],
        { session },
      );
      reviewId = review._id;
    } catch (err) {
      if (err?.code === 11000) {
        throw new P2PError(
          "You already reviewed this order",
          409,
          "REVIEW_ALREADY_EXISTS",
        );
      }
      throw err;
    }

    await P2PProfile.updateOne(
      { userId: revieweeId },
      {
        $setOnInsert: { userId: revieweeId },
        $inc:
          rating === "POSITIVE"
            ? { positiveReviews: 1 }
            : { negativeReviews: 1 },
      },
      { upsert: true, session, setDefaultsOnInsert: true },
    );
  });

  return P2PReview.findById(reviewId).lean();
}

module.exports = {
  P2PError,

  // Profile
  getOrCreateProfile,
  serializeProfile,

  // Payment methods
  createPaymentMethod,
  listMyPaymentMethods,
  updatePaymentMethod,
  setPaymentMethodActive,

  // Marketplace advertisements
  createAdvertisement,
  listActiveCurrencies,
  listMarketAdvertisements,
  listMyAdvertisements,
  getAdvertisement,
  updateAdvertisement,
  setAdvertisementStatus,

  // Orders / escrow
  createOrder,
  listMyOrders,
  getOrderForUser,
  markPaid,
  releaseOrder,
  cancelOrder,
  expireOrder,

  // Appeals and reviews
  openDispute,
  getDisputeForUser,
  createReview,
};
