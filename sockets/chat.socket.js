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

        if (!conversationId || !senderId || !senderRole || !message) {
          return;
        }

        const newMessage = await ChatMessage.create({
          conversation: conversationId,
          sender: senderId,
          senderRole,
          message,
        });

        const updateFields = {
          lastMessage: message,
        };

        if (senderRole === "customer") {
          updateFields.$inc = { unreadByAdmin: 1 };
        } else {
          updateFields.$inc = { unreadByCustomer: 1 };
        }

        await ChatConversation.findByIdAndUpdate(
          conversationId,
          updateFields
        );

        io.to(conversationId).emit("newChatMessage", newMessage);

      } catch (err) {
        console.error("Socket message error:", err);
      }
    });

  });
};