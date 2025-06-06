const express = require("express");
const router = express.Router();
const { generateReferralCode, lookupReferralCode } = require("../controller/adminController");

router.get("/generate", generateReferralCode);
router.get("/lookup", lookupReferralCode);

module.exports = router;
