const User = require("../models/User");

// 🧠 Allowed coins — always use lowercase keys
const ALLOWED_COINS = ["bitcoin", "ethereum", "usdc", "usdt"];

module.exports = async (req, res) => {
  const { id } = req.params;
  const { coin, amount } = req.body;

  if (!ALLOWED_COINS.includes(coin)) {
    return res.status(400).json({ message: "Unsupported coin type" });
  }

  if (typeof amount !== "number") {
    return res.status(400).json({ message: "Amount must be a number" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure coins object exists
    if (!user.coins) {
      user.coins = {
        bitcoin: 0,
        ethereum: 0,
        usdc: 0,
        usdt: 0,
      };
    }

    // ✅ Update coin balance
    user.coins[coin] += amount;

    // Prevent negative balances
    if (user.coins[coin] < 0) {
      return res.status(400).json({ message: "Balance cannot be negative" });
    }

    await user.save();
    return res.status(200).json({
      message: `${amount >= 0 ? "Added" : "Removed"} ${Math.abs(amount)} ${coin.toUpperCase()} successfully`,
      coins: user.coins,
    });

  } catch (err) {
    console.error("Update coin error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
