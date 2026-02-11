// services/limitMatcher.js
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Balance = require("../models/Balance");
const Trade = require("../models/Trade");
const pairMapping = require("../config/pairMapping");
const MarketOverride = require("../models/MarketOverride");

const OKX_BASE = "https://www.okx.com";

// Node 18+ has fetch. If not, use node-fetch.
const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

async function fetchOkxLast(instId) {
  const url = `${OKX_BASE}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`;
  const r = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`OKX ticker failed ${r.status}`);
  const j = await r.json();
  const last = Number(j?.data?.[0]?.last);
  return Number.isFinite(last) ? last : null;
}

// Atomic helpers (MVP). For production, move these to a shared wallet service.
async function lockOrSpendLocked(session, userId, asset, spendLockedAmount) {
  // Spend from locked: locked -= X
  const res = await Balance.updateOne(
    { userId, asset, locked: { $gte: spendLockedAmount } },
    { $inc: { locked: -spendLockedAmount } },
    { session }
  );
  if (res.modifiedCount !== 1) throw new Error("INSUFFICIENT_LOCKED");
}

async function addAvailable(session, userId, asset, amount) {
  await Balance.updateOne(
    { userId, asset },
    { $inc: { available: amount } },
    { upsert: true, session }
  );
}

let isRunning = false;

async function matchLimitOrdersOnce({ batch = 200 } = {}) {
  if (isRunning) return;
  isRunning = true;

  try {
    // Pull open limit orders (your schema only supports type=limit anyway)
    const openOrders = await Order.find({ status: "open" })
      .sort({ createdAt: 1 })
      .limit(batch)
      .lean();

    if (!openOrders.length) return;

    // Group by instId so we fetch OKX last once per pair
    const uniqueInst = [...new Set(openOrders.map(o => o.instId))];

    const lastByInst = {};
    await Promise.all(
      uniqueInst.map(async (instId) => {
          const ov = await getActiveOverride(instId);
    if (ov) {
      lastByInst[instId] = Number(ov.fixedPrice);
      return;
    }
        const okxInstId = pairMapping[instId] || instId; // <-- add this line
        try {
          lastByInst[instId] = await fetchOkxLast(okxInstId); // <-- use okxInstId
        } catch {
          lastByInst[instId] = null;
        }
      })
    );

    // Process in order
    for (const o of openOrders) {
      const last = lastByInst[o.instId];
      if (!Number.isFinite(last)) continue;

      const shouldFill =
        (o.side === "buy" && last <= o.price) ||
        (o.side === "sell" && last >= o.price);

      if (!shouldFill) continue;

      // Fill this order in a transaction so balances + order + trade are consistent
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // Re-read order inside txn to avoid double fill
          const ord = await Order.findOne({ _id: o._id, status: "open" }).session(session);
          if (!ord) return; // already filled/cancelled elsewhere

          const userId = ord.userId;
          const instId = ord.instId;
          const base = ord.base;
          const quote = ord.quote;

          const amountBase = Number(ord.amountBase);
          const limitPrice = Number(ord.price);
          const feeRate = Number(ord.feeRate ?? 0.001);

          if (!(amountBase > 0) || !(limitPrice > 0)) throw new Error("BAD_ORDER");

          // NOTE: Fill price choice:
          // MVP: use current last for trade record, but settle at ord.price to match user's expectation.
          // We'll settle at ord.price (recommended).
          const fillPrice = limitPrice;

          if (ord.side === "buy") {
            // Locked USDT should be >= price*amountBase
            const grossQuote = fillPrice * amountBase;

            // Spend locked quote
            await lockOrSpendLocked(session, userId, quote, grossQuote);

            // Fee charged in BASE (like your market buy)
            const feeBase = amountBase * feeRate;
            const netBase = amountBase - feeBase;

            await addAvailable(session, userId, base, netBase);

            // Mark order filled
            ord.status = "filled";
            await ord.save({ session });

            // Save trade record
            await Trade.create([{
              userId,
              instId,
              base,
              quote,
              side: "buy",
              type: "limit",
              price: fillPrice,
              amountBase,
              feeRate,
              feeAsset: base,
              feeAmount: feeBase,
              grossQuote,
              netQuote: grossQuote,  // for buy, quote spent = grossQuote
              netBase,
            }], { session });

          } else {
            // SELL
            // Spend locked BASE = amountBase
            await lockOrSpendLocked(session, userId, base, amountBase);

            const grossQuote = fillPrice * amountBase;

            // Fee charged in QUOTE (like your market sell)
            const feeQuote = grossQuote * feeRate;
            const netQuote = grossQuote - feeQuote;

            await addAvailable(session, userId, quote, netQuote);

            ord.status = "filled";
            await ord.save({ session });

            await Trade.create([{
              userId,
              instId,
              base,
              quote,
              side: "sell",
              type: "limit",
              price: fillPrice,
              amountBase,
              feeRate,
              feeAsset: quote,
              feeAmount: feeQuote,
              grossQuote,
              netQuote,
              netBase: amountBase, // for sell, base sold = amountBase
            }], { session });
          }
        });
      } catch (e) {
        // If txn failed, just skip this order this round
        // Common reasons: insufficient locked due to cancel, race, etc.
      } finally {
        session.endSession();
      }
    }
  } finally {
    isRunning = false;
  }
}

async function getActiveOverride(instId) {
  if (instId !== "NEX-USDT") return null;
  const doc = await MarketOverride.findOne({ instId: "NEX-USDT", isActive: true }).lean();
  if (!doc) return null;
  if (doc.endAt && new Date(doc.endAt).getTime() <= Date.now()) return null;
  return doc;
}

function startLimitMatcher({ intervalMs = 1500 } = {}) {
  // run immediately then loop
  matchLimitOrdersOnce().catch(() => {});
  return setInterval(() => matchLimitOrdersOnce().catch(() => {}), intervalMs);
}

module.exports = {
  matchLimitOrdersOnce,
  startLimitMatcher,
};
