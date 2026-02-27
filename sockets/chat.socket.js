const ChatMessage = require("../models/ChatMessage");
const ChatConversation = require("../models/ChatConversation");

module.exports = (io) => {
  io.on("connection", (socket) => {

    // admins join this once to receive sidebar updates
    socket.on("joinAdmin", () => {
      socket.join("admins");
    });

    socket.on("joinChat", (conversationId) => {
      socket.join(String(conversationId));
    });

    socket.on("leaveChat", (conversationId) => {
      socket.leave(String(conversationId));
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

        const now = new Date();

        const inc = role === "customer"
          ? { unreadByAgent: 1 }
          : { unreadByCustomer: 1 };

        await ChatConversation.findByIdAndUpdate(
          conversationId,
          { $set: { lastMessage: message, updatedAt: now }, $inc: inc },
          { new: true }
        );

        // people inside the opened conversation
        io.to(String(conversationId)).emit("newChatMessage", newMessage);

        // ALL admins (sidebar updates)
        io.to("admins").emit("adminConversationUpdated", {
          conversationId: String(conversationId),
          lastMessage: message,
          updatedAt: now.toISOString(),
          senderRole: role,
          incUnreadByAgent: role === "customer" ? 1 : 0,
          incUnreadByCustomer: role === "agent" ? 1 : 0,
        });

        cb?.({ ok: true, message: newMessage });
      } catch (err) {
        console.error("Socket message error:", err);
        cb?.({ ok: false, error: err.message });
      }
    });

  });
};