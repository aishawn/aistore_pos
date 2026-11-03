/** Download through Odoo's backup API and validate EVERY archive data block. No business writes. */
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import https from "node:https";
import { isIP } from "node:net";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith("--") || !process.argv[i + 1]) throw Error("Arguments require --key VALUE");
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
if ([...args.keys()].some(k => !["env", "base", "database", "out", "pg-restore", "origin-ip"].includes(k))) throw Error("Unknown argument");
const env = { ...process.env };
if (args.has("env")) for (const line of fs.readFileSync(args.get("env"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
}
const base = args.get("base"), database = args.get("database"), output = args.get("out"), restore = args.get("pg-restore");
if (!base || new URL(base).protocol !== "https:" || !database || !output || !restore || !env.ODOO_MASTER_PASSWORD) throw Error("Explicit HTTPS base, database, output, pg-restore and private master password required");
if (fs.existsSync(output) || fs.existsSync(output + ".partial") || fs.existsSync(output + ".manifest.json")) throw Error("Refusing to overwrite backup evidence");
fs.mkdirSync(path.dirname(output), { recursive: true });
const manifest = { database, createdAt: new Date().toISOString(), bytes: 0, sha256: null, archiveValidated: false, restoreTested: false, businessWrites: 0 };
try {
  const body = new URLSearchParams({ master_pwd: env.ODOO_MASTER_PASSWORD, name: database, backup_format: "dump" }).toString();
  let stream;
  if (args.has("origin-ip")) {
    const ip = args.get("origin-ip"); if (!isIP(ip)) throw Error("Invalid origin IP");
    // Preserve HTTPS hostname, certificate validation and Odoo authentication; change DNS routing only.
    const response = await new Promise((resolve, reject) => {
      const req = https.request(new URL("/web/database/backup", base), { method: "POST", lookup: (_host, options, callback) => options?.all ? callback(null, [{ address: ip, family: isIP(ip) }]) : callback(null, ip, isIP(ip)),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }, timeout: 1_200_000 }, resolve);
      req.on("error", reject); req.on("timeout", () => req.destroy(Error("Backup transport timeout"))); req.end(body);
    });
    if (response.statusCode !== 200 || !response.headers["content-disposition"]) { response.destroy(); throw Error(`Backup endpoint HTTP ${response.statusCode}`); }
    stream = response;
  } else {
    const response = await fetch(new URL("/web/database/backup", base), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(1_200_000) });
    if (!response.ok || !response.headers.get("content-disposition") || !response.body) throw Error(`Backup endpoint HTTP ${response.status}`);
    stream = Readable.fromWeb(response.body);
  }
  await pipeline(stream, fs.createWriteStream(output + ".partial", { flags: "wx", mode: 0o600 }));
  manifest.bytes = fs.statSync(output + ".partial").size;
  const hash = createHash("sha256"); await pipeline(fs.createReadStream(output + ".partial"), hash); manifest.sha256 = hash.digest("hex");
  // Listing the TOC or checking PGDMP alone does not detect a truncated dump.
  const exitCode = await new Promise((resolve, reject) => {
    const log = fs.openSync(output + ".validation.log", "wx", 0o600);
    const child = spawn(restore, ["--data-only", "--file", process.platform === "win32" ? "NUL" : "/dev/null", output + ".partial"], { windowsHide: true, stdio: ["ignore", "ignore", log] });
    child.on("error", reject); child.on("exit", code => { fs.closeSync(log); resolve(code); });
  });
  if (exitCode !== 0) throw Error("Full archive validation failed; partial evidence retained, NOT a recoverable backup");
  manifest.archiveValidated = true;
  fs.renameSync(output + ".partial", output);
} catch (error) {
  if (fs.existsSync(output + ".partial")) manifest.bytes = fs.statSync(output + ".partial").size;
  manifest.error = error instanceof Error ? error.message : "Backup failed";
  process.exitCode = 1;
} finally {
  fs.writeFileSync(output + ".manifest.json", JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(manifest));
}
