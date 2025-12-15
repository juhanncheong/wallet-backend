// controller/adminController.js
const User = require("../models/User");
const ReferralCode = require("../models/ReferralCode");

// ✅ Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update user balance (User.balance field)
const updateUserBalance = async (req, res) => {
  const { id } = req.params;
  const { balance } = req.body;

  try {
    const newBalance = Number(balance);
    if (Number.isNaN(newBalance)) {
      return res.status(400).json({ message: "balance must be a number" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { balance: newBalance },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ success: true, user });
  } catch (err) {
    console.error("Update balance error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Change username
const changeUsername = async (req, res) => {
  const { id } = req.params;
  const { newUsername } = req.body;

  try {
    if (!newUsername) {
      return res.status(400).json({ message: "newUsername is required" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { username: newUsername },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ success: true, user });
  } catch (err) {
    console.error("Change username error:", err);
    return res.status(500).json({ message: "Failed to change username" });
  }
};

// ✅ Change email
const changeEmail = async (req, res) => {
  const { id } = req.params;
  const { newEmail } = req.body;

  try {
    if (!newEmail) {
      return res.status(400).json({ message: "newEmail is required" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { email: newEmail },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ success: true, user });
  } catch (err) {
    console.error("Change email error:", err);
    return res.status(500).json({ message: "Failed to change email" });
  }
};

// ✅ Change password (keeps your current plaintext style)
const changePassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }

    await User.findByIdAndUpdate(id, { password: newPassword });
    return res.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ message: "Failed to change password" });
  }
};

// ✅ Change withdrawal pin
const changePin = async (req, res) => {
  const { id } = req.params;
  const { newPin } = req.body;

  try {
    if (!newPin) {
      return res.status(400).json({ message: "newPin is required" });
    }

    await User.findByIdAndUpdate(id, { withdrawalPin: newPin });
    return res.json({ success: true });
  } catch (err) {
    console.error("Change pin error:", err);
    return res.status(500).json({ message: "Failed to change pin" });
  }
};

// ✅ Freeze / Unfreeze login access (this is the REAL account freeze)
const toggleFreezeAccount = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isFrozen = !user.isFrozen;
    await user.save();

    return res.json({ success: true, isFrozen: user.isFrozen });
  } catch (err) {
    console.error("Toggle freeze account error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Freeze / Unfreeze withdrawals (MUST be isWithdrawFrozen)
const toggleFreezeWithdrawal = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawFrozen = !user.isWithdrawFrozen;
    await user.save();

    return res.json({ success: true, isWithdrawFrozen: user.isWithdrawFrozen });
  } catch (err) {
    console.error("Toggle freeze withdrawals error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Update user wallet address
const updateWalletAddress = async (req, res) => {
  const { id } = req.params;
  const { coin, address } = req.body;

  const coinMap = {
    btc: "bitcoin",
    eth: "ethereum",
    usdc: "usdc",
    usdt: "usdt",
    bitcoin: "bitcoin",
    ethereum: "ethereum",
  };

  const normalizedCoin = coinMap[(coin || "").toLowerCase()];
  if (!normalizedCoin) {
    return res.status(400).json({ message: "Invalid coin type" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.wallets) user.wallets = {};
    user.wallets[normalizedCoin] = address;
    await user.save();

    return res.json({
      success: true,
      message: `${normalizedCoin.toUpperCase()} address updated successfully`,
      wallets: user.wallets,
    });
  } catch (err) {
    console.error("Update wallet error:", err);
    return res.status(500).json({ message: "Failed to update wallet address" });
  }
};

// ✅ Admin manually creates a referral code for a user (supports GET ?email= and POST {email})
const generateReferralCode = async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.referralCode) {
      return res.status(400).json({ message: "User already has a referral code" });
    }

    let newCode;
    let exists = true;
    while (exists) {
      newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await User.findOne({ referralCode: newCode });
    }

    user.referralCode = newCode;
    await user.save();

    // track globally too (optional, but you already use this model)
    await ReferralCode.updateOne({ code: newCode }, { code: newCode }, { upsert: true });

    return res.json({ success: true, code: newCode });
  } catch (err) {
    console.error("Referral code generation error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Lookup who owns a referral code
const lookupReferralCode = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: "Code is required" });

  try {
    const user = await User.findOne({ referralCode: code });
    if (!user) return res.status(404).json({ message: "Code not found" });

    return res.json({
      userId: user._id,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error("Lookup error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get users referred by a referral code
const getReferredUsers = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: "Referral code is required" });

  try {
    const users = await User.find({ referredBy: code }).sort({ createdAt: -1 });

    return res.json(
      users.map((u) => ({
        _id: u._id,
        email: u.email,
        username: u.username,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    console.error("Get referred users error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Toggle withdraw lock (expects { userId } in body)
const toggleWithdrawLock = async (req, res) => {
  const { userId } = req.body;

  try {
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawLocked = !user.isWithdrawLocked;
    await user.save();

    return res.status(200).json({
      message: "Withdrawal lock toggled",
      isWithdrawLocked: user.isWithdrawLocked,
    });
  } catch (err) {
    console.error("Toggle withdraw lock error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllUsers,
  updateUserBalance,
  changeUsername,
  changeEmail,
  changePassword,
  changePin,
  toggleFreezeAccount,
  toggleFreezeWithdrawal,
  updateWalletAddress,
  generateReferralCode,
  lookupReferralCode,
  toggleWithdrawLock,
  getReferredUsers,
};
