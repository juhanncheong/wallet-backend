const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Balance = require("../models/Balance");
const FuturesPosition = require("../models/FuturesPosition");

// Allowed trading pairs – must match your frontend PAIRS list
const ALLOWED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "TONUSDT",
  "LTCUSDT",
  "DOTUSDT",
];

function calcLiqPrice(entryPrice, leverage, side) {
  const entry = Number(entryPrice);
  const lev = Number(leverage);
  if (!entry || !lev) return entry;

  if (side === "long") {
    return entry * (1 - 1 / lev);
  }

  return entry * (1 + 1 / lev);
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

// POST /api/futures/open
// body: { symbol, side, size, leverage, entryPrice, tp?, sl?, reduceOnly? }
router.post("/open", auth, async (req, res) => {
  const userId =
    req.userId || req.user?.userId || req.user?.id || req.user?._id;
  let { symbol, side, size, leverage, entryPrice, tp, sl, reduceOnly } =
    req.body;

  const positionSide = side === "short" ? "short" : "long";
  const notional = Number(size);
  const lev = Number(leverage);
  const entry = Number(entryPrice);

  symbol = typeof symbol === "string" ? symbol.toUpperCase() : "BTCUSDT";

  if (!ALLOWED_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ message: "Unsupported trading pair" });
  }

  if (
    !Number.isFinite(notional) ||
    !Number.isFinite(lev) ||
    !Number.isFinite(entry) ||
    notional <= 0 ||
    lev <= 0 ||
    entry <= 0
  ) {
    return res.status(400).json({ message: "Invalid size/leverage/price" });
  }

  const margin = notional / lev;
  if (!Number.isFinite(margin) || margin <= 0) {
    return res.status(400).json({ message: "Invalid margin" });
  }

  const session = await mongoose.startSession();

  try {
    let position = null;
    let updatedBalance = null;

    await session.withTransaction(async () => {
      const user = await User.exists({ _id: userId }).session(session);
      if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        throw err;
      }

      updatedBalance = await Balance.findOneAndUpdate(
        { userId, asset: "USDT", available: { $gte: margin } },
        { $inc: { available: -margin } },
        { new: true, session },
      );

      if (!updatedBalance) {
        const current = await Balance.findOne({ userId, asset: "USDT" })
          .session(session)
          .lean();
        const err = new Error("Insufficient USDT balance");
        err.status = 400;
        err.requiredMargin = margin;
        err.available = Number(current?.available || 0);
        throw err;
      }

      const liqPrice = calcLiqPrice(entry, lev, positionSide);

      const created = await FuturesPosition.create(
        [
          {
            userId,
            symbol,
            side: positionSide,
            size: notional,
            leverage: lev,
            margin,
            entryPrice: entry,
            liqPrice,
            tp: tp || undefined,
            sl: sl || undefined,
            reduceOnly: !!reduceOnly,
          },
        ],
        { session },
      );

      position = created[0];
    });

    return res.json({
      message: "Position opened",
      position,
      newBalance: Number(updatedBalance?.available || 0),
    });
  } catch (err) {
    console.error("Open futures error:", err);

    if (err.status === 400 && err.message === "Insufficient USDT balance") {
      return res.status(400).json({
        message: err.message,
        requiredMargin: err.requiredMargin,
        available: err.available,
      });
    }

    return res.status(err.status || 500).json({
      message: err.status ? err.message : "Server error",
    });
  } finally {
    session.endSession();
  }
});

// GET /api/futures/open
router.get("/open", auth, async (req, res) => {
  try {
    const userId =
      req.userId || req.user?.userId || req.user?.id || req.user?._id;
    const positions = await FuturesPosition.find({
      userId,
      status: "open",
    }).sort({ openedAt: -1 });

    return res.json(positions);
  } catch (err) {
    console.error("Get futures open error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/futures/close
// body: { positionId, percent, markPrice }
router.post("/close", auth, async (req, res) => {
  const userId =
    req.userId || req.user?.userId || req.user?.id || req.user?._id;
  const { positionId, percent, markPrice } = req.body;
  const pct = Number(percent);
  const mark = Number(markPrice);

  if (
    !mongoose.Types.ObjectId.isValid(positionId) ||
    !Number.isFinite(pct) ||
    pct <= 0 ||
    pct > 100 ||
    !Number.isFinite(mark) ||
    mark <= 0
  ) {
    return res.status(400).json({ message: "Invalid close request" });
  }

  const session = await mongoose.startSession();

  try {
    let position = null;
    let updatedBalance = null;
    let realizedPnl = 0;
    let realizedPnlPct = 0;

    await session.withTransaction(async () => {
      const pos = await FuturesPosition.findOne({
        _id: positionId,
        userId,
        status: "open",
      }).session(session);

      if (!pos) {
        const err = new Error("Position not found");
        err.status = 404;
        throw err;
      }

      const user = await User.exists({ _id: userId }).session(session);
      if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        throw err;
      }

      const portion = pct / 100;
      const closeSize = Number(pos.size) * portion;
      const closeMargin = Number(pos.margin) * portion;

      const { pnlUsd, pnlPct } = computePnl(
        pos.side,
        pos.entryPrice,
        mark,
        closeSize,
        closeMargin,
      );

      realizedPnl = pnlUsd;
      realizedPnlPct = pnlPct;

      const settlement = closeMargin + pnlUsd;
      updatedBalance = await Balance.findOneAndUpdate(
        { userId, asset: "USDT" },
        { $inc: { available: settlement } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      );

      if (pct === 100) {
        pos.status = "closed";
        pos.closePrice = mark;
        pos.closedAt = new Date();
        pos.pnlUsd = pnlUsd;
        pos.pnlPct = pnlPct;
        pos.size = 0;
        pos.margin = 0;
      } else {
        pos.size = Number(pos.size) - closeSize;
        pos.margin = Number(pos.margin) - closeMargin;
      }

      await pos.save({ session });
      position = pos;
    });

    return res.json({
      message: pct === 100 ? "Position closed" : "Position partially closed",
      position,
      newBalance: Number(updatedBalance?.available || 0),
      realizedPnl,
      realizedPnlPct,
    });
  } catch (err) {
    console.error("Close futures error:", err);
    return res.status(err.status || 500).json({
      message: err.status ? err.message : "Server error",
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;
