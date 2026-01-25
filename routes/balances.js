// routes/adminBalance.js
const express = require("express");
const router = express.Router();

const adminUpdateCoin = require("../adminUpdateCoin");

// If you already have verifyAdmin middleware somewhere, use that.
// If not, simplest is to re-use the same JWT logic you use in other admin routes.
const jwt = require("jsonwebtoken");

function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "Token missing" });

  try {
    const decoded = jwt.verify(token, "secretkey");
    req.adminId = decoded.adminId;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid token" });
  }
}

// ✅ This is the endpoint your React is calling:
router.patch("/users/:id/coins", verifyAdmin, adminUpdateCoin);

module.exports = router;
