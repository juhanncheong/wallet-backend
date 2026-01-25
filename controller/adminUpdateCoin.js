// adminUpdateCoin.js
const User = require("../models/User");
const Transaction = require("../models/Transaction");

// 50 USDT-pair base coins (your list)
const SUPPORTED_COINS = [
  "USDT","BTC","ETH","SOL","XRP","BNB","DOGE","ADA","TRX","AVAX","DOT",
  "MATIC","LINK","LTC","BCH","ATOM","TON","XLM","ETC","APT","OP",
  "ARB","SUI","NEAR","FIL","INJ","RNDR","RUNE","AAVE","UNI","IMX",
  "GRT","STX","MKR","ALGO","KAS","TIA","SEI","PEPE","SHIB","WIF",
  "BONK","FLOKI","JUP","JTO","LDO","FET","TAO","QNT","XAUT","USDC",
];

const SUPPORTED_SET = new Set(SUPPORTED_COINS.map((c) => c.toLowerCase()));

module.exports = async (req, res) => {
  const { id } = req.params;
  let { coin, amount, type } = req.body;

  if (!coin) return res.status(400).json({ message: "Missing coin" });

  // normalize
  coin = String(coin).trim().toLowerCase();

  if (!SUPPORTED_SET.has(coin)) {
    return res.status(400).json({ message: "Invalid coin type" });
  }

  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  if (type !== "add" && type !== "remove") {
    return res.status(400).json({ message: "Invalid type (use add/remove)" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.coins) user.coins = {};
    const current = Number(user.coins[coin] || 0);

    const next = type === "remove" ? current - amount : current + amount;
    if (next < 0) return res.status(400).json({ message: "Insufficient balance" });

    user.coins[coin] = Number(next.toFixed(8));
    await user.save();

    await Transaction.create({
      userId: id,
      type: type === "remove" ? "withdrawal" : "deposit",
      coin,
      amount,
      status: "completed",
    });

    return res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error("Update coin error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
