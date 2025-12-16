const jwt = require("jsonwebtoken");

module.exports = function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, "secretkey");

    // Accept BOTH admin systems:
    // 1. Legacy user-based admin (req.user.isAdmin)
    // 2. New admin panel login (adminId in token)
    if (!decoded.isAdmin && !decoded.adminId) {
      return res.status(403).json({ message: "Admin access only" });
    }

    // Store whichever identity is available
    req.adminId = decoded.adminId || null;
    req.isAdmin = decoded.isAdmin || false;

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
