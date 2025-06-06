// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
  const { username, email, password, referredBy } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) return res.status(400).json({ message: "User already exists" });

  if (!referredBy) {
  return res.status(400).json({ message: "Referral code is required" });
}

const referrer = await User.findOne({ referralCode: referredBy });
if (!referrer) {
  return res.status(400).json({ message: "Invalid referral code" });
}

  const hashedPassword = await bcrypt.hash(password, 10);
  const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newUser = new User({
  username,
  email,
  password: hashedPassword,
  referralCode,
  referredBy
});

  await newUser.save();

  res.status(201).json({ message: "User created successfully" });
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

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
      balance: totalBalance,
      coins: user.coins,
      wallets: user.wallets,
      isFrozen: user.isFrozen,
      isWithdrawFrozen: user.isWithdrawFrozen,
      createdAt: user.createdAt,
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

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
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

    const isMatch = await bcrypt.compare(currentPin, user.withdrawalPin);
    if (!isMatch) {
      return res.status(400).json({ message: "Current PIN is incorrect" });
    }

    const hashedPin = await bcrypt.hash(newPin, 10);
    user.withdrawalPin = hashedPin;
    await user.save();

    res.json({ message: "Withdrawal PIN updated successfully" });
  } catch (err) {
    console.error("Change PIN error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
