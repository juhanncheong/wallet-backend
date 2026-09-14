// server.js
// Production-hardened entrypoint for Bitwell backend.
// Keeps the existing route structure while improving startup ordering,
// environment validation, CORS, security headers, admin auth, health checks,
// graceful shutdown, and worker lifecycle.

const dotenv = require("dotenv");
dotenv.config(); // MUST load env before importing routes/services that read process.env

const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const User = require("./models/User");
const Admin = require("./models/Admin");

// Routes
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
const kycRoutes = require("./routes/kyc");
const adminKycRoutes = require("./routes/adminKyc");
const depositRoutes = require("./routes/deposit");
const chatRoutes = require("./routes/chat.routes");
const p2pRoutes = require("./routes/p2p");
const uploadRoutes = require("./routes/upload.routes");

// Background services
const { startLimitMatcher } = require("./services/limitMatcher");
const { startP2PExpiry } = require("./jobs/p2pExpiry");

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const MONGO_URI = requireEnv("MONGO_URI");
const JWT_SECRET = requireEnv("JWT_SECRET");

// P2P payment details are encrypted with AES-GCM in the P2P service.
// Fail fast instead of discovering a bad key after users have created orders.
const P2P_ENCRYPTION_KEY = requireEnv("P2P_ENCRYPTION_KEY");
if (!/^[a-fA-F0-9]{64}$/.test(P2P_ENCRYPTION_KEY)) {
  throw new Error(
    "P2P_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)",
  );
}

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

// Comma-separated example:
// CORS_ORIGINS=https://app.example.com,https://admin.example.com
const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (IS_PROD && configuredOrigins.length === 0) {
  console.warn(
    "[SECURITY] CORS_ORIGINS is not set. Falling back to '*'. Set it in production.",
  );
}

function isOriginAllowed(origin) {
  // Requests from curl/server-to-server often have no Origin header.
  if (!origin) return true;
  if (configuredOrigins.length === 0) return true;
  return configuredOrigins.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);

    const err = new Error("Origin not allowed by CORS");
    err.status = 403;
    return callback(err);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Idempotency-Key",
    "X-Request-Id",
  ],
  exposedHeaders: ["X-Request-Id"],
  credentials: false,
  maxAge: 86400,
};

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Request ID for logs/debugging across API + reverse proxy.
app.use((req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.length <= 128
      ? incoming
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Lightweight security headers without adding a new package dependency.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("X-DNS-Prefetch-Control", "off");

  if (IS_PROD) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Keep request bodies intentionally bounded.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
app.use(
  express.urlencoded({
    extended: false,
    limit: process.env.FORM_BODY_LIMIT || "256kb",
  }),
);

// -----------------------------------------------------------------------------
// Health / readiness
// -----------------------------------------------------------------------------

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "bitwell-backend",
    environment: NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("/ready", (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;

  res.status(mongoReady ? 200 : 503).json({
    ok: mongoReady,
    mongo: mongoReady ? "connected" : "not-ready",
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// API routes
// -----------------------------------------------------------------------------

app.use("/api", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/user", walletRoutes);
app.use("/api/futures", futuresRoutes);
app.use("/api/markets", marketsRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/withdrawals", withdrawalRoutes);

// Balance is the single source of truth for wallet asset balances.
app.use("/api/balances", balancesRoutes);
app.use("/api/admin", adminBalanceRoutes);

app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin/kyc", adminKycRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/p2p", p2pRoutes);

// -----------------------------------------------------------------------------
// Uploads
// -----------------------------------------------------------------------------

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  "/uploads",
  express.static(uploadsDir, {
    dotfiles: "deny",
    index: false,
    etag: true,
    maxAge: IS_PROD ? "1h" : 0,
  }),
);

app.use("/api", uploadRoutes);

// -----------------------------------------------------------------------------
// Admin login + compatibility /admin routes
// -----------------------------------------------------------------------------

// Small in-process protection for the legacy admin login.
// For multi-replica deployments, replace this later with Redis-backed rate limiting.
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const adminLoginAttempts = new Map();

function getClientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function adminLoginRateLimit(req, res, next) {
  const key = getClientIp(req);
  const now = Date.now();

  let state = adminLoginAttempts.get(key);
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + ADMIN_LOGIN_WINDOW_MS };
    adminLoginAttempts.set(key, state);
  }

  if (state.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((state.resetAt - now) / 1000),
    );

    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      message: "Too many admin login attempts. Try again later.",
    });
  }

  req.adminLoginRateKey = key;
  next();
}

function registerAdminLoginFailure(req) {
  const key = req.adminLoginRateKey || getClientIp(req);
  const now = Date.now();

  const state = adminLoginAttempts.get(key) || {
    count: 0,
    resetAt: now + ADMIN_LOGIN_WINDOW_MS,
  };

  state.count += 1;
  adminLoginAttempts.set(key, state);
}

function clearAdminLoginFailures(req) {
  adminLoginAttempts.delete(req.adminLoginRateKey || getClientIp(req));
}

app.post("/admin/login", adminLoginRateLimit, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      registerAdminLoginFailure(req);
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username });

    // Preserve the current Admin model's password behavior.
    // A password-hash migration should be done separately so existing admins
    // are not locked out unexpectedly.
    if (!admin || admin.password !== password) {
      registerAdminLoginFailure(req);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    clearAdminLoginFailures(req);

    const token = jwt.sign(
      {
        adminId: String(admin._id),
        isAdmin: true,
      },
      JWT_SECRET,
      {
        expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "1h",
        issuer: "bitwell-backend",
        audience: "bitwell-admin",
      },
    );

    return res.json({ token });
  } catch (err) {
    console.error("Admin login error", {
      requestId: req.requestId,
      message: err?.message,
    });
    return res.status(500).json({ message: "Admin login failed" });
  }
});

function verifyAdmin(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Admin token missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: "bitwell-backend",
      audience: "bitwell-admin",
    });

    if (!decoded?.isAdmin || !decoded?.adminId) {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.adminId = decoded.adminId;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
}

// Compatibility endpoints used by older admin frontend pages.
// Sensitive credential fields are explicitly excluded.
app.get("/admin/users", verifyAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password -withdrawalPin").lean();

    return res.json(users);
  } catch (err) {
    console.error("Legacy admin users error", {
      requestId: req.requestId,
      message: err?.message,
    });
    return res.status(500).json({ message: "Failed to load users" });
  }
});

app.use("/admin", withdrawalRoutes);

// -----------------------------------------------------------------------------
// HTTP + Socket.IO
// -----------------------------------------------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions,
  serveClient: false,
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
});

require("./sockets/chat.socket")(io);

// -----------------------------------------------------------------------------
// 404 + centralized error handling
// -----------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
    requestId: req.requestId,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body too large",
      requestId: req.requestId,
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON body",
      requestId: req.requestId,
    });
  }

  const status = Number(err?.status) || 500;

  if (status >= 500) {
    console.error("Unhandled request error", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err?.message,
      stack: IS_PROD ? undefined : err?.stack,
    });
  }

  return res.status(status).json({
    message: status >= 500 ? "Internal server error" : err.message,
    requestId: req.requestId,
  });
});

// -----------------------------------------------------------------------------
// Startup / shutdown
// -----------------------------------------------------------------------------

let shuttingDown = false;

async function start() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
  });

  console.log("MongoDB connected");

  // Start DB-dependent workers only after Mongo is ready.
  startLimitMatcher({
    intervalMs: Number(process.env.LIMIT_MATCHER_INTERVAL_MS || 1500),
  });
  startP2PExpiry();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, () => {
      server.off("error", reject);
      resolve();
    });
  });

  // Sensible Node HTTP limits for an API + Socket.IO service.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 30000;

  console.log(
    `Server running | port=${PORT} | env=${NODE_ENV} | pid=${process.pid}`,
  );
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  const forceTimer = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  try {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });

    await mongoose.disconnect();

    clearTimeout(forceTimer);
    console.log("Shutdown complete");
    process.exit(exitCode);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown("uncaughtException", 1);
});

start().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
