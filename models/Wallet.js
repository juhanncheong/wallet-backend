const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  address: { type: String, required: true },
  coin: { type: String, required: true },       // BTC, ETH, USDC, etc.
  network: { type: String, required: true },    // Bitcoin, Ethereum, etc.
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Wallet', WalletSchema);
