// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ReferralCode = require("../models/ReferralCode");
const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const Balance = require("../models/Balance");

// Auth middleware to protect routes
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// Reserve 1 address from pool (atomic)
async function reserveNextAddress({ network, userId, session }) {
  const filter = {
    network,
    $or: [{ status: "available" }, { status: { $exists: false } }],
    assignedTo: null,
  };

  const update = {
    $set: { status: "assigned", assignedTo: userId, assignedAt: new Date() },
  };

  const opts = { new: true, sort: { createdAt: 1 }, session };

  return Wallet.findOneAndUpdate(filter, update, opts);
}

async function allocateDepositWallets(userId, session) {
  const wanted = [
    { key: "ERC20", network: "ERC20" },
    { key: "BEP20", network: "BEP20" },
    { key: "TRC20", network: "TRC20" },
    { key: "BTC", network: "BTC" },
    { key: "SOL", network: "SOL" },
  ];

  const out = {};
  for (const w of wanted) {
    const doc = await reserveNextAddress({
      network: w.network,
      userId,
      session,
    });

    if (!doc) {
      const err = new Error(`No available ${w.network} deposit address in pool`);
      err.status = 503;
      err.code = "ADDRESS_POOL_EMPTY";
      err.missing = w.key;
      throw err;
    }

    out[w.key] = doc.address;
  }

  return out;
}

// Signup
router.post("/signup", async (req, res) => {
  const { username, email, password, withdrawalPin, referredBy } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      const err = new Error("Email already registered");
      err.status = 400;
      throw err;
    }

    // Optional referral validation
    let validReferrer = null;
    if (referredBy) {
      validReferrer = await ReferralCode.findOne({ code: referredBy }).session(session);
      if (!validReferrer) {
        const err = new Error("Invalid referral code");
        err.status = 400;
        throw err;
      }
    }

    // Generate referral code
    const referralCode =
      username.slice(0, 3).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    // Create user (no hardcoded wallets anymore)
    const newUser = new User({
      username,
      email,
      password,
      withdrawalPin,
      referralCode,
      referredBy: referredBy || null,
    });

    await newUser.save({ session });

    // ✅ Allocate deposit addresses from pool and attach to user
    const wallets = await allocateDepositWallets(newUser._id, session);
    newUser.wallets = wallets;
    await newUser.save({ session });

    // Record referral code
    await ReferralCode.updateOne(
      { code: referralCode },
      { code: referralCode },
      { upsert: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: validReferrer
        ? `Signup successful using referral code ${referredBy}`
        : "Signup successful",
      referralCode,
      wallets, // optional: handy for debugging/testing
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res
      .status(err.status || 500)
      .json({ message: err.message || "Server error during signup" });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    // Check if frozen
    if (user.isFrozen) {
      return res.status(403).json({ message: "Account frozen" });
    }

    // Compare plain text password
    if (user.password !== password) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, isAdmin: user.isAdmin || false },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ SEND SUCCESS RESPONSE (YOU WERE MISSING THIS!)
    return res.json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        username: user.username,
        referralCode: user.referralCode,
        creditScore: user.creditScore
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get user info (protected)
router.get("/user", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ pull balances from Balance collection
    const rows = await Balance.find({ userId: user._id }).lean();

    // build { BTC: 31, ETH: 11, ... }
    const balances = {};
    for (const r of rows) balances[r.asset] = Number(r.available || 0);

    res.json({
      username: user.username,
      email: user.email,
      referralCode: user.referralCode,
      wallets: user.wallets,
      balances,              // ✅ new
      availableCoins: user.availableCoins || {},
      isFrozen: user.isFrozen,
      isWithdrawFrozen: user.isWithdrawFrozen,
      createdAt: user.createdAt,
      creditScore: user.creditScore,
    });
  } catch (err) {
    console.error("Fetch user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Moved outside
router.post("/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.password !== currentPassword) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword; // Save plain password
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/change-pin", authMiddleware, async (req, res) => {
  const { currentPin, newPin } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.withdrawalPin !== currentPin) {
      return res.status(400).json({ message: "Current PIN is incorrect" });
    }

    user.withdrawalPin = newPin;
    await user.save();

    res.json({ message: "Withdrawal PIN updated successfully" });
  } catch (err) {
    console.error("Change PIN error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



module.exports = router;
