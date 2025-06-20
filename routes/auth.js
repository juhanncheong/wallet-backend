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
  const { username, email, password, referredBy,withdrawalPin  } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    if (!referredBy) {
      return res.status(400).json({ message: "Referral code is required" });
    }

    // ✅ Check referral code in ReferralCode model
    const validReferral = await ReferralCode.findOne({ code: referredBy });
    if (!validReferral) {
      return res.status(400).json({ message: "Invalid referral code" });
    }

    
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newUser = new User({
      username,
      email,
      password,
      referralCode,
      referredBy,
      withdrawalPin
    });

    await newUser.save();
    res.status(201).json({ message: "Account Created successfully" });

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // ✅ Check if account is frozen
    if (user.isFrozen) {
      return res.status(403).json({ message: "Account frozen" });
    }

    if (user.password !== password) {
  return res.status(400).json({ message: "Invalid credentials" });
}

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
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
