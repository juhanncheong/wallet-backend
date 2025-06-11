const User = require("../models/User");
const Transaction = require("../models/Transaction");

module.exports = async (req, res) => {
  const { id } = req.params;
  let { coin, amount, type } = req.body;

  coin = coin.toLowerCase();  // <--- fix here

  if (!coin || !amount || !type) {
    return res.status(400).json({ message: "Missing coin, amount, or type" });
  }

  // Force float number
  amount = parseFloat(amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.coins) user.coins = {};

    const current = parseFloat(user.coins[coin] || 0);
    const updatedAmount = type === "remove" ? current - amount : current + amount;

    if (updatedAmount < 0) return res.status(400).json({ message: "Insufficient balance" });

    user.coins[coin] = parseFloat(updatedAmount.toFixed(8));
    await user.save();

    await Transaction.create({
      userId: id,
      type: type === "remove" ? "withdrawal" : "deposit",
      coin,
      amount,
      status: "completed",
    });

    res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error("Update coin error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
