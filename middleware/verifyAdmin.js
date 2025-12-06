const jwt = require("jsonwebtoken");

module.exports = function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, "secretkey");

    req.adminId = decoded.adminId;
    next();

  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
