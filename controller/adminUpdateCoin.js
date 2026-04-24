const Balance = require("../models/Balance");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const EPSILON = 0.00000001;

const LEGACY_TO_SYMBOL = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  DOGECOIN: "DOGE",
};

const SYMBOL_TO_ALL_NAMES = {
  BTC: ["BTC", "BITCOIN"],
  ETH: ["ETH", "ETHEREUM"],
  DOGE: ["DOGE", "DOGECOIN"],
};

function normalizeAsset(coin) {
  const raw = String(coin || "").trim().toUpperCase();
  return LEGACY_TO_SYMBOL[raw] || raw;
}

function getPossibleAssetNames(coin) {
  const normalized = normalizeAsset(coin);
  return SYMBOL_TO_ALL_NAMES[normalized] || [normalized];
}

module.exports = async (req, res) => {
  const { id } = req.params;
  let { coin, amount, type } = req.body;

  if (!coin) {
    return res.status(400).json({ message: "Missing coin" });
  }

  const asset = normalizeAsset(coin);
  const possibleAssetNames = getPossibleAssetNames(asset);

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

    // Find both new and legacy rows, e.g. ETH + ETHEREUM
    const rows = await Balance.find({
      userId: id,
      asset: { $in: possibleAssetNames },
    });

    const currentAvailable = rows.reduce((sum, row) => {
      return sum + Number(row.available || 0);
    }, 0);

    const currentLocked = rows.reduce((sum, row) => {
      return sum + Number(row.locked || 0);
    }, 0);

    const next =
      type === "remove"
        ? currentAvailable - amount
        : currentAvailable + amount;

    if (next < -EPSILON) {
      return res.status(400).json({
        message: "Insufficient balance",
        asset,
        currentAvailable,
        requestedAmount: amount,
        checkedAssets: possibleAssetNames,
      });
    }

    const nextAvailable = next <= EPSILON ? 0 : Number(next.toFixed(8));

    let responseBalance;

    // Delete all old/new rows first, so ETHEREUM becomes clean ETH
    await Balance.deleteMany({
      userId: id,
      asset: { $in: possibleAssetNames },
    });

    // Recreate only if balance remains positive
    if (nextAvailable > EPSILON || currentLocked > EPSILON) {
      const created = await Balance.create({
        userId: id,
        asset,
        available: nextAvailable,
        locked: currentLocked,
      });

      responseBalance = created.toObject();
    } else {
      responseBalance = {
        userId: id,
        asset,
        available: 0,
        locked: 0,
        deleted: true,
      };
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