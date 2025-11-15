import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

const baseDataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dataDir = baseDataDir;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "db.sqlite");

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, username TEXT UNIQUE, password_hash TEXT, created_at INTEGER)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, created_at INTEGER, FOREIGN KEY(owner_id) REFERENCES users(id))"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, site_id TEXT, owner_id TEXT, source_type TEXT, source_info TEXT, status TEXT, logs TEXT, created_at INTEGER, updated_at INTEGER, FOREIGN KEY(site_id) REFERENCES sites(id))"
  );
});

export default db;