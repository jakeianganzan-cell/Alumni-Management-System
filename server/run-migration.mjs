import mysql from "mysql2/promise";
import dotenv from "dotenv";
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
const DB_SSL_ENABLED =
  ["1", "true", "yes", "require", "required"].includes(
    String(process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED || "").trim().toLowerCase(),
  ) || Boolean(DB_SSL_CA);

const ssl = DB_SSL_ENABLED
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
      ...(DB_SSL_CA ? { ca: DB_SSL_CA.replace(/\\n/g, "\n") } : {}),
    }
  : undefined;

const statements = [
  "DROP TABLE IF EXISTS job_applications",
  "DROP TABLE IF EXISTS jobs",
  `CREATE TABLE IF NOT EXISTS officer_school_year (
      id INT AUTO_INCREMENT PRIMARY KEY,
      start_year SMALLINT NOT NULL,
      end_year SMALLINT NOT NULL,
      label VARCHAR(25) NOT NULL,
      is_current TINYINT(1) DEFAULT 0,
      created_by VARCHAR(36) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_officer_school_year_label (label),
      UNIQUE KEY uq_officer_school_year_range (start_year, end_year)
    )`,
  `CREATE TABLE IF NOT EXISTS officers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_year_id INT NOT NULL,
      alumni_id VARCHAR(36) NOT NULL,
      position VARCHAR(100) NOT NULL,
      custom_position VARCHAR(255) DEFAULT NULL,
      display_order INT DEFAULT 0,
      snapshot_name VARCHAR(255) NOT NULL,
      snapshot_email VARCHAR(255) DEFAULT NULL,
      snapshot_course VARCHAR(255) DEFAULT NULL,
      snapshot_batch VARCHAR(50) DEFAULT NULL,
      snapshot_contact_number VARCHAR(50) DEFAULT NULL,
      snapshot_photo LONGTEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  `CREATE TABLE IF NOT EXISTS imported_alumni_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      import_batch_id VARCHAR(36) NOT NULL,
      imported_profile_id VARCHAR(36) DEFAULT NULL,
      full_name VARCHAR(255) NOT NULL,
      graduation_year VARCHAR(10) NOT NULL,
      email_address VARCHAR(255) NOT NULL,
      contact_number VARCHAR(50) DEFAULT NULL,
      generated_alumni_id VARCHAR(50) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'imported',
      imported_by VARCHAR(36) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
];

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function runMigration() {
  try {
    console.log("Running migration...");

    const [announcementTables] = await pool.query("SHOW TABLES LIKE 'announcements'");
    const [eventTables] = await pool.query("SHOW TABLES LIKE 'events'");

    if (!Array.isArray(announcementTables) || announcementTables.length === 0) {
      if (Array.isArray(eventTables) && eventTables.length > 0) {
        await pool.query("RENAME TABLE events TO announcements");
        console.log("Renamed events table to announcements.");
      } else {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS announcements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            date DATE,
            time TIME,
            venue VARCHAR(255),
            type VARCHAR(100),
            organizer VARCHAR(255),
            image_url LONGTEXT,
            status VARCHAR(50) DEFAULT 'upcoming',
            capacity INT DEFAULT 0,
            views INT DEFAULT 0,
            success_score INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        console.log("Created announcements table.");
      }
    }

    const announcementAlterStatements = [
      "ALTER TABLE announcements ADD COLUMN type VARCHAR(100) NULL",
      "ALTER TABLE announcements ADD COLUMN google_form_link TEXT NULL",
    ];

    for (const sql of announcementAlterStatements) {
      try {
        await pool.query(sql);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Duplicate column")) {
          throw error;
        }
      }
    }

    await pool.query("UPDATE announcements SET type = 'event' WHERE type IS NULL OR type = ''");

    for (const sql of statements) {
      await pool.query(sql);
    }

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

runMigration();
