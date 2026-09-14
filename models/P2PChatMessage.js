const mongoose = require("mongoose");

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 1200 },
    name: { type: String, default: "", maxlength: 240 },
    mime: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
      required: true,
    },
    size: { type: Number, min: 1, max: 5 * 1024 * 1024, required: true },
  },
  { _id: false },
);

const p2pChatMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "P2PChatConversation",
      required: true,
      index: true,
      immutable: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "P2POrder",
      required: true,
      index: true,
      immutable: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    senderRole: {
      type: String,
      enum: ["buyer", "seller"],
      required: true,
      immutable: true,
    },
    kind: {
      type: String,
      enum: ["text", "image"],
      default: "text",
      required: true,
    },
    message: { type: String, default: "", maxlength: 2000 },
    attachment: { type: attachmentSchema, default: undefined },
  },
  { timestamps: true },
);

p2pChatMessageSchema.index({ conversationId: 1, createdAt: -1 });
p2pChatMessageSchema.index({ orderId: 1, createdAt: -1 });

module.exports =
  mongoose.models.P2PChatMessage ||
  mongoose.model("P2PChatMessage", p2pChatMessageSchema);
