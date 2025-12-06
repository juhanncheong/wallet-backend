const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const FuturesPosition = require("../models/FuturesPosition");

// ----- helpers -----
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

function computePnl(side, entry, mark, size, margin) {
  entry = Number(entry);
  mark = Number(mark);
  size = Number(size);
  margin = Number(margin);

  let pnlUsd;
  if (side === "long") {
    pnlUsd = size * (mark / entry - 1);
  } else {
    pnlUsd = size * (1 - mark / entry);
  }
  const pnlPct = margin ? (pnlUsd / margin) * 100 : 0;
  return { pnlUsd, pnlPct };
}

// ========================
//   POST /api/futures/open
// ========================
// body: { side, size, leverage, entryPrice, tp?, sl?, reduceOnly? }
router.post("/open", auth, async (req, res) => {
  try {
    const { side, size, leverage, entryPrice, tp, sl, reduceOnly } = req.body;

    const _side = side === "short" ? "short" : "long";
    const notional = Number(size);
    const lev = Number(leverage);
    const entry = Number(entryPrice);

    if (!notional || !lev || !entry) {
      return res.status(400).json({ message: "Invalid size/leverage/price" });
    }

    const margin = notional / lev;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const usdtBalance = user.coins?.usdt || 0;

    // HARD backend margin check
    if (margin > usdtBalance) {
      return res.status(400).json({
        message: "Insufficient USDT balance",
        requiredMargin: margin,
        available: usdtBalance,
      });
    }

    // Deduct margin from USDT wallet
    user.coins.usdt = usdtBalance - margin;

    const liqPrice = calcLiqPrice(entry, lev, _side);

    const position = await FuturesPosition.create({
      userId: user._id,
      symbol: "BTCUSDT",
      side: _side,
      size: notional,
      leverage: lev,
      margin,
      entryPrice: entry,
      liqPrice,
      tp: tp || undefined,
      sl: sl || undefined,
      reduceOnly: !!reduceOnly,
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

// =========================
//   GET /api/futures/open
// =========================
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

// ======================================
//   POST /api/futures/close
//   body: { positionId, percent, markPrice }
// ======================================
router.post("/close", auth, async (req, res) => {
  try {
    const { positionId, percent, markPrice } = req.body;
    const pct = Number(percent);
    const mark = Number(markPrice);

    if (!positionId || !pct || pct <= 0 || pct > 100 || !mark) {
      return res.status(400).json({ message: "Invalid close request" });
    }

    const pos = await FuturesPosition.findOne({
      _id: positionId,
      userId: req.user.userId,
      status: "open",
    });

    if (!pos) {
      return res.status(404).json({ message: "Position not found" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // portion to close
    const portion = pct / 100;
    const closeSize = pos.size * portion;
    const closeMargin = pos.margin * portion;

    const { pnlUsd, pnlPct } = computePnl(
      pos.side,
      pos.entryPrice,
      mark,
      closeSize,
      closeMargin
    );

    // credit back margin + PnL for the closed part
    user.coins.usdt = (user.coins.usdt || 0) + closeMargin + pnlUsd;

    if (pct === 100) {
      // full close
      pos.status = "closed";
      pos.closePrice = mark;
      pos.closedAt = new Date();
      pos.pnlUsd = pnlUsd;
      pos.pnlPct = pnlPct;
      pos.size = 0;
      pos.margin = 0;
    } else {
      // partial close - shrink position
      pos.size = pos.size - closeSize;
      pos.margin = pos.margin - closeMargin;
      // we keep entryPrice and liqPrice as they are (simplified)
    }

    await pos.save();
    await user.save();

    res.json({
      message: pct === 100 ? "Position closed" : "Position partially closed",
      position: pos,
      newBalance: user.coins.usdt,
      realizedPnl: pnlUsd,
      realizedPnlPct: pnlPct,
    });
  } catch (err) {
    console.error("Close futures error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
