// routes/balances.js
const express = require("express");
const router = express.Router();

const Balance = require("../models/Balance");
const User = require("../models/User");
const auth = require("../middleware/auth");
const EPSILON = 0.00000001;

// GET /api/balances
router.get("/", auth, async (req, res) => {
  try {
    const userId =
      req.userId || req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await User.findById(userId)
      .select("isWithdrawLocked isWithdrawFrozen isWithdrawPinLocked")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    // show only coins user actually has, or assets with an admin withdrawal reserve
    const rows = await Balance.find({
      userId,
      $or: [
        { available: { $gt: EPSILON } },
        { locked: { $gt: EPSILON } },
        { withdrawalReserve: { $gt: EPSILON } },
      ],
    })
      .sort({ asset: 1 })
      .lean();

    const fullyBlocked = Boolean(
      user.isWithdrawLocked ||
      user.isWithdrawFrozen ||
      user.isWithdrawPinLocked,
    );

    const data = rows.map((row) => {
      const available = Number(row.available || 0);
      const withdrawalReserve = Math.max(0, Number(row.withdrawalReserve || 0));

      return {
        ...row,
        withdrawalReserve,
        withdrawable: fullyBlocked
          ? 0
          : Math.max(available - withdrawalReserve, 0),
      };
    });

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: "Failed to load balances" });
  }
});

module.exports = router;
