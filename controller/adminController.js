const User = require('../models/User');
const Transaction = require('../models/Transaction'); // ADD THIS
const bcrypt = require("bcryptjs");
const Wallet = require("../models/Wallet");

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
  const { coin, address } = req.body;

  // 🧠 Normalize coin names
  const coinMap = {
    btc: "bitcoin",
    eth: "ethereum",
    usdc: "usdc",
    usdt: "usdt",
    bitcoin: "bitcoin",
    ethereum: "ethereum",
  };

  const normalizedCoin = coinMap[coin];
  if (!normalizedCoin) {
    return res.status(400).json({ message: "Invalid coin type" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.wallets[normalizedCoin] = address;
    await user.save();

    res.json({
      success: true,
      message: `${normalizedCoin.toUpperCase()} address updated successfully`,
      wallets: user.wallets,
    });
  } catch (err) {
    console.error("Update wallet error:", err);
    res.status(500).json({ message: "Failed to update wallet address" });
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
