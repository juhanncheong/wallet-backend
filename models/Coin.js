const mongoose = require("mongoose");

const CoinSchema = new mongoose.Schema({
  name: String,
  symbol: String,
  network: String,
  listed: Boolean
});

module.exports = mongoose.model("Coin", CoinSchema);
