const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Balance = require("../models/Balance");

// POST - Create a new transaction (deposit or withdrawal)
router.post('/', async (req, res) => {
  try {
    const { userId, type, coin, amount, status } = req.body;

    const newTx = new Transaction({
      userId,
      type,
      coin,
      amount,
      status: status || (type === 'withdrawal' ? 'pending' : 'completed'),
    });

    await newTx.save();

    res.status(201).json(newTx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update withdrawal status (admin approval/rejection)
router.put('/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'completed' or 'failed'

    if (!["completed", "failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    if (tx.type !== 'withdrawal') {
      return res.status(400).json({ message: 'Only withdrawals can be updated' });
    }

    if (tx.status !== "pending") {
      return res.status(400).json({ message: "Already processed" });
    }

    tx.status = status;
    await tx.save();

    // Refund only if rejected
    if (status === "failed") {
      const asset = String(tx.coin || "").trim().toUpperCase();

      await Balance.updateOne(
        { userId: tx.userId, asset },
        { $inc: { available: tx.amount } }
      );
    }

    res.json({ message: `Transaction ${status}` });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/all-withdrawals', async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal' }).sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/all-deposits', async (req, res) => {
  try {
    const deposits = await Transaction.find({ type: 'deposit' })
      .sort({ createdAt: -1 })
      .populate('userId', 'email'); // optional but nice
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Get all transactions for a user
router.get('/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
