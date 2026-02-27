const mongoose = require("mongoose");

const chatConversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ✅ agent is Admin (not User)
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    status: {
      type: String,
      enum: ["waiting", "active", "closed"],
      default: "waiting",
    },

    lastMessage: { type: String, default: "" },

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