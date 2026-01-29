const Kyc = require("../models/Kyc");
const path = require("path");
const fs = require("fs");

// List KYC submissions
exports.listKyc = async (req, res) => {
  const { status, userId } = req.query;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.userId = userId;

  const [items, total] = await Promise.all([
    Kyc.find(filter)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Kyc.countDocuments(filter),
  ]);

  res.json({
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
};

// Get single KYC
exports.getKyc = async (req, res) => {
  const kyc = await Kyc.findById(req.params.id);
  if (!kyc) return res.status(404).json({ message: "KYC not found" });
  res.json(kyc);
};

// Mark under review
exports.markUnderReview = async (req, res) => {
  const kyc = await Kyc.findByIdAndUpdate(
    req.params.id,
    {
      status: "UNDER_REVIEW",
      reviewedBy: req.adminId,
    },
    { new: true }
  );

  if (!kyc) return res.status(404).json({ message: "KYC not found" });
  res.json({ message: "KYC under review", kyc });
};

// Approve
exports.approveKyc = async (req, res) => {
  const kyc = await Kyc.findByIdAndUpdate(
    req.params.id,
    {
      status: "APPROVED",
      reviewedBy: req.adminId,
      reviewedAt: new Date(),
      rejectReason: null,
    },
    { new: true }
  );

  if (!kyc) return res.status(404).json({ message: "KYC not found" });
  res.json({ message: "KYC approved", kyc });
};

// Reject
exports.rejectKyc = async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ message: "Reject reason required" });
  }

  const kyc = await Kyc.findByIdAndUpdate(
    req.params.id,
    {
      status: "REJECTED",
      reviewedBy: req.adminId,
      reviewedAt: new Date(),
      rejectReason: reason,
    },
    { new: true }
  );

  if (!kyc) return res.status(404).json({ message: "KYC not found" });
  res.json({ message: "KYC rejected", kyc });
};

// Secure file viewer (admin only)
exports.viewFile = async (req, res) => {
  const { id, type } = req.params; // type = idFront | idBack | selfie

  const kyc = await Kyc.findById(id);
  if (!kyc || !kyc.files[type]) {
    return res.status(404).json({ message: "File not found" });
  }

  const file = kyc.files[type];
  if (!fs.existsSync(file.path)) {
    return res.status(404).json({ message: "File missing on disk" });
  }

  res.setHeader("Content-Type", file.mime);
  res.sendFile(path.resolve(file.path));
};
