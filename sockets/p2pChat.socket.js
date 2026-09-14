const jwt = require("jsonwebtoken");
const p2pChat = require("../services/p2pChatService");

const WINDOW_MS = 10 * 1000;
const MAX_MESSAGES_PER_WINDOW = 12;

function extractToken(socket) {
  const authToken = String(socket.handshake?.auth?.token || "").trim();
  if (authToken) return authToken.replace(/^Bearer\s+/i, "");

  const header = String(socket.handshake?.headers?.authorization || "").trim();
  const [scheme, token] = header.split(" ");
  if (/^Bearer$/i.test(scheme) && token) return token;

  return "";
}

function socketUserId(decoded) {
  return decoded?.id || decoded?._id || decoded?.userId || null;
}

function rateLimit(socket) {
  const now = Date.now();
  const state = socket.data.p2pChatRate || {
    startedAt: now,
    count: 0,
  };

  if (now - state.startedAt >= WINDOW_MS) {
    state.startedAt = now;
    state.count = 0;
  }

  state.count += 1;
  socket.data.p2pChatRate = state;

  return state.count <= MAX_MESSAGES_PER_WINDOW;
}

module.exports = function registerP2PChatSocket(io) {
  const nsp = io.of("/p2p-chat");

  // Authenticate once during the Socket.IO handshake. The browser never gets
  // to choose senderId or senderRole.
  nsp.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error("AUTH_REQUIRED"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = socketUserId(decoded);
      if (!userId) return next(new Error("AUTH_REQUIRED"));

      socket.data.userId = String(userId);
      return next();
    } catch {
      return next(new Error("AUTH_INVALID"));
    }
  });

  nsp.on("connection", (socket) => {
    socket.on("p2pChat:join", async (payload = {}, cb) => {
      try {
        const orderId = String(payload.orderId || "");
        const order = await p2pChat.getOrderForParticipant(
          orderId,
          socket.data.userId,
        );

        const conversation = await p2pChat.getOrCreateConversation(order);
        const room = p2pChat.roomForOrder(orderId);

        await socket.join(room);

        return cb?.({
          ok: true,
          data: {
            conversationId: String(conversation._id),
            orderId: String(order._id),
            role: order.role,
          },
        });
      } catch (err) {
        return cb?.({
          ok: false,
          error: err.message || "Unable to join P2P chat",
          code: err.code,
        });
      }
    });

    socket.on("p2pChat:send", async (payload = {}, cb) => {
      try {
        if (!rateLimit(socket)) {
          return cb?.({
            ok: false,
            error: "Too many messages. Please slow down.",
            code: "RATE_LIMITED",
          });
        }

        const orderId = String(payload.orderId || "");
        const room = p2pChat.roomForOrder(orderId);

        // sendMessage performs the participant check again. Joining a room is
        // never treated as authorization to send.
        const result = await p2pChat.sendMessage({
          orderId,
          userId: socket.data.userId,
          message: payload.message,
          attachment: payload.attachment,
        });

        // Ensure this socket is in the verified order room before broadcasting.
        await socket.join(room);
        nsp.to(room).emit("p2pChat:message", result.message);

        return cb?.({ ok: true, data: result.message });
      } catch (err) {
        return cb?.({
          ok: false,
          error: err.message || "Unable to send P2P message",
          code: err.code,
        });
      }
    });

    socket.on("p2pChat:typing", async (payload = {}, cb) => {
      try {
        const orderId = String(payload.orderId || "");
        const order = await p2pChat.getOrderForParticipant(
          orderId,
          socket.data.userId,
        );

        const room = p2pChat.roomForOrder(orderId);
        await socket.join(room);

        socket.to(room).emit("p2pChat:typing", {
          orderId,
          role: order.role,
          typing: Boolean(payload.typing),
        });

        return cb?.({ ok: true });
      } catch (err) {
        return cb?.({ ok: false, error: err.message, code: err.code });
      }
    });
  });
};
