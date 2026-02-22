const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ReferralCode = require("../models/ReferralCode");
const auth = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");
const verifyAdmin = require("../middleware/verifyAdmin");
const RewardGrant = require("../models/RewardGrant");
const Order = require("../models/Order");
const Balance = require("../models/Balance");
const adminController = require("../controller/adminController");
const DepositInstruction = require("../models/DepositInstruction");

const {
  getAllUsers,
  updateUserBalance,
  changeUsername,
  changeEmail,
  changePassword,
  changePin,
  toggleFreezeWithdrawal,
  updateWalletAddress,
  generateReferralCode, 
  lookupReferralCode,
  toggleWithdrawLock,
  getReferredUsers,
  freezeUserAccount,
  unfreezeUserAccount,
  addPoolAddress,
  bulkAddPoolAddresses,
  listPoolAddresses,
  disablePoolAddress,
  enablePoolAddress,
  adminListOpenOrders,
  adminListCompletedOrders,
  adminCancelOrder,
  adminForceCancelUserOrders,
} = require("../controller/adminController");

const mongoose = require("mongoose");

router.get("/users", getAllUsers);

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

// ✅ Freeze/unfreeze withdrawal
router.put("/users/:id/freeze-withdrawal", toggleFreezeWithdrawal);

// ✅ Freeze/unfreeze account
router.post("/users/:id/freeze", verifyAdmin, freezeUserAccount);
router.post("/users/:id/unfreeze", verifyAdmin, unfreezeUserAccount);

// ✅ Address Pool (deposit wallets)
router.post("/address-pool", verifyAdmin, addPoolAddress);
router.post("/address-pool/bulk", verifyAdmin, bulkAddPoolAddresses);
router.get("/address-pool", verifyAdmin, listPoolAddresses);
router.patch("/address-pool/:id/disable", verifyAdmin, disablePoolAddress);
router.patch("/address-pool/:id/enable", verifyAdmin, enablePoolAddress);

// ✅ Update user coin balance (e.g. BTC, ETH, USDC, USDT)
router.patch("/users/:id/coins", require("../controller/adminUpdateCoin"));

// ✅ Update user wallet address
router.put("/users/:id/wallet", updateWalletAddress);

// ✅ Spot Trading Admin
router.get("/orders/open", verifyAdmin, adminListOpenOrders);
router.get("/orders/completed", verifyAdmin, adminListCompletedOrders);
router.post("/orders/:orderId/cancel", verifyAdmin, adminCancelOrder);
router.post("/users/:userId/orders/force-cancel", verifyAdmin, adminForceCancelUserOrders);

// NEX / market override controls
router.get("/market-override", verifyAdmin, adminController.getMarketOverride);
router.post("/market-override/start", verifyAdmin, adminController.startMarketOverride);
router.post("/market-override/stop", verifyAdmin, adminController.stopMarketOverride);

// ✅ Search user by email or ID
router.get("/user", async (req, res) => {
  const { email, id } = req.query;

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
    const activeUsers = await User.countDocuments({
     lastOnlineAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    const registersToday = await User.countDocuments({ createdAt: { $gte: startOfToday } });
    const activeToday = await User.countDocuments({ lastOnlineAt: { $gte: startOfToday } });

    const registersThisWeek = await User.countDocuments({ createdAt: { $gte: startOfWeek } });
    const activeThisWeek = await User.countDocuments({ lastOnlineAt: { $gte: startOfWeek } });

    const registersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });
    const activeThisMonth = await User.countDocuments({ lastOnlineAt: { $gte: startOfMonth } });
    
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


// Admin Reward Grants (Claimable Airdrops)
const ALLOWED_COINS = ["bitcoin", "ethereum", "usdc", "usdt"];

// Create (draft)
router.post("/reward-grants", verifyAdmin, async (req, res) => {
  try {
    const { userId, coin, amount, note = "" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    if (!ALLOWED_COINS.includes(coin)) {
      return res.status(400).json({ message: "Invalid coin" });
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const grant = await RewardGrant.create({
      userId,
      coin,
      amount: numAmount,
      note,
      status: "draft",
    });

    return res.json({ grant });
  } catch (err) {
    console.error("Create reward grant error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Activate (this is your "Show" button)
router.patch("/reward-grants/:id/activate", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const grant = await RewardGrant.findOneAndUpdate(
      { _id: id, status: "draft" },
      { $set: { status: "active", activatedAt: new Date() } },
      { new: true }
    );

    if (!grant) {
      return res.status(404).json({ message: "Grant not found or not in draft status" });
    }

    return res.json({ grant });
  } catch (err) {
    console.error("Activate reward grant error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Cancel (allowed if draft or active)
router.patch("/reward-grants/:id/cancel", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const grant = await RewardGrant.findOneAndUpdate(
      { _id: id, status: { $in: ["draft", "active"] } },
      { $set: { status: "cancelled", cancelledAt: new Date() } },
      { new: true }
    );

    if (!grant) {
      return res.status(404).json({ message: "Grant not found or cannot be cancelled" });
    }

    return res.json({ grant });
  } catch (err) {
    console.error("Cancel reward grant error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// List (admin dashboard table)
router.get("/reward-grants", verifyAdmin, async (req, res) => {
  try {
    const { status, userId, coin } = req.query;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);

    const filter = {};
    if (status) filter.status = status;
    if (coin) filter.coin = coin;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.userId = userId;

    const [items, total] = await Promise.all([
      RewardGrant.find(filter)
        .populate("userId", "email username")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      RewardGrant.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("List reward grants error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get('/user-lookup', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ message: "Missing query" });

  try {
    const conditions = [{ email: query }];

    // Only search _id if valid ObjectId
    if (mongoose.Types.ObjectId.isValid(query)) {
      conditions.push({ _id: query });
    }

    const user = await User.findOne({ $or: conditions });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    console.error("User lookup error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// routes/user.js or wherever your GET /api/user is
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      username: user.username,
      email: user.email,
      lastOnlineAt: user.lastOnlineAt || null,
      coins: user.coins,
      isWithdrawLocked: user.isWithdrawLocked,
      availableCoins: user.availableCoins,
      creditScore: user.creditScore,
    });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// UPDATE CREDIT SCORE
router.put("/users/:id/credit-score", verifyAdmin, async (req, res) => {
  try {
    let { creditScore } = req.body;

    if (creditScore === undefined) {
      return res.status(400).json({ message: "creditScore is required" });
    }

    creditScore = Number(creditScore);

    if (isNaN(creditScore) || creditScore < 0 || creditScore > 100) {
      return res
        .status(400)
        .json({ message: "creditScore must be a number between 0 and 100" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { creditScore },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Credit score updated",
      user,
    });
  } catch (err) {
    console.error("Error updating credit score:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Reset withdrawal PIN lock + attempts (does NOT affect admin lock)
router.patch("/users/:id/reset-withdrawal-pin-lock", verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWithdrawPinLocked = false;
    user.withdrawalPinFailCount = 0;

    await user.save();

    return res.json({
      message: "Withdrawal PIN lock reset",
      isWithdrawPinLocked: user.isWithdrawPinLocked,
      withdrawalPinFailCount: user.withdrawalPinFailCount,
    });
  } catch (err) {
    console.error("Reset withdrawal PIN lock error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Admin: Get user balances (NEW SYSTEM)
router.get("/users/:id/balances", verifyAdmin, async (req, res) => {
  try {
    const Balance = require("../models/Balance");

    const balances = await Balance.find({
      userId: req.params.id,
    }).sort({ asset: 1 });

    return res.json(balances);
  } catch (err) {
    console.error("Get user balances error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Update wire transfer details
router.post("/update-wire-details", verifyAdmin, async (req, res) => {
  try {
    const {
      minimumDeposit,
      recipientName,
      recipientAddress,
      recipientAccount,
      swiftBic,
      bankName,
      bankCountry,
      bankAddress,
      intermediaryBank,
      importantNotes
    } = req.body;

    let instruction = await DepositInstruction.findOne({ method: "wire" });

    if (!instruction) {
      instruction = new DepositInstruction({ method: "wire" });
    }

    instruction.minimumDeposit = minimumDeposit || 0;
    instruction.recipientName = recipientName || "";
    instruction.recipientAddress = recipientAddress || "";
    instruction.recipientAccount = recipientAccount || "";
    instruction.swiftBic = swiftBic || "";
    instruction.bankName = bankName || "";
    instruction.bankCountry = bankCountry || "";
    instruction.bankAddress = bankAddress || "";
    instruction.intermediaryBank = intermediaryBank || "";
    instruction.importantNotes = importantNotes || "";

    await instruction.save();

    res.json({ success: true, message: "Wire details updated successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;