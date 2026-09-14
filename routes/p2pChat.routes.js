const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const auth = require("../middleware/auth");
const p2pChat = require("../services/p2pChatService");

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function safeFileName(value) {
  return String(value || "image")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function routeError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error("P2P chat route error:", err);

  return res.status(status).json({
    ok: false,
    message: status >= 500 ? "P2P chat request failed" : err.message,
    code: err?.code || undefined,
  });
}

async function requireParticipant(req, res, next) {
  try {
    req.p2pChatOrder = await p2pChat.getOrderForParticipant(
      req.params.orderId,
      req.userId,
    );
    return next();
  } catch (err) {
    return routeError(res, err);
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(
      __dirname,
      "..",
      "private_uploads",
      "p2p-chat",
      String(req.params.orderId),
    );

    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = ALLOWED_MIME.get(String(file.mimetype || "").toLowerCase());
    cb(null, `${crypto.randomUUID()}${ext || ""}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      const err = new Error("Only JPG, PNG, and WEBP images are allowed");
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

// Get/create the order's private chat and fetch its messages.
router.get("/orders/:orderId", auth, async (req, res) => {
  try {
    const data = await p2pChat.getChat(req.params.orderId, req.userId, {
      before: req.query.before,
      limit: req.query.limit,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    return routeError(res, err);
  }
});

// REST fallback for sending messages. Socket.IO uses the same service.
router.post("/orders/:orderId/messages", auth, async (req, res) => {
  try {
    const result = await p2pChat.sendMessage({
      orderId: req.params.orderId,
      userId: req.userId,
      message: req.body?.message,
      attachment: req.body?.attachment,
    });

    const io = req.app.get("io");
    io?.of("/p2p-chat")
      .to(p2pChat.roomForOrder(req.params.orderId))
      .emit("p2pChat:message", result.message);

    return res.status(201).json({ ok: true, data: result.message });
  } catch (err) {
    return routeError(res, err);
  }
});

router.patch("/orders/:orderId/read", auth, async (req, res) => {
  try {
    await p2pChat.markRead(req.params.orderId, req.userId);
    return res.json({ ok: true });
  } catch (err) {
    return routeError(res, err);
  }
});

// Private image upload. The order participant check happens BEFORE multer writes.
router.post(
  "/orders/:orderId/upload",
  auth,
  requireParticipant,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "No image uploaded" });
    }

    return res.status(201).json({
      ok: true,
      data: {
        attachment: {
          url: `/api/p2p/chat/files/${req.params.orderId}/${req.file.filename}`,
          name: safeFileName(req.file.originalname),
          mime: req.file.mimetype,
          size: req.file.size,
        },
      },
    });
  },
);

// Authenticated image delivery. Files are NOT exposed through /uploads directly.
router.get(
  "/files/:orderId/:filename",
  auth,
  requireParticipant,
  (req, res) => {
    const filename = String(req.params.filename || "");
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(filename)) {
      return res.status(400).json({ ok: false, message: "Invalid file name" });
    }

    const filePath = path.join(
      __dirname,
      "..",
      "private_uploads",
      "p2p-chat",
      String(req.params.orderId),
      filename,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, message: "Image not found" });
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(filePath);
  },
);

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        ok: false,
        message: "Image must be 5MB or smaller",
      });
    }

    return res.status(400).json({ ok: false, message: err.message });
  }

  if (err) {
    return res.status(Number(err.status) || 400).json({
      ok: false,
      message: err.message || "Upload failed",
    });
  }

  return next();
});

module.exports = router;
