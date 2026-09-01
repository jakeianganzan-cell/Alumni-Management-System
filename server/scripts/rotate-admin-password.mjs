import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const serverRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");
const envPath = path.resolve(serverRoot, ".env");

dotenv.config({ path: path.resolve(projectRoot, ".env") });
dotenv.config({ path: envPath, override: true });

const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
if (!adminEmail) throw new Error("ADMIN_EMAIL is required before rotating the admin password.");

const isEnabled = (value) => ["1", "true", "yes", "required"].includes(String(value || "").trim().toLowerCase());
const getSsl = async () => {
  if (!isEnabled(process.env.DB_SSL)) return undefined;

  let ca = String(process.env.DB_SSL_CA || "").replace(/\\n/g, "\n").trim();
  if (!ca && process.env.DB_SSL_CA_FILE) {
    const caPath = path.isAbsolute(process.env.DB_SSL_CA_FILE)
      ? process.env.DB_SSL_CA_FILE
      : path.resolve(serverRoot, process.env.DB_SSL_CA_FILE);
    ca = await fs.readFile(caPath, "utf8");
  }

  return {
    ...(ca ? { ca } : {}),
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  };
};

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ustp_alumni",
  ssl: await getSsl(),
});

const nextPassword = crypto.randomBytes(36).toString("base64url");
const passwordHash = await bcrypt.hash(nextPassword, 12);
const currentEnv = await fs.readFile(envPath, "utf8");
const lineEnding = currentEnv.includes("\r\n") ? "\r\n" : "\n";
const nextLine = `ADMIN_PASSWORD=${nextPassword}`;
const nextEnv = /^ADMIN_PASSWORD=.*$/m.test(currentEnv)
  ? currentEnv.replace(/^ADMIN_PASSWORD=.*$/m, nextLine)
  : `${currentEnv.replace(/\s*$/, "")}${lineEnding}${nextLine}${lineEnding}`;
const tempPath = `${envPath}.rotate-${process.pid}`;

try {
  await connection.beginTransaction();
  const [result] = await connection.execute(
    "UPDATE users SET password_hash = ? WHERE LOWER(email) = ?",
    [passwordHash, adminEmail],
  );

  if (result.affectedRows < 1) {
    throw new Error(`No admin account exists for ${adminEmail}; no credential was changed.`);
  }

  await fs.writeFile(tempPath, nextEnv, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tempPath, envPath);

  try {
    await connection.commit();
  } catch (error) {
    await fs.writeFile(envPath, currentEnv, { encoding: "utf8", mode: 0o600 });
    throw error;
  }
} catch (error) {
  await connection.rollback();
  await fs.rm(tempPath, { force: true });
  throw error;
} finally {
  await connection.end();
}

console.log("Admin password rotated. The replacement is stored only in server/.env.");
