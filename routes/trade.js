// routes/trade.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth"); // adjust if your auth path differs
const Balance = require("../models/Balance");
const Order = require("../models/Order");
const Trade = require("../models/Trade");
const SUPPORTED = require("../config/supportedPairs");

const OKX_BASE = "https://www.okx.com";
const FEE_RATE = 0.001; // 0.1%

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

function parseInstId(instId) {
  const [base, quote] = String(instId).toUpperCase().split("-");
  if (!base || !quote) return null;
  return { base, quote };
}

async function getLastPrice(instId) {
  const url = `${OKX_BASE}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`;
  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("OKX ticker failed");
  const j = await r.json();
  const row = j?.data?.[0];
  const last = Number(row?.last);
  if (!Number.isFinite(last) || last <= 0) throw new Error("Bad price");
  return last;
}

async function getOrCreateBalance(userId, asset) {
  const a = String(asset).toUpperCase();
  let b = await Balance.findOne({ userId, asset: a });
  if (!b) b = await Balance.create({ userId, asset: a, available: 0, locked: 0 });
  return b;
}

// atomic-ish helpers (simple & safe enough for v1)
async function addAvailable(userId, asset, delta) {
  const a = String(asset).toUpperCase();
  await Balance.updateOne(
    { userId, asset: a },
    { $setOnInsert: { userId, asset: a }, $inc: { available: delta } },
    { upsert: true }
  );
}

async function lockFunds(userId, asset, amount) {
  const a = String(asset).toUpperCase();
  // only lock if enough available
  const res = await Balance.updateOne(
    { userId, asset: a, available: { $gte: amount } },
    { $inc: { available: -amount, locked: amount } }
  );
  return res.modifiedCount === 1;
}

async function unlockFunds(userId, asset, amount) {
  const a = String(asset).toUpperCase();
  await Balance.updateOne(
    { userId, asset: a, locked: { $gte: amount } },
    { $inc: { available: amount, locked: -amount } }
  );
}

async function spendLocked(userId, asset, amount) {
  const a = String(asset).toUpperCase();
  const res = await Balance.updateOne(
    { userId, asset: a, locked: { $gte: amount } },
    { $inc: { locked: -amount } }
  );
  return res.modifiedCount === 1;
}

function ensureSupported(instId) {
  const id = String(instId).toUpperCase();
  if (!SUPPORTED.includes(id)) {
    const err = new Error("Pair not supported");
    err.status = 400;
    throw err;
  }
  return id;
}

/**
 * MARKET ORDER
 * body:
 *  { instId, side: "buy", amountUSDT }  (buy with USDT)
 *  { instId, side: "sell", amountBase } (sell base)
 */
router.post("/market", auth, async (req, res) => {
  try {
    const userId = req.userId; // adjust if your auth uses different field
    const instId = ensureSupported(req.body.instId);
    const side = String(req.body.side || "").toLowerCase();
    const parsed = parseInstId(instId);
    if (!parsed) return res.status(400).json({ error: "Bad instId" });
    const { base, quote } = parsed;
    if (quote !== "USDT") return res.status(400).json({ error: "USDT pairs only" });

    const last = await getLastPrice(instId);

    if (side === "buy") {
      const amountUSDT = Number(req.body.amountUSDT);
      if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) return res.status(400).json({ error: "Bad amountUSDT" });

      // Fee on BUY: take fee in BASE (simple model)
      const grossBase = amountUSDT / last;
      const feeBase = grossBase * FEE_RATE;
      const netBase = grossBase - feeBase;

      // Need USDT funds
      const ok = await lockFunds(userId, "USDT", amountUSDT);
      if (!ok) return res.status(400).json({ error: "Insufficient USDT" });

      // Spend the locked USDT
      await spendLocked(userId, "USDT", amountUSDT);

      // Credit BASE
      await addAvailable(userId, base, netBase);

      const trade = await Trade.create({
        userId, instId, base, quote,
        side, type: "market",
        price: last,
        amountBase: grossBase,
        feeRate: FEE_RATE,
        feeAsset: base,
        feeAmount: feeBase,
        grossQuote: amountUSDT,
        netQuote: amountUSDT, // buys: quote spent is the same
        netBase
      });

      return res.json({ message: "Market buy filled", trade });
    }

    if (side === "sell") {
      const amountBase = Number(req.body.amountBase);
      if (!Number.isFinite(amountBase) || amountBase <= 0) return res.status(400).json({ error: "Bad amountBase" });

      const ok = await lockFunds(userId, base, amountBase);
      if (!ok) return res.status(400).json({ error: `Insufficient ${base}` });

      // Spend the locked BASE
      await spendLocked(userId, base, amountBase);

      const grossQuote = amountBase * last;
      const feeUSDT = grossQuote * FEE_RATE;
      const netQuote = grossQuote - feeUSDT;

      // Credit USDT (net)
      await addAvailable(userId, "USDT", netQuote);

      const trade = await Trade.create({
        userId, instId, base, quote,
        side, type: "market",
        price: last,
        amountBase,
        feeRate: FEE_RATE,
        feeAsset: "USDT",
        feeAmount: feeUSDT,
        grossQuote,
        netQuote,
        netBase: amountBase
      });

      return res.json({ message: "Market sell filled", trade });
    }

    return res.status(400).json({ error: "side must be buy or sell" });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Trade failed" });
  }
});

/**
 * LIMIT ORDER
 * body: { instId, side, price, amountBase }
 * - buy locks USDT = price*amountBase
 * - sell locks BASE = amountBase
 * If current price is already good, we auto-fill instantly.
 */
router.post("/limit", auth, async (req, res) => {
  try {
    const userId = req.userId;
    const instId = ensureSupported(req.body.instId);
    const side = String(req.body.side || "").toLowerCase();
    const parsed = parseInstId(instId);
    if (!parsed) return res.status(400).json({ error: "Bad instId" });
    const { base, quote } = parsed;
    if (quote !== "USDT") return res.status(400).json({ error: "USDT pairs only" });

    const price = Number(req.body.price);
    const amountBase = Number(req.body.amountBase);
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "Bad price" });
    if (!Number.isFinite(amountBase) || amountBase <= 0) return res.status(400).json({ error: "Bad amountBase" });

    let lockedAsset, lockedAmount;

    if (side === "buy") {
      lockedAsset = "USDT";
      lockedAmount = price * amountBase;
      const ok = await lockFunds(userId, lockedAsset, lockedAmount);
      if (!ok) return res.status(400).json({ error: "Insufficient USDT" });
    } else if (side === "sell") {
      lockedAsset = base;
      lockedAmount = amountBase;
      const ok = await lockFunds(userId, lockedAsset, lockedAmount);
      if (!ok) return res.status(400).json({ error: `Insufficient ${base}` });
    } else {
      return res.status(400).json({ error: "side must be buy or sell" });
    }

    const order = await Order.create({
      userId, instId, base, quote,
      side, type: "limit",
      price,
      amountBase,
      feeRate: FEE_RATE,
      status: "open",
      lockedAsset,
      lockedAmount
    });

    // Auto-fill if marketable now
    const last = await getLastPrice(instId);
    const marketable =
      (side === "buy" && last <= price) ||
      (side === "sell" && last >= price);

    if (!marketable) {
      return res.json({ message: "Limit order placed", order });
    }

    // Fill instantly at LAST (simple). You can fill at order.price if you prefer.
    const fillPrice = last;

    if (side === "buy") {
      // Spend locked USDT (lockedAmount)
      await spendLocked(userId, "USDT", lockedAmount);

      const grossBase = lockedAmount / fillPrice;
      const feeBase = grossBase * FEE_RATE;
      const netBase = grossBase - feeBase;

      await addAvailable(userId, base, netBase);

      await Order.updateOne({ _id: order._id }, { $set: { status: "filled" } });

      const trade = await Trade.create({
        userId, instId, base, quote,
        side, type: "limit",
        price: fillPrice,
        amountBase: grossBase,
        feeRate: FEE_RATE,
        feeAsset: base,
        feeAmount: feeBase,
        grossQuote: lockedAmount,
        netQuote: lockedAmount,
        netBase
      });

      return res.json({ message: "Limit buy filled instantly", orderId: order._id, trade });
    }

    if (side === "sell") {
      // Spend locked BASE
      await spendLocked(userId, base, amountBase);

      const grossQuote = amountBase * fillPrice;
      const feeUSDT = grossQuote * FEE_RATE;
      const netQuote = grossQuote - feeUSDT;

      await addAvailable(userId, "USDT", netQuote);

      await Order.updateOne({ _id: order._id }, { $set: { status: "filled" } });

      const trade = await Trade.create({
        userId, instId, base, quote,
        side, type: "limit",
        price: fillPrice,
        amountBase,
        feeRate: FEE_RATE,
        feeAsset: "USDT",
        feeAmount: feeUSDT,
        grossQuote,
        netQuote,
        netBase: amountBase
      });

      return res.json({ message: "Limit sell filled instantly", orderId: order._id, trade });
    }
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Limit order failed" });
  }
});

// list my open orders
router.get("/orders", auth, async (req, res) => {
  const userId = req.userId;
  const rows = await Order.find({ userId, status: "open" }).sort({ createdAt: -1 }).lean();
  res.json({ data: rows });
});

// cancel an order (unlocks funds)
router.post("/orders/:id/cancel", auth, async (req, res) => {
  const userId = req.userId;
  const id = req.params.id;

  const order = await Order.findOne({ _id: id, userId, status: "open" });
  if (!order) return res.status(404).json({ error: "Order not found" });

  await unlockFunds(userId, order.lockedAsset, order.lockedAmount);
  order.status = "cancelled";
  await order.save();

  res.json({ message: "Order cancelled", data: order });
});

module.exports = router;
