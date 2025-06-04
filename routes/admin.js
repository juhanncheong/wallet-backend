const express = require("express");
const router = express.Router();

const {
  updateUserBalance,
  changeUsername,
  changeEmail,
  changePassword,
  changePin
} = require("../models/controllers/adminController");

// Update user balance
router.patch("/users/:id/balance", updateUserBalance);

// Change username
router.put("/users/:id/username", changeUsername);

// Change email
router.put("/users/:id/email", changeEmail);

// Change password
router.put("/users/:id/password", changePassword);

// Change withdrawal pin
router.put("/users/:id/pin", changePin);

module.exports = router;

// testing render push
