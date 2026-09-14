const jwt = require("jsonwebtoken");

module.exports = function verifyAdmin(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Admin token missing" });
  }

  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return res
      .status(500)
      .json({ message: "Server authentication is not configured" });
  }

  try {
    const decoded = jwt.verify(token, secret, {
      issuer: "bitwell-backend",
      audience: "bitwell-admin",
    });

    if (!decoded?.isAdmin || !decoded?.adminId) {
      return res.status(403).json({ message: "Admin access only" });
    }

    // Canonical admin identity.
    req.adminId = decoded.adminId;

    // Backward compatibility for any older admin routes that read req.userId.
    req.userId = decoded.adminId;

    // Allows existing isAdmin-style middleware to inspect req.user if needed.
    req.user = decoded;

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
};
