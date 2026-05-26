import fs from "fs/promises";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import type { Response } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../db";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createStoredZipBuffer,
  generateTracerDocxBuffer,
  generateTracerPdfBuffer,
} from "../utils/tracerPdf";

interface TracerSummaryRow extends RowDataPacket {
  id: number;
  user_id: string;
  employment_status: string | null;
  job_title: string | null;
  company: string | null;
  industry: string | null;
  work_location: string | null;
  income: string | null;
  relevance: string | null;
  time_to_job: string | null;
  further_studies: string | null;
  certifications: string | null;
  comments: string | null;
  ched_payload: string | null;
  submission_status: string | null;
  allow_resubmission: number | boolean | null;
  submitted_at: string | null;
  admin_reopened_at: string | null;
  admin_reopened_by: string | null;
  pdf_generated_at: string | null;
  created_at: string;
  updated_at: string | null;
  name?: string | null;
  email?: string | null;
  student_id?: string | null;
  course?: string | null;
  batch?: string | null;
}

interface TracerDraftRow extends RowDataPacket {
  id: number;
  user_id: string;
  ched_payload: string | null;
  created_at: string;
  updated_at: string;
}

interface RoleRow extends RowDataPacket {
  role: string;
}

interface SimpleCountRow extends RowDataPacket {
  total?: number;
  totalAlumni?: number;
}

const SCHOOL_NAME = "Salay Community College";
const SCHOOL_OFFICE = "Alumni Affairs and Graduate Tracer Unit";
const REPORT_TITLE = "Graduate Tracer Analytics Report";
const REPORT_SUBTITLE = "CHED-ready institutional reporting template";
const STALE_TRACER_NOTIFICATION_TITLE = "Graduate tracer update needed";
const STALE_TRACER_NOTIFICATION_CATEGORY = "tracer";
const STALE_TRACER_NOTIFICATION_LINK = "/alumni/tracer";
const TWO_YEARS_IN_MS = 1000 * 60 * 60 * 24 * 365 * 2;

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeParseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const cleanText = (value: unknown) => String(value ?? "").trim();
const cleanNullableText = (value: unknown) => {
  const normalized = cleanText(value);
  return normalized ? normalized : null;
};

const slugify = (value: string) =>
  value
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

const jsonResponseError = (res: Response, status: number, error: string) => res.status(status).json({ error });

const tableExists = async (tableName: string) => {
  const rows = await db.query<RowDataPacket>("SHOW TABLES LIKE ?", [tableName]);
  return rows.length > 0;
};

const columnExists = async (tableName: string, columnName: string) => {
  try {
    const rows = await db.query<RowDataPacket>(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
    return rows.length > 0;
  } catch {
    return false;
  }
};

const buildTracerPayloadSummary = (payload: Record<string, unknown>) => {
  const trainings = Array.isArray(payload.trainings) ? payload.trainings : [];
  const professionalExams = Array.isArray(payload.professionalExams) ? payload.professionalExams : [];

  return {
    employment_status:
      cleanText(payload.presentlyEmployed) === "Employed"
        ? cleanText(payload.presentEmploymentStatus) || "Employed"
        : cleanText(payload.presentlyEmployed) || null,
    job_title: cleanNullableText(payload.presentOccupation),
    company: cleanNullableText(payload.companyNameAddress),
    industry: cleanNullableText(payload.industry),
    work_location: cleanNullableText(payload.workLocation),
    income: cleanNullableText(payload.initialGrossMonthlyEarning),
    relevance: cleanNullableText(payload.curriculumRelevantToFirstJob),
    time_to_job: cleanNullableText(payload.timeToLandFirstJob),
    further_studies: trainings.length > 0 ? "Yes" : "No",
    certifications: professionalExams
      .map((row) => cleanText((row as Record<string, unknown>).examName))
      .filter(Boolean)
      .join(", ") || null,
    comments: cleanNullableText(payload.curriculumSuggestions),
  };
};

const yearToNumber = (value: unknown) => {
  const year = Number.parseInt(cleanText(value), 10);
  return Number.isFinite(year) ? year : null;
};

const categoryToMonths = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized.includes("less than a month")) return 0.5;
  if (normalized.includes("1 to 6 months")) return 3.5;
  if (normalized.includes("7 to 11 months")) return 9;
  if (normalized.includes("1 year to less than 2 years")) return 18;
  if (normalized.includes("2 years to less than 3 years")) return 30;
  if (normalized.includes("3 years to less than 4 years")) return 42;
  return null;
};

const formatFileDate = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReportDate = (value = new Date()) =>
  value.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const loadReportPngDataUri = (candidates: string[]) => {
  for (const candidate of candidates) {
    try {
      const data = readFileSync(candidate);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      // Dev and production builds use different working directories.
    }
  }

  return "";
};

const SCHOOL_LOGO_DATA_URI = loadReportPngDataUri([
  path.resolve(process.cwd(), "src/assets/salay.png"),
  path.resolve(process.cwd(), "../src/assets/salay.png"),
]);

const CHED_LOGO_DATA_URI = loadReportPngDataUri([
  path.resolve(process.cwd(), "server/assets/ched-seal.png"),
  path.resolve(process.cwd(), "assets/ched-seal.png"),
  path.resolve(process.cwd(), "../server/assets/ched-seal.png"),
]);

const getPayloadBatchYear = (payload: Record<string, unknown>) =>
  cleanText((Array.isArray(payload.educationalAttainments) ? (payload.educationalAttainments[0] as Record<string, unknown>)?.yearGraduated : "") || "");

const getTracerBatchYear = (row: Omit<Partial<TracerSummaryRow>, "ched_payload"> & { ched_payload?: string | Record<string, unknown> | null }) => {
  const payload = safeParseJson<Record<string, unknown>>(row.ched_payload, {});
  return cleanText(row.batch) || getPayloadBatchYear(payload) || "N_A";
};

const splitNameForFile = (name: string) => {
  const normalized = cleanText(name).replace(/\s+/g, " ");
  if (!normalized) return { lastName: "Alumni", firstName: "Tracer" };

  if (normalized.includes(",")) {
    const [lastName, rest] = normalized.split(",", 2);
    const [firstName] = rest.trim().split(/\s+/);
    return { lastName: lastName || "Alumni", firstName: firstName || "Tracer" };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { lastName: parts[0], firstName: "Tracer" };
  return { lastName: parts[parts.length - 1], firstName: parts[0] };
};

const buildTracerFileName = (name: string, batchYear?: string | null, extension = "pdf") => {
  const { lastName, firstName } = splitNameForFile(name || "Alumni");
  return `GTS_${slugify(lastName || "Alumni")}_${slugify(firstName || "Tracer")}_${slugify(batchYear || "N_A")}.${extension}`;
};

const isTruthy = (value: unknown) => value === true || value === 1 || value === "1";

const getTracerActivityDate = (row: Pick<TracerSummaryRow, "updated_at" | "submitted_at" | "created_at"> | null) => {
  const candidate = cleanText(row?.updated_at) || cleanText(row?.submitted_at) || cleanText(row?.created_at);
  if (!candidate) return null;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isTracerStale = (row: Pick<TracerSummaryRow, "updated_at" | "submitted_at" | "created_at"> | null) => {
  const activityDate = getTracerActivityDate(row);
  if (!activityDate) return false;
  return Date.now() - activityDate.getTime() >= TWO_YEARS_IN_MS;
};

const clearStaleTracerNotifications = async (userId: string) => {
  if (!(await tableExists("user_notifications"))) return;

  await db.execute(
    `DELETE FROM user_notifications
     WHERE user_id = ? AND category = ? AND link_url = ? AND title = ?`,
    [userId, STALE_TRACER_NOTIFICATION_CATEGORY, STALE_TRACER_NOTIFICATION_LINK, STALE_TRACER_NOTIFICATION_TITLE],
  );
};

const syncStaleTracerNotification = async (userId: string, row: Pick<TracerSummaryRow, "updated_at" | "submitted_at" | "created_at"> | null) => {
  if (!(await tableExists("user_notifications"))) return;

  if (!row || !isTracerStale(row)) {
    await clearStaleTracerNotifications(userId);
    return;
  }

  const existingRows = await db.query<RowDataPacket>(
    `SELECT id
     FROM user_notifications
     WHERE user_id = ? AND category = ? AND link_url = ? AND title = ?
     LIMIT 1`,
    [userId, STALE_TRACER_NOTIFICATION_CATEGORY, STALE_TRACER_NOTIFICATION_LINK, STALE_TRACER_NOTIFICATION_TITLE],
  );

  if (existingRows.length > 0) return;

  await db.execute(
    `INSERT INTO user_notifications
      (id, user_id, title, message, category, link_url, is_read, created_at, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NULL)`,
    [
      randomUUID(),
      userId,
      STALE_TRACER_NOTIFICATION_TITLE,
      "Your graduate tracer record has not been updated for 2 years. Please review and update it.",
      STALE_TRACER_NOTIFICATION_CATEGORY,
      STALE_TRACER_NOTIFICATION_LINK,
    ],
  );
};

const ensureTracerSchema = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_form (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      employment_status VARCHAR(100) NULL,
      company VARCHAR(255) NULL,
      industry VARCHAR(255) NULL,
      work_location VARCHAR(255) NULL,
      job_title VARCHAR(255) NULL,
      income VARCHAR(100) NULL,
      relevance VARCHAR(100) NULL,
      time_to_job VARCHAR(100) NULL,
      further_studies VARCHAR(100) NULL,
      certifications TEXT NULL,
      comments TEXT NULL,
      submission_status VARCHAR(50) NOT NULL DEFAULT 'completed',
      allow_resubmission TINYINT(1) NOT NULL DEFAULT 0,
      admin_reopened_at DATETIME NULL,
      admin_reopened_by VARCHAR(36) NULL,
      pdf_generated_at DATETIME NULL,
      ched_payload LONGTEXT NULL,
      submitted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tracer_form_user_id (user_id),
      INDEX idx_tracer_form_status (submission_status),
      INDEX idx_tracer_form_submitted (submitted_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  try {
    const userIdColumns = await db.query<RowDataPacket>("SHOW COLUMNS FROM tracer_form LIKE 'user_id'");
    const userIdType = cleanText(userIdColumns[0]?.Type).toLowerCase();

    if (userIdType && !userIdType.includes("varchar")) {
      await db.execute("ALTER TABLE tracer_form MODIFY COLUMN user_id VARCHAR(36) NOT NULL");
    }
  } catch {
    // Ignore type-migration issues and let the later query surface the actual error if any.
  }

  const alterations = [
    "ALTER TABLE tracer_form ADD COLUMN submission_status VARCHAR(50) NOT NULL DEFAULT 'completed'",
    "ALTER TABLE tracer_form ADD COLUMN allow_resubmission TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE tracer_form ADD COLUMN admin_reopened_at DATETIME NULL",
    "ALTER TABLE tracer_form ADD COLUMN admin_reopened_by VARCHAR(36) NULL",
    "ALTER TABLE tracer_form ADD COLUMN pdf_generated_at DATETIME NULL",
    "ALTER TABLE tracer_form ADD COLUMN ched_payload LONGTEXT NULL",
    "ALTER TABLE tracer_form ADD COLUMN submitted_at DATETIME NULL",
    "ALTER TABLE tracer_form ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    "ALTER TABLE tracer_form ADD COLUMN industry VARCHAR(255) NULL",
    "ALTER TABLE tracer_form ADD COLUMN relevance VARCHAR(100) NULL",
    "ALTER TABLE tracer_form ADD COLUMN further_studies VARCHAR(100) NULL",
    "ALTER TABLE tracer_form ADD COLUMN certifications TEXT NULL",
    "ALTER TABLE tracer_form ADD COLUMN comments TEXT NULL",
    "ALTER TABLE tracer_form ADD COLUMN job_title VARCHAR(255) NULL",
    "ALTER TABLE tracer_form ADD COLUMN income VARCHAR(100) NULL",
    "ALTER TABLE tracer_form ADD COLUMN time_to_job VARCHAR(100) NULL",
  ];

  for (const sql of alterations) {
    try {
      await db.execute(sql);
    } catch {
      // Ignore legacy duplicate-column cases.
    }
  }

  try {
    await db.execute(`
      UPDATE tracer_form tf
      INNER JOIN users u
        ON u.email = COALESCE(
          NULLIF(tf.email, ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(tf.ched_payload, '$.email')), '')
        )
      SET tf.user_id = u.id,
          tf.email = COALESCE(NULLIF(tf.email, ''), u.email)
      WHERE tf.user_id IS NULL
         OR tf.user_id = ''
         OR tf.user_id = '0'
         OR tf.user_id NOT REGEXP '^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$'
    `);
  } catch {
    // Ignore legacy payload rows that cannot be mapped back to a current user account.
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_drafts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      ched_payload LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tracer_drafts_user_id (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_education (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracer_form_id INT NOT NULL,
      row_order INT NOT NULL DEFAULT 0,
      degree_specialization VARCHAR(255) NULL,
      school VARCHAR(255) NULL,
      year_graduated VARCHAR(10) NULL,
      honors_awards VARCHAR(255) NULL,
      FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_professional_exams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracer_form_id INT NOT NULL,
      row_order INT NOT NULL DEFAULT 0,
      exam_name VARCHAR(255) NULL,
      date_taken VARCHAR(100) NULL,
      rating VARCHAR(100) NULL,
      FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_trainings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracer_form_id INT NOT NULL,
      row_order INT NOT NULL DEFAULT 0,
      title VARCHAR(255) NULL,
      duration_credits VARCHAR(255) NULL,
      institution VARCHAR(255) NULL,
      FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_referrals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracer_form_id INT NOT NULL,
      row_order INT NOT NULL DEFAULT 0,
      referral_name VARCHAR(255) NULL,
      referral_address VARCHAR(255) NULL,
      referral_contact_number VARCHAR(100) NULL,
      FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_type VARCHAR(100) NOT NULL,
      generated_by VARCHAR(36) NULL,
      filters_json LONGTEXT NULL,
      file_name VARCHAR(255) NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_user_id VARCHAR(36) NULL,
      tracer_user_id VARCHAR(36) NULL,
      action VARCHAR(100) NOT NULL,
      details_json LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tracer_audit_actor (actor_user_id),
      INDEX idx_tracer_audit_target (tracer_user_id),
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (tracer_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS graduate_tracer_forms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracer_form_id INT NULL,
      alumni_id VARCHAR(36) NOT NULL,
      form_status VARCHAR(50) NOT NULL DEFAULT 'Draft',
      submitted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_graduate_tracer_forms_alumni (alumni_id),
      INDEX idx_graduate_tracer_forms_status (form_status),
      INDEX idx_graduate_tracer_forms_submitted (submitted_at),
      FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE SET NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_personal_info (
      form_id INT PRIMARY KEY,
      full_name VARCHAR(255) NULL,
      email VARCHAR(255) NULL,
      contact_number VARCHAR(100) NULL,
      payload_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_educational_background (
      form_id INT PRIMARY KEY,
      payload_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_employment_data (
      form_id INT PRIMARY KEY,
      employment_status VARCHAR(100) NULL,
      job_title VARCHAR(255) NULL,
      company VARCHAR(255) NULL,
      payload_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_training_data (
      form_id INT PRIMARY KEY,
      payload_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracer_feedback (
      form_id INT PRIMARY KEY,
      comments TEXT NULL,
      payload_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
    )
  `);

  const hasGraduateTracer = await tableExists("graduate_tracer");
  if (hasGraduateTracer) {
    await db.execute(`
      INSERT INTO tracer_form (
        user_id, employment_status, company, industry, work_location, job_title, income,
        relevance, time_to_job, further_studies, certifications, comments, ched_payload,
        submission_status, submitted_at, created_at, updated_at
      )
      SELECT
        gt.user_id,
        gt.employment_status,
        gt.company,
        gt.industry,
        gt.work_location,
        gt.job_title,
        gt.salary_range,
        gt.relevance,
        gt.years_to_land_job,
        gt.further_studies,
        gt.certifications,
        gt.comments,
        COALESCE(gt.ched_payload, NULL),
        'completed',
        COALESCE(gt.updated_at, gt.created_at),
        gt.created_at,
        gt.updated_at
      FROM graduate_tracer gt
      LEFT JOIN tracer_form tf ON tf.user_id = gt.user_id
      WHERE tf.user_id IS NULL
    `).catch(() => undefined);
  }
};

const requireTracerAdmin = async (userId: string) => {
  const roles = await db.query<RoleRow>("SELECT role FROM user_roles WHERE user_id = ? AND COALESCE(archived, 0) = 0", [userId]);
  return roles.some((row) => cleanText(row.role) !== "alumni");
};

const getSubmissionByUserId = async (userId: string) => {
  await ensureTracerSchema();
  const rows = await db.query<TracerSummaryRow>(
    `SELECT
      tf.*,
      p.name,
      p.email,
      p.student_id,
      p.course,
      p.batch
     FROM tracer_form tf
     LEFT JOIN profiles p ON p.id = tf.user_id
     WHERE tf.user_id = ?
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
};

const getSubmissionById = async (id: string) => {
  await ensureTracerSchema();
  const rows = await db.query<TracerSummaryRow>(
    `SELECT
      tf.*,
      p.name,
      p.email,
      p.student_id,
      p.course,
      p.batch
     FROM tracer_form tf
     LEFT JOIN profiles p ON p.id = tf.user_id
     WHERE tf.id = ?
     LIMIT 1`,
    [id],
  );

  return rows[0] || null;
};

const getSubmissionByLookup = async (lookup: string) => {
  const normalized = cleanText(lookup);
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return getSubmissionById(normalized);
  }

  const byUserId = await getSubmissionByUserId(normalized);
  if (byUserId) return byUserId;

  return getSubmissionById(normalized);
};

const getDraftByUserId = async (userId: string) => {
  await ensureTracerSchema();
  const rows = await db.query<TracerDraftRow>("SELECT * FROM tracer_drafts WHERE user_id = ? LIMIT 1", [userId]);
  return rows[0] || null;
};

const writeAuditLog = async (actorUserId: string | null, tracerUserId: string | null, action: string, details: Record<string, unknown>) => {
  await ensureTracerSchema();
  await db.execute(
    "INSERT INTO tracer_audit_logs (actor_user_id, tracer_user_id, action, details_json) VALUES (?, ?, ?, ?)",
    [actorUserId, cleanNullableText(tracerUserId), action, JSON.stringify(details)],
  );
};

const syncChildRows = async (conn: PoolConnection, tracerFormId: number, payload: Record<string, unknown>) => {
  await conn.execute("DELETE FROM tracer_education WHERE tracer_form_id = ?", [tracerFormId]);
  await conn.execute("DELETE FROM tracer_professional_exams WHERE tracer_form_id = ?", [tracerFormId]);
  await conn.execute("DELETE FROM tracer_trainings WHERE tracer_form_id = ?", [tracerFormId]);
  await conn.execute("DELETE FROM tracer_referrals WHERE tracer_form_id = ?", [tracerFormId]);

  const educationRows = Array.isArray(payload.educationalAttainments) ? payload.educationalAttainments : [];
  const examRows = Array.isArray(payload.professionalExams) ? payload.professionalExams : [];
  const trainingRows = Array.isArray(payload.trainings) ? payload.trainings : [];
  const referralRows = Array.isArray(payload.referrals) ? payload.referrals : [];

  for (const [index, row] of educationRows.entries()) {
    const record = row as Record<string, unknown>;
    if (!Object.values(record).some((value) => cleanText(value))) continue;
    await conn.execute(
      `INSERT INTO tracer_education (tracer_form_id, row_order, degree_specialization, school, year_graduated, honors_awards)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tracerFormId,
        index,
        cleanNullableText(record.degreeSpecialization),
        cleanNullableText(record.school),
        cleanNullableText(record.yearGraduated),
        cleanNullableText(record.honorsAwards),
      ],
    );
  }

  for (const [index, row] of examRows.entries()) {
    const record = row as Record<string, unknown>;
    if (!Object.values(record).some((value) => cleanText(value))) continue;
    await conn.execute(
      `INSERT INTO tracer_professional_exams (tracer_form_id, row_order, exam_name, date_taken, rating)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tracerFormId,
        index,
        cleanNullableText(record.examName),
        cleanNullableText(record.dateTaken),
        cleanNullableText(record.rating),
      ],
    );
  }

  for (const [index, row] of trainingRows.entries()) {
    const record = row as Record<string, unknown>;
    if (!Object.values(record).some((value) => cleanText(value))) continue;
    await conn.execute(
      `INSERT INTO tracer_trainings (tracer_form_id, row_order, title, duration_credits, institution)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tracerFormId,
        index,
        cleanNullableText(record.title),
        cleanNullableText(record.durationCredits),
        cleanNullableText(record.institution),
      ],
    );
  }

  for (const [index, row] of referralRows.entries()) {
    const record = row as Record<string, unknown>;
    if (!Object.values(record).some((value) => cleanText(value))) continue;
    await conn.execute(
      `INSERT INTO tracer_referrals (tracer_form_id, row_order, referral_name, referral_address, referral_contact_number)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tracerFormId,
        index,
        cleanNullableText(record.name),
        cleanNullableText(record.address),
        cleanNullableText(record.contactNumber),
      ],
    );
  }
};

const syncNamedTracerTables = async (
  userId: string,
  payload: Record<string, unknown>,
  formStatus: "Draft" | "Submitted",
  tracerFormId?: number | null,
) => {
  await ensureTracerSchema();
  const summary = buildTracerPayloadSummary(payload);
  const submittedAt = formStatus === "Submitted" ? new Date() : null;

  await db.execute(
    `INSERT INTO graduate_tracer_forms (tracer_form_id, alumni_id, form_status, submitted_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tracer_form_id = COALESCE(VALUES(tracer_form_id), tracer_form_id),
       form_status = VALUES(form_status),
       submitted_at = CASE WHEN VALUES(submitted_at) IS NULL THEN submitted_at ELSE VALUES(submitted_at) END,
       updated_at = CURRENT_TIMESTAMP`,
    [tracerFormId || null, userId, formStatus, submittedAt],
  );

  const formRows = await db.query<RowDataPacket>("SELECT id FROM graduate_tracer_forms WHERE alumni_id = ? LIMIT 1", [userId]);
  const formId = Number(formRows[0]?.id || 0);
  if (!formId) return;

  const personalPayload = {
    fullName: payload.fullName,
    permanentAddress: payload.permanentAddress,
    email: payload.email,
    telephoneNumber: payload.telephoneNumber,
    mobileNumber: payload.mobileNumber,
    civilStatus: payload.civilStatus,
    sex: payload.sex,
    birthdayMonth: payload.birthdayMonth,
    birthdayDay: payload.birthdayDay,
    birthdayYear: payload.birthdayYear,
    regionOfOrigin: payload.regionOfOrigin,
    province: payload.province,
    residenceType: payload.residenceType,
  };
  const educationPayload = {
    educationalAttainments: Array.isArray(payload.educationalAttainments) ? payload.educationalAttainments : [],
    professionalExams: Array.isArray(payload.professionalExams) ? payload.professionalExams : [],
    reasonsForCourse: payload.reasonsForCourse,
    reasonsForCourseOther: payload.reasonsForCourseOther,
  };
  const trainingPayload = {
    trainings: Array.isArray(payload.trainings) ? payload.trainings : [],
    advanceStudyReason: payload.advanceStudyReason,
    advanceStudyReasonOther: payload.advanceStudyReasonOther,
  };
  const employmentPayload = {
    presentlyEmployed: payload.presentlyEmployed,
    presentEmploymentStatus: payload.presentEmploymentStatus,
    presentOccupation: payload.presentOccupation,
    companyNameAddress: payload.companyNameAddress,
    industry: payload.industry,
    workLocation: payload.workLocation,
    firstJobAfterCollege: payload.firstJobAfterCollege,
    firstJobRelatedToCourse: payload.firstJobRelatedToCourse,
    timeToLandFirstJob: payload.timeToLandFirstJob,
    jobLevelFirstJob: payload.jobLevelFirstJob,
    jobLevelCurrentJob: payload.jobLevelCurrentJob,
    initialGrossMonthlyEarning: payload.initialGrossMonthlyEarning,
    curriculumRelevantToFirstJob: payload.curriculumRelevantToFirstJob,
    unemploymentReasons: payload.unemploymentReasons,
    usefulCompetencies: payload.usefulCompetencies,
  };
  const feedbackPayload = {
    curriculumSuggestions: payload.curriculumSuggestions,
    referrals: Array.isArray(payload.referrals) ? payload.referrals : [],
  };

  await db.execute(
    `INSERT INTO tracer_personal_info (form_id, full_name, email, contact_number, payload_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), email = VALUES(email), contact_number = VALUES(contact_number), payload_json = VALUES(payload_json)`,
    [
      formId,
      cleanNullableText(payload.fullName),
      cleanNullableText(payload.email),
      cleanNullableText(payload.mobileNumber) || cleanNullableText(payload.telephoneNumber),
      JSON.stringify(personalPayload),
    ],
  );

  await db.execute(
    `INSERT INTO tracer_educational_background (form_id, payload_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)`,
    [formId, JSON.stringify(educationPayload)],
  );

  await db.execute(
    `INSERT INTO tracer_employment_data (form_id, employment_status, job_title, company, payload_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE employment_status = VALUES(employment_status), job_title = VALUES(job_title), company = VALUES(company), payload_json = VALUES(payload_json)`,
    [formId, summary.employment_status, summary.job_title, summary.company, JSON.stringify(employmentPayload)],
  );

  await db.execute(
    `INSERT INTO tracer_training_data (form_id, payload_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)`,
    [formId, JSON.stringify(trainingPayload)],
  );

  await db.execute(
    `INSERT INTO tracer_feedback (form_id, comments, payload_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE comments = VALUES(comments), payload_json = VALUES(payload_json)`,
    [formId, summary.comments, JSON.stringify(feedbackPayload)],
  );
};

const toPdfRecord = (row: TracerSummaryRow) => ({
  ...row,
  ched_payload: safeParseJson<Record<string, unknown>>(row.ched_payload, {}),
});

const sendPdfResponse = (res: Response, fileName: string, pdfBuffer: Buffer, disposition: "attachment" | "inline") => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdfBuffer);
};

const buildDownloadPdfBuffer = async (row: TracerSummaryRow) => {
  try {
    return await generateTracerPdfBuffer(toPdfRecord(row));
  } catch (error) {
    console.error("TRACER PDF TEMPLATE GENERATION ERROR:", error);
    throw new Error(`Unable to generate the official Graduate Tracer PDF template: ${getErrorMessage(error)}`);
  }
};

const exportOneTracerRecord = async (row: TracerSummaryRow, format: "pdf" | "docx") => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracer-export-"));
  const fileName = buildTracerFileName(cleanText(row.name) || "Alumni", getTracerBatchYear(row), format);
  const outputPath = path.join(tempDir, fileName);

  if (format === "pdf") {
    const pdfBuffer = await buildDownloadPdfBuffer(row);
    await fs.writeFile(outputPath, pdfBuffer);
    return { tempDir, fileName, outputPath };
  }

  await fs.writeFile(outputPath, generateTracerDocxBuffer(toPdfRecord(row)));

  return { tempDir, fileName, outputPath };
};

const getAdminTracerRows = async (filters: {
  search?: string;
  course?: string;
  batch?: string;
  employmentStatus?: string;
  dateSubmitted?: string;
  page?: number;
  pageSize?: number;
}) => {
  await ensureTracerSchema();

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (cleanText(filters.search)) {
    const search = `%${cleanText(filters.search)}%`;
    where.push("(p.name LIKE ? OR p.student_id LIKE ? OR p.course LIKE ? OR p.batch LIKE ?)");
    params.push(search, search, search, search);
  }

  if (cleanText(filters.course) && cleanText(filters.course) !== "All Courses") {
    where.push("p.course = ?");
    params.push(cleanText(filters.course));
  }

  if (cleanText(filters.batch) && cleanText(filters.batch) !== "All Batches") {
    where.push("p.batch = ?");
    params.push(cleanText(filters.batch));
  }

  if (cleanText(filters.employmentStatus) && cleanText(filters.employmentStatus) !== "All Status") {
    where.push("tf.employment_status = ?");
    params.push(cleanText(filters.employmentStatus));
  }

  if (cleanText(filters.dateSubmitted)) {
    where.push("DATE(COALESCE(tf.submitted_at, tf.created_at)) = ?");
    params.push(cleanText(filters.dateSubmitted));
  }

  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 10)));
  const offset = (page - 1) * pageSize;
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countRows = await db.query<SimpleCountRow>(
    `SELECT COUNT(*) AS total
     FROM tracer_form tf
     LEFT JOIN profiles p ON p.id = tf.user_id
     ${whereSql}`,
    params,
  );

  const rows = await db.query<TracerSummaryRow>(
    `SELECT
      tf.*,
      p.name,
      p.email,
      p.student_id,
      p.course,
      p.batch
     FROM tracer_form tf
     LEFT JOIN profiles p ON p.id = tf.user_id
     ${whereSql}
     ORDER BY COALESCE(tf.submitted_at, tf.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    rows: rows.map((row) => ({ ...row, ched_payload: safeParseJson(row.ched_payload, {}) })),
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      totalPages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / pageSize)),
    },
  };
};

const buildAnalytics = async () => {
  await ensureTracerSchema();

  const alumniRows = await db.query<SimpleCountRow>(
    `SELECT COUNT(*) AS totalAlumni
     FROM user_roles
     WHERE role = 'alumni' AND COALESCE(archived, 0) = 0`,
  );

  const submissions = await db.query<TracerSummaryRow>(
    `SELECT
      tf.*,
      p.name,
      p.email,
      p.student_id,
      p.course,
      p.batch
     FROM tracer_form tf
     LEFT JOIN profiles p ON p.id = tf.user_id`,
  );

  const totalAlumni = Number(alumniRows[0]?.totalAlumni || 0);
  const totalResponded = submissions.length;
  const completionRate = totalAlumni > 0 ? Number(((totalResponded / totalAlumni) * 100).toFixed(2)) : 0;

  const charts = {
    employmentStatus: new Map<string, number>(),
    salaryBrackets: new Map<string, number>(),
    workLocation: new Map<string, number>(),
    curriculumRelevance: new Map<string, number>(),
    usefulCompetencies: new Map<string, number>(),
    graduationYear: new Map<string, number>(),
  };

  let employed = 0;
  let unemployed = 0;
  let selfEmployed = 0;
  let totalWaitMonths = 0;
  let waitMonthsCount = 0;

  for (const row of submissions) {
    const payload = safeParseJson<Record<string, unknown>>(row.ched_payload, {});
    const presentlyEmployed = cleanText(payload.presentlyEmployed);
    const employmentStatus = cleanText(row.employment_status) || presentlyEmployed || "Unspecified";
    const income = cleanText(row.income) || cleanText(payload.initialGrossMonthlyEarning) || "Unspecified";
    const workLocation = cleanText(row.work_location) || cleanText(payload.workLocation) || "Unspecified";
    const curriculumRelevant = cleanText(row.relevance) || cleanText(payload.curriculumRelevantToFirstJob) || "Unspecified";
    const timeToJob = cleanText(row.time_to_job) || cleanText(payload.timeToLandFirstJob);

    charts.employmentStatus.set(employmentStatus, (charts.employmentStatus.get(employmentStatus) || 0) + 1);
    charts.salaryBrackets.set(income, (charts.salaryBrackets.get(income) || 0) + 1);
    charts.workLocation.set(workLocation, (charts.workLocation.get(workLocation) || 0) + 1);
    charts.curriculumRelevance.set(curriculumRelevant, (charts.curriculumRelevance.get(curriculumRelevant) || 0) + 1);

    const payloadYear = cleanText((Array.isArray(payload.educationalAttainments) ? (payload.educationalAttainments[0] as Record<string, unknown>)?.yearGraduated : "") || row.batch);
    if (payloadYear) {
      charts.graduationYear.set(payloadYear, (charts.graduationYear.get(payloadYear) || 0) + 1);
    }

    const usefulCompetencies = Array.isArray(payload.usefulCompetencies) ? payload.usefulCompetencies : [];
    for (const entry of usefulCompetencies) {
      const label = cleanText(entry);
      if (!label) continue;
      charts.usefulCompetencies.set(label, (charts.usefulCompetencies.get(label) || 0) + 1);
    }

    if (presentlyEmployed === "Employed") employed += 1;
    if (presentlyEmployed === "Not Employed" || presentlyEmployed === "Never Employed") unemployed += 1;
    if (cleanText(payload.presentEmploymentStatus) === "Self-employed" || employmentStatus === "Self-employed") selfEmployed += 1;

    const months = categoryToMonths(timeToJob);
    if (months !== null) {
      totalWaitMonths += months;
      waitMonthsCount += 1;
    }
  }

  const toArray = (map: Map<string, number>) =>
    [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    totals: {
      totalAlumni,
      totalResponded,
      completionRate,
      employmentRate: totalResponded > 0 ? Number(((employed / totalResponded) * 100).toFixed(2)) : 0,
      unemploymentRate: totalResponded > 0 ? Number(((unemployed / totalResponded) * 100).toFixed(2)) : 0,
      selfEmploymentRate: totalResponded > 0 ? Number(((selfEmployed / totalResponded) * 100).toFixed(2)) : 0,
      averageWaitingMonths: waitMonthsCount > 0 ? Number((totalWaitMonths / waitMonthsCount).toFixed(2)) : 0,
    },
    charts: {
      employmentStatus: toArray(charts.employmentStatus),
      salaryBrackets: toArray(charts.salaryBrackets),
      workLocation: toArray(charts.workLocation),
      curriculumRelevance: toArray(charts.curriculumRelevance),
      usefulCompetencies: toArray(charts.usefulCompetencies).slice(0, 10),
      graduationYear: toArray(charts.graduationYear),
    },
  };
};

const buildExcelWorkbookHtml = (
  rows: Array<Record<string, unknown>>,
) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const logoCell = SCHOOL_LOGO_DATA_URI
    ? `<img src="${SCHOOL_LOGO_DATA_URI}" alt="${escapeHtml(SCHOOL_NAME)} logo" style="height:64px;width:64px;object-fit:contain;" />`
    : `<strong>${escapeHtml(SCHOOL_NAME)}</strong>`;
  const chedCell = CHED_LOGO_DATA_URI
    ? `<img src="${CHED_LOGO_DATA_URI}" alt="CHED seal" style="height:64px;width:64px;object-fit:contain;" />`
    : "CHED";
  const tableHeaders = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = rows.length > 0
    ? rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${Math.max(headers.length, 1)}">No tracer records available.</td></tr>`;

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head>
    <meta charset="utf-8" />
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Graduate Tracer Report</x:Name><x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>9</x:SplitHorizontal><x:TopRowBottomPane>9</x:TopRowBottomPane></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      body { font-family: Arial, sans-serif; color: #172033; }
      .title { background: #550000; color: #ffffff; font-size: 20px; font-weight: 700; text-align: center; }
      .subtitle { background: #f3f4f6; color: #374151; font-size: 12px; text-align: center; }
      .logo { text-align: center; vertical-align: middle; border: 1px solid #d1d5db; }
      .meta { color: #475569; font-size: 12px; text-align: center; }
      .section { background: #e5e7eb; color: #550000; font-size: 13px; font-weight: 700; }
      th { background: #550000; color: #ffffff; font-weight: 700; border: 1px solid #550000; padding: 8px; }
      td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; mso-number-format:"\\@"; }
    </style>
  </head>
  <body>
    <table>
      <colgroup>
        ${Array.from({ length: Math.max(headers.length, 12) }, () => `<col style="width: 150px;" />`).join("")}
      </colgroup>
      <tr>
        <td class="logo" rowspan="4">${logoCell}</td>
        <td class="title" colspan="${Math.max(headers.length - 2, 10)}">${escapeHtml(SCHOOL_NAME)}</td>
        <td class="logo" rowspan="4">${chedCell}</td>
      </tr>
      <tr><td class="subtitle" colspan="${Math.max(headers.length - 2, 10)}">${escapeHtml(SCHOOL_OFFICE)}</td></tr>
      <tr><td class="title" colspan="${Math.max(headers.length - 2, 10)}">${escapeHtml(REPORT_TITLE)}</td></tr>
      <tr><td class="meta" colspan="${Math.max(headers.length - 2, 10)}">${escapeHtml(REPORT_SUBTITLE)} | Generated ${escapeHtml(formatReportDate())}</td></tr>
      <tr><td colspan="${Math.max(headers.length, 12)}">&nbsp;</td></tr>
      <tr><td class="section" colspan="${Math.max(headers.length, 12)}">Respondent Records</td></tr>
      <tr>${tableHeaders}</tr>
      ${tableRows}
    </table>
  </body>
</html>`;
};

const buildReportHtml = (
  analytics: Awaited<ReturnType<typeof buildAnalytics>>,
  rows: Array<Record<string, unknown>>,
) => {
  const list = (title: string, items: Array<{ label: string; value: number }>) => `
    <section class="panel">
      <h3>${title}</h3>
      <table>
        <thead><tr><th>Label</th><th class="number">Count</th></tr></thead>
        <tbody>${items.length > 0 ? items.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="number">${escapeHtml(item.value)}</td></tr>`).join("") : `<tr><td colspan="2">No data available.</td></tr>`}</tbody>
      </table>
    </section>
  `;
  const logo = SCHOOL_LOGO_DATA_URI ? `<img src="${SCHOOL_LOGO_DATA_URI}" alt="${escapeHtml(SCHOOL_NAME)} logo" />` : `<span>${escapeHtml(SCHOOL_NAME)}</span>`;
  const chedLogo = CHED_LOGO_DATA_URI ? `<img src="${CHED_LOGO_DATA_URI}" alt="CHED seal" />` : `<span>CHED</span>`;
  const recordHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const emptyRow = `<tr><td colspan="${Math.max(recordHeaders.length, 1)}">No tracer records available.</td></tr>`;
  const recordTable = recordHeaders.length > 0 ? `
    <section class="records-panel">
      <div class="section-bar">
        <h3>Respondent Records</h3>
        <span>${rows.length} record${rows.length === 1 ? "" : "s"}</span>
      </div>
      <div class="table-wrap">
        <table class="records">
          <thead><tr>${recordHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${rows.length > 0 ? rows.map((row) => `<tr>${recordHeaders.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("") : emptyRow}</tbody>
        </table>
      </div>
    </section>
  ` : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(REPORT_TITLE)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #172033; background: #f8fafc; font-size: 12px; }
      .sheet { max-width: 1440px; margin: 0 auto; background: #ffffff; padding: 24px; }
      header { display: grid; grid-template-columns: 78px 1fr 78px; align-items: center; gap: 16px; border-bottom: 4px solid #550000; padding-bottom: 14px; }
      header .logo { align-items: center; border: 1px solid #d8dde6; border-radius: 10px; display: flex; height: 68px; justify-content: center; padding: 7px; }
      header img { max-height: 56px; max-width: 56px; object-fit: contain; }
      h1 { color: #550000; font-size: 23px; letter-spacing: 0.02em; margin: 0; text-align: center; text-transform: uppercase; }
      h2 { color: #172033; font-size: 14px; font-weight: 700; margin: 4px 0 0; text-align: center; }
      .meta { color: #64748b; line-height: 1.5; margin-top: 8px; text-align: center; }
      .intro { border: 1px solid #e2e8f0; border-left: 5px solid #550000; margin: 14px 0; padding: 10px 12px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
      .panel { break-inside: avoid; border: 1px solid #d8dde6; border-radius: 10px; margin-bottom: 14px; overflow: hidden; }
      h3 { color: inherit; font-size: 12px; letter-spacing: .04em; margin: 0; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d8dde6; padding: 6px 7px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; color: #172033; font-size: 10px; text-transform: uppercase; }
      .number { text-align: right; width: 90px; }
      .records-panel { border: 1px solid #d8dde6; border-radius: 10px; overflow: hidden; }
      .section-bar { align-items: center; background: #550000; color: #ffffff; display: flex; justify-content: space-between; padding: 10px 12px; }
      .section-bar span { font-size: 11px; font-weight: 700; }
      .table-wrap { overflow-x: auto; }
      .records { font-size: 9.5px; min-width: 1320px; table-layout: fixed; }
      .records th { background: #550000; color: #ffffff; }
      .records th:nth-child(1), .records td:nth-child(1) { width: 145px; }
      .records th:nth-child(2), .records td:nth-child(2) { width: 90px; }
      .records th:nth-child(3), .records td:nth-child(3) { width: 140px; }
      .records th:nth-child(4), .records td:nth-child(4) { width: 62px; }
      .records th:nth-child(5), .records td:nth-child(5) { width: 118px; }
      .records th:nth-child(6), .records td:nth-child(6) { width: 120px; }
      .records th:nth-child(7), .records td:nth-child(7) { width: 120px; }
      .records th:nth-child(8), .records td:nth-child(8) { width: 105px; }
      .records th:nth-child(9), .records td:nth-child(9) { width: 95px; }
      .records th:nth-child(10), .records td:nth-child(10) { width: 105px; }
      .records th:nth-child(11), .records td:nth-child(11) { width: 105px; }
      .records th:nth-child(12), .records td:nth-child(12) { width: 115px; }
      footer { border-top: 1px solid #d8dde6; color: #64748b; margin-top: 18px; padding-top: 10px; text-align: right; }
      .print-action { background: #550000; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font-weight: 700; padding: 9px 14px; position: fixed; right: 18px; top: 18px; }
      @media print {
        body { background: #ffffff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .sheet { max-width: none; padding: 0; }
        .table-wrap { overflow: visible; }
        .records { min-width: 0; width: 100%; }
        .print-action { display: none; }
      }
    </style>
  </head>
  <body>
    <button class="print-action" onclick="window.print()">Print / Save as PDF</button>
    <main class="sheet">
    <header>
      <div class="logo">${logo}</div>
      <div>
        <h1>${escapeHtml(SCHOOL_NAME)}</h1>
        <h2>${escapeHtml(REPORT_TITLE)}</h2>
        <p class="meta">${escapeHtml(SCHOOL_OFFICE)}<br />${escapeHtml(REPORT_SUBTITLE)}<br />Generated ${escapeHtml(formatReportDate())}</p>
      </div>
      <div class="logo">${chedLogo}</div>
    </header>
    <section class="intro">
      Landscape printable report arranged like the Excel workbook for clear review of alumni tracer details.
    </section>
    ${recordTable}
    <div class="grid">
      ${list("Employment Status", analytics.charts.employmentStatus)}
      ${list("Salary Brackets", analytics.charts.salaryBrackets)}
      ${list("Work Location", analytics.charts.workLocation)}
      ${list("Curriculum Relevance", analytics.charts.curriculumRelevance)}
      ${list("Top Useful Competencies", analytics.charts.usefulCompetencies)}
      ${list("Graduation Year", analytics.charts.graduationYear)}
    </div>
    <footer>Prepared through the Alumni Management System Graduate Tracer module.</footer>
    </main>
  </body>
</html>`;
};

export const getMyTracer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const [submission, draft] = await Promise.all([getSubmissionByUserId(req.user.id), getDraftByUserId(req.user.id)]);
    await syncStaleTracerNotification(req.user.id, submission);
    res.json({
      submission: submission ? { ...submission, ched_payload: safeParseJson(submission.ched_payload, {}) } : null,
      draft: draft ? { ...draft, ched_payload: safeParseJson(draft.ched_payload, {}) } : null,
      allowResubmission: true,
      canSubmit: true,
    });
  } catch (error: unknown) {
    console.error("GET MY TRACER ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const saveTracerDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);
    await ensureTracerSchema();

    const payload = safeParseJson<Record<string, unknown>>(req.body?.ched_payload ?? req.body, {});
    await db.execute(
      `INSERT INTO tracer_drafts (user_id, ched_payload)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE ched_payload = VALUES(ched_payload), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, JSON.stringify(payload)],
    );

    await syncNamedTracerTables(req.user.id, payload, "Draft", null);
    await writeAuditLog(req.user.id, req.user.id, "save_draft", { hasPayload: Object.keys(payload).length > 0 });
    const draft = await getDraftByUserId(req.user.id);
    res.json({ success: true, draft: draft ? { ...draft, ched_payload: safeParseJson(draft.ched_payload, {}) } : null });
  } catch (error: unknown) {
    console.error("SAVE TRACER DRAFT ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const submitTracer = async (req: AuthenticatedRequest, res: Response) => {
  const conn = await db.getConnection();

  try {
    if (!req.user?.id) return res.sendStatus(401);
    await ensureTracerSchema();

    const payload = safeParseJson<Record<string, unknown>>(req.body?.ched_payload ?? req.body, {});
    const summary = buildTracerPayloadSummary(payload);
    const existingRows = await db.query<TracerSummaryRow>("SELECT * FROM tracer_form WHERE user_id = ? LIMIT 1", [req.user.id]);
    const existing = existingRows[0] || null;

    await conn.beginTransaction();

    let tracerFormId = existing?.id ?? 0;

    if (existing) {
      await conn.execute(
        `UPDATE tracer_form
         SET employment_status = ?, job_title = ?, company = ?, industry = ?, work_location = ?, income = ?,
             relevance = ?, time_to_job = ?, further_studies = ?, certifications = ?, comments = ?,
             ched_payload = ?, submission_status = 'completed', allow_resubmission = 1,
             admin_reopened_at = NULL, admin_reopened_by = NULL, submitted_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [
          summary.employment_status,
          summary.job_title,
          summary.company,
          summary.industry,
          summary.work_location,
          summary.income,
          summary.relevance,
          summary.time_to_job,
          summary.further_studies,
          summary.certifications,
          summary.comments,
          JSON.stringify(payload),
          req.user.id,
        ],
      );
    } else {
      const [insertResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO tracer_form (
          user_id, employment_status, job_title, company, industry, work_location, income, relevance, time_to_job,
          further_studies, certifications, comments, ched_payload, submission_status, allow_resubmission, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, CURRENT_TIMESTAMP)`,
        [
          req.user.id,
          summary.employment_status,
          summary.job_title,
          summary.company,
          summary.industry,
          summary.work_location,
          summary.income,
          summary.relevance,
          summary.time_to_job,
          summary.further_studies,
          summary.certifications,
          summary.comments,
          JSON.stringify(payload),
        ],
      );
      tracerFormId = insertResult.insertId;
    }

    if (!tracerFormId) {
      const row = await db.query<TracerSummaryRow>("SELECT id FROM tracer_form WHERE user_id = ? LIMIT 1", [req.user.id]);
      tracerFormId = Number(row[0]?.id || 0);
    }

    await syncChildRows(conn, tracerFormId, payload);
    await conn.execute("DELETE FROM tracer_drafts WHERE user_id = ?", [req.user.id]);
    await conn.commit();
    await syncNamedTracerTables(req.user.id, payload, "Submitted", tracerFormId);
    await clearStaleTracerNotifications(req.user.id);

    await writeAuditLog(req.user.id, req.user.id, existing ? "update_tracer" : "submit_tracer", {
      submittedAt: new Date().toISOString(),
      graduationYear: yearToNumber((Array.isArray(payload.educationalAttainments) ? (payload.educationalAttainments[0] as Record<string, unknown>)?.yearGraduated : "") || null),
    });

    const submission = await getSubmissionByUserId(req.user.id);
    res.json({
      success: true,
      submission: submission ? { ...submission, ched_payload: safeParseJson(submission.ched_payload, {}) } : null,
      fileName: buildTracerFileName(cleanText(submission?.name) || cleanText(payload.fullName) || "Alumni", getTracerBatchYear({ ...(submission || {}), ched_payload: payload }), "pdf"),
    });
  } catch (error: unknown) {
    await conn.rollback();
    console.error("SUBMIT TRACER ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  } finally {
    conn.release();
  }
};

export const exportMyTracerRecord = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const row = await getSubmissionByUserId(req.user.id);
    if (!row) {
      return jsonResponseError(res, 404, "No submitted tracer form found for this account.");
    }

    const format = req.query.format === "docx" ? "docx" : "pdf";
    const exported = await exportOneTracerRecord(row, format);
    await db.execute("UPDATE tracer_form SET pdf_generated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [req.user.id]).catch(() => undefined);
    await writeAuditLog(req.user.id, req.user.id, `download_${format}`, { scope: "self" });
    res.download(exported.outputPath, exported.fileName);
  } catch (error: unknown) {
    console.error("EXPORT MY TRACER ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const previewMyTracerRecord = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const row = await getSubmissionByUserId(req.user.id);
    if (!row) {
      return jsonResponseError(res, 404, "No submitted tracer form found for this account.");
    }

    const fileName = buildTracerFileName(cleanText(row.name) || "Alumni", getTracerBatchYear(row), "pdf");
    const pdfBuffer = await buildDownloadPdfBuffer(row);
    await db.execute("UPDATE tracer_form SET pdf_generated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [req.user.id]).catch(() => undefined);
    await writeAuditLog(req.user.id, req.user.id, "preview_pdf", { scope: "self" });
    sendPdfResponse(res, fileName, pdfBuffer, "inline");
  } catch (error: unknown) {
    console.error("PREVIEW MY TRACER ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const listTracerRecords = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows, pagination } = await getAdminTracerRows({
      search: typeof req.query.search === "string" ? req.query.search : "",
      course: typeof req.query.course === "string" ? req.query.course : "",
      batch: typeof req.query.batch === "string" ? req.query.batch : "",
      employmentStatus: typeof req.query.employmentStatus === "string" ? req.query.employmentStatus : "",
      dateSubmitted: typeof req.query.dateSubmitted === "string" ? req.query.dateSubmitted : "",
      page: typeof req.query.page === "string" ? Number(req.query.page) : 1,
      pageSize: typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 10,
    });

    res.json({ rows, pagination });
  } catch (error: unknown) {
    console.error("LIST TRACER RECORDS ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const getAdminTracerRecord = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const lookup = cleanText(req.params.alumniId ?? req.params.id);
    const row = await getSubmissionByLookup(lookup);
    if (!row) {
      return jsonResponseError(res, 404, "Tracer record not found.");
    }

    res.json({ ...row, ched_payload: safeParseJson(row.ched_payload, {}) });
  } catch (error: unknown) {
    console.error("GET ADMIN TRACER RECORD ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const getTracerAnalytics = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await buildAnalytics());
  } catch (error: unknown) {
    console.error("GET TRACER ANALYTICS ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const reopenTracerSubmission = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const targetUserId = cleanText(req.params.userId);
    if (!targetUserId) {
      return jsonResponseError(res, 400, "Tracer user ID is required.");
    }

    await ensureTracerSchema();
    await db.execute(
      `UPDATE tracer_form
       SET allow_resubmission = 1, submission_status = 'reopened', admin_reopened_at = CURRENT_TIMESTAMP, admin_reopened_by = ?
       WHERE user_id = ?`,
      [req.user.id, targetUserId],
    );

    await writeAuditLog(req.user.id, targetUserId, "reopen_submission", { reopenedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("REOPEN TRACER SUBMISSION ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const exportTracerRecord = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);
    const userId = cleanText(req.params.userId);
    const row = await getSubmissionByUserId(userId);

    if (!row) {
      return jsonResponseError(res, 404, "Tracer record not found.");
    }

    const format = req.query.format === "docx" ? "docx" : "pdf";
    const exported = await exportOneTracerRecord(row, format);
    await db.execute("UPDATE tracer_form SET pdf_generated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [userId]).catch(() => undefined);
    await writeAuditLog(req.user.id, userId, `admin_download_${format}`, { scope: "individual" });
    res.download(exported.outputPath, exported.fileName);
  } catch (error: unknown) {
    console.error("EXPORT TRACER RECORD ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const exportTracerPdfByRecordId = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const tracerId = cleanText(req.params.alumniId ?? req.params.id);
    if (!tracerId) {
      return jsonResponseError(res, 400, "Tracer record ID is required.");
    }

    const row = await getSubmissionByLookup(tracerId);
    if (!row) {
      return jsonResponseError(res, 404, "Tracer record not found.");
    }

    const pdfBuffer = await buildDownloadPdfBuffer(row);
    const fileName = buildTracerFileName(cleanText(row.name) || "Alumni", getTracerBatchYear(row), "pdf");
    await db.execute("UPDATE tracer_form SET pdf_generated_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]).catch(() => undefined);
    await writeAuditLog(req.user.id, row.user_id, "admin_download_pdf_by_record_id", { tracerId });

    sendPdfResponse(res, fileName, pdfBuffer, "attachment");
  } catch (error: unknown) {
    console.error("EXPORT TRACER PDF BY ID ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const previewTracerPdfByRecordId = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const tracerId = cleanText(req.params.alumniId ?? req.params.id);
    if (!tracerId) {
      return jsonResponseError(res, 400, "Tracer record ID is required.");
    }

    const row = await getSubmissionByLookup(tracerId);
    if (!row) {
      return jsonResponseError(res, 404, "Tracer record not found.");
    }

    const fileName = buildTracerFileName(cleanText(row.name) || "Alumni", getTracerBatchYear(row), "pdf");
    const pdfBuffer = await buildDownloadPdfBuffer(row);
    await db.execute("UPDATE tracer_form SET pdf_generated_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]).catch(() => undefined);
    await writeAuditLog(req.user.id, row.user_id, "admin_preview_pdf_by_record_id", { tracerId });
    sendPdfResponse(res, fileName, pdfBuffer, "inline");
  } catch (error: unknown) {
    console.error("PREVIEW TRACER PDF BY ID ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const bulkDownloadTracerPdfs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const requestedIds = Array.isArray(req.body?.alumniIds)
      ? req.body.alumniIds
      : Array.isArray(req.body?.recordIds)
        ? req.body.recordIds
        : Array.isArray(req.body?.ids)
          ? req.body.ids
          : [];

    let rows: TracerSummaryRow[] = [];

    if (requestedIds.length > 0) {
      const seen = new Set<string>();
      for (const rawId of requestedIds) {
        const lookup = cleanText(rawId);
        if (!lookup || seen.has(lookup)) continue;
        seen.add(lookup);
        const row = await getSubmissionByLookup(lookup);
        if (row) rows.push(row);
      }
    } else {
      const filters = req.body?.filters && typeof req.body.filters === "object" ? req.body.filters : req.query;
      const result = await getAdminTracerRows({
        search: typeof filters.search === "string" ? filters.search : "",
        course: typeof filters.course === "string" ? filters.course : "",
        batch: typeof filters.batch === "string" ? filters.batch : "",
        employmentStatus: typeof filters.employmentStatus === "string" ? filters.employmentStatus : "",
        dateSubmitted: typeof filters.dateSubmitted === "string" ? filters.dateSubmitted : "",
        page: 1,
        pageSize: 500,
      });
      rows = result.rows as TracerSummaryRow[];
    }

    if (rows.length === 0) {
      return jsonResponseError(res, 404, "No tracer records matched the selected alumni.");
    }

    const archiveFiles: Array<{ name: string; data: Buffer }> = [];
    const usedFileNames = new Set<string>();

    for (const row of rows) {
      const baseFileName = buildTracerFileName(cleanText(row.name) || row.user_id, getTracerBatchYear(row), "pdf");
      let fileName = baseFileName;
      let suffix = 2;
      while (usedFileNames.has(fileName)) {
        fileName = baseFileName.replace(".pdf", `_${suffix}.pdf`);
        suffix += 1;
      }
      usedFileNames.add(fileName);
      archiveFiles.push({ name: fileName, data: await buildDownloadPdfBuffer(row) });
    }

    const zipBuffer = createStoredZipBuffer(archiveFiles);
    await writeAuditLog(req.user.id, "", "admin_bulk_download_pdf", { records: rows.length });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="graduate-tracer-selected-pdfs.zip"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(zipBuffer);
  } catch (error: unknown) {
    console.error("BULK DOWNLOAD TRACER PDF ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const exportTracerArchive = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const format = req.query.format === "docx" ? "docx" : "pdf";
    const { rows } = await getAdminTracerRows({
      search: typeof req.query.search === "string" ? req.query.search : "",
      course: typeof req.query.course === "string" ? req.query.course : "",
      batch: typeof req.query.batch === "string" ? req.query.batch : "",
      employmentStatus: typeof req.query.employmentStatus === "string" ? req.query.employmentStatus : "",
      dateSubmitted: typeof req.query.dateSubmitted === "string" ? req.query.dateSubmitted : "",
      page: 1,
      pageSize: 500,
    });

    if (rows.length === 0) {
      return jsonResponseError(res, 404, "No tracer records matched the selected filters.");
    }

    const archiveFiles: Array<{ name: string; data: Buffer }> = [];
    const usedFileNames = new Set<string>();

    for (const row of rows) {
      const rawRow = row as TracerSummaryRow;
      const baseFileName = buildTracerFileName(cleanText(rawRow.name) || rawRow.user_id, getTracerBatchYear(rawRow), format);
      let fileName = baseFileName;
      let suffix = 2;
      while (usedFileNames.has(fileName)) {
        fileName = baseFileName.replace(`.${format}`, `_${suffix}.${format}`);
        suffix += 1;
      }
      usedFileNames.add(fileName);

      archiveFiles.push({
        name: fileName,
        data: format === "pdf" ? await buildDownloadPdfBuffer(rawRow) : generateTracerDocxBuffer(toPdfRecord(rawRow)),
      });
    }

    const zipBuffer = createStoredZipBuffer(archiveFiles);
    await writeAuditLog(req.user.id, "", `admin_batch_download_${format}`, { records: rows.length });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="graduate-tracer-forms-${format}.zip"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(zipBuffer);
  } catch (error: unknown) {
    console.error("EXPORT TRACER ARCHIVE ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const exportTracerReports = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);

    const analytics = await buildAnalytics();
    const { rows } = await getAdminTracerRows({ page: 1, pageSize: 1000 });
    const summaryRows = rows.map((row) => {
      const payload = row.ched_payload as Record<string, unknown>;
      return {
        "Alumni Name": cleanText(row.name),
        "Student ID": cleanText(row.student_id),
        Course: cleanText(row.course),
        Batch: cleanText(row.batch),
        "Employment Status": cleanText(row.employment_status) || cleanText(payload.presentlyEmployed),
        Occupation: cleanText(row.job_title),
        Company: cleanText(row.company),
        "Work Location": cleanText(row.work_location),
        "Salary Range": cleanText(row.income),
        "Curriculum Relevant": cleanText(row.relevance),
        "Time To First Job": cleanText(row.time_to_job),
        "Submitted At": cleanText(row.submitted_at),
      };
    });

    const format = cleanText(req.query.format).toLowerCase() || "pdf";
    if (!["excel", "pdf"].includes(format)) {
      return jsonResponseError(res, 400, "Only Excel and PDF tracer report exports are available.");
    }
    await db.execute(
      "INSERT INTO tracer_reports (report_type, generated_by, filters_json, file_name) VALUES (?, ?, ?, ?)",
      ["analytics", req.user.id, JSON.stringify(req.query || {}), `tracer-report-${format}`],
    ).catch(() => undefined);

    if (format === "excel") {
      const workbook = buildExcelWorkbookHtml(summaryRows);
      await writeAuditLog(req.user.id, "", "export_report_excel", { rows: summaryRows.length });
      res.setHeader("Content-Type", "application/vnd.ms-excel");
      res.setHeader("Content-Disposition", `attachment; filename="graduate-tracer-report-${formatFileDate()}.xls"`);
      return res.send(workbook);
    }

    if (format === "pdf") {
      await writeAuditLog(req.user.id, "", "export_report_pdf", { rows: summaryRows.length });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="graduate-tracer-report-${formatFileDate()}.html"`);
      return res.send(buildReportHtml(analytics, summaryRows));
    }

    await writeAuditLog(req.user.id, "", "export_report_pdf", { rows: summaryRows.length });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="graduate-tracer-report-${formatFileDate()}.html"`);
    return res.send(buildReportHtml(analytics, summaryRows));
  } catch (error: unknown) {
    console.error("EXPORT TRACER REPORTS ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};

export const assertTracerAdminAccess = async (req: AuthenticatedRequest, res: Response, next: () => void) => {
  try {
    if (!req.user?.id) return res.sendStatus(401);
    const allowed = await requireTracerAdmin(req.user.id);
    if (!allowed) return res.sendStatus(403);
    next();
  } catch (error: unknown) {
    console.error("TRACER ADMIN ACCESS ERROR:", error);
    jsonResponseError(res, 500, getErrorMessage(error));
  }
};
