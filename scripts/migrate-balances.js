// scripts/migrate-balances.js
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User");
const Balance = require("../models/Balance");

function coinKeyToAsset(key) {
  // your existing keys are: bitcoin, ethereum, usdc, usdt
  if (key === "bitcoin") return "BTC";
  if (key === "ethereum") return "ETH";
  return String(key).toUpperCase(); // USDC, USDT
}

async function upsertBalance(userId, asset, amount) {
  const n = Number(amount || 0);
  await Balance.updateOne(
    { userId, asset },
    { $setOnInsert: { userId, asset }, $set: { available: n } },
    { upsert: true }
  );
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({}, { coins: 1 }).lean();

  let touched = 0;
  for (const u of users) {
    const coins = u.coins || {};
    const keys = ["bitcoin", "ethereum", "usdc", "usdt"];

    for (const k of keys) {
      const asset = coinKeyToAsset(k);
      const amount = coins?.[k] ?? 0;
      await upsertBalance(u._id, asset, amount);
    }
    touched++;
  }

  console.log(`✅ Migrated balances for ${touched} users.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
