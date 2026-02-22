const mongoose = require("mongoose");

const depositInstructionSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    default: "wire"
  },

  minimumDeposit: {
    type: Number,
    default: 0
  },

  recipientName: {
    type: String,
    default: ""
  },

  recipientAddress: {
    type: String,
    default: ""
  },

  recipientAccount: {
    type: String,
    default: ""
  },

  swiftBic: {
    type: String,
    default: ""
  },

  bankName: {
    type: String,
    default: ""
  },

  bankCountry: {
    type: String,
    default: ""
  },

  bankAddress: {
    type: String,
    default: ""
  },

  intermediaryBank: {
    type: String,
    default: ""
  },

  importantNotes: {
    type: String,
    default: ""
  }

}, { timestamps: true });

module.exports = mongoose.model("DepositInstruction", depositInstructionSchema);