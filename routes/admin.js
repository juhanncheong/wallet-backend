const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ReferralCode = require("../models/ReferralCode");
const auth = require("../middleware/auth");
const Coin = require('../models/Coin');
const { verifyAdmin } = require("../auth");

const {
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
  getReferredUsers
} = require("../controller/adminController");


router.patch("/users/:id/freeze", toggleFreezeAccount);
router.patch("/users/:id/freeze-withdrawal", toggleFreezeWithdrawal);


// ✅ Get users invited by a referral code
router.get("/referral/invited", getReferredUsers);


// ✅ Update user balance
router.patch("/users/:id/balance", updateUserBalance);

// ✅ Change username
router.put("/users/:id/username", changeUsername);

// ✅ Change email
router.put("/users/:id/email", changeEmail);

// ✅ Change password
router.put("/users/:id/password", changePassword);

// ✅ Change withdrawal pin
router.put("/users/:id/pin", changePin);

// ✅ Freeze/unfreeze account
router.put("/users/:id/freeze-account", toggleFreezeAccount);

// ✅ Freeze/unfreeze withdrawal
router.put("/users/:id/freeze-withdrawal", toggleFreezeWithdrawal);

// ✅ Update user coin balance (e.g. BTC, ETH, USDC, USDT)
router.patch("/users/:id/coins", require("../controller/adminUpdateCoin"));

// ✅ Update user wallet address
router.put("/users/:id/wallet", updateWalletAddress);

// ✅ Search user by email or ID
router.get("/user", async (req, res) => {
  const { email, id } = req.query;
 
  router.get("/users", getAllUsers);

  try {
    let user;
    if (email) {
      user = await User.findOne({ email });
    } else if (id) {
      user = await User.findById(id);
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      _id: user._id,
      email: user.email,
      username: user.username,
      referralCode: user.referralCode,   // ✅ show referral
      referredBy: user.referredBy,       // ✅ who invited
      wallets: user.wallets || {}        // ✅ include wallet data
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



router.get("/referral/generate", generateReferralCode);
router.post("/referral/generate", generateReferralCode);
router.post("/toggle-withdrawal-lock", toggleWithdrawLock);

// 🔍 Lookup who owns a referral code
router.get("/referral/lookup/:code", async (req, res) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code });
    if (!user) return res.json({ success: false, message: "Code not found" });
    res.json({ success: true, user: { email: user.email } });
  } catch (err) {
    console.error("Code lookup error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔍 Lookup referral info by email
router.get("/referral/user/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.json({ success: false, message: "User not found" });

    const invitedUsers = await User.find({ referredBy: user.referralCode });
    const invitedList = invitedUsers.map(u => ({
      email: u.email,
      username: u.username,
      joined: u.createdAt
    }));

    res.json({
      success: true,
      code: user.referralCode,
      invited: invitedList
    });
  } catch (err) {
    console.error("Referral info error:", err);
    res.status(500).json({ success: false });
  }
});

// Admin removes referral code
router.delete("/referral/remove/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.json({ success: false, message: "User not found" });

    user.referralCode = undefined;
    await user.save();

    res.json({ success: true, message: "Referral code removed" });
  } catch (err) {
    console.error("Delete referral error:", err);
    res.status(500).json({ success: false });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const now = new Date();

    // Today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Start of this week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // USER METRICS
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });

    const registersToday = await User.countDocuments({ createdAt: { $gte: startOfToday } });
    const activeToday = await User.countDocuments({ lastLogin: { $gte: startOfToday } });

    const registersThisWeek = await User.countDocuments({ createdAt: { $gte: startOfWeek } });
    const activeThisWeek = await User.countDocuments({ lastLogin: { $gte: startOfWeek } });

    const registersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });
    const activeThisMonth = await User.countDocuments({ lastLogin: { $gte: startOfMonth } });
    
    // WITHDRAWALS
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    const withdrawalsToday = await Transaction.countDocuments({
      type: 'withdrawal',
      status: 'completed',
      createdAt: { $gte: startOfToday }
    });
    const withdrawalsMonth = await Transaction.countDocuments({
      type: 'withdrawal',
      status: 'completed',
      createdAt: { $gte: startOfMonth }
    });

    // WALLET DISTRIBUTION
    const users = await User.find();
    const walletDistribution = { BTC: 0, ETH: 0, USDC: 0, USDT: 0 };
    users.forEach(user => {
      walletDistribution.BTC += user.coins?.bitcoin || 0;
      walletDistribution.ETH += user.coins?.ethereum || 0;
      walletDistribution.USDC += user.coins?.usdc || 0;
      walletDistribution.USDT += user.coins?.usdt || 0;
    });
    const walletList = Object.entries(walletDistribution).map(([coin, value]) => ({ coin, value }));

    // REFERRALS
    const referralCodes = await ReferralCode.countDocuments();
    const totalReferred = await User.countDocuments({ referredBy: { $ne: null } });

    const topReferrerAgg = await User.aggregate([
      { $match: { referredBy: { $ne: null } } },
      { $group: { _id: '$referredBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    let topReferrer = null;
    if (topReferrerAgg.length > 0) {
      const ref = topReferrerAgg[0]._id;
      const owner = await User.findOne({ referralCode: ref });
      topReferrer = owner?.email || null;
    }

    res.json({
      // User Overview
      totalUsers,
      activeUsers,
      registersToday,
      activeToday,
      registersThisWeek,
      activeThisWeek,
      registersThisMonth,
      activeThisMonth,

      // Withdrawals
      pendingWithdrawals,
      withdrawalsToday,
      withdrawalsMonth,

      // Wallet + Referrals
      walletDistribution: walletList,
      referralCodes,
      totalReferred,
      topReferrer
    });

  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Server error fetching stats" });
  }
});
// 🔓 Toggle withdrawal lock
router.patch("/users/:id/toggle-withdrawal-lock", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawLocked = !user.isWithdrawLocked;
    await user.save();

    res.json({ 
      message: `Withdrawal ${user.isWithdrawLocked ? "locked" : "unlocked"} successfully`,
      isWithdrawLocked: user.isWithdrawLocked
    });
  } catch (err) {
    console.error("Toggle withdrawal lock error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.post('/toggle-coin-send', async (req, res) => {
  const { coin, status } = req.body;

  try {
    const updated = await Coin.findOneAndUpdate(
      { name: coin },
      { sendEnabled: status },
      { new: true, upsert: true }
    );

    res.json({ message: `Send status updated for ${coin}`, data: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update send status', error: err.message });
  }
});
router.get('/coin-status', async (req, res) => {
  try {
    const coins = await Coin.find({});
    res.json(coins);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch coin status', error: err.message });
  }
});
router.post("/update-balance-availability", auth, async (req, res) => {
  try {
    const { userId, coin, from, to, amount } = req.body;

    if (!userId || !coin || !from || !to || typeof amount !== "number") {
      return res.status(400).json({ message: "Invalid request" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Example: moving from 'available' to 'unavailable'
    if (user.coins[coin][from] < amount) {
      return res.status(400).json({ message: "Insufficient funds in source" });
    }

    user.coins[coin][from] -= amount;
    user.coins[coin][to] += amount;

    await user.save();
    res.json({ message: "Balance updated successfully", coins: user.coins[coin] });
  } catch (err) {
    console.error("Error updating balance availability", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:id/coin-availability", async (req, res) => {
  const { coin, isAvailable } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.availableCoins) user.availableCoins = {};

    user.availableCoins[coin] = isAvailable;
    await user.save();

    res.json({ message: `Coin availability updated`, availableCoins: user.availableCoins });
  } catch (err) {
    console.error("Coin availability update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Should look like this
router.get('/user-lookup', verifyAdmin, async (req, res) => {
  const query = req.query.query?.trim();
  if (!query) return res.status(400).json({ message: 'Query required' });

  const user = await User.findOne({
    $or: [{ email: query }, { _id: query }]
  });

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ user });
});

module.exports = router;