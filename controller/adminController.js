const User = require('../models/User');
const Transaction = require('../models/Transaction'); // ADD THIS
const bcrypt = require("bcryptjs");

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
  const { userId, reason } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isFrozen = true;
    user.freezeReason = reason || "Account frozen by admin";
    user.frozenAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: "User account frozen successfully",
      userId: user._id,
    });

  } catch (err) {
    console.error("Freeze user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Unfreeze user account
exports.unfreezeUserAccount = async (req, res) => {
  const { userId } = req.body;

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

    res.status(200).json({
      success: true,
      message: "User account unfrozen successfully",
      userId: user._id,
    });

  } catch (err) {
    console.error("Unfreeze user error:", err);
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
