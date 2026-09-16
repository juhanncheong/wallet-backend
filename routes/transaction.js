const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Balance = require("../models/Balance");

// POST - Create a new transaction (deposit or withdrawal)
router.post("/", async (req, res) => {
  try {
    const { userId, type, coin, amount, status } = req.body;

    const newTx = new Transaction({
      userId,
      type,
      coin,
      amount,
      status: status || (type === "withdrawal" ? "pending" : "completed"),
    });

    await newTx.save();

    res.status(201).json(newTx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update withdrawal status (admin approval/rejection)
router.put("/:id/status", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { status } = req.body; // 'completed' or 'failed'

    if (!["completed", "failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    let updatedTx = null;

    await session.withTransaction(async () => {
      updatedTx = await Transaction.findOneAndUpdate(
        {
          _id: req.params.id,
          type: "withdrawal",
          status: "pending",
        },
        { $set: { status } },
        { new: true, session },
      );

      if (!updatedTx) {
        const existing = await Transaction.findById(req.params.id)
          .session(session)
          .lean();

        const err = new Error(
          !existing
            ? "Transaction not found"
            : existing.type !== "withdrawal"
              ? "Only withdrawals can be updated"
              : "Already processed",
        );
        err.status = !existing ? 404 : 400;
        throw err;
      }

      // Refund only if rejected/failed. The refund and status transition are
      // committed together, so a failed request cannot mark a withdrawal as
      // failed without restoring its funds.
      if (status === "failed") {
        const asset = String(updatedTx.coin || "")
          .trim()
          .toUpperCase();

        await Balance.updateOne(
          { userId: updatedTx.userId, asset },
          {
            $inc: { available: Number(updatedTx.amount || 0) },
            $setOnInsert: { userId: updatedTx.userId, asset },
          },
          { upsert: true, session },
        );
      }
    });

    return res.json({ message: `Transaction ${status}` });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    return res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

router.get("/all-withdrawals", async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: "withdrawal" }).sort({
      createdAt: -1,
    });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/all-deposits", async (req, res) => {
  try {
    const deposits = await Transaction.find({ type: "deposit" })
      .sort({ createdAt: -1 })
      .populate("userId", "email"); // optional but nice
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Get all transactions for a user
router.get("/:userId", async (req, res) => {
  try {
    const transactions = await Transaction.find({
      userId: req.params.userId,
    }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
