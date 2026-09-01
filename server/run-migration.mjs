import mysql from "mysql2/promise";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

dotenv.config({ path: path.resolve(currentDirPath, "../.env") });
dotenv.config({ path: path.resolve(currentDirPath, ".env"), override: true });

const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || "ustp_alumni";
const DB_SSL_CA = process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA;
const DB_SSL_CA_FILE = process.env.DB_SSL_CA_FILE || process.env.MYSQL_SSL_CA_FILE;
const DB_SSL_ENABLED =
  ["1", "true", "yes", "require", "required"].includes(
    String(process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED || "").trim().toLowerCase(),
  ) || Boolean(DB_SSL_CA || DB_SSL_CA_FILE);

const readSslCa = () => {
  const caValue = DB_SSL_CA?.trim();

  if (caValue) {
    if (caValue.includes("BEGIN CERTIFICATE")) {
      return caValue.replace(/\\n/g, "\n");
    }

    const caPath = path.isAbsolute(caValue) ? caValue : path.resolve(currentDirPath, caValue);
    return fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : caValue.replace(/\\n/g, "\n");
  }

  const caFilePath = DB_SSL_CA_FILE
    ? path.resolve(currentDirPath, DB_SSL_CA_FILE)
    : path.resolve(currentDirPath, "cert", "ca.pem");

  return fs.existsSync(caFilePath) ? fs.readFileSync(caFilePath, "utf8") : undefined;
};

const ca = readSslCa();
const ssl = DB_SSL_ENABLED
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
      ...(ca ? { ca } : {}),
    }
  : undefined;

const splitSqlStatements = (sql) =>
  sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.startsWith("--"));

const getErrorCode = (error) =>
  error && typeof error === "object" && "code" in error ? String(error.code || "") : "";

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error || ""));

const getChecksum = (value) => crypto.createHash("sha256").update(value).digest("hex");

const isIgnorableIdempotencyError = (error) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    code === "ER_DUP_FIELDNAME" ||
    code === "ER_DUP_KEYNAME" ||
    code === "ER_CANT_DROP_FIELD_OR_KEY" ||
    message.includes("duplicate column") ||
    message.includes("duplicate key name") ||
    message.includes("check that column/key exists")
  );
};

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl,
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

const runMigration = async () => {
  const migrationsDir = path.resolve(currentDirPath, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  await pool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await pool.query(`USE \`${DB_NAME}\``);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");
    const statements = splitSqlStatements(sql);
    const checksum = await getChecksum(sql);
    const [existingRows] = await pool.query("SELECT checksum FROM schema_migrations WHERE filename = ? LIMIT 1", [file]);

    if (Array.isArray(existingRows) && existingRows[0]?.checksum === checksum) {
      console.log(`Skipping ${file}; already applied.`);
      continue;
    }

    if (Array.isArray(existingRows) && existingRows.length > 0 && file === "001_initial_schema.sql") {
      console.warn(`Skipping ${file}; legacy base migration checksum differs from the recorded database version.`);
      continue;
    }

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      throw new Error(`Migration checksum changed after apply: ${file}`);
    }

    console.log(`Running ${file} (${statements.length} statements)...`);

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (error) {
        if (!isIgnorableIdempotencyError(error)) {
          console.error(`Migration failed in ${file}.`);
          throw error;
        }
      }
    }

    await pool.query("INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)", [file, checksum]);
  }

  console.log("Migrations completed successfully.");
};

runMigration()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
