import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import dotenv from "dotenv";

const serverRoot = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.resolve(serverRoot, ".env"), quiet: true });

const required = (name, aliases = []) => {
  const names = [name, ...aliases];
  const value = names.map((candidate) => process.env[candidate]).find((candidate) => String(candidate || "").trim());
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (/[\r\n]/.test(value)) throw new Error(`Environment variable ${name} contains an invalid line break.`);
  return value;
};

const encryptionKeyHex = required("BACKUP_ENCRYPTION_KEY");
if (!/^[a-f0-9]{64}$/i.test(encryptionKeyHex)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).");
}

const database = required("DB_NAME", ["MYSQL_DATABASE"]);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.resolve(process.env.BACKUP_DIR || path.resolve(serverRoot, "backups"));
const backupFile = path.resolve(process.env.BACKUP_FILE || path.join(backupDir, `database-${timestamp}.sql.gz.enc`));
const metadataFile = `${backupFile}.json`;

await fs.promises.mkdir(path.dirname(backupFile), { recursive: true });

const quoteOption = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const temporaryPaths = [];

const createTemporaryFile = async (prefix, contents) => {
  const file = path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}`);
  await fs.promises.writeFile(file, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  temporaryPaths.push(file);
  return file;
};

let defaultsFile;

try {
  let sslCaFile = String(process.env.DB_SSL_CA_FILE || process.env.MYSQL_SSL_CA_FILE || "").trim();
  const sslCa = String(process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA || "").trim();
  if (!sslCaFile && sslCa) sslCaFile = await createTemporaryFile("sacc-backup-ca", sslCa);

  const sslEnabled = ["1", "true", "yes", "required"].includes(
    String(process.env.DB_SSL || process.env.MYSQL_SSL || "").trim().toLowerCase(),
  );
  const defaults = [
    "[client]",
    `host=${quoteOption(required("DB_HOST", ["MYSQL_HOST"]))}`,
    `port=${quoteOption(process.env.DB_PORT || process.env.MYSQL_PORT || "3306")}`,
    `user=${quoteOption(required("DB_USER", ["MYSQL_USER"]))}`,
    `password=${quoteOption(required("DB_PASSWORD", ["MYSQL_PASSWORD"]))}`,
    ...(sslEnabled ? ["ssl-mode=REQUIRED"] : []),
    ...(sslCaFile ? [`ssl-ca=${quoteOption(path.resolve(sslCaFile))}`] : []),
    "",
  ].join("\n");
  defaultsFile = await createTemporaryFile("sacc-backup-client", defaults);

  const dump = spawn(
    process.env.MYSQLDUMP_BIN || "mysqldump",
    [
      `--defaults-extra-file=${defaultsFile}`,
      "--single-transaction",
      "--quick",
      "--routines",
      "--events",
      "--triggers",
      "--hex-blob",
      "--no-tablespaces",
      database,
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );

  let stderr = "";
  dump.stderr.setEncoding("utf8");
  dump.stderr.on("data", (chunk) => {
    if (stderr.length < 8_000) stderr += chunk;
  });

  const dumpCompleted = new Promise((resolve, reject) => {
    dump.once("error", reject);
    dump.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysqldump failed with exit code ${code}. ${stderr.trim()}`));
    });
  });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(encryptionKeyHex, "hex"), iv);
  await Promise.all([
    pipeline(dump.stdout, createGzip({ level: 9 }), cipher, fs.createWriteStream(backupFile, { mode: 0o600, flags: "wx" })),
    dumpCompleted,
  ]);

  const authTag = cipher.getAuthTag();
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(backupFile), hash);

  const metadata = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    encryption: "aes-256-gcm",
    compression: "gzip",
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    sha256: hash.digest("hex"),
  };
  await fs.promises.writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });

  console.log(`Encrypted database backup created: ${backupFile}`);
  console.log(`Backup metadata created: ${metadataFile}`);
} catch (error) {
  await Promise.allSettled([fs.promises.rm(backupFile, { force: true }), fs.promises.rm(metadataFile, { force: true })]);
  throw error;
} finally {
  await Promise.allSettled(temporaryPaths.map((file) => fs.promises.rm(file, { force: true })));
}
