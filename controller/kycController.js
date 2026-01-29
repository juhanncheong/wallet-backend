const Kyc = require("../models/Kyc");

exports.getMyKyc = async (req, res) => {
  const userId = req.user.userId;

  let kyc = await Kyc.findOne({ userId });

  if (!kyc) {
    return res.json({ status: "NOT_STARTED" });
  }

  res.json({
    status: kyc.status,
    fullName: kyc.fullName,
    dob: kyc.dob,
    country: kyc.country,
    submittedAt: kyc.submittedAt,
    rejectReason: kyc.rejectReason || null,
  });
};

exports.submitKyc = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, dob, country } = req.body;

    if (!fullName || !dob || !country) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!req.files?.idFront || !req.files?.idBack || !req.files?.selfie) {
      return res.status(400).json({ message: "All documents required" });
    }

    let kyc = await Kyc.findOne({ userId });
    if (!kyc) kyc = new Kyc({ userId });

    kyc.fullName = fullName;
    kyc.dob = new Date(dob);
    kyc.country = country;

    const toFileMeta = (f) => ({
     path: f.path,
     mime: f.mimetype,
     size: f.size,
     originalName: f.originalname,
     uploadedAt: new Date(),
   });

   kyc.files = {
     idFront: toFileMeta(req.files.idFront[0]),
     idBack: toFileMeta(req.files.idBack[0]),
     selfie: toFileMeta(req.files.selfie[0]),
   };

    kyc.status = "SUBMITTED";
    kyc.submittedAt = new Date();
    kyc.rejectReason = null;
    kyc.reviewNotes = null;
    kyc.reviewedAt = null;
    kyc.reviewedBy = null;

    await kyc.save();

    res.json({ message: "KYC submitted successfully" });
  } catch (err) {
    console.error("KYC submit error:", err);
    return res.status(500).json({ message: err.message || "Failed to submit KYC" });
  }
};
