const Balance = require("../models/Balance");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const EPSILON = 0.00000001;

function normalizeAsset(coin) {
  const map = {
    BITCOIN: "BTC",
    ETHEREUM: "ETH",
    DOGECOIN: "DOGE",
  };

  const raw = String(coin || "").trim().toUpperCase();
  return map[raw] || raw;
}

module.exports = async (req, res) => {
  const { id } = req.params;
  let { coin, amount, type } = req.body;

  if (!coin) {
    return res.status(400).json({ message: "Missing coin" });
  }

  const asset = normalizeAsset(coin);

  amount = Number(amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  if (type !== "add" && type !== "remove") {
    return res.status(400).json({ message: "Invalid type (use add/remove)" });
  }

  try {
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const row = await Balance.findOne({ userId: id, asset });
    const currentAvailable = Number(row?.available || 0);
    const currentLocked = Number(row?.locked || 0);

    const next =
      type === "remove"
        ? currentAvailable - amount
        : currentAvailable + amount;

    if (next < -EPSILON) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const nextAvailable = next <= EPSILON ? 0 : Number(next.toFixed(8));

    let responseBalance;

    if (nextAvailable <= EPSILON && currentLocked <= EPSILON) {
      await Balance.deleteOne({ userId: id, asset });

      responseBalance = {
        userId: id,
        asset,
        available: 0,
        locked: 0,
        deleted: true,
      };
    } else {
      const updated = await Balance.findOneAndUpdate(
        { userId: id, asset },
        {
          $setOnInsert: { userId: id, asset },
          $set: { available: nextAvailable },
        },
        {
          upsert: true,
          new: true,
        }
      ).lean();

      responseBalance = updated;
    }

    await Transaction.create({
      userId: id,
      type: type === "remove" ? "withdrawal" : "deposit",
      coin: asset,
      amount,
      status: "completed",
    });

    return res.json({
      success: true,
      balance: responseBalance,
    });
  } catch (err) {
    console.error("Update coin error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};