const Balance = require("../models/Balance");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

module.exports = async (req, res) => {
  const { id } = req.params;
  let { coin, amount, type } = req.body;

  if (!coin) return res.status(400).json({ message: "Missing coin" });

  // Normalize
  const asset = String(coin).trim().toUpperCase();

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

    // Load current balance row
    const row = await Balance.findOne({ userId: id, asset }).lean();
    const current = Number(row?.available || 0);

    const next = type === "remove" ? current - amount : current + amount;
    if (next < 0) return res.status(400).json({ message: "Insufficient balance" });

    await Balance.updateOne(
      { userId: id, asset },
      { $setOnInsert: { userId: id, asset }, $set: { available: Number(next.toFixed(8)) } },
      { upsert: true }
    );

    await Transaction.create({
      userId: id,
      type: type === "remove" ? "withdrawal" : "deposit",
      coin: asset,
      amount,
      status: "completed",
    });

    const updated = await Balance.findOne({ userId: id, asset }).lean();
    return res.json({ success: true, balance: updated });
  } catch (err) {
    console.error("Update coin error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
