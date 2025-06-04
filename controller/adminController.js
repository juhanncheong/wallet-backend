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

// ✅ Change password (with bcrypt)
exports.changePassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(id, { password: hashedPassword });
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
    const hashedPin = await bcrypt.hash(newPin, 10);
    await User.findByIdAndUpdate(id, { withdrawalPin: hashedPin });
    res.json({ success: true });
  } catch (err) {
    console.error("Change pin error:", err);
    res.status(500).json({ message: "Failed to change pin" });
  }
};

// ✅ Freeze / Unfreeze login access
exports.toggleFreezeAccount = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isFrozen = !user.isFrozen;
    await user.save();

    res.json({ success: true, isFrozen: user.isFrozen });
  } catch (err) {
    console.error("Toggle freeze account error:", err);
    res.status(500).json({ message: "Failed to toggle freeze" });
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

// ✅ Freeze or unfreeze account
exports.toggleFreezeAccount = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isFrozen = !user.isFrozen;
    await user.save();

    res.json({ success: true, isFrozen: user.isFrozen });
  } catch (err) {
    console.error("Toggle freeze account error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Freeze or unfreeze withdrawals
exports.toggleFreezeWithdrawal = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawFrozen = !user.isWithdrawFrozen;
    await user.save();

    res.json({ success: true, isWithdrawFrozen: user.isWithdrawFrozen });
  } catch (err) {
    console.error("Toggle freeze withdrawals error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
