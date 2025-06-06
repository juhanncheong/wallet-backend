const mongoose = require("mongoose");

const referralCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
});

module.exports = mongoose.model("ReferralCode", referralCodeSchema);
