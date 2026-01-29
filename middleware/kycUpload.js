const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user.userId;
    const dir = path.join("uploads", "kyc", String(userId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // fixed filenames, overwrite on resubmit
    const map = {
      idFront: "id_front",
      idBack: "id_back",
      selfie: "selfie",
    };
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${map[file.fieldname]}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED.includes(file.mimetype)) {
    return cb(new Error("Invalid file type"));
  }
  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});
