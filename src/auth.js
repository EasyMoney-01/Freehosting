import jwt from "jsonwebtoken";

export function signToken(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function authMiddleware(secret) {
  return function (req, res, next) {
    const h = req.headers["authorization"];
    if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });
    const token = h.slice(7);
    try {
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      next();
    } catch (e) {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}