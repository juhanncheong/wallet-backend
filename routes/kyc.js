const express = require("express");
const router = express.Router();
const kycController = require("../controllers/kycController");
const authMiddleware = require("./auth").authMiddleware || require("./auth"); // adapt if needed
const upload = require("../middleware/kycUpload");

router.get("/me", authMiddleware, kycController.getMyKyc);

router.post(
  "/submit",
  authMiddleware,
  upload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  kycController.submitKyc
);

module.exports = router;
