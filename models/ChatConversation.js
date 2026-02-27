const mongoose = require("mongoose");

const chatConversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["waiting", "active", "closed"],
      default: "waiting",
    },

    lastMessage: String,

    unreadByAgent: {
      type: Number,
      default: 0,
    },

    unreadByCustomer: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatConversation", chatConversationSchema);