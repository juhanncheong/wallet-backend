const ChatMessage = require("../models/ChatMessage");
const ChatConversation = require("../models/ChatConversation");

module.exports = (io) => {
  io.on("connection", (socket) => {

    socket.on("joinChat", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("sendChatMessage", async (data) => {
  try {
    const { conversationId, senderId, senderRole, message } = data;

    if (!conversationId || !senderRole || !message) return; // ✅ senderId not required

    const newMessage = await ChatMessage.create({
      conversation: conversationId,
      sender: senderId || null, // ✅ allow null if you want
      senderRole,               // we'll fix enum below
      message,
    });

    // update conversation counters
    const updateFields = { lastMessage: message };

    if (senderRole === "customer") {
      updateFields.$inc = { unreadByAgent: 1 };
    } else {
      updateFields.$inc = { unreadByCustomer: 1 };
    }

    await ChatConversation.findByIdAndUpdate(conversationId, updateFields);
    io.to(conversationId).emit("newChatMessage", newMessage);
  } catch (err) {
    console.error("Socket message error:", err);
  }
});

  });
};