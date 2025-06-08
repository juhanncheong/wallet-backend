const mongoose = require("mongoose");

const CoinSchema = new mongoose.Schema({
  name: String,
  symbol: String,
  network: String,
  listed: Boolean,
  sendEnabled: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model("Coin", CoinSchema);
