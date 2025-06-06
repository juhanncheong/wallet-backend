const express = require("express");
const router = express.Router();

const {
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
  const User = require("../models/User");

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
      referredBy: user.referredBy        // ✅ who invited
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/referral/generate", generateReferralCode);
router.post("/referral/generate", generateReferralCode);

const User = require("../models/User");

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


module.exports = router;