const ChatMessage = require("../models/ChatMessage");
const ChatConversation = require("../models/ChatConversation");

module.exports = (io) => {
  io.on("connection", (socket) => {

    socket.on("joinChat", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("sendChatMessage", async (data, cb) => {
      try {
        const { conversationId, senderId, senderRole, message, kind, attachment } = data;

        if (!conversationId || !senderId || !senderRole) {
          return cb?.({ ok: false, error: "Missing fields" });
        }

        // ✅ allow attachments even if message empty
        const hasText = typeof message === "string" && message.trim().length > 0;
        const hasAttachment = attachment && attachment.url;

        if (!hasText && !hasAttachment) {
          return cb?.({ ok: false, error: "Empty message" });
        }

        const role = senderRole === "admin" ? "agent" : senderRole;
        const senderModel = role === "customer" ? "User" : "Admin";

        const finalKind = hasAttachment ? (kind || "file") : "text";
        const finalMessage =
          hasText ? message.trim()
          : finalKind === "image" ? "[image]"
          : "[file]";

        const newMessage = await ChatMessage.create({
          conversation: conversationId,
          sender: senderId,
          senderModel,
          senderRole: role,
          message: finalMessage,
          kind: finalKind,
          attachment: hasAttachment ? attachment : undefined,
       });

        const inc = role === "customer" ? { unreadByAgent: 1 } : { unreadByCustomer: 1 };

        await ChatConversation.findByIdAndUpdate(
          conversationId,
          { $set: { lastMessage: finalMessage, updatedAt: new Date() }, $inc: inc },
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