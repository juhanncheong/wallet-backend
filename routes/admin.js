const express = require("express");
const router = express.Router();
const { updateUserBalance } = require("../controllers/adminController");

router.patch("/users/:id/balance", updateUserBalance);

module.exports = router;
