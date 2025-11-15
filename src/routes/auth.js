import express from "express";
import db from "../db.js";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { signToken } from "../auth.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);
const router = express.Router();

router.post("/signup", async (req, res) => {
  const { email, password, username } = req.body || {};
  if (!email || !password || !username) return res.status(400).json({ error: "missing_fields" });
  db.get("SELECT id FROM users WHERE email = ? OR username = ?", [email, username], (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (row) return res.status(409).json({ error: "conflict" });
    const id = nanoid();
    const password_hash = bcrypt.hashSync(password, 10);
    const created_at = Date.now();
    db.run(
      "INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, email, username, password_hash, created_at],
      function (err2) {
        if (err2) return res.status(500).json({ error: "db_error" });
        const token = signToken({ id, email, username }, process.env.JWT_SECRET || "dev_secret");
        res.json({ token, user: { id, email, username } });
      }
    );
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });
  db.get("SELECT id, email, username, password_hash FROM users WHERE email = ?", [email], (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(401).json({ error: "invalid_credentials" });
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    const token = signToken({ id: row.id, email: row.email, username: row.username }, process.env.JWT_SECRET || "dev_secret");
    res.json({ token, user: { id: row.id, email: row.email, username: row.username } });
  });
});

export default router;