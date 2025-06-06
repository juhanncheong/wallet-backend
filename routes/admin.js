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
  lookupReferralCode
} = require("../controller/adminController");


router.patch("/users/:id/freeze", toggleFreezeAccount);
router.patch("/users/:id/freeze-withdrawal", toggleFreezeWithdrawal);


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
  referralCode: user.referralCode,   // ✅ This makes referral code visible
  referredBy: user.referredBy        // ✅ (Optional) shows who invited this user
});
// ✅ Generate a new referral code
router.get("/referral/generate", generateReferralCode);

// ✅ Lookup who owns a referral code
router.get("/referral/lookup", lookupReferralCode);

module.exports = router;
