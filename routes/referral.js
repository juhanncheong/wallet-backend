const express = require("express");
const router = express.Router();
const { generateReferralCode, lookupReferralCode } = require("../controller/adminController");

// Generate referral code
router.get("/generate", generateReferralCode);

// Lookup referral code
router.get("/lookup", lookupReferralCode);

module.exports = router;
