const User = require('../models/User');
const Transaction = require('../models/Transaction'); // ADD THIS
const bcrypt = require("bcryptjs");
const Wallet = require("../models/Wallet");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Balance = require("../models/Balance");
const MarketOverride = require("../models/MarketOverride");

// ✅ Update user balance and log transaction
exports.updateUserBalance = async (req, res) => {
  const { id } = req.params;
  const { amount, coin = 'usdt' } = req.body; // Default to USDT if coin not provided

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.balance = (user.balance || 0) + amount;
    user.coins[coin] = (user.coins[coin] || 0) + amount;
    await user.save();

    // ✅ Create a new transaction log
    const tx = new Transaction({
      userId: id,
      type: 'deposit',
      coin,
      amount,
      status: 'completed',
    });
    await tx.save();

    res.json({
      success: true,
      balance: user.balance,
      coinBalance: user.coins[coin],
      transactionId: tx._id,
    });
  } catch (err) {
    console.error("Balance update error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


// ✅ Change username
exports.changeUsername = async (req, res) => {
  const { id } = req.params;
  const { newUsername } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { username: newUsername },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error("Change username error:", err);
    res.status(500).json({ message: "Failed to change username" });
  }
};

// ✅ Change email
exports.changeEmail = async (req, res) => {
  const { id } = req.params;
  const { newEmail } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { email: newEmail },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error("Change email error:", err);
    res.status(500).json({ message: "Failed to change email" });
  }
};

// ✅ Change password
exports.changePassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    await User.findByIdAndUpdate(id, { password: newPassword });
    res.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
};

// ✅ Change withdrawal pin (with bcrypt)
exports.changePin = async (req, res) => {
  const { id } = req.params;
  const { newPin } = req.body;

  try {
    await User.findByIdAndUpdate(id, { withdrawalPin: newPin });
    res.json({ success: true });
  } catch (err) {
    console.error("Change pin error:", err);
    res.status(500).json({ message: "Failed to change pin" });
  }
};

// ✅ Freeze user account
exports.freezeUserAccount = async (req, res) => {
  const userId = req.params.id; // ✅ FROM URL

  try {
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isFrozen = true;
    user.freezeReason = "Account frozen by admin";
    user.frozenAt = new Date();

    await user.save();

    res.json({
      success: true,
      message: "User account frozen",
    });
  } catch (err) {
    console.error("Freeze error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Unfreeze user account
exports.unfreezeUserAccount = async (req, res) => {
  const userId = req.params.id; // ✅ FROM URL

  try {
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isFrozen = false;
    user.freezeReason = "";
    user.frozenAt = null;

    await user.save();

    res.json({
      success: true,
      message: "User account unfrozen",
    });
  } catch (err) {
    console.error("Unfreeze error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Freeze / Unfreeze withdrawals
exports.toggleFreezeWithdrawal = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.withdrawalFrozen = !user.withdrawalFrozen;
    await user.save();

    res.json({ success: true, withdrawalFrozen: user.withdrawalFrozen });
  } catch (err) {
    console.error("Toggle freeze withdrawal error:", err);
    res.status(500).json({ message: "Failed to toggle withdrawal freeze" });
  }
};

exports.updateWalletAddress = async (req, res) => {
  const { id } = req.params;
  const { network, address } = req.body;

  const net = String(network || "").trim().toUpperCase();
  const ALLOWED_NETWORKS = ["ERC20", "BEP20", "TRC20", "BTC", "SOL"];

  if (!ALLOWED_NETWORKS.includes(net)) {
    return res.status(400).json({
      message: "Invalid network (ERC20, BEP20, TRC20, BTC, SOL only)",
    });
  }
  if (!address || typeof address !== "string" || address.trim().length < 8) {
    return res.status(400).json({ message: "Invalid address" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ensure wallets exists
    user.wallets = user.wallets || {};
    user.wallets[net] = address.trim();

    await user.save();

    return res.json({
      success: true,
      message: `${net} address updated successfully`,
      wallets: user.wallets,
    });
  } catch (err) {
    console.error("Update wallet error:", err);
    return res.status(500).json({ message: "Failed to update wallet address" });
  }
};

// ✅ Admin manually creates a referral code (used for signup)
const ReferralCode = require("../models/ReferralCode");

exports.generateReferralCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.referralCode) {
      return res.status(400).json({ message: "User already has a referral code" });
    }

    // Generate a unique referral code
    let newCode;
    let exists = true;
    while (exists) {
      newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await User.findOne({ referralCode: newCode });
    }

    user.referralCode = newCode;
    await user.save();

    // Optionally track in global ReferralCode model too
    const globalCode = new ReferralCode({ code: newCode });
    await globalCode.save();

    res.json({ success: true, code: newCode });
  } catch (err) {
    console.error("Referral code generation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// ✅ Admin looks up which user owns a referralCode (generated after signup)
exports.lookupReferralCode = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: "Code is required" });

  try {
    const user = await User.findOne({ referralCode: code });
    if (!user) return res.status(404).json({ message: "Code not found" });

    res.json({
      userId: user._id,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error("Lookup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin gets users who signed up using a specific referral (who referredBy = code)
exports.getReferredUsers = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: "Referral code is required" });

  try {
    const users = await User.find({ referredBy: code });

    res.json(
      users.map(u => ({
        _id: u._id,
        email: u.email,
        username: u.username,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    console.error("Get referred users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const toggleWithdrawLock = async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawLocked = !user.isWithdrawLocked;
    await user.save();

    res.status(200).json({ message: "Withdrawal lock toggled", isWithdrawLocked: user.isWithdrawLocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.toggleWithdrawLock = toggleWithdrawLock;

// --------------------
// Address Pool (Deposit Wallet Pool)
// --------------------
const COIN_MAP = {
  btc: "bitcoin",
  eth: "ethereum",
  usdc: "usdc",
  usdt: "usdt",
  bitcoin: "bitcoin",
  ethereum: "ethereum",
};

function normalizeCoin(coin) {
  if (!coin) return null;
  return COIN_MAP[String(coin).toLowerCase()];
}

// POST /admin/address-pool  (add 1)
exports.addPoolAddress = async (req, res) => {
  try {
    const { address, coin, network, notes = "" } = req.body;

    const normalizedCoin = normalizeCoin(coin);
    if (!address || typeof address !== "string" || address.trim().length < 8) {
      return res.status(400).json({ message: "Invalid address" });
    }
    if (!normalizedCoin) {
      return res.status(400).json({ message: "Invalid coin" });
    }
    if (!network || typeof network !== "string") {
      return res.status(400).json({ message: "Network is required" });
    }

    const doc = await Wallet.create({
      address: address.trim(),
      coin: normalizedCoin,
      network: network.trim(),
      notes,
      status: "available",
    });

    return res.json({ success: true, wallet: doc });
  } catch (err) {
    // duplicate key (unique index on address+coin+network)
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Address already exists in pool" });
    }
    console.error("addPoolAddress error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /admin/address-pool/bulk  (add many, e.g. 5 addresses)
exports.bulkAddPoolAddresses = async (req, res) => {
  try {
    const { items } = req.body; // [{address, coin, network, notes?}, ...]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const prepared = items.map((it) => {
      const normalizedCoin = normalizeCoin(it.coin);
      return {
        address: String(it.address || "").trim(),
        coin: normalizedCoin,
        network: String(it.network || "").trim(),
        notes: it.notes || "",
        status: "available",
      };
    });

    // validate
    for (const p of prepared) {
      if (!p.address || p.address.length < 8) {
        return res.status(400).json({ message: "Invalid address in items[]" });
      }
      if (!p.coin) {
        return res.status(400).json({ message: "Invalid coin in items[]" });
      }
      if (!p.network) {
        return res.status(400).json({ message: "Network is required in items[]" });
      }
    }

    // ordered:false = keep inserting even if some duplicates
    const inserted = await Wallet.insertMany(prepared, { ordered: false });

    return res.json({
      success: true,
      insertedCount: inserted.length,
      inserted,
    });
  } catch (err) {
    // insertMany duplicates often still throws; we still want a useful response
    if (err?.writeErrors) {
      const insertedCount = err.result?.nInserted || 0;
      return res.status(207).json({
        success: true,
        message: "Some addresses could not be inserted (likely duplicates).",
        insertedCount,
        errors: err.writeErrors.map((e) => ({
          index: e.index,
          code: e.code,
          message: e.errmsg,
        })),
      });
    }

    console.error("bulkAddPoolAddresses error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /admin/address-pool?coin=btc&network=Ethereum&status=available&page=1&limit=50
exports.listPoolAddresses = async (req, res) => {
  try {
    const { coin, network, status } = req.query;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

    const filter = {};
    if (coin) {
      const normalizedCoin = normalizeCoin(coin);
      if (!normalizedCoin) return res.status(400).json({ message: "Invalid coin" });
      filter.coin = normalizedCoin;
    }
    if (network) filter.network = String(network).trim();
    if (status) filter.status = status;

    const [items, total, counts] = await Promise.all([
      Wallet.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Wallet.countDocuments(filter),
      Wallet.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      counts: counts.reduce((acc, c) => ((acc[c._id] = c.count), acc), {}),
    });
  } catch (err) {
    console.error("listPoolAddresses error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /admin/address-pool/:id/disable
exports.disablePoolAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Wallet.findOneAndUpdate(
      { _id: id, status: { $ne: "assigned" } }, // don't disable if already assigned
      { $set: { status: "disabled" } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found, or already assigned (cannot disable)." });
    }

    return res.json({ success: true, wallet: updated });
  } catch (err) {
    console.error("disablePoolAddress error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /admin/address-pool/:id/enable
exports.enablePoolAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Wallet.findOneAndUpdate(
      { _id: id, status: "disabled" },
      { $set: { status: "available", assignedTo: null, assignedAt: null } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found or not disabled." });
    }

    return res.json({ success: true, wallet: updated });
  } catch (err) {
    console.error("enablePoolAddress error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ==================================================
// ✅ Spot Trading Admin Functions (NEW)
// ==================================================

/**
 * GET /api/admin/orders/open
 * Query:
 *  - userId (optional)
 *  - instId (optional, e.g. ETH-USDT)
 *  - page, limit
 */
exports.adminListOpenOrders = async (req, res) => {
  try {
    const { userId, instId } = req.query;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

    const filter = { status: "open", type: "limit" };

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.userId = userId;
    }
    if (instId) {
      filter.instId = String(instId).trim().toUpperCase();
    }

    const [items, total] = await Promise.all([
      Order.find(filter)
        .populate("userId", "email username")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("adminListOpenOrders error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


/**
 * GET /api/admin/orders/completed
 * Defaults to status=filled (completed).
 * Query:
 *  - status=filled|cancelled (optional)
 *  - userId (optional)
 *  - instId (optional)
 *  - from, to (optional ISO date)
 *  - page, limit
 */
// ✅ Completed = Trade history (not Order)
exports.adminListCompletedOrders = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const Trade = require("../models/Trade");

    const { userId, instId } = req.query;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

    const q = {};

    if (userId && mongoose.Types.ObjectId.isValid(userId)) q.userId = userId;
    if (instId) q.instId = String(instId).trim().toUpperCase();

    // date filter on createdAt
    const { from, to } = req.query;
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(from);
      if (to) q.createdAt.$lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      Trade.find(q)
        .populate("userId", "email username")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Trade.countDocuments(q),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("adminListCompletedOrders (Trade) error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * POST /api/admin/orders/:orderId/cancel
 * Body: { reason?: string }
 *
 * Cancels a single OPEN order and unlocks funds using lockedAsset/lockedAmount.
 * This is idempotent: it only unlocks when we actually change open -> cancelled.
 */
exports.adminCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const reason = String(req.body?.reason || "Cancelled by admin");

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid orderId" });
    }

    // Only cancel if currently open (prevents double unlock)
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "open" },
      { $set: { status: "cancelled", cancelReason: reason } },
      { new: true }
    );

    if (!order) {
      // If not open, check if it exists (better message)
      const exists = await Order.exists({ _id: orderId });
      if (!exists) return res.status(404).json({ message: "Order not found" });
      return res.status(409).json({ message: "Order is not open (already filled/cancelled)" });
    }

    // Unlock funds
    await Balance.updateOne(
      { userId: order.userId, asset: order.lockedAsset },
      { $inc: { available: order.lockedAmount, locked: -order.lockedAmount } },
      { upsert: true }
    );

    return res.json({
      ok: true,
      orderId: order._id,
      newStatus: order.status,
      unlocked: { asset: order.lockedAsset, amount: order.lockedAmount },
    });
  } catch (err) {
    console.error("adminCancelOrder error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


/**
 * POST /api/admin/users/:userId/orders/force-cancel
 * Body: { instId?: string, reason?: string }
 *
 * Cancels ALL open orders for that user (optional filter by instId).
 * Unlocks funds for each cancelled order.
 */
exports.adminForceCancelUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const instId = req.body?.instId ? String(req.body.instId).trim().toUpperCase() : null;
    const reason = String(req.body?.reason || "Force-cancel by admin");

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const filter = { userId, status: "open" };
    if (instId) filter.instId = instId;

    const openOrders = await Order.find(filter).select("_id userId lockedAsset lockedAmount instId");

    if (openOrders.length === 0) {
      return res.json({ ok: true, cancelledCount: 0, message: "No open orders to cancel" });
    }

    let cancelledCount = 0;
    const unlockedTotals = {}; // { USDT: 123, BTC: 0.5 }

    for (const o of openOrders) {
      // idempotent: only unlock if we successfully flip status open -> cancelled
      const updated = await Order.findOneAndUpdate(
        { _id: o._id, status: "open" },
        { $set: { status: "cancelled", cancelReason: reason } },
        { new: true }
      );

      if (!updated) continue;

      cancelledCount += 1;

      await Balance.updateOne(
        { userId: updated.userId, asset: updated.lockedAsset },
        { $inc: { available: updated.lockedAmount, locked: -updated.lockedAmount } },
        { upsert: true }
      );

      unlockedTotals[updated.lockedAsset] =
        (unlockedTotals[updated.lockedAsset] || 0) + updated.lockedAmount;
    }

    return res.json({
      ok: true,
      cancelledCount,
      instId: instId || null,
      unlockedTotals,
    });
  } catch (err) {
    console.error("adminForceCancelUserOrders error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /admin/market-override
exports.getMarketOverride = async (req, res) => {
  try {
    const doc = await MarketOverride.findOne({ instId: "NEX-USDT" }).lean();
    return res.json({ ok: true, data: doc || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to read override" });
  }
};

// POST /admin/market-override/start
// body: { fixedPrice: number, minutes: number }
exports.startMarketOverride = async (req, res) => {
  try {
    const fixedPrice = Number(req.body.fixedPrice);
    const minutes = Math.max(1, Math.min(Number(req.body.minutes) || 0, 7 * 24 * 60));
    const band = Number(req.body.band ?? 0.5);
    const stepMin = Number(req.body.stepMin ?? 0.01);
    const stepMax = Number(req.body.stepMax ?? 0.06);
    const flipProb = Number(req.body.flipProb ?? 0.25);
    const meanRevert = Number(req.body.meanRevert ?? 0.15);
    const shockProb = Number(req.body.shockProb ?? 0.02);
    const shockSize = Number(req.body.shockSize ?? 0.25);
    const volMin = Number(req.body.volMin ?? 1);
    const volMax = Number(req.body.volMax ?? 25);

    if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) {
      return res.status(400).json({ ok: false, error: "Bad fixedPrice" });
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ ok: false, error: "Bad minutes" });
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + minutes * 60 * 1000);

    const update = {
      instId: "NEX-USDT",
      isActive: true,
      fixedPrice,
      wickPct: 0.001,
      blendMinutes: 5,
      band, stepMin, stepMax, flipProb, meanRevert, shockProb, shockSize, volMin, volMax,
      startAt: now,
      endAt,
      updatedAt: now,
    };

    const doc = await MarketOverride.findOneAndUpdate(
      { instId: "NEX-USDT" },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to start override" });
  }
};

// POST /admin/market-override/stop
exports.stopMarketOverride = async (req, res) => {
  try {
    const now = new Date();
    const doc = await MarketOverride.findOneAndUpdate(
      { instId: "NEX-USDT" },
      { $set: { isActive: false, updatedAt: now } },
      { new: true }
    ).lean();

    return res.json({ ok: true, data: doc || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to stop override" });
  }
};
