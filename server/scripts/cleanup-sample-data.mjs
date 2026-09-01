import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const serverRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");

dotenv.config({ path: path.resolve(projectRoot, ".env") });
dotenv.config({ path: path.resolve(serverRoot, ".env"), override: true });

const sampleProjectTitles = [
  "Sample: Batch 2018 Classroom Repair Drive",
  "Sample: Alumni Scholarship Starter Fund",
  "Sample: Community Feeding and Wellness Day",
  "Sample: Green Campus Tree Growing Project",
];

const sampleFeeReferences = [
  "SAMPLE-FEE-2018-0001",
  "SAMPLE-FEE-2019-0002",
  "SAMPLE-FEE-2020-0003",
  "SAMPLE-FEE-2021-0004",
  "SAMPLE-FEE-2022-0005",
  "SAMPLE-FEE-2023-0006",
  "SAMPLE-FEE-2024-0007",
  "SAMPLE-FEE-2024-0008",
  "SAMPLE-FEE-2017-0009",
  "SAMPLE-FEE-2016-0010",
];

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"];
const missing = required.filter((key) => !String(process.env[key] || "").trim());

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const parseBoolean = (value) =>
  ["1", "true", "yes", "require", "required"].includes(String(value || "").trim().toLowerCase());

const readSslCa = () => {
  const caValue = String(process.env.DB_SSL_CA || "").trim();
  if (caValue) {
    if (caValue.includes("BEGIN CERTIFICATE")) return caValue.replace(/\\n/g, "\n");
    const caPath = path.isAbsolute(caValue) ? caValue : path.resolve(serverRoot, caValue);
    return fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : caValue.replace(/\\n/g, "\n");
  }

  const caFile = String(process.env.DB_SSL_CA_FILE || "").trim();
  const caFilePath = caFile ? path.resolve(serverRoot, caFile) : path.resolve(serverRoot, "cert", "ca.pem");
  return fs.existsSync(caFilePath) ? fs.readFileSync(caFilePath, "utf8") : undefined;
};

const sslEnabled = parseBoolean(process.env.DB_SSL) || Boolean(process.env.DB_SSL_CA || process.env.DB_SSL_CA_FILE);
const sslCa = sslEnabled ? readSslCa() : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  ssl: sslEnabled
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
        ...(sslCa ? { ca: sslCa } : {}),
      }
    : undefined,
});

const placeholders = (items) => items.map(() => "?").join(", ");

const conn = await pool.getConnection();

try {
  await conn.beginTransaction();

  const [projectFilesResult] = await conn.execute(
    `DELETE FROM alumni_project_files
     WHERE project_id IN (
       SELECT id FROM alumni_projects WHERE title IN (${placeholders(sampleProjectTitles)})
     )`,
    sampleProjectTitles,
  );

  const [projectsResult] = await conn.execute(
    `DELETE FROM alumni_projects WHERE title IN (${placeholders(sampleProjectTitles)})`,
    sampleProjectTitles,
  );

  const [feeRecordsResult] = await conn.execute(
    `DELETE FROM alumni_fee_records WHERE reference_number IN (${placeholders(sampleFeeReferences)})`,
    sampleFeeReferences,
  );

  await conn.commit();

  console.log("Sample cleanup complete.");
  console.log(`Deleted project files: ${projectFilesResult.affectedRows || 0}`);
  console.log(`Deleted alumni projects: ${projectsResult.affectedRows || 0}`);
  console.log(`Deleted alumni fee records: ${feeRecordsResult.affectedRows || 0}`);
} catch (error) {
  await conn.rollback();
  console.error("Sample cleanup failed:", error);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
