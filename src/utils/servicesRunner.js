import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { customAlphabet } from "nanoid";
import AdmZip from "adm-zip";
import { downloadRepoZip } from "./github.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);
const runners = new Map();
let nextPort = 5000;

function allocPort() {
  return nextPort++;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function extractZip(buf, target, subdir) {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  const first = entries.length ? entries[0].entryName.split("/")[0] : "";
  const prefix = subdir ? `${first}/${subdir.replace(/^\/+|\/+$/g, "")}/` : `${first}/`;
  for (const e of entries) {
    const name = e.entryName;
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.endsWith("/")) continue;
    const targetPath = path.join(target, rel);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, e.getData());
  }
}

export async function createAndStartService({ servicesRoot, ownerId, serviceId, repo, ref, subdir, build_command, start_command, env = {} }) {
  const dir = path.join(servicesRoot, ownerId, serviceId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  ensureDir(dir);
  const buf = await downloadRepoZip(repo, ref, process.env.GITHUB_TOKEN);
  extractZip(buf, dir, subdir);
  if (build_command) {
    const res = await new Promise((resolve) => {
      const child = spawn(build_command, { cwd: dir, shell: true });
      let logs = "";
      child.stdout.on("data", (d) => { logs += d.toString(); });
      child.stderr.on("data", (d) => { logs += d.toString(); });
      child.on("close", (code) => { resolve({ code, logs }); });
    });
    if (res.code !== 0) return { ok: false, logs: res.logs };
  }
  const port = allocPort();
  const childEnv = Object.assign({}, process.env, env, { PORT: String(port), NODE_ENV: "production" });
  const child = spawn(start_command, { cwd: dir, shell: true, env: childEnv });
  let logs = "";
  child.stdout.on("data", (d) => { logs += d.toString(); });
  child.stderr.on("data", (d) => { logs += d.toString(); });
  child.on("close", () => { /* no-op */ });
  runners.set(serviceId, { child, port, dir, logs });
  return { ok: true, port };
}

export function stopService(serviceId) {
  const r = runners.get(serviceId);
  if (!r) return false;
  try { r.child.kill(); } catch {}
  runners.delete(serviceId);
  return true;
}

export function getService(serviceId) {
  return runners.get(serviceId) || null;
}