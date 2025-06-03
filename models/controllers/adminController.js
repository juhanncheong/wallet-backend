const User = require("../models/User");

exports.updateUserBalance = async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.balance = (user.balance || 0) + amount;
    await user.save();

    res.json({
      success: true,
      balance: user.balance,
    });
  } catch (err) {
    console.error("Balance update error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
