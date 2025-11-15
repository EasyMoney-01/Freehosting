import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import { customAlphabet } from "nanoid";
import { spawn } from "child_process";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function extractZipTo(buffer, targetDir, prefix) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const first = entries.length ? entries[0].entryName.split("/")[0] : "";
  const pre = prefix ? `${first}/${prefix.replace(/^\/+|\/+$/g, "")}/` : `${first}/`;
  for (const e of entries) {
    const name = e.entryName;
    if (!name.startsWith(pre)) continue;
    const rel = name.slice(pre.length);
    if (!rel || rel.endsWith("/")) continue;
    const target = path.join(targetDir, rel);
    ensureDir(path.dirname(target));
    const data = e.getData();
    fs.writeFileSync(target, data);
  }
}

function runBuild(cwd, buildCommand) {
  return new Promise((resolve) => {
    const child = spawn(buildCommand, { cwd, shell: true });
    let logs = "";
    child.stdout.on("data", (d) => { logs += d.toString(); });
    child.stderr.on("data", (d) => { logs += d.toString(); });
    child.on("close", (code) => { resolve({ code, logs }); });
  });
}

export async function deployFromZip({ buffer, sitesRoot, ownerId, siteId, subdir, buildCommand, outputDir }) {
  const workDir = path.join(process.cwd(), "tmp", nanoid());
  ensureDir(workDir);
  extractZipTo(buffer, workDir, subdir);
  let logs = "";
  if (buildCommand && outputDir) {
    const res = await runBuild(workDir, buildCommand);
    logs += res.logs;
    if (res.code !== 0) return { ok: false, logs };
    const outPath = path.join(workDir, outputDir);
    const siteDir = path.join(sitesRoot, ownerId, siteId);
    try { fs.rmSync(siteDir, { recursive: true, force: true }); } catch {}
    ensureDir(siteDir);
    const copy = (src, dst) => {
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        ensureDir(dst);
        for (const n of fs.readdirSync(src)) copy(path.join(src, n), path.join(dst, n));
      } else {
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
      }
    };
    copy(outPath, siteDir);
    return { ok: true, logs };
  } else {
    const siteDir = path.join(sitesRoot, ownerId, siteId);
    try { fs.rmSync(siteDir, { recursive: true, force: true }); } catch {}
    ensureDir(siteDir);
    const copy = (src, dst) => {
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        ensureDir(dst);
        for (const n of fs.readdirSync(src)) copy(path.join(src, n), path.join(dst, n));
      } else {
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
      }
    };
    copy(workDir, siteDir);
    return { ok: true, logs };
  }
}