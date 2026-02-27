const ChatMessage = require("../models/ChatMessage");
const ChatConversation = require("../models/ChatConversation");

module.exports = (io) => {
  io.on("connection", (socket) => {

    socket.on("joinChat", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("sendChatMessage", async (data, cb) => {
  try {
    const { conversationId, senderId, senderRole, message } = data;

    if (!conversationId || !senderId || !senderRole || !message) {
      return cb?.({ ok: false, error: "Missing fields" });
    }

    const role = senderRole === "admin" ? "agent" : senderRole;
    const senderModel = role === "customer" ? "User" : "Admin";

    const newMessage = await ChatMessage.create({
      conversation: conversationId,
      sender: senderId,
      senderModel,
      senderRole: role,
      message,
    });

    const inc = role === "customer"
      ? { unreadByAgent: 1 }
      : { unreadByCustomer: 1 };

    await ChatConversation.findByIdAndUpdate(
      conversationId,
      { $set: { lastMessage: message, updatedAt: new Date() }, $inc: inc },
      { new: true }
    );

    io.to(conversationId).emit("newChatMessage", newMessage);
    cb?.({ ok: true, message: newMessage });
  } catch (err) {
    console.error("Socket message error:", err);
    cb?.({ ok: false, error: err.message });
  }
});

  });
};