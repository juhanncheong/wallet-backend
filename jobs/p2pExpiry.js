const { P2POrder } = require("../models/P2P");
const { expireOrder } = require("../services/p2pService");

let timer = null;
let running = false;

async function runExpiryPass({ batchSize = 50 } = {}) {
  if (running) return;
  running = true;

  try {
    const due = await P2POrder.find({
      status: "awaiting_payment",
      paymentDeadlineAt: { $lte: new Date() },
    })
      .select("_id")
      .sort({ paymentDeadlineAt: 1 })
      .limit(batchSize)
      .lean();

    for (const order of due) {
      try {
        // Service rechecks order state inside a Mongo transaction.
        // eslint-disable-next-line no-await-in-loop
        await expireOrder(order._id);
      } catch (err) {
        console.error("P2P expiry failed", {
          orderId: String(order._id),
          code: err?.code,
          message: err?.message,
        });
      }
    }
  } finally {
    running = false;
  }
}

function startP2PExpiry({ intervalMs } = {}) {
  if (timer) return timer;

  const configured = Number(
    intervalMs || process.env.P2P_EXPIRY_INTERVAL_MS || 15000,
  );
  const safeInterval = Number.isFinite(configured)
    ? Math.max(5000, Math.floor(configured))
    : 15000;

  runExpiryPass().catch((err) =>
    console.error("Initial P2P expiry pass failed", err?.message || err),
  );

  timer = setInterval(() => {
    runExpiryPass().catch((err) =>
      console.error("P2P expiry pass failed", err?.message || err),
    );
  }, safeInterval);

  if (typeof timer.unref === "function") timer.unref();

  console.log(`P2P expiry worker started | interval=${safeInterval}ms`);
  return timer;
}

function stopP2PExpiry() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  runExpiryPass,
  startP2PExpiry,
  stopP2PExpiry,
};
