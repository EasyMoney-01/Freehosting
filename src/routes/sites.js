import express from "express";
import db from "../db.js";
import fs from "fs";
import path from "path";
import multer from "multer";
import AdmZip from "adm-zip";
import { customAlphabet } from "nanoid";
import { downloadRepoZip } from "../utils/github.js";
import { deployFromZip } from "../utils/deployer.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const SITES_ROOT = process.env.SITES_DIR || path.join(process.cwd(), "sites");
function siteDir(ownerId, siteId) {
  return path.join(SITES_ROOT, ownerId, siteId);
}

router.post("/", (req, res) => {
  const { name } = req.body || {};
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  if (!name) return res.status(400).json({ error: "missing_fields" });
  const id = nanoid();
  const created_at = Date.now();
  db.run("INSERT INTO sites (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)", [id, req.user.id, name, created_at], function (err) {
    if (err) return res.status(500).json({ error: "db_error" });
    const dir = siteDir(req.user.id, id);
    fs.mkdirSync(dir, { recursive: true });
    res.json({ id, name });
  });
});

router.get("/", (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  db.all("SELECT id, name, created_at FROM sites WHERE owner_id = ? ORDER BY created_at DESC", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ sites: rows || [] });
  });
});

router.post("/:id/deploy", upload.single("bundle"), (req, res) => {
  const siteId = req.params.id;
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  db.get("SELECT id FROM sites WHERE id = ? AND owner_id = ?", [siteId, req.user.id], async (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });
    if (!req.file) return res.status(400).json({ error: "missing_bundle" });
    const { subdir, build_command, output_dir } = req.body || {};
    const created_at = Date.now();
    const depId = nanoid();
    db.run(
      "INSERT INTO deployments (id, site_id, owner_id, source_type, source_info, status, logs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [depId, siteId, req.user.id, "zip", JSON.stringify({ subdir, build_command, output_dir }), "pending", "", created_at, created_at],
      async function (e2) {
        if (e2) return res.status(500).json({ error: "db_error" });
        const sitesRoot = SITES_ROOT;
        const result = await deployFromZip({ buffer: req.file.buffer, sitesRoot, ownerId: req.user.id, siteId, subdir, buildCommand: build_command, outputDir: output_dir });
        const status = result.ok ? "success" : "failed";
        const updated_at = Date.now();
        db.run("UPDATE deployments SET status = ?, logs = ?, updated_at = ? WHERE id = ?", [status, result.logs || "", updated_at, depId]);
        res.json({ status, deployment_id: depId });
      }
    );
  });
});

router.post("/:id/deploy/github", async (req, res) => {
  const siteId = req.params.id;
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  const { repo, ref, subdir, build_command, output_dir } = req.body || {};
  if (!repo || typeof repo !== "string" || !repo.includes("/")) return res.status(400).json({ error: "invalid_repo" });
  db.get("SELECT id FROM sites WHERE id = ? AND owner_id = ?", [siteId, req.user.id], async (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });
    try {
      const buf = await downloadRepoZip(repo, ref, process.env.GITHUB_TOKEN);
      const created_at = Date.now();
      const depId = nanoid();
      db.run(
        "INSERT INTO deployments (id, site_id, owner_id, source_type, source_info, status, logs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [depId, siteId, req.user.id, "github", JSON.stringify({ repo, ref, subdir, build_command, output_dir }), "pending", "", created_at, created_at],
        async function (e2) {
          if (e2) return res.status(500).json({ error: "db_error" });
          const sitesRoot = SITES_ROOT;
          const result = await deployFromZip({ buffer: buf, sitesRoot, ownerId: req.user.id, siteId, subdir, buildCommand: build_command, outputDir: output_dir });
          const status = result.ok ? "success" : "failed";
          const updated_at = Date.now();
          db.run("UPDATE deployments SET status = ?, logs = ?, updated_at = ? WHERE id = ?", [status, result.logs || "", updated_at, depId]);
          res.json({ status, deployment_id: depId });
        }
      );
    } catch (e) {
      res.status(500).json({ error: "fetch_failed" });
    }
  });
});

router.get("/:id/deployments", (req, res) => {
  const siteId = req.params.id;
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  db.all("SELECT id, source_type, status, created_at, updated_at FROM deployments WHERE site_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 20", [siteId, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ deployments: rows || [] });
  });
});

router.get("/deployments/:depId", (req, res) => {
  const depId = req.params.depId;
  if (!req.user || !req.user.id) return res.status(401).json({ error: "unauthorized" });
  db.get("SELECT id, site_id, status, logs, created_at, updated_at FROM deployments WHERE id = ? AND owner_id = ?", [depId, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  });
});

export default router;