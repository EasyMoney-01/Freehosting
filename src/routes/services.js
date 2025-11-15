import express from "express";
import db from "../db.js";
import fs from "fs";
import path from "path";
import { customAlphabet } from "nanoid";
import { createAndStartService, stopService, getService } from "../utils/servicesRunner.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);
const router = express.Router();
const SERVICES_ROOT = process.env.SERVICES_DIR || path.join(process.cwd(), "services");
if (!fs.existsSync(SERVICES_ROOT)) fs.mkdirSync(SERVICES_ROOT, { recursive: true });

router.post("/", async (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  const { name, repo, ref, subdir, build_command, start_command } = req.body || {};
  if (!name || !repo || !start_command) return res.status(400).json({ error: "missing_fields" });
  const id = nanoid();
  const created_at = Date.now();
  db.run(
    "INSERT INTO services (id, owner_id, name, status, port, source_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, req.user.id, name, "pending", 0, JSON.stringify({ repo, ref, subdir, build_command, start_command }), created_at, created_at],
    async function (e1) {
      if (e1) return res.status(500).json({ error: "db_error" });
      try {
        const r = await createAndStartService({ servicesRoot: SERVICES_ROOT, ownerId: req.user.id, serviceId: id, repo, ref, subdir, build_command, start_command });
        if (!r.ok) {
          db.run("UPDATE services SET status = ?, updated_at = ? WHERE id = ?", ["failed", Date.now(), id]);
          return res.status(500).json({ error: "start_failed" });
        }
        db.run("UPDATE services SET status = ?, port = ?, updated_at = ? WHERE id = ?", ["running", r.port, Date.now(), id]);
        res.json({ id, name, status: "running", port: r.port });
      } catch (e) {
        db.run("UPDATE services SET status = ?, updated_at = ? WHERE id = ?", ["failed", Date.now(), id]);
        res.status(500).json({ error: "start_failed" });
      }
    }
  );
});

router.get("/", (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  db.all("SELECT id, name, status, port, created_at, updated_at FROM services WHERE owner_id = ? ORDER BY created_at DESC", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ services: rows || [] });
  });
});

router.post("/:id/stop", (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  const id = req.params.id;
  db.get("SELECT id FROM services WHERE id = ? AND owner_id = ?", [id, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });
    stopService(id);
    db.run("UPDATE services SET status = ?, updated_at = ? WHERE id = ?", ["stopped", Date.now(), id]);
    res.json({ status: "stopped" });
  });
});

router.post("/:id/start", (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  const id = req.params.id;
  db.get("SELECT id, source_info FROM services WHERE id = ? AND owner_id = ?", [id, req.user.id], async (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });
    const src = JSON.parse(row.source_info || "{}");
    try {
      const r = await createAndStartService({ servicesRoot: SERVICES_ROOT, ownerId: req.user.id, serviceId: id, repo: src.repo, ref: src.ref, subdir: src.subdir, build_command: src.build_command, start_command: src.start_command });
      if (!r.ok) return res.status(500).json({ error: "start_failed" });
      db.run("UPDATE services SET status = ?, port = ?, updated_at = ? WHERE id = ?", ["running", r.port, Date.now(), id]);
      res.json({ status: "running", port: r.port });
    } catch (e) {
      res.status(500).json({ error: "start_failed" });
    }
  });
});

router.get("/:id/logs", (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  const id = req.params.id;
  const r = getService(id);
  if (!r) return res.json({ logs: "" });
  res.json({ logs: r.logs || "" });
});

export default router;