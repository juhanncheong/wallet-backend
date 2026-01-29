const express = require("express");
const router = express.Router();
const verifyAdmin = require("../middleware/verifyAdmin");
const ctrl = require("../controller/adminKycController");

router.get("/", verifyAdmin, ctrl.listKyc);
router.get("/:id", verifyAdmin, ctrl.getKyc);

router.post("/:id/under-review", verifyAdmin, ctrl.markUnderReview);
router.post("/:id/approve", verifyAdmin, ctrl.approveKyc);
router.post("/:id/reject", verifyAdmin, ctrl.rejectKyc);

// Secure image access
router.get("/:id/file/:type", verifyAdmin, ctrl.viewFile);

module.exports = router;
