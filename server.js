// server.js (clean + balance-model-first)

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

const User = require("./models/User");
const Withdrawal = require("./models/Withdrawal");
const Admin = require("./models/Admin");

// ✅ Routes
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transaction");
const walletRoutes = require("./routes/wallet");
const withdrawalRoutes = require("./routes/withdrawals");
const adminRoutes = require("./routes/admin");
const futuresRoutes = require("./routes/futures");
const marketsRoutes = require("./routes/markets");
const balancesRoutes = require("./routes/balances");
const adminBalanceRoutes = require("./routes/adminBalance");
const tradeRoutes = require("./routes/trade");
const { startLimitMatcher } = require("./services/limitMatcher");
const kycRoutes = require("./routes/kyc");
const adminKycRoutes = require("./routes/adminKyc");
const depositRoutes = require("./routes/deposit");

dotenv.config();

const app = express();

// ✅ Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// ✅ API Routes
app.use("/api", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/user", walletRoutes); // (optional alias, keep if frontend depends on it)
app.use("/api/futures", futuresRoutes);
app.use("/api/markets", marketsRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/withdrawals", withdrawalRoutes);

// ✅ NEW BALANCE SYSTEM (single source of truth)
app.use("/api/balances", balancesRoutes);
app.use("/api/admin", adminBalanceRoutes);

// ✅ Other admin routes (keep, but make sure they DON'T touch old User.coins/user.balance coin logic)
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin/kyc", adminKycRoutes);

app.use("/api/deposit", depositRoutes);

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error(err));

startLimitMatcher({ intervalMs: 1500 });

// ==========================
// Admin Auth
// ==========================
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin || admin.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { adminId: admin._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Admin login failed" });
  }
});

// ✅ Middleware: Verify Admin (used by legacy /admin endpoints below)
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).send("Token missing");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(403).send("Invalid token");
  }
}

// ==========================
// Legacy /admin endpoints
// Keep ONLY if your admin panel uses /admin/*
// These do NOT touch coins anymore.
// ==========================

// ✅ Admin: Get All Users
app.get("/admin/users", verifyAdmin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

app.use("/admin", withdrawalRoutes);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
