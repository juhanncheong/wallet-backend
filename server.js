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
const { allocateDepositWallets } = require("./services/depositAllocator");


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
// Admin Auth (keep if used)
// ==========================
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin || admin.password !== password) {
      return res.status(401).send("Unauthorized");
    }

    const token = jwt.sign(
      { adminId: admin._id },
      process.env.JWT_SECRET || "secretkey"
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Admin login failed" });
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

app.post("/admin/reallocate-wallets", verifyAdmin, async (req, res) => {
  const limit = Number(req.body?.limit || 0); // optional: process only N users

  // Find users missing any of the network wallets
  const filter = {
    $or: [
      { "wallets.ERC20": null },
      { "wallets.BEP20": null },
      { "wallets.TRC20": null },
      { wallets: { $exists: false } },
    ],
  };

  const users = await User.find(filter).select("_id email username wallets");
  const target = limit > 0 ? users.slice(0, limit) : users;

  const report = {
    totalFound: users.length,
    processed: 0,
    updated: 0,
    failed: [],
  };

  for (const u of target) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const wallets = await allocateDepositWallets(u._id, session);

      await User.updateOne(
        { _id: u._id },
        { $set: { wallets } },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      report.processed += 1;
      report.updated += 1;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      report.processed += 1;
      report.failed.push({
        userId: String(u._id),
        email: u.email,
        reason: err.message,
        code: err.code || null,
        missing: err.missing || null,
      });
    }
  }

  res.json(report);
});

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
