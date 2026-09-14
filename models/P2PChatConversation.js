const mongoose = require("mongoose");

const { Schema } = mongoose;

const p2pChatConversationSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "P2POrder",
      required: true,
      unique: true,
      index: true,
      immutable: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    lastMessage: { type: String, default: "", maxlength: 240 },
    lastMessageAt: { type: Date, default: null, index: true },
    unreadByBuyer: { type: Number, default: 0, min: 0 },
    unreadBySeller: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

p2pChatConversationSchema.index({ buyerId: 1, updatedAt: -1 });
p2pChatConversationSchema.index({ sellerId: 1, updatedAt: -1 });

module.exports =
  mongoose.models.P2PChatConversation ||
  mongoose.model("P2PChatConversation", p2pChatConversationSchema);
