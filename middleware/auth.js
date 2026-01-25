// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // keep this path as you have it

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Support different token payload shapes
    const userId = decoded.id || decoded._id || decoded.userId;

    // ✅ add this so all routes can use req.userId
    req.userId = userId;

    // Touch lastOnlineAt (throttled to reduce DB writes)
    if (userId) {
      const now = new Date();
      const throttleMs = 60 * 1000; // update at most once per minute

      const ip =
        (req.headers["x-forwarded-for"]?.toString().split(",")[0] || "").trim() ||
        req.socket?.remoteAddress ||
        "";

      await User.updateOne(
        {
          _id: userId,
          $or: [
            { lastOnlineAt: null },
            { lastOnlineAt: { $lt: new Date(Date.now() - throttleMs) } },
          ],
        },
        { $set: { lastOnlineAt: now, lastOnlineIp: ip } }
      ).catch(() => {});
    }

    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid or expired token" });
  }
};
