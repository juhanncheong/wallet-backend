const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "ChatConversation", required: true },

    sender: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "senderModel" },
    senderModel: { type: String, required: true, enum: ["User", "Admin"] },

    senderRole: { type: String, enum: ["customer", "agent"], required: true },

    message: { type: String, required: true },

    kind: { type: String, enum: ["text", "image", "file"], default: "text" },
    attachment: {
      url: String,
      name: String,
      mime: String,
      size: Number,
    },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);