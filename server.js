const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cors = require("cors");
const User = require("./models/User");
const Withdrawal = require("./models/Withdrawal");
const Coin = require("./models/Coin");
const Admin = require("./models/Admin");
const transactionRoutes = require('./routes/transaction');
const walletRoutes = require('./routes/wallet');
const app = express();
app.use(cors({
  origin: '*', // ⚠️ You can restrict this later to only your frontend URL
}));
const withdrawalRoutes = require("./routes/withdrawals");

dotenv.config();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use("/api", require("./routes/auth"));
app.use('/api/transactions', transactionRoutes);
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/wallet", walletRoutes);
app.use("/admin", withdrawalRoutes);
app.use("/api/admin", require("./routes/admin"));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// Admin Login
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (!admin || admin.password !== password) return res.status(401).send('Unauthorized');
  const token = jwt.sign({ adminId: admin._id }, 'secretkey');
  res.json({ token });
});

// Middleware: Verify Admin
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).send('Token missing');
  try {
    const decoded = jwt.verify(token, 'secretkey');
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(403).send('Invalid token');
  }
}

// Admin: Get All Users
app.get('/admin/users', verifyAdmin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// ✅ Admin: Update User Balance
app.patch('/admin/users/:id/balance', verifyAdmin, async (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User not found');

  // Initialize balance if not already set
  if (typeof user.balance !== 'number') {
    user.balance = 0;
  }

  user.balance += amount;
  await user.save();
  res.json({ message: 'Balance updated', user });
});

// Admin: Add or Update User Wallets
app.post('/admin/users/:id/wallets', verifyAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User not found');
  user.wallets = { ...user.wallets, ...req.body };
  await user.save();
  res.json(user);
});

// Admin: Get Withdrawal Requests
app.get('/admin/withdrawals', verifyAdmin, async (req, res) => {
  const withdrawals = await Withdrawal.find().populate('userId', 'email');
  res.json(withdrawals);
});

// Admin: Add a Coin
app.post('/admin/coins', verifyAdmin, async (req, res) => {
  const coin = new Coin(req.body);
  await coin.save();
  res.json(coin);
});

// Admin: Delete a Coin
app.delete('/admin/coins/:id', verifyAdmin, async (req, res) => {
  await Coin.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
