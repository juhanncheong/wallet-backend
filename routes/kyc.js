const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/kycUpload");
const kycController = require("../controller/kycController");

router.get("/me", auth, kycController.getMyKyc);

router.post(
  "/submit",
  auth,
  upload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  kycController.submitKyc
);

module.exports = router;
