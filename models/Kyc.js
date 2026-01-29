const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },       // local disk path
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const KycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["NOT_STARTED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"],
      default: "NOT_STARTED",
      index: true,
    },

    // minimal fields
    fullName: { type: String, trim: true },
    dob: { type: Date },
    country: { type: String, trim: true },

    files: {
      idFront: { type: FileSchema },
      idBack: { type: FileSchema },
      selfie: { type: FileSchema },
    },

    // submission + review metadata
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

    rejectReason: { type: String, trim: true },
    reviewNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Kyc", KycSchema);
