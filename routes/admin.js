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

module.exports = router;
