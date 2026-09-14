const mongoose = require("mongoose");

const { P2POrder } = require("../models/P2P");
const P2PChatConversation = require("../models/P2PChatConversation");
const P2PChatMessage = require("../models/P2PChatMessage");

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 200;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function id(value) {
  return String(value || "");
}

function roomForOrder(orderId) {
  return `p2p:order:${id(orderId)}`;
}

function roleForOrder(order, userId) {
  const uid = id(userId);
  if (id(order.buyerId) === uid) return "buyer";
  if (id(order.sellerId) === uid) return "seller";
  return null;
}

async function getOrderForParticipant(orderId, userId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw httpError(400, "Invalid P2P order ID", "INVALID_ORDER_ID");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(401, "Invalid authenticated user", "INVALID_USER_ID");
  }

  const order = await P2POrder.findById(orderId)
    .select(
      "reference buyerId sellerId advertiserId takerId adSide asset fiatCurrency price usdtAmount fiatAmount status paymentDeadlineAt paidAt completedAt cancelledAt expiredAt appealedAt createdAt",
    )
    .populate("buyerId", "username")
    .populate("sellerId", "username")
    .lean();

  if (!order) {
    throw httpError(404, "P2P order not found", "ORDER_NOT_FOUND");
  }

  const buyerObject = order.buyerId;
  const sellerObject = order.sellerId;
  const buyerId = buyerObject?._id || buyerObject;
  const sellerId = sellerObject?._id || sellerObject;

  const normalized = {
    ...order,
    buyerId,
    sellerId,
    buyer: buyerObject?._id
      ? { id: id(buyerObject._id), username: buyerObject.username || "P2P User" }
      : { id: id(buyerId), username: "P2P User" },
    seller: sellerObject?._id
      ? { id: id(sellerObject._id), username: sellerObject.username || "P2P User" }
      : { id: id(sellerId), username: "P2P User" },
  };

  const role = roleForOrder(normalized, userId);
  if (!role) {
    throw httpError(403, "You are not a participant in this P2P order", "NOT_PARTICIPANT");
  }

  normalized.role = role;
  return normalized;
}

async function getOrCreateConversation(order) {
  let conversation = await P2PChatConversation.findOne({ orderId: order._id }).lean();
  if (conversation) return conversation;

  try {
    conversation = await P2PChatConversation.create({
      orderId: order._id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      lastMessage: "",
      unreadByBuyer: 0,
      unreadBySeller: 0,
    });
    return conversation.toObject();
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await P2PChatConversation.findOne({
        orderId: order._id,
      }).lean();
      if (existing) return existing;
    }
    throw err;
  }
}

function serializeConversation(conversation, order, userId) {
  const role = roleForOrder(order, userId);
  const counterparty = role === "buyer" ? order.seller : order.buyer;

  return {
    id: id(conversation._id),
    orderId: id(order._id),
    orderReference: order.reference,
    role,
    counterparty,
    unread:
      role === "buyer"
        ? Number(conversation.unreadByBuyer || 0)
        : Number(conversation.unreadBySeller || 0),
    lastMessage: conversation.lastMessage || "",
    lastMessageAt: conversation.lastMessageAt || null,
  };
}

function systemMessage(order, type, createdAt, message) {
  if (!createdAt) return null;

  return {
    id: `system-${id(order._id)}-${type}`,
    conversationId: null,
    orderId: id(order._id),
    senderId: null,
    senderRole: "system",
    kind: "system",
    message,
    attachment: null,
    createdAt,
    systemType: type,
  };
}

function derivedSystemMessages(order) {
  return [
    systemMessage(order, "ORDER_CREATED", order.createdAt, "Order created"),
    systemMessage(
      order,
      "PAYMENT_MARKED_PAID",
      order.paidAt,
      "Buyer marked the order as paid",
    ),
    systemMessage(order, "APPEAL_OPENED", order.appealedAt, "Appeal opened"),
    systemMessage(
      order,
      "ORDER_COMPLETED",
      order.completedAt,
      "USDT released. Order completed",
    ),
    systemMessage(order, "ORDER_CANCELLED", order.cancelledAt, "Order cancelled"),
    systemMessage(order, "ORDER_EXPIRED", order.expiredAt, "Order expired"),
  ].filter(Boolean);
}

function serializeMessage(message) {
  return {
    id: id(message._id),
    conversationId: id(message.conversationId),
    orderId: id(message.orderId),
    senderId: id(message.senderId),
    senderRole: message.senderRole,
    kind: message.kind,
    message: message.message || "",
    attachment: message.attachment || null,
    createdAt: message.createdAt,
  };
}

async function listMessages({ order, conversation, before, limit }) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_MESSAGE_LIMIT, 1),
    MAX_MESSAGE_LIMIT,
  );

  const query = { conversationId: conversation._id };
  if (before) {
    const beforeDate = new Date(before);
    if (!Number.isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    }
  }

  const docs = await P2PChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  const persisted = docs.reverse().map(serializeMessage);
  const system = derivedSystemMessages(order);

  const merged = [...system, ...persisted].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return merged;
}

function normalizeAttachment(attachment, orderId) {
  if (!attachment) return null;

  const url = String(attachment.url || "").trim();
  const expectedPrefix = `/api/p2p/chat/files/${id(orderId)}/`;

  if (!url.startsWith(expectedPrefix)) {
    throw httpError(400, "Invalid P2P chat attachment", "INVALID_ATTACHMENT");
  }

  const mime = String(attachment.mime || "").trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw httpError(400, "Unsupported attachment type", "INVALID_ATTACHMENT_TYPE");
  }

  const size = Number(attachment.size || 0);
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
    throw httpError(400, "Invalid attachment size", "INVALID_ATTACHMENT_SIZE");
  }

  return {
    url,
    name: String(attachment.name || "image").slice(0, 240),
    mime,
    size,
  };
}

async function sendMessage({ orderId, userId, message, attachment }) {
  const order = await getOrderForParticipant(orderId, userId);
  const conversation = await getOrCreateConversation(order);
  const senderRole = roleForOrder(order, userId);

  const cleanMessage = String(message || "").trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    throw httpError(400, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`, "MESSAGE_TOO_LONG");
  }

  const cleanAttachment = normalizeAttachment(attachment, order._id);
  if (!cleanMessage && !cleanAttachment) {
    throw httpError(400, "Message cannot be empty", "EMPTY_MESSAGE");
  }

  const kind = cleanAttachment ? "image" : "text";
  const finalText = cleanMessage || "[image]";

  const created = await P2PChatMessage.create({
    conversationId: conversation._id,
    orderId: order._id,
    senderId: userId,
    senderRole,
    kind,
    message: finalText,
    attachment: cleanAttachment || undefined,
  });

  const unreadInc =
    senderRole === "buyer" ? { unreadBySeller: 1 } : { unreadByBuyer: 1 };

  await P2PChatConversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: finalText.slice(0, 240),
        lastMessageAt: created.createdAt,
      },
      $inc: unreadInc,
    },
  );

  return {
    order,
    conversation,
    message: serializeMessage(created.toObject()),
  };
}

async function markRead(orderId, userId) {
  const order = await getOrderForParticipant(orderId, userId);
  const conversation = await getOrCreateConversation(order);
  const role = roleForOrder(order, userId);

  const update = role === "buyer" ? { unreadByBuyer: 0 } : { unreadBySeller: 0 };
  await P2PChatConversation.updateOne({ _id: conversation._id }, { $set: update });

  return { order, conversation, role };
}

async function getChat(orderId, userId, options = {}) {
  const order = await getOrderForParticipant(orderId, userId);
  const conversation = await getOrCreateConversation(order);
  const messages = await listMessages({
    order,
    conversation,
    before: options.before,
    limit: options.limit,
  });

  return {
    conversation: serializeConversation(conversation, order, userId),
    order: {
      id: id(order._id),
      reference: order.reference,
      status: order.status,
      asset: order.asset,
      fiatCurrency: order.fiatCurrency,
      price: order.price,
      usdtAmount: order.usdtAmount,
      fiatAmount: order.fiatAmount,
      paymentDeadlineAt: order.paymentDeadlineAt,
      buyer: order.buyer,
      seller: order.seller,
    },
    messages,
  };
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  roomForOrder,
  roleForOrder,
  getOrderForParticipant,
  getOrCreateConversation,
  getChat,
  sendMessage,
  markRead,
};
