// routes/adminBalance.js
const express = require("express");
const router = express.Router();

const Balance = require("../models/Balance");
const User = require("../models/User");

// if you already have verifyAdmin middleware, reuse it.
// In server.js you have verifyAdmin in-file for /admin/... :contentReference[oaicite:6]{index=6}
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).send("Token missing");
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, "secretkey");
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(403).send("Invalid token");
  }
}

// POST /api/admin/balance/set
// body: { userId, asset, amount }  (amount is the NEW available amount)
router.post("/balance/set", verifyAdmin, async (req, res) => {
  try {
    const { userId, asset, amount } = req.body;

    if (!userId || !asset) return res.status(400).json({ error: "Missing userId/asset" });
    if (typeof amount !== "number") return res.status(400).json({ error: "Invalid amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const a = String(asset).toUpperCase().trim();

    await Balance.updateOne(
      { userId, asset: a },
      { $setOnInsert: { userId, asset: a }, $set: { available: amount } },
      { upsert: true }
    );

    const row = await Balance.findOne({ userId, asset: a }).lean();
    res.json({ message: "Balance set", data: row });
  } catch (e) {
    res.status(500).json({ error: "Failed to set balance" });
  }
});

module.exports = router;
