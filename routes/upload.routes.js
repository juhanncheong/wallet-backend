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

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  // IMPORTANT: this URL must match how you serve /uploads (next step)
  const url = `/uploads/${req.file.filename}`;

  res.json({
    ok: true,
    file: {
      url,
      name: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
    },
  });
});

module.exports = router;