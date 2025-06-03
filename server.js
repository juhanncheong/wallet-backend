const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors({
  origin: '*', // or replace with 'http://localhost:5173' for security
}));

dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// Schemas
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  balance: { type: Number, default: 0 },
  wallets: {
    BTC: String,
    ETH: String,
    USDT: String,
    USDC: String,
  }
});

const WithdrawalSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  coin: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const CoinSchema = new mongoose.Schema({
  name: String,
  symbol: String,
  network: String,
  listed: Boolean
});

const AdminSchema = new mongoose.Schema({
  username: String,
  password: String
});

const User = mongoose.model('User', UserSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const Coin = mongoose.model('Coin', CoinSchema);
const Admin = mongoose.model('Admin', AdminSchema);

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

// Admin Routes
app.get('/admin/users', verifyAdmin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

app.patch('/admin/users/:id/balance', verifyAdmin, async (req, res) => {
  const { amount } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User not found');
  user.balance += amount;
  await user.save();
  res.json(user);
});

app.post('/admin/users/:id/wallets', verifyAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User not found');
  user.wallets = { ...user.wallets, ...req.body };
  await user.save();
  res.json(user);
});

app.get('/admin/withdrawals', verifyAdmin, async (req, res) => {
  const withdrawals = await Withdrawal.find().populate('userId', 'email');
  res.json(withdrawals);
});

app.post('/admin/coins', verifyAdmin, async (req, res) => {
  const coin = new Coin(req.body);
  await coin.save();
  res.json(coin);
});

app.delete('/admin/coins/:id', verifyAdmin, async (req, res) => {
  await Coin.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

// Start Server
const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
