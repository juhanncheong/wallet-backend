const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const auth = require("../middleware/auth");

// store locally: /uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

router.post("/upload", auth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "No file uploaded" });

    return res.json({
      ok: true,
      file: {
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (e) {
    console.error("Upload error:", e);
    return res.status(500).json({ ok: false, message: "Upload failed" });
  }
});

router.use((err, req, res, next) => {
  console.error("Multer error:", err);
  return res.status(400).json({ ok: false, message: err.message || "Upload error" });
});

module.exports = router;