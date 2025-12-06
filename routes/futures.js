const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const FuturesPosition = require("../models/FuturesPosition");

// Helper: liquidation price
function calcLiqPrice(entryPrice, leverage, side) {
  entryPrice = Number(entryPrice);
  leverage = Number(leverage);

  if (!entryPrice || !leverage) return entryPrice;

  if (side === "long") {
    return entryPrice * (1 - 1 / leverage);
  } else {
    return entryPrice * (1 + 1 / leverage);
  }
}

/**
 * POST /api/futures/open
 * Body: { side: "long"|"short", size, leverage, entryPrice }
 * - Validates margin against user's USDT balance
 * - Deducts margin from user.coins.usdt
 * - Creates FuturesPosition document
 */
router.post("/open", auth, async (req, res) => {
  try {
    const { side, size, leverage, entryPrice } = req.body;

    const _side = side === "short" ? "short" : "long";
    const _size = Number(size);
    const _lev = Number(leverage);
    const _entry = Number(entryPrice);

    if (!_size || !_lev || !_entry) {
      return res.status(400).json({ message: "Invalid size / leverage / price" });
    }

    const margin = _size / _lev;

    const user = await User.findById(req.user.userId); // from auth.js
    if (!user) return res.status(404).json({ message: "User not found" });

    const usdtBalance = user.coins?.usdt || 0;

    // 🔥 HARD BACKEND CHECK
    if (margin > usdtBalance) {
      return res.status(400).json({
        message: "Insufficient USDT balance",
        requiredMargin: margin,
        available: usdtBalance,
      });
    }

    // Deduct margin from balance (simple spot-as-margin for now)
    user.coins.usdt = usdtBalance - margin;

    const liqPrice = calcLiqPrice(_entry, _lev, _side);

    const position = await FuturesPosition.create({
      userId: user._id,
      symbol: "BTCUSDT",
      side: _side,
      size: _size,
      leverage: _lev,
      margin,
      entryPrice: _entry,
      liqPrice,
    });

    await user.save();

    res.json({
      message: "Position opened",
      position,
      newBalance: user.coins.usdt,
    });
  } catch (err) {
    console.error("Open futures error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/futures/open
 * - Returns all OPEN positions for logged-in user
 */
router.get("/open", auth, async (req, res) => {
  try {
    const positions = await FuturesPosition.find({
      userId: req.user.userId,
      status: "open",
    }).sort({ openedAt: -1 });

    res.json(positions);
  } catch (err) {
    console.error("Get futures open error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
