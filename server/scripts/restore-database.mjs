import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import dotenv from "dotenv";

const serverRoot = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.resolve(serverRoot, ".env"), quiet: true });

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (/[\r\n]/.test(value)) throw new Error(`Environment variable ${name} contains an invalid line break.`);
  return value;
};

if (process.env.ALLOW_DATABASE_RESTORE !== "YES") {
  throw new Error("Restore refused. Set ALLOW_DATABASE_RESTORE=YES only for an approved recovery drill.");
}

const backupFile = path.resolve(process.argv[2] || required("BACKUP_FILE"));
const metadataFile = `${backupFile}.json`;
const target = {
  host: required("RESTORE_DB_HOST"),
  port: process.env.RESTORE_DB_PORT || "3306",
  user: required("RESTORE_DB_USER"),
  password: required("RESTORE_DB_PASSWORD"),
  database: required("RESTORE_DB_NAME"),
};

if (!/^[a-zA-Z0-9_$-]+$/.test(target.database)) {
  throw new Error("RESTORE_DB_NAME contains unsupported characters.");
}

if (required("RESTORE_CONFIRM_DATABASE") !== target.database) {
  throw new Error("Restore refused. RESTORE_CONFIRM_DATABASE must exactly match RESTORE_DB_NAME.");
}

const productionTarget = {
  host: String(process.env.DB_HOST || process.env.MYSQL_HOST || "").trim(),
  port: String(process.env.DB_PORT || process.env.MYSQL_PORT || "3306").trim(),
  database: String(process.env.DB_NAME || process.env.MYSQL_DATABASE || "").trim(),
};

if (
  productionTarget.host &&
  productionTarget.database &&
  target.host.toLowerCase() === productionTarget.host.toLowerCase() &&
  target.port === productionTarget.port &&
  target.database.toLowerCase() === productionTarget.database.toLowerCase()
) {
  throw new Error("Restore refused because the target matches the configured source database.");
}

const encryptionKeyHex = required("BACKUP_ENCRYPTION_KEY");
if (!/^[a-f0-9]{64}$/i.test(encryptionKeyHex)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).");
}

const metadata = JSON.parse(await fs.promises.readFile(metadataFile, "utf8"));
if (metadata.formatVersion !== 1 || metadata.encryption !== "aes-256-gcm" || metadata.compression !== "gzip") {
  throw new Error("Unsupported backup metadata format.");
}

const hash = crypto.createHash("sha256");
await pipeline(fs.createReadStream(backupFile), hash);
if (hash.digest("hex") !== metadata.sha256) throw new Error("Backup integrity verification failed.");

const quoteOption = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const temporaryPaths = [];
const defaultsFile = path.join(os.tmpdir(), `sacc-restore-client-${crypto.randomUUID()}`);
temporaryPaths.push(defaultsFile);
let restoreSslCaFile = String(process.env.RESTORE_DB_SSL_CA_FILE || "").trim();
const restoreSslCa = String(process.env.RESTORE_DB_SSL_CA || "").trim();
if (!restoreSslCaFile && restoreSslCa) {
  restoreSslCaFile = path.join(os.tmpdir(), `sacc-restore-ca-${crypto.randomUUID()}`);
  await fs.promises.writeFile(restoreSslCaFile, restoreSslCa, { encoding: "utf8", mode: 0o600, flag: "wx" });
  temporaryPaths.push(restoreSslCaFile);
}
const restoreSslEnabled = ["1", "true", "yes", "required"].includes(
  String(process.env.RESTORE_DB_SSL || "").trim().toLowerCase(),
);
const defaults = [
  "[client]",
  `host=${quoteOption(target.host)}`,
  `port=${quoteOption(target.port)}`,
  `user=${quoteOption(target.user)}`,
  `password=${quoteOption(target.password)}`,
  ...(restoreSslEnabled ? ["ssl-mode=REQUIRED"] : []),
  ...(restoreSslCaFile ? [`ssl-ca=${quoteOption(path.resolve(restoreSslCaFile))}`] : []),
  "",
].join("\n");
await fs.promises.writeFile(defaultsFile, defaults, { encoding: "utf8", mode: 0o600, flag: "wx" });

const runMysql = (args, input) => {
  const mysql = spawn(process.env.MYSQL_BIN || "mysql", [`--defaults-extra-file=${defaultsFile}`, ...args], {
    stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  mysql.stdout.setEncoding("utf8");
  mysql.stderr.setEncoding("utf8");
  mysql.stdout.on("data", (chunk) => (stdout += chunk));
  mysql.stderr.on("data", (chunk) => {
    if (stderr.length < 8_000) stderr += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    mysql.once("error", reject);
    mysql.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`mysql failed with exit code ${code}. ${stderr.trim()}`));
    });
  });
  return { mysql, completed };
};

try {
  const check = runMysql([
    "--batch",
    "--skip-column-names",
    "-e",
    `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${target.database}';`,
  ]);
  const tableCount = Number(String(await check.completed).trim());
  if (!Number.isFinite(tableCount) || tableCount !== 0) {
    throw new Error("Restore refused because the target database is not empty.");
  }

  const restore = runMysql([target.database], true);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(encryptionKeyHex, "hex"),
    Buffer.from(metadata.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(metadata.authTag, "hex"));
  await Promise.all([
    pipeline(fs.createReadStream(backupFile), decipher, createGunzip(), restore.mysql.stdin),
    restore.completed,
  ]);
  console.log(`Backup integrity verified and restored into disposable database: ${target.database}`);
} finally {
  await Promise.allSettled(temporaryPaths.map((file) => fs.promises.rm(file, { force: true })));
}
