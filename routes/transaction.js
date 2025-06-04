const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');

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

// GET - Get all transactions for a user
router.get('/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update withdrawal status (admin approval/rejection)
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'completed' or 'failed'
    const tx = await Transaction.findById(req.params.id);

    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    if (tx.type !== 'withdrawal') return res.status(400).json({ message: 'Only withdrawals can be updated' });

    tx.status = status;
    await tx.save();

    // If rejected, refund the user
    if (status === 'failed') {
      const user = await User.findById(tx.userId);
      user.coins[tx.coin] += tx.amount;
      await user.save();
    }

    res.json({ message: `Transaction ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
