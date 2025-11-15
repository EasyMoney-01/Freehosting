import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import db from "./db.js";
import authRouter from "./routes/auth.js";
import sitesRouter from "./routes/sites.js";
import { authMiddleware } from "./auth.js";

dotenv.config();
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const jwtSecret = process.env.JWT_SECRET || "dev_secret";

const sitesRoot = process.env.SITES_DIR || path.join(process.cwd(), "sites");
if (!fs.existsSync(sitesRoot)) fs.mkdirSync(sitesRoot, { recursive: true });

app.use(express.json({ limit: "2mb" }));
const publicDir = path.join(process.cwd(), "src", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.use("/api/auth", authRouter);
app.use("/api/sites", authMiddleware(jwtSecret), sitesRouter);

app.get("/u/:username/:sitename/*", (req, res) => {
  const { username, sitename } = req.params;
  const rest = req.params[0] || "";
  db.get("SELECT id FROM users WHERE username = ?", [username], (e1, user) => {
    if (e1 || !user) return res.status(404).send("Not found");
    db.get("SELECT id FROM sites WHERE owner_id = ? AND name = ?", [user.id, sitename], (e2, site) => {
      if (e2 || !site) return res.status(404).send("Not found");
      const dir = path.join(sitesRoot, user.id, site.id);
      const filePath = path.join(dir, rest);
      const exists = fs.existsSync(filePath);
      if (exists && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
      const indexPath = path.join(dir, "index.html");
      if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
      res.status(404).send("Not found");
    });
  });
});

db.get("SELECT id FROM users WHERE username = ?", ["demo"], (e, row) => {
  if (!row) {
    const id = "demo_user";
    const created_at = Date.now();
    db.run("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", [id, "demo@example.com", "demo", "", created_at]);
    const siteId = "welcome";
    db.run("INSERT INTO sites (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)", [siteId, id, "hello", created_at]);
    const dir = path.join(sitesRoot, id, siteId);
    fs.mkdirSync(dir, { recursive: true });
    const html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Welcome</title><style>body{font-family:system-ui;margin:40px}a{color:#2563eb}</style></head><body><h1>Free Host Demo</h1><p>Upload a ZIP to deploy your static site.</p><p>Demo path: <code>/u/demo/hello/</code></p></body></html>";
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
});

app.listen(port, () => {
  console.log(`server:${port}`);
});