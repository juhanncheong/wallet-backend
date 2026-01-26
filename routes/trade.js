// routes/trade.js  ✅ corrected (matcher-driven limit fills, safer)

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");            // ✅ add this
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

// ✅ enforce backend freeze
async function assertNotFrozen(userId) {
  const u = await User.findById(userId).select("isFrozen").lean();
  if (u?.isFrozen) {
    const err = new Error("Account frozen");
    err.status = 403;
    throw err;
  }
}

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
 *  { instId, side: "buy", amountUSDT }
 *  { instId, side: "sell", amountBase }
 */
router.post("/market", auth, async (req, res) => {
  try {
    const userId = req.userId;
    await assertNotFrozen(userId); // ✅

    const instId = ensureSupported(req.body.instId);
    const side = String(req.body.side || "").toLowerCase();

    const parsed = parseInstId(instId);
    if (!parsed) return res.status(400).json({ error: "Bad instId" });
    const { base, quote } = parsed;
    if (quote !== "USDT") return res.status(400).json({ error: "USDT pairs only" });

    const last = await getLastPrice(instId);

    if (side === "buy") {
      const amountUSDT = Number(req.body.amountUSDT);
      if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
        return res.status(400).json({ error: "Bad amountUSDT" });
      }

      // Fee on BUY: fee in BASE
      const grossBase = amountUSDT / last;
      const feeBase = grossBase * FEE_RATE;
      const netBase = grossBase - feeBase;

      const ok = await lockFunds(userId, "USDT", amountUSDT);
      if (!ok) return res.status(400).json({ error: "Insufficient USDT" });

      await spendLocked(userId, "USDT", amountUSDT);
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
        netQuote: amountUSDT,
        netBase
      });

      return res.json({ message: "Market buy filled", trade });
    }

    if (side === "sell") {
      const amountBase = Number(req.body.amountBase);
      if (!Number.isFinite(amountBase) || amountBase <= 0) {
        return res.status(400).json({ error: "Bad amountBase" });
      }

      const ok = await lockFunds(userId, base, amountBase);
      if (!ok) return res.status(400).json({ error: `Insufficient ${base}` });

      await spendLocked(userId, base, amountBase);

      const grossQuote = amountBase * last;
      const feeUSDT = grossQuote * FEE_RATE;
      const netQuote = grossQuote - feeUSDT;

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
 * LIMIT ORDER (matcher-driven)
 * body: { instId, side, price, amountBase }
 * - buy locks USDT = price*amountBase
 * - sell locks BASE = amountBase
 * ✅ No instant fill here — the background matcher fills orders over time.
 */
router.post("/limit", auth, async (req, res) => {
  try {
    const userId = req.userId;
    await assertNotFrozen(userId); // ✅

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

    return res.json({ message: "Limit order placed", order });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Limit order failed" });
  }
});

// list my open orders
router.get("/orders", auth, async (req, res) => {
  try {
    const userId = req.userId;
    await assertNotFrozen(userId); // ✅ (optional, but consistent)
    const rows = await Order.find({ userId, status: "open" }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Failed" });
  }
});

// cancel an order (unlocks funds)
router.post("/orders/:id/cancel", auth, async (req, res) => {
  try {
    const userId = req.userId;
    await assertNotFrozen(userId); // ✅

    const id = req.params.id;
    const order = await Order.findOne({ _id: id, userId, status: "open" });
    if (!order) return res.status(404).json({ error: "Order not found" });

    await unlockFunds(userId, order.lockedAsset, order.lockedAmount);
    order.status = "cancelled";
    await order.save();

    res.json({ message: "Order cancelled", data: order });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Cancel failed" });
  }
});

// cancel ALL open orders (unlocks funds)
// optional body: { instId: "BTC-USDT" }
router.post("/orders/cancel-all", auth, async (req, res) => {
  try {
    const userId = req.userId;
    await assertNotFrozen(userId);

    const q = { userId, status: "open", type: "limit" };

    // optional filter by pair
    if (req.body?.instId) {
      q.instId = String(req.body.instId).toUpperCase();
    }

    const orders = await Order.find(q);
    if (!orders.length) return res.json({ message: "No open orders", cancelled: 0 });

    // unlock funds + mark cancelled
    for (const o of orders) {
      await unlockFunds(userId, o.lockedAsset, o.lockedAmount);
      o.status = "cancelled";
      await o.save();
    }

    res.json({ message: "All open orders cancelled", cancelled: orders.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Cancel-all failed" });
  }
});

// Get trade history
router.get("/history", auth, async (req, res) => {
  try {
    const userId = req.userId;

    const q = { userId };
    if (req.query.instId) {
      q.instId = String(req.query.instId).toUpperCase();
    }

    const rows = await Trade.find(q)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to fetch history" });
  }
});

module.exports = router;
