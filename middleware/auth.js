const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    if (user.isFrozen) {
      return res.status(403).json({ message: "Account frozen" });
    }

    req.user = { userId: user._id, isAdmin: !!user.isAdmin };
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
