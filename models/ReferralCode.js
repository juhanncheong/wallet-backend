const mongoose = require("mongoose");

const referralCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  createdBy: { type: String, default: "admin" }
});

module.exports = mongoose.model("ReferralCode", referralCodeSchema);
