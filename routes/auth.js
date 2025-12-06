// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ReferralCode = require("../models/ReferralCode");


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

// Signup
router.post("/signup", async (req, res) => {
  const { username, email, password, withdrawalPin, referredBy } = req.body;

  try {
    // 1️⃣ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // 2️⃣ Optional: Validate referral if user provided one
    let validReferrer = null;
    if (referredBy) {
      validReferrer = await ReferralCode.findOne({ code: referredBy });
      if (!validReferrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    // 3️⃣ Generate a unique referral code for this new user
    const referralCode =
      username.slice(0, 3).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    // 4️⃣ Create new user
    const newUser = new User({
      username,
      email,
      password,
      withdrawalPin,
      referralCode,
      referredBy: referredBy || null,
    });

    await newUser.save();

    // 5️⃣ Record referral code (so others can use it)
    await ReferralCode.updateOne(
      { code: referralCode },
      { code: referralCode },
      { upsert: true }
    );

    res.status(201).json({
      message: validReferrer
        ? `Signup successful using referral code ${referredBy}`
        : "Signup successful",
      referralCode,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup" });
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

    // USD conversion rates
    const btcUsd = 65000;
    const ethUsd = 3500;
    const usdcUsd = 1;
    const usdtUsd = 1;

    const totalBalance =
      (user.coins?.bitcoin || 0) * btcUsd +
      (user.coins?.ethereum || 0) * ethUsd +
      (user.coins?.usdc || 0) * usdcUsd +
      (user.coins?.usdt || 0) * usdtUsd;

    res.json({
  username: user.username,
  email: user.email,
  referralCode: user.referralCode,
  balance: totalBalance,
  coins: user.coins,
  wallets: user.wallets,
  availableCoins: user.availableCoins || {},
  isFrozen: user.isFrozen,
  isWithdrawFrozen: user.isWithdrawFrozen,
  createdAt: user.createdAt,
  creditScore: user.creditScore,
  availableCoins: user.availableCoins,
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
