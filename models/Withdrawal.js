const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  coin: String,

  method: { 
    type: String, 
    enum: ["CRYPTO", "USDT_WIRE"], 
    default: "CRYPTO" 
  },

  // For crypto withdrawals
  address: String,
  network: String,

  // For wire withdrawals
  wireInfo: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    swiftCode: String,
    bankAddress: String
  },

  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected"],
    default: "pending" 
  },

  createdAt: { type: Date, default: Date.now },
  approvedAt: Date,
  rejectedAt: Date,
  adminNote: String
});

module.exports = mongoose.model("Withdrawal", WithdrawalSchema);