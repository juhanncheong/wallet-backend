const express = require("express");
const router = express.Router();
const DepositInstruction = require("../models/DepositInstruction");

// Public - Get wire transfer details
router.get("/wire-details", async (req, res) => {
  try {
    const instruction = await DepositInstruction.findOne({ method: "wire" });

    if (!instruction) {
      return res.json({
        success: false,
        message: "Wire details not configured"
      });
    }

    res.json({
      success: true,
      data: instruction
    });

  } catch (err) {
    console.error("Fetch wire details error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;