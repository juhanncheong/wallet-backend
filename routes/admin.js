const express = require("express");
const router = express.Router();

const {
  updateUserBalance,
  changeUsername,
  changeEmail,
  changePassword,
  changePin,
  toggleFreezeAccount,
  toggleFreezeWithdrawal
} = require("../controller/adminController");

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

module.exports = router;
