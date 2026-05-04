import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import db from "./db.ts";
import sendEmail, { sendMail } from "./utils/sendEmail";
import { authenticateToken } from "./middleware/auth";
import tracerRoutes from "./routes/tracer.routes";
import emailRoutes from "./routes/emailRoutes";
import { AuthenticatedRequest } from "./types/auth";
import { assertTracerAdminAccess, exportTracerPdfByRecordId, previewTracerPdfByRecordId } from "./controllers/tracer.controller";
import { COURSE_LABELS, COURSE_OPTIONS, normalizeCourseCode, SYSTEM_COURSES } from "./courseCatalog";

const app = express();
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
dotenv.config({ path: path.resolve(currentDirPath, "../.env") });
dotenv.config({ path: path.resolve(currentDirPath, ".env"), override: true });
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const ADMIN_EMAIL = "forjakeproject@gmail.com";
const ADMIN_PASSWORD = "administrator123";
const ADMIN_NAME = "System Administrator";
const APP_BASE_URL = process.env.APP_BASE_URL || "";

type QueryRow = RowDataPacket & Record<string, unknown>;
type DbParam = string | number | boolean | Date | Buffer | null;

interface AlumniImportInputRow {
    fullName?: string;
    graduationYear?: string;
    emailAddress?: string;
    contactNumber?: string;
}

interface AlumniImportPreparedRow {
    rowNumber: number;
    name: string;
    batch: string;
    email: string;
    contactNumber: string;
}

interface AlumniImportFailure {
    rowNumber: number;
    emailAddress: string;
    fullName: string;
    reason: string;
}

interface PendingDonationRow extends QueryRow {
    status: string | null;
    name: string | null;
}

interface UpcomingEventRow extends QueryRow {
    image_url: string | null;
    status: string | null;
}

interface RegistrationRow extends QueryRow {
    event_id: number | string;
}

interface DonationListRow extends QueryRow {
    id: number;
    user_id: string;
    amount: number;
    method: string;
    status: string | null;
    purpose: string | null;
    ref_number: string | null;
    receipt_url: string | null;
    message: string | null;
    created_at: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    review_notes?: string | null;
    name: string | null;
    email?: string | null;
    student_id: string | null;
    batch: string | null;
    course: string | null;
}

interface EventListRow extends QueryRow {
    image_url: string | null;
    status: string | null;
    audience_scope?: string | null;
    audience_value?: string | null;
}

interface UserNotificationRow extends QueryRow {
    id: string;
    user_id: string;
    title: string;
    message: string;
    category: string | null;
    link_url: string | null;
    is_read: number | boolean;
    created_at: string;
}

interface UserSettingsRow extends QueryRow {
    user_id: string;
    allow_event_alerts: number | boolean | null;
    allow_survey_reminders: number | boolean | null;
    allow_email_notifications: number | boolean | null;
    allow_in_app_notifications: number | boolean | null;
}

interface OfficerRow extends QueryRow {
    user_id: string;
    role: string;
    archived: number | boolean | null;
    profile_id: string | null;
    profile_name: string | null;
    profile_email: string | null;
    profile_photo: string | null;
}

interface OfficerSchoolYearRow extends QueryRow {
    id: number;
    start_year: number | string;
    end_year: number | string;
    label: string | null;
    is_current: number | boolean | null;
    created_at: string;
    updated_at: string;
    officer_count: number | string | null;
}

interface OfficerRosterRow extends QueryRow {
    id: number;
    school_year_id: number;
    position: string;
    custom_position: string | null;
    display_order: number | string | null;
    alumni_id: string;
    snapshot_name: string;
    snapshot_email: string | null;
    snapshot_course: string | null;
    snapshot_batch: string | null;
    snapshot_contact_number: string | null;
    snapshot_photo: string | null;
    created_at: string;
    updated_at: string;
}

type FreedomWallReactionType = "heart";

interface FreedomWallPostRow extends QueryRow {
    id: number | string;
    user_id: string;
    content: string;
    image_url: string | null;
    category: string | null;
    is_pinned: number | boolean | null;
    created_at: string;
    updated_at: string;
    author_name: string | null;
    author_batch: string | null;
    author_course: string | null;
    author_photo: string | null;
}

interface FreedomWallCommentRow extends QueryRow {
    id: number | string;
    post_id: number | string;
    user_id: string;
    parent_id: number | string | null;
    content: string;
    created_at: string;
    updated_at: string;
    author_name: string | null;
    author_batch: string | null;
    author_course: string | null;
    author_photo: string | null;
}

interface NormalizedOfficerAssignment {
    alumniId: string;
    position: string;
    name: string;
    contactNumber: string;
    photoBase64: string | null;
    customPosition: string | null;
    displayOrder: number;
}

const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : "Unknown error";
};

const parseRows = <T extends QueryRow = QueryRow>(result: T[] | T[][] | unknown) => {
    if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
    }

    return Array.isArray(result) ? result : [];
};

const getSingleRow = async <T extends QueryRow = QueryRow>(sql: string, params: DbParam[] = []) => {
    const rows = parseRows<T>(await db.query<T>(sql, params));
    return rows[0] || null;
};

const getRoleForUser = async (userId: string) => {
    const roleRow = await getSingleRow(
        "SELECT role FROM user_roles WHERE user_id = ?",
        [userId]
    );

    return roleRow?.role || "alumni";
};

const getProfileForUser = async (userId: string) => {
    return await getSingleRow(
        `SELECT id, name, email, student_id, course, batch, contact_number, photo, created_at
         FROM profiles
         WHERE id = ?`,
        [userId]
    );
};

const getUserForAuth = async (userId: string) => {
    return await getSingleRow(
        `SELECT id, email
         FROM users
         WHERE id = ?`,
        [userId]
    );
};

const getChairmanCourseForUser = async (userId: string) => {
    const profile = await getProfileForUser(userId);
    return normalizeSupportedCourse(profile?.course);
};

const tableExists = async (tableName: string) => {
    const table = await getSingleRow(
        "SHOW TABLES LIKE ?",
        [tableName]
    );

    return Boolean(table);
};

const columnExists = async (tableName: string, columnName: string) => {
    try {
        const column = await getSingleRow(
            `SHOW COLUMNS FROM ${tableName} LIKE ?`,
            [columnName]
        );

        return Boolean(column);
    } catch {
        return false;
    }
};

const getAnnouncementTableName = async () => {
    try {
        if (await tableExists("announcements")) {
            return "announcements";
        }

        if (await tableExists("events")) {
            return "events";
        }

        return "announcements";
    } catch {
        return "announcements";
    }
};

const getTracerTableName = async () => {
    try {
        if (await tableExists("tracer_form")) {
            return "tracer_form";
        }

        if (await tableExists("graduate_tracer")) {
            return "graduate_tracer";
        }

        if (await tableExists("tracer_responses")) {
            return "tracer_responses";
        }

        return "tracer_form";
    } catch {
        return "tracer_form";
    }
};

const getTracerColumnNames = (tableName: string) => {
    if (tableName === "tracer_form") {
        return {
            income: "income",
            timeToJob: "time_to_job"
        };
    }

    return {
        income: "salary_range",
        timeToJob: "years_to_land_job"
    };
};

const getTracerCompletionStatus = async (userId: string) => {
    const tracerTable = await getTracerTableName();
    const row = await getSingleRow(
        `SELECT COUNT(*) AS total FROM ${tracerTable} WHERE user_id = ?`,
        [userId]
    );

    return Number(row?.total || 0) > 0;
};

const normalizeStatus = (value: string | null | undefined, fallback = "pending") => {
    const normalized = String(value || fallback).trim().toLowerCase();
    return normalized || fallback;
};

const FREEDOM_WALL_REACTION_TYPES = ["heart"] as const;

const normalizeFreedomWallReactionType = (value: unknown): FreedomWallReactionType | null => {
    const normalized = String(value || "").trim().toLowerCase();
    return FREEDOM_WALL_REACTION_TYPES.includes(normalized as FreedomWallReactionType)
        ? normalized as FreedomWallReactionType
        : null;
};

const OFFICER_POSITION_LABELS: Record<string, string> = {
    president: "President",
    vice_president: "Vice President",
    secretary: "Secretary",
    assistant_secretary: "Assistant Secretary",
    treasurer: "Treasurer",
    assistant_treasurer: "Assistant Treasurer",
    auditor: "Auditor",
    pio: "PRO",
    pro: "PRO",
    board_member: "Board Member"
};

const OFFICER_POSITION_ORDER: Record<string, number> = {
    president: 10,
    vice_president: 20,
    secretary: 30,
    assistant_secretary: 40,
    treasurer: 50,
    assistant_treasurer: 60,
    auditor: 70,
    pio: 80,
    pro: 80,
    board_member: 90
};

const ACHIEVEMENT_REACTION_TYPES = ["heart"] as const;
type AchievementReactionType = typeof ACHIEVEMENT_REACTION_TYPES[number];

const normalizeOfficerPositionKey = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "pro") {
        return "pio";
    }

    return normalized;
};

const formatOfficerPosition = (value: string | null | undefined, customPosition?: string | null) => {
    if (customPosition) {
        return customPosition;
    }

    const normalized = String(value || "").trim().toLowerCase();
    if (OFFICER_POSITION_LABELS[normalized]) {
        return OFFICER_POSITION_LABELS[normalized];
    }

    return normalized
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

const getOfficerDisplayOrder = (position: string | null | undefined, index = 0) => {
    const normalized = normalizeOfficerPositionKey(position);
    return (OFFICER_POSITION_ORDER[normalized] || 100) + index;
};

const getActiveOfficerSchoolYear = async () => {
    const currentSchoolYear = await getSingleRow<OfficerSchoolYearRow>(
        `SELECT id, start_year, end_year, label, is_current, created_at, updated_at
         FROM officer_school_year
         WHERE is_current = 1
         ORDER BY start_year DESC, end_year DESC, id DESC
         LIMIT 1`
    );

    if (currentSchoolYear) {
        return currentSchoolYear;
    }

    return await getSingleRow<OfficerSchoolYearRow>(
        `SELECT id, start_year, end_year, label, is_current, created_at, updated_at
         FROM officer_school_year
         ORDER BY start_year DESC, end_year DESC, id DESC
         LIMIT 1`
    );
};

const getOfficerRosterForSchoolYear = async (schoolYearId: number | string) => {
    return parseRows(await db.query(
        `SELECT
            o.position,
            o.custom_position,
            o.snapshot_name AS name,
            o.snapshot_photo AS photo,
            sy.label AS school_year
         FROM officers o
         INNER JOIN officer_school_year sy ON sy.id = o.school_year_id
         WHERE sy.id = ?
         ORDER BY o.display_order ASC, o.snapshot_name ASC`,
        [schoolYearId]
    ));
};

const parseSchoolYearInput = (value: unknown) => {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^(\d{4})\s*-\s*(\d{4})$/);

    if (!match) {
        return null;
    }

    const startYear = Number(match[1]);
    const endYear = Number(match[2]);

    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear !== startYear + 1) {
        return null;
    }

    return {
        startYear,
        endYear,
        label: `${startYear} - ${endYear}`
    };
};

const normalizeAnnouncementType = (value: string | null | undefined) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "survey" || normalized === "event" || normalized === "announcement") {
        return normalized;
    }

    return "announcement";
};

const normalizeAnnouncementAudienceScope = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "course" || normalized === "batch") {
        return normalized;
    }

    return "all";
};

const normalizeAnnouncementAudienceValue = (scope: string, value: unknown) => {
    if (scope === "course") {
        return normalizeText(value) || null;
    }

    if (scope === "batch") {
        return normalizeBatch(value) || null;
    }

    return null;
};

const formatAnnouncementAudienceLabel = (scope: string | null | undefined, value: string | null | undefined) => {
    const normalizedScope = normalizeAnnouncementAudienceScope(scope);
    const normalizedValue = String(value || "").trim();

    if (normalizedScope === "course" && normalizedValue) {
        return normalizedValue;
    }

    if (normalizedScope === "batch" && normalizedValue) {
        return `Batch ${normalizedValue}`;
    }

    return "All alumni";
};

const getAnnouncementAudienceRecipients = async (scope: string, value: string | null) => {
    if (scope === "all" || !value) {
        return getAlumniUserIds();
    }

    const column = scope === "course" ? "course" : "batch";
    const normalizedValue = scope === "course" ? normalizeText(value) : normalizeBatch(value);
    const rows = parseRows(await db.query(
        `SELECT p.id
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id
         WHERE ur.role = 'alumni'
           AND COALESCE(ur.archived, 0) = 0
           AND LOWER(COALESCE(p.${column}, '')) = LOWER(?)`,
        [normalizedValue]
    ));

    return rows.map((row) => String(row.id));
};

const getAnnouncementStatusFallback = (type: string | null | undefined) => {
    return normalizeAnnouncementType(type) === "event" ? "upcoming" : "active";
};

const formatStatusLabel = (value: string | null | undefined, fallback = "pending") => {
    const normalized = normalizeStatus(value, fallback);
    return normalized
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeDonationStatus = (value: unknown) => {
    const normalized = normalizeStatus(String(value || "pending_review"), "pending_review");
    if (normalized === "pending") {
        return "pending_review";
    }

    if (normalized === "approved" || normalized === "rejected" || normalized === "pending_review") {
        return normalized;
    }

    return "pending_review";
};

const normalizeAnnouncementApprovalStatus = (value: unknown, fallback = "approved") => {
    const normalized = normalizeStatus(String(value || fallback), fallback);
    if (normalized === "pending" || normalized === "pending_review") {
        return "pending_approval";
    }

    if (normalized === "approved" || normalized === "published") {
        return "approved";
    }

    if (normalized === "rejected") {
        return "rejected";
    }

    return fallback;
};

const canModerateAnnouncementContent = (role: string | null | undefined) => {
    return normalizeStatus(role, "alumni") !== "alumni";
};

const normalizeAchievementReactionType = (value: unknown): AchievementReactionType | null => {
    const normalized = normalizeStatus(String(value || ""), "");
    return (ACHIEVEMENT_REACTION_TYPES as readonly string[]).includes(normalized)
        ? normalized as AchievementReactionType
        : null;
};

const normalizeStoredMedia = (value: string | null | undefined) => {
    if (!value) return null;

    const trimmed = value.trim();

    if (!trimmed) return null;
    if (trimmed.startsWith("data:")) return trimmed;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return APP_BASE_URL ? `${APP_BASE_URL}${trimmed}` : trimmed;
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 80) {
        return `data:image/jpeg;base64,${trimmed}`;
    }

    return trimmed;
};

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

const normalizeText = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");

const normalizePhone = (value: unknown) => String(value || "").replace(/[^\d+]/g, "").trim();

const normalizeBatch = (value: unknown) => String(value || "").trim();

const normalizeSupportedCourse = (value: unknown) => normalizeCourseCode(normalizeText(value));

const validateSupportedCourse = (value: unknown) => {
    const normalizedCourse = normalizeSupportedCourse(value);

    if (!normalizedCourse) {
        return {
            ok: false,
            course: null,
            message: `Course must be one of: ${SYSTEM_COURSES.join(", ")}.`,
        };
    }

    return {
        ok: true,
        course: normalizedCourse,
        message: "",
    };
};

const getUserSettings = async (userId: string) => {
    const row = await getSingleRow<UserSettingsRow>(
        `SELECT user_id, allow_event_alerts, allow_survey_reminders, allow_email_notifications, allow_in_app_notifications
         FROM user_settings
         WHERE user_id = ?`,
        [userId]
    );

    return {
        emailNotifications: Boolean(row?.allow_email_notifications ?? 1),
        inAppNotifications: Boolean(row?.allow_in_app_notifications ?? 1),
        eventAnnouncements: Boolean(row?.allow_event_alerts ?? 1),
        tracerNotifications: Boolean(row?.allow_survey_reminders ?? 1)
    };
};

const validateImportRow = (row: AlumniImportInputRow, rowNumber: number) => {
    const fullName = normalizeText(row.fullName);
    const graduationYear = normalizeBatch(row.graduationYear);
    const emailAddress = normalizeEmail(row.emailAddress);
    const contactNumber = normalizePhone(row.contactNumber);

    if (!fullName) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Full Name is required" } };
    }

    if (!graduationYear || !/^\d{4}$/.test(graduationYear)) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Graduation Year must be a 4-digit year" } };
    }

    if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Email Address is invalid" } };
    }

    if (!contactNumber) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Contact Number is required" } };
    }

    return {
        ok: true as const,
        prepared: {
            rowNumber,
            name: fullName,
            batch: graduationYear,
            email: emailAddress,
            contactNumber
        }
    };
};

const generateUniqueAlumniId = async (conn: PoolConnection, batch: string | null | undefined) => {
    const normalizedBatch = normalizeBatch(batch) || "ALUM";
    const prefix = `${normalizedBatch}-`;

    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT student_id
         FROM profiles
         WHERE student_id LIKE ?
         ORDER BY student_id DESC
         LIMIT 1`,
        [`${prefix}%`]
    );

    const latestId = Array.isArray(rows) && rows.length > 0 ? String(rows[0].student_id || "") : "";
    const latestSuffix = latestId.startsWith(prefix)
        ? Number.parseInt(latestId.slice(prefix.length), 10)
        : 0;

    let nextSequence = Number.isFinite(latestSuffix) ? latestSuffix + 1 : 1;

    while (true) {
        const alumniId = `${normalizedBatch}-${String(nextSequence).padStart(4, "0")}`;
        const [existing] = await conn.query<RowDataPacket[]>(
            "SELECT id FROM profiles WHERE student_id = ? LIMIT 1",
            [alumniId]
        );

        if (!Array.isArray(existing) || existing.length === 0) {
            return alumniId;
        }

        nextSequence += 1;
    }
};

const createAlumniAccount = async (conn: PoolConnection, {
    name,
    email,
    course,
    batch,
    contactNumber,
    photoBase64
}: {
    name: string;
    email: string;
    course?: string | null;
    batch?: string | null;
    contactNumber?: string | null;
    photoBase64?: string | null;
}) => {
    const alumniId = await generateUniqueAlumniId(conn, batch);
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(alumniId, 10);

    await conn.query(
        "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        [userId, email, hashedPassword]
    );

    await conn.query(
        `INSERT INTO profiles
        (id, name, email, student_id, course, batch, contact_number, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            name,
            email,
            alumniId,
            course || null,
            batch || null,
            contactNumber || null,
            normalizeStoredMedia(photoBase64) || null
        ]
    );

    await conn.query(
        "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
        [userId, "alumni"]
    );

    return { userId, alumniId };
};

const ensureDatabaseColumns = async () => {
    const tracerTable = await getTracerTableName();
    const announcementTable = await getAnnouncementTableName();
    const statements: Array<{ table: string; sql: string }> = [
        {
            table: tracerTable,
            sql: `ALTER TABLE ${tracerTable} ADD COLUMN industry VARCHAR(255) NULL`
        },
        {
            table: tracerTable,
            sql: `ALTER TABLE ${tracerTable} ADD COLUMN relevance VARCHAR(100) NULL`
        },
        {
            table: tracerTable,
            sql: `ALTER TABLE ${tracerTable} ADD COLUMN further_studies VARCHAR(100) NULL`
        },
        {
            table: tracerTable,
            sql: `ALTER TABLE ${tracerTable} ADD COLUMN certifications TEXT NULL`
        },
        {
            table: tracerTable,
            sql: `ALTER TABLE ${tracerTable} ADD COLUMN comments TEXT NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN type VARCHAR(100) NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN google_form_link TEXT NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN approval_status VARCHAR(50) NOT NULL DEFAULT 'approved'`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN created_by VARCHAR(36) NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN approved_by VARCHAR(36) NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN rejection_reason TEXT NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN audience_scope VARCHAR(20) NOT NULL DEFAULT 'all'`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN audience_value VARCHAR(255) NULL`
        },
        {
            table: "donations",
            sql: "ALTER TABLE donations ADD COLUMN receipt_url LONGTEXT NULL"
        },
        {
            table: "donations",
            sql: "ALTER TABLE donations ADD COLUMN reviewed_at DATETIME NULL"
        },
        {
            table: "donations",
            sql: "ALTER TABLE donations ADD COLUMN reviewed_by VARCHAR(36) NULL"
        },
        {
            table: "donations",
            sql: "ALTER TABLE donations ADD COLUMN review_notes TEXT NULL"
        },
        {
            table: "user_roles",
            sql: "ALTER TABLE user_roles ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0"
        },
        {
            table: "freedom_wall_posts",
            sql: "ALTER TABLE freedom_wall_posts ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Discussion'"
        }
    ];

    for (const { table, sql } of statements) {
        try {
            if (!(await tableExists(table))) {
                continue;
            }

            await db.execute(sql);
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            const alreadyExists =
                message.includes("Duplicate column name") ||
                message.includes("check that column/key exists") ||
                (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_FIELDNAME");
            const missingTable =
                typeof error === "object" && error !== null && "code" in error && error.code === "ER_NO_SUCH_TABLE";

            if (!alreadyExists && !missingTable) {
                console.error("SCHEMA UPDATE ERROR:", sql, error);
            }
        }
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(36) PRIMARY KEY,
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'email',
                status VARCHAR(50) DEFAULT 'sent',
                recipients VARCHAR(100) DEFAULT 'all',
                recipient_count INT DEFAULT 0,
                sent_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(36) NULL
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE notifications", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                category VARCHAR(100) DEFAULT 'general',
                link_url VARCHAR(255) DEFAULT NULL,
                is_read TINYINT(1) DEFAULT 0,
                actor_id VARCHAR(36) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_notifications_user (user_id),
                INDEX idx_user_notifications_read (user_id, is_read),
                INDEX idx_user_notifications_created (created_at)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE user_notifications", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_settings (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                resume_url LONGTEXT,
                privacy_profile_visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
                privacy_employment_visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
                allow_event_alerts TINYINT(1) DEFAULT 1,
                allow_survey_reminders TINYINT(1) DEFAULT 1,
                allow_community_notifications TINYINT(1) DEFAULT 1,
                allow_email_notifications TINYINT(1) DEFAULT 1,
                allow_in_app_notifications TINYINT(1) DEFAULT 1,
                theme_preference ENUM('system', 'light', 'dark') DEFAULT 'system',
                language_preference VARCHAR(20) DEFAULT 'en',
                timezone VARCHAR(100) DEFAULT 'Asia/Manila',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_user_settings_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE user_settings", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS officer_school_year (
                id INT AUTO_INCREMENT PRIMARY KEY,
                start_year SMALLINT NOT NULL,
                end_year SMALLINT NOT NULL,
                label VARCHAR(25) NOT NULL,
                is_current TINYINT(1) DEFAULT 0,
                created_by VARCHAR(36) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_officer_school_year_label (label),
                UNIQUE KEY uq_officer_school_year_range (start_year, end_year),
                INDEX idx_officer_school_year_current (is_current),
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE officer_school_year", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS officers (
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (school_year_id) REFERENCES officer_school_year(id) ON DELETE CASCADE,
                FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_officers_school_year (school_year_id, display_order),
                INDEX idx_officers_alumni (alumni_id),
                INDEX idx_officers_position (position)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE officers", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS imported_alumni_records (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_imported_alumni_batch (import_batch_id),
                INDEX idx_imported_alumni_profile (imported_profile_id),
                INDEX idx_imported_alumni_email (email_address),
                FOREIGN KEY (imported_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
                FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE imported_alumni_records", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS achievement_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                achievement_id INT NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_achievement_comments_achievement (achievement_id, created_at),
                INDEX idx_achievement_comments_user (user_id)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE achievement_comments", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS achievement_reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                achievement_id INT NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                reaction_type VARCHAR(20) NOT NULL DEFAULT 'heart',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_achievement_reactions_user (achievement_id, user_id),
                INDEX idx_achievement_reactions_achievement (achievement_id),
                INDEX idx_achievement_reactions_user (user_id)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE achievement_reactions", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS freedom_wall_posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                content TEXT NOT NULL,
                image_url LONGTEXT DEFAULT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'Discussion',
                visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
                status ENUM('published', 'hidden', 'reported', 'deleted') DEFAULT 'published',
                is_pinned TINYINT(1) DEFAULT 0,
                pinned_by VARCHAR(36) DEFAULT NULL,
                report_count INT DEFAULT 0,
                edited_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_wall_posts_user (user_id),
                INDEX idx_wall_posts_status (status),
                INDEX idx_wall_posts_pinned (is_pinned),
                INDEX idx_wall_posts_created_at (created_at)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE freedom_wall_posts", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS freedom_wall_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                parent_id INT DEFAULT NULL,
                content TEXT NOT NULL,
                status ENUM('published', 'hidden', 'reported', 'deleted') DEFAULT 'published',
                edited_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES freedom_wall_posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES freedom_wall_comments(id) ON DELETE CASCADE,
                INDEX idx_wall_comments_post (post_id),
                INDEX idx_wall_comments_user (user_id),
                INDEX idx_wall_comments_parent (parent_id)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE freedom_wall_comments", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                target_type ENUM('freedom_wall_post', 'freedom_wall_comment') NOT NULL,
                target_id INT NOT NULL,
                reaction_type ENUM('heart') DEFAULT 'heart',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_reactions_user_target (user_id, target_type, target_id),
                INDEX idx_reactions_target (target_type, target_id),
                INDEX idx_reactions_user (user_id)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE reactions", error);
    }
};

const buildAuthPayload = async (user: { id: string; email: string }) => {
    const currentUser = await getUserForAuth(user.id);
    const role = await getRoleForUser(user.id);
    const profile = await getProfileForUser(user.id);
    const isTracerCompleted = role === "alumni"
        ? await getTracerCompletionStatus(user.id)
        : true;

    return {
        role,
        profile,
        user: {
            id: user.id,
            email: currentUser?.email ? String(currentUser.email) : user.email
        },
        isTracerCompleted
    };
};

const getChairmanAlumniData = async (course: string) => {
    const tracerTable = await getTracerTableName();

    const rows = parseRows(await db.query(
        `SELECT
            p.id,
            p.name,
            p.email,
            p.student_id,
            p.batch,
            p.course,
            p.created_at,
            gt.employment_status,
            gt.company,
            gt.job_title,
            gt.work_location,
            gt.created_at AS tracer_created_at,
            COALESCE(er.event_count, 0) AS event_count,
            COALESCE(ec.comment_count, 0) AS comment_count,
            COALESCE(d.donation_count, 0) AS donation_count,
            COALESCE(tr.tracer_count, 0) AS tracer_count
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni'
         LEFT JOIN ${tracerTable} gt ON gt.user_id = p.id
         LEFT JOIN (
            SELECT alumni_id, COUNT(*) AS event_count
            FROM event_registrations
            GROUP BY alumni_id
         ) er ON er.alumni_id = p.id
         LEFT JOIN (
            SELECT alumni_id, COUNT(*) AS comment_count
            FROM event_comments
            GROUP BY alumni_id
         ) ec ON ec.alumni_id = p.id
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS donation_count
            FROM donations
            GROUP BY user_id
         ) d ON d.user_id = p.id
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS tracer_count
            FROM ${tracerTable}
            GROUP BY user_id
         ) tr ON tr.user_id = p.id
         WHERE p.course = ?
         ORDER BY COALESCE(gt.created_at, p.created_at) DESC, p.name ASC`,
        [course]
    ));

    return rows.map((row) => {
        const engagementScore =
            Number(row.event_count || 0) +
            Number(row.comment_count || 0) +
            Number(row.donation_count || 0) +
            Number(row.tracer_count || 0);

        return {
            id: String(row.id),
            name: String(row.name || ""),
            email: String(row.email || ""),
            student_id: row.student_id ? String(row.student_id) : null,
            batch: row.batch ? String(row.batch) : null,
            course: row.course ? String(row.course) : null,
            employment_status: row.employment_status ? String(row.employment_status) : null,
            company: row.company ? String(row.company) : null,
            job_title: row.job_title ? String(row.job_title) : null,
            work_location: row.work_location ? String(row.work_location) : null,
            event_count: Number(row.event_count || 0),
            comment_count: Number(row.comment_count || 0),
            donation_count: Number(row.donation_count || 0),
            tracer_count: Number(row.tracer_count || 0),
            created_at: row.created_at ? String(row.created_at) : null,
            tracer_created_at: row.tracer_created_at ? String(row.tracer_created_at) : null,
            engagementScore,
            engagement:
                engagementScore >= 4
                    ? "High"
                    : engagementScore >= 2
                        ? "Medium"
                        : "Low",
        };
    });
};

const getAdminUserIds = async () => {
    const rows = parseRows(await db.query(
        `SELECT user_id
         FROM user_roles
         WHERE role <> 'alumni'`
    ));

    return rows.map((row) => String(row.user_id));
};

const getAlumniUserIds = async () => {
    const rows = parseRows(await db.query(
        `SELECT user_id
         FROM user_roles
         WHERE role = 'alumni'`
    ));

    return rows.map((row) => String(row.user_id));
};

const getFreedomWallPostSocialData = async (postIds: number[], userId: string | null | undefined) => {
    const reactionCounts = new Map<number, Record<FreedomWallReactionType, number>>();
    const currentReactions = new Map<number, FreedomWallReactionType | null>();
    const commentCounts = new Map<number, number>();

    if (postIds.length === 0) {
        return { reactionCounts, currentReactions, commentCounts };
    }

    postIds.forEach((postId) => {
        reactionCounts.set(postId, {
            heart: 0
        });
        commentCounts.set(postId, 0);
        currentReactions.set(postId, null);
    });

    const placeholders = postIds.map(() => "?").join(", ");

    const reactionRows = parseRows(await db.query(
        `SELECT target_id, reaction_type, COUNT(*) AS total
         FROM reactions
         WHERE target_type = 'freedom_wall_post' AND target_id IN (${placeholders})
         GROUP BY target_id, reaction_type`,
        postIds
    ));

    reactionRows.forEach((row) => {
        const postId = Number(row.target_id);
        const reactionType = normalizeFreedomWallReactionType(row.reaction_type);
        if (!reactionType) return;

        const current = reactionCounts.get(postId) || {
            heart: 0
        };

        current[reactionType] = Number(row.total || 0);
        reactionCounts.set(postId, current);
    });

    const commentRows = parseRows(await db.query(
        `SELECT post_id, COUNT(*) AS total
         FROM freedom_wall_comments
         WHERE status = 'published' AND post_id IN (${placeholders})
         GROUP BY post_id`,
        postIds
    ));

    commentRows.forEach((row) => {
        commentCounts.set(Number(row.post_id), Number(row.total || 0));
    });

    if (userId) {
        const currentReactionRows = parseRows(await db.query(
            `SELECT target_id, reaction_type
             FROM reactions
             WHERE user_id = ? AND target_type = 'freedom_wall_post' AND target_id IN (${placeholders})`,
            [userId, ...postIds]
        ));

        currentReactionRows.forEach((row) => {
            const reactionType = normalizeFreedomWallReactionType(row.reaction_type);
            if (!reactionType) return;
            currentReactions.set(Number(row.target_id), reactionType);
        });
    }

    return { reactionCounts, currentReactions, commentCounts };
};

const createUserNotification = async ({
    userId,
    title,
    message,
    category,
    linkUrl,
    actorId
}: {
    userId: string;
    title: string;
    message: string;
    category: string;
    linkUrl?: string | null;
    actorId?: string | null;
}) => {
    if (!userId) return;
    if (actorId && actorId === userId) return;

    await db.execute(
        `INSERT INTO user_notifications
            (id, user_id, title, message, category, link_url, is_read, created_at, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), ?)`,
        [uuidv4(), userId, title, message, category, linkUrl || null, actorId || null]
    );
};

const createUserNotifications = async ({
    userIds,
    title,
    message,
    category,
    linkUrl,
    actorId
}: {
    userIds: string[];
    title: string;
    message: string;
    category: string;
    linkUrl?: string | null;
    actorId?: string | null;
}) => {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))].filter((userId) => !(actorId && userId === actorId));

    await Promise.all(uniqueUserIds.map((userId) =>
        createUserNotification({
            userId,
            title,
            message,
            category,
            linkUrl,
            actorId
        })
    ));
};

const STALE_TRACER_NOTIFICATION_TITLE = "Graduate tracer update needed";
const STALE_TRACER_NOTIFICATION_CATEGORY = "tracer";
const STALE_TRACER_NOTIFICATION_LINK = "/alumni/tracer";
const TWO_YEARS_IN_MS = 1000 * 60 * 60 * 24 * 365 * 2;

const syncStaleTracerNotification = async (userId: string) => {
    if (!userId) return;

    const tracerTable = await getTracerTableName();
    const activitySelect = tracerTable === "tracer_form"
        ? "updated_at, submitted_at, created_at"
        : "updated_at, NULL AS submitted_at, created_at";

    const tracerRow = await getSingleRow(
        `SELECT ${activitySelect}
         FROM ${tracerTable}
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );

    const deleteReminder = async () => {
        await db.execute(
            `DELETE FROM user_notifications
             WHERE user_id = ? AND category = ? AND link_url = ? AND title = ?`,
            [userId, STALE_TRACER_NOTIFICATION_CATEGORY, STALE_TRACER_NOTIFICATION_LINK, STALE_TRACER_NOTIFICATION_TITLE]
        );
    };

    if (!tracerRow) {
        await deleteReminder();
        return;
    }

    const activityValue = String(tracerRow.updated_at || tracerRow.submitted_at || tracerRow.created_at || "").trim();
    const activityDate = activityValue ? new Date(activityValue) : null;
    const isStale = activityDate && !Number.isNaN(activityDate.getTime()) && (Date.now() - activityDate.getTime() >= TWO_YEARS_IN_MS);

    if (!isStale) {
        await deleteReminder();
        return;
    }

    const existingReminder = await getSingleRow(
        `SELECT id
         FROM user_notifications
         WHERE user_id = ? AND category = ? AND link_url = ? AND title = ?
         LIMIT 1`,
        [userId, STALE_TRACER_NOTIFICATION_CATEGORY, STALE_TRACER_NOTIFICATION_LINK, STALE_TRACER_NOTIFICATION_TITLE]
    );

    if (existingReminder) {
        return;
    }

    await db.execute(
        `INSERT INTO user_notifications
            (id, user_id, title, message, category, link_url, is_read, created_at, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NULL)`,
        [
            uuidv4(),
            userId,
            STALE_TRACER_NOTIFICATION_TITLE,
            "Your graduate tracer record has not been updated for 2 years. Please review and update it.",
            STALE_TRACER_NOTIFICATION_CATEGORY,
            STALE_TRACER_NOTIFICATION_LINK
        ]
    );
};

const getAchievementSocialData = async (achievementIds: number[], userId: string | null | undefined) => {
    const reactionCounts = new Map<number, Record<AchievementReactionType, number>>();
    const currentReactions = new Map<number, AchievementReactionType | null>();
    const commentCounts = new Map<number, number>();

    if (achievementIds.length === 0) {
        return { reactionCounts, currentReactions, commentCounts };
    }

    achievementIds.forEach((achievementId) => {
        reactionCounts.set(achievementId, {
            heart: 0
        });
        commentCounts.set(achievementId, 0);
        currentReactions.set(achievementId, null);
    });

    const placeholders = achievementIds.map(() => "?").join(", ");
    const reactionRows = parseRows(await db.query(
        `SELECT achievement_id, reaction_type, COUNT(*) AS total
         FROM achievement_reactions
         WHERE achievement_id IN (${placeholders})
         GROUP BY achievement_id, reaction_type`,
        achievementIds
    ));

    reactionRows.forEach((row) => {
        const achievementId = Number(row.achievement_id);
        const reactionType = normalizeAchievementReactionType(row.reaction_type);
        if (!reactionType) return;

        const current = reactionCounts.get(achievementId) || {
            heart: 0
        };
        current[reactionType] = Number(row.total || 0);
        reactionCounts.set(achievementId, current);
    });

    const commentRows = parseRows(await db.query(
        `SELECT achievement_id, COUNT(*) AS total
         FROM achievement_comments
         WHERE achievement_id IN (${placeholders})
         GROUP BY achievement_id`,
        achievementIds
    ));

    commentRows.forEach((row) => {
        commentCounts.set(Number(row.achievement_id), Number(row.total || 0));
    });

    if (userId) {
        const userReactionRows = parseRows(await db.query(
            `SELECT achievement_id, reaction_type
             FROM achievement_reactions
             WHERE user_id = ? AND achievement_id IN (${placeholders})`,
            [userId, ...achievementIds]
        ));

        userReactionRows.forEach((row) => {
            const reactionType = normalizeAchievementReactionType(row.reaction_type);
            if (!reactionType) return;
            currentReactions.set(Number(row.achievement_id), reactionType);
        });
    }

    return { reactionCounts, currentReactions, commentCounts };
};

const getAchievementAccess = async (achievementId: number, userId: string) => {
    const achievement = await getSingleRow(
        `SELECT id, alumni_id, title, status
         FROM achievements
         WHERE id = ?`,
        [achievementId]
    );

    if (!achievement) {
        return { achievement: null, canAccess: false, canModerate: false };
    }

    const role = await getRoleForUser(userId);
    const canModerate = role !== "alumni";
    const canAccess = canModerate || normalizeStatus(achievement.status, "pending") === "approved" || String(achievement.alumni_id) === userId;

    return { achievement, canAccess, canModerate };
};

const ensureDefaultAdmin = async () => {
    const existingUser = await getSingleRow(
        "SELECT id FROM users WHERE email = ?",
        [ADMIN_EMAIL]
    );

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const adminId = existingUser?.id || uuidv4();

    if (!existingUser) {
        await db.execute(
            "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
            [adminId, ADMIN_EMAIL, passwordHash]
        );
    } else {
        await db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [passwordHash, adminId]
        );
    }

    const existingProfile = await getSingleRow(
        "SELECT id FROM profiles WHERE id = ?",
        [adminId]
    );

    if (!existingProfile) {
        await db.execute(
            "INSERT INTO profiles (id, name, email) VALUES (?, ?, ?)",
            [adminId, ADMIN_NAME, ADMIN_EMAIL]
        );
    } else {
        await db.execute(
            "UPDATE profiles SET name = ?, email = ? WHERE id = ?",
            [ADMIN_NAME, ADMIN_EMAIL, adminId]
        );
    }

    const existingRole = await getSingleRow(
        "SELECT user_id FROM user_roles WHERE user_id = ?",
        [adminId]
    );

    if (!existingRole) {
        await db.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
            [adminId, "president"]
        );
    } else {
        await db.execute(
            "UPDATE user_roles SET role = ? WHERE user_id = ?",
            ["president", adminId]
        );
    }

    console.log(`✅ Default admin ensured for ${ADMIN_EMAIL}`);
};

const ensureChairmanAccounts = async () => {
    for (const courseOption of COURSE_OPTIONS) {
        const existingChairman = await getSingleRow(
            `SELECT ur.user_id
             FROM user_roles ur
             INNER JOIN profiles p ON p.id = ur.user_id
             WHERE ur.role = 'chairman' AND p.course = ?
             LIMIT 1`,
            [courseOption.code]
        );

        if (existingChairman?.user_id) {
            continue;
        }

        const existingUser = await getSingleRow(
            "SELECT id FROM users WHERE email = ?",
            [courseOption.chairmanEmail]
        );

        const chairmanId = existingUser?.id ? String(existingUser.id) : uuidv4();
        const passwordHash = await bcrypt.hash(courseOption.chairmanPassword, 10);

        if (!existingUser) {
            await db.execute(
                "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
                [chairmanId, courseOption.chairmanEmail, passwordHash]
            );
        } else {
            await db.execute(
                "UPDATE users SET email = ?, password_hash = ? WHERE id = ?",
                [courseOption.chairmanEmail, passwordHash, chairmanId]
            );
        }

        const existingProfile = await getSingleRow(
            "SELECT id FROM profiles WHERE id = ?",
            [chairmanId]
        );

        if (!existingProfile) {
            await db.execute(
                "INSERT INTO profiles (id, name, email, course) VALUES (?, ?, ?, ?)",
                [chairmanId, courseOption.chairmanName, courseOption.chairmanEmail, courseOption.code]
            );
        } else {
            await db.execute(
                "UPDATE profiles SET name = ?, email = ?, course = ? WHERE id = ?",
                [courseOption.chairmanName, courseOption.chairmanEmail, courseOption.code, chairmanId]
            );
        }

        const existingRole = await getSingleRow(
            "SELECT user_id FROM user_roles WHERE user_id = ?",
            [chairmanId]
        );

        if (!existingRole) {
            await db.execute(
                "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
                [chairmanId, "chairman"]
            );
        } else {
            await db.execute(
                "UPDATE user_roles SET role = ? WHERE user_id = ?",
                ["chairman", chairmanId]
            );
        }
    }
};

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(process.cwd(), "../public")));

const requireAdmin = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const role = await getRoleForUser(req.user.id);

        if (!["president", "admin", "chairman", "vice_president", "secretary",
            "assistant_secretary", "treasurer", "assistant_treasurer", "auditor", "pio", "appointed"].includes(role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        next();
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
};

const requireChairman = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const role = await getRoleForUser(req.user.id);

        if (role !== "chairman") {
            return res.status(403).json({ error: "Chairman access required" });
        }

        const course = await getChairmanCourseForUser(req.user.id);

        if (!course) {
            return res.status(400).json({ error: "Chairman account must be assigned to a supported course." });
        }

        next();
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
};

/* =========================
   STARTUP INIT
========================= */
ensureDefaultAdmin().catch((error) => {
    console.error("DEFAULT ADMIN INIT ERROR:", error);
});

ensureChairmanAccounts().catch((error) => {
    console.error("CHAIRMAN ACCOUNT INIT ERROR:", error);
});

ensureDatabaseColumns().catch((error) => {
    console.error("DATABASE COLUMN INIT ERROR:", error);
});

/* =========================
   TEST ROUTE
========================= */
app.get("/api/test", async (_req, res) => {
    try {
        const rows = await db.query<QueryRow>("SELECT 1 + 1 AS result");
        res.json(parseRows(rows));
    } catch (err: unknown) {
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* ROOT */
app.get("/", (_req, res) => {
    res.send("SERVER WORKING ✅");
});

/* =========================
   REGISTER ADMIN
========================= */
app.post("/api/auth/setup-admin", async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const existing = await getSingleRow(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existing) {
            return res.status(400).json({ error: "User already exists" });
        }

        const id = uuidv4();
        const hash = await bcrypt.hash(password, 10);

        await db.execute(
            "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
            [id, email, hash]
        );

        await db.execute(
            "INSERT INTO profiles (id, name, email) VALUES (?, ?, ?)",
            [id, name, email]
        );

        await db.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
            [id, "president"]
        );

        res.json({ success: true, userId: id });
    } catch (err: unknown) {
        console.error("SETUP ADMIN ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const identifier = String(email || "").trim();

        if (!identifier || !password) {
            return res.status(400).json({ error: "Missing credentials" });
        }

        const users = parseRows(await db.query(
            `SELECT u.*
             FROM users u
             LEFT JOIN profiles p ON p.id = u.id
             WHERE u.email = ? OR p.student_id = ?
             LIMIT 1`,
            [identifier, identifier]
        ));

        if (!users.length) {
            return res.status(400).json({ error: "User not found" });
        }

        const user = users[0];

        if (!user?.password_hash) {
            return res.status(500).json({ error: "Invalid database: missing password_hash" });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        const authPayload = await buildAuthPayload({
            id: user.id,
            email: user.email
        });

        res.json({
            token,
            ...authPayload
        });
    } catch (err: unknown) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   SESSION (restore auth state)
========================= */
app.get("/api/auth/session", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user) {
            return res.sendStatus(401);
        }

        const authPayload = await buildAuthPayload({
            id: req.user.id,
            email: req.user.email
        });

        res.json(authPayload);
    } catch (err: unknown) {
        console.error("SESSION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/auth/tracer-status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const role = await getRoleForUser(req.user.id);
        const isTracerCompleted = role === "alumni"
            ? await getTracerCompletionStatus(req.user.id)
            : true;

        res.json({ isTracerCompleted });
    } catch (err: unknown) {
        console.error("TRACER STATUS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/account/settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const settings = await getUserSettings(req.user.id);
        res.json({ settings });
    } catch (err: unknown) {
        console.error("GET ACCOUNT SETTINGS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/account/profile", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const {
            fullName,
            email,
            contactNumber,
            course,
            yearGraduated,
            photo
        } = req.body || {};

        const normalizedName = normalizeText(fullName);
        const normalizedEmail = normalizeEmail(email);
        const normalizedContactNumber = normalizePhone(contactNumber) || null;
        const normalizedCourse = normalizeText(course) || null;
        const normalizedYearGraduated = normalizeBatch(yearGraduated) || null;
        const normalizedPhoto = typeof photo === "string"
            ? normalizeStoredMedia(photo) || null
            : null;

        if (!normalizedName) {
            return res.status(400).json({ error: "Full name is required." });
        }

        if (!normalizedEmail || !/\S+@\S+\.\S+/.test(normalizedEmail)) {
            return res.status(400).json({ error: "A valid email address is required." });
        }

        if (normalizedCourse) {
            const courseValidation = validateSupportedCourse(normalizedCourse);

            if (!courseValidation.ok || !courseValidation.course) {
                return res.status(400).json({ error: courseValidation.message });
            }
        }

        const existingUser = await getSingleRow(
            `SELECT id
             FROM users
             WHERE email = ? AND id <> ?
             LIMIT 1`,
            [normalizedEmail, req.user.id]
        );

        if (existingUser) {
            return res.status(400).json({ error: "Email address is already in use." });
        }

        await db.execute(
            `UPDATE users
             SET email = ?
             WHERE id = ?`,
            [normalizedEmail, req.user.id]
        );

        await db.execute(
            `UPDATE profiles
             SET name = ?, email = ?, contact_number = ?, course = ?, batch = ?, photo = ?
             WHERE id = ?`,
            [
                normalizedName,
                normalizedEmail,
                normalizedContactNumber,
                normalizedCourse ? normalizeSupportedCourse(normalizedCourse) : null,
                normalizedYearGraduated,
                normalizedPhoto,
                req.user.id
            ]
        );

        const authPayload = await buildAuthPayload({
            id: req.user.id,
            email: normalizedEmail
        });

        res.json({
            success: true,
            message: "Profile updated successfully.",
            ...authPayload
        });
    } catch (err: unknown) {
        console.error("UPDATE ACCOUNT PROFILE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/account/password", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const { currentPassword, newPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current password and new password are required." });
        }

        if (String(newPassword).length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters." });
        }

        const account = await getSingleRow(
            `SELECT password_hash
             FROM users
             WHERE id = ?`,
            [req.user.id]
        );

        if (!account?.password_hash) {
            return res.status(404).json({ error: "User account not found." });
        }

        const matches = await bcrypt.compare(String(currentPassword), String(account.password_hash));
        if (!matches) {
            return res.status(400).json({ error: "Current password is incorrect." });
        }

        const passwordHash = await bcrypt.hash(String(newPassword), 10);
        await db.execute(
            `UPDATE users
             SET password_hash = ?
             WHERE id = ?`,
            [passwordHash, req.user.id]
        );

        res.json({
            success: true,
            message: "Password updated successfully."
        });
    } catch (err: unknown) {
        console.error("UPDATE ACCOUNT PASSWORD ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/account/notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const {
            emailNotifications,
            inAppNotifications,
            eventAnnouncements,
            tracerNotifications
        } = req.body || {};

        await db.execute(
            `INSERT INTO user_settings
                (user_id, allow_email_notifications, allow_in_app_notifications, allow_event_alerts, allow_survey_reminders)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                allow_email_notifications = VALUES(allow_email_notifications),
                allow_in_app_notifications = VALUES(allow_in_app_notifications),
                allow_event_alerts = VALUES(allow_event_alerts),
                allow_survey_reminders = VALUES(allow_survey_reminders)`,
            [
                req.user.id,
                emailNotifications ? 1 : 0,
                inAppNotifications ? 1 : 0,
                eventAnnouncements ? 1 : 0,
                tracerNotifications ? 1 : 0
            ]
        );

        const settings = await getUserSettings(req.user.id);
        res.json({
            success: true,
            message: "Notification settings updated successfully.",
            settings
        });
    } catch (err: unknown) {
        console.error("UPDATE ACCOUNT NOTIFICATIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   PROFILES / ALUMNI
========================= */
app.get("/api/profiles", authenticateToken, async (_req, res) => {
    try {
        const rows = parseRows(await db.query(
            `SELECT 
                p.id,
                p.name,
                p.email,
                p.student_id,
                p.course,
                p.batch,
                p.contact_number,
                p.photo,
                p.created_at,
                ur.role
            FROM profiles p
            LEFT JOIN user_roles ur ON ur.user_id = p.id
            ORDER BY p.name ASC`
        ));

        res.json(rows);
    } catch (err: unknown) {
        console.error("GET PROFILES ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/profiles", authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        const {
            name,
            email,
            course,
            batch,
            contactNumber,
            photoBase64,
            sendEmail: shouldSend
        } = _req.body || {};

        if (!name || !email) {
            return res.status(400).json({ error: "Name and email are required" });
        }

        const normalizedName = normalizeText(name);
        const normalizedEmail = normalizeEmail(email);
        const normalizedBatch = normalizeBatch(batch);
        const normalizedContactNumber = normalizePhone(contactNumber) || null;
        const courseValidation = validateSupportedCourse(course);

        if (!normalizedEmail || !/\S+@\S+\.\S+/.test(normalizedEmail)) {
            return res.status(400).json({ error: "A valid email address is required." });
        }

        if (!normalizedBatch || !/^\d{4}$/.test(normalizedBatch)) {
            return res.status(400).json({ error: "Batch year is required and must be a 4-digit year." });
        }

        if (!courseValidation.ok || !courseValidation.course) {
            return res.status(400).json({ error: courseValidation.message });
        }

        const [existing] = await conn.query<RowDataPacket[]>(
            "SELECT id FROM users WHERE email = ?",
            [normalizedEmail]
        );

        if (Array.isArray(existing) && existing.length > 0) {
            return res.status(400).json({ error: "Email already exists" });
        }

        await conn.beginTransaction();

        const { alumniId } = await createAlumniAccount(conn, {
            name: normalizedName,
            email: normalizedEmail,
            course: courseValidation.course,
            batch: normalizedBatch,
            contactNumber: normalizedContactNumber,
            photoBase64: photoBase64 || null
        });

        let emailSent = false;
        let emailMessageId: string | null = null;

        if (shouldSend) {
            const emailResult = await sendEmail({
                to: normalizedEmail,
                name: normalizedName,
                alumniId
            });
            emailSent = true;
            emailMessageId = emailResult.messageId;
        }

        await conn.commit();

        res.json({
            success: true,
            alumniId,
            emailSent,
            emailMessageId
        });
    } catch (err: unknown) {
        await conn.rollback();
        console.error("CREATE ALUMNI ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

app.post("/api/profiles/import", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows as AlumniImportInputRow[] : [];
        const importBatchId = uuidv4();

        if (rows.length === 0) {
            return res.status(400).json({ error: "No alumni rows were provided" });
        }

        const validRows: AlumniImportPreparedRow[] = [];
        const failedRows: AlumniImportFailure[] = [];
        const seenEmails = new Set<string>();

        rows.forEach((row, index) => {
            const result = validateImportRow(row, index + 1);

            if (!result.ok) {
                failedRows.push(result.failure);
                return;
            }

            if (seenEmails.has(result.prepared.email)) {
                failedRows.push({
                    rowNumber: result.prepared.rowNumber,
                    fullName: result.prepared.name,
                    emailAddress: result.prepared.email,
                    reason: "Duplicate email found in the uploaded file"
                });
                return;
            }

            seenEmails.add(result.prepared.email);
            validRows.push(result.prepared);
        });

        const validEmails = validRows.map((row) => row.email);
        const existingEmailSet = new Set<string>();

        if (validEmails.length > 0) {
            const placeholders = validEmails.map(() => "?").join(", ");
            const [existingRows] = await conn.query<RowDataPacket[]>(
                `SELECT email FROM users WHERE LOWER(email) IN (${placeholders})`,
                validEmails
            );

            existingRows.forEach((row) => {
                existingEmailSet.add(normalizeEmail(row.email));
            });
        }

        const rowsToImport = validRows.filter((row) => {
            if (!existingEmailSet.has(row.email)) {
                return true;
            }

            failedRows.push({
                rowNumber: row.rowNumber,
                fullName: row.name,
                emailAddress: row.email,
                reason: "Email already exists in the database"
            });

            return false;
        });

        const importedRows: Array<{ rowNumber: number; alumniId: string; emailAddress: string; fullName: string; }> = [];

        if (rowsToImport.length > 0) {
            await conn.beginTransaction();

            for (const row of rowsToImport) {
                const { userId, alumniId } = await createAlumniAccount(conn, {
                    name: row.name,
                    email: row.email,
                    batch: row.batch,
                    contactNumber: row.contactNumber
                });

                await conn.query(
                    `INSERT INTO imported_alumni_records
                        (import_batch_id, imported_profile_id, full_name, graduation_year, email_address, contact_number, generated_alumni_id, status, imported_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?)`,
                    [
                        importBatchId,
                        userId,
                        row.name,
                        row.batch,
                        row.email,
                        row.contactNumber,
                        alumniId,
                        req.user?.id || null
                    ]
                );

                importedRows.push({
                    rowNumber: row.rowNumber,
                    alumniId,
                    emailAddress: row.email,
                    fullName: row.name
                });
            }

            await conn.commit();
        }

        res.json({
            success: true,
            summary: {
                totalRows: rows.length,
                validRows: validRows.length,
                importedRows: importedRows.length,
                failedRows: failedRows.length
            },
            importedRows,
            failedRows: failedRows.sort((a, b) => a.rowNumber - b.rowNumber)
        });
    } catch (err: unknown) {
        await conn.rollback();
        console.error("IMPORT ALUMNI ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

/* =========================
   ADMIN DASHBOARD
========================= */
app.get("/api/admin/dashboard", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const hasAnnouncementApprovalStatus = await columnExists(announcementTable, "approval_status");
        const totalAlumniRow = await getSingleRow(
            `SELECT COUNT(*) AS totalAlumni
             FROM user_roles
             WHERE role = 'alumni'`
        );

        const tracerTable = await getTracerTableName();

        const tracerRows = parseRows(await db.query(
            `SELECT 
                gt.user_id,
                gt.employment_status,
                gt.company,
                gt.work_location,
                gt.created_at,
                p.name,
                p.course,
                p.batch
            FROM ${tracerTable} gt
            LEFT JOIN profiles p ON p.id = gt.user_id
            ORDER BY gt.created_at DESC
            LIMIT 5`
        ));

        const tracerCountRow = await getSingleRow(
            `SELECT COUNT(*) AS tracerCount FROM ${tracerTable}`
        );

        const totalDonationsRow = await getSingleRow(
            "SELECT COALESCE(SUM(amount), 0) AS totalDonations FROM donations WHERE LOWER(status) = 'approved'"
        );

        const pendingDonations = parseRows<PendingDonationRow>(await db.query<PendingDonationRow>(
            `SELECT 
                d.id,
                d.amount,
                d.method,
                d.status,
                d.purpose,
                d.ref_number,
                d.message,
                d.created_at,
                d.user_id,
                p.name
            FROM donations d
            LEFT JOIN profiles p ON p.id = d.user_id
            WHERE LOWER(COALESCE(d.status, 'pending_review')) IN ('pending', 'pending_review')
            ORDER BY d.created_at DESC
            LIMIT 5`
        ));

        const upcomingEvents = parseRows<UpcomingEventRow>(await db.query<UpcomingEventRow>(
            `SELECT 
                e.id,
                e.title,
                e.description,
                e.date,
                e.time,
                e.venue,
                e.type,
                e.organizer,
                e.image_url,
                e.status,
                COUNT(er.id) AS regCount
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            WHERE LOWER(e.status) = 'upcoming'
            ${hasAnnouncementApprovalStatus ? "AND LOWER(COALESCE(e.approval_status, 'approved')) = 'approved'" : ""}
            GROUP BY e.id
            ORDER BY e.date ASC
            LIMIT 5`
        ));

        res.json({
            totalAlumni: Number(totalAlumniRow?.totalAlumni || 0),
            tracerCount: Number(tracerCountRow?.tracerCount || 0),
            tracerData: tracerRows,
            recentTracer: tracerRows,
            totalDonations: Number(totalDonationsRow?.totalDonations || 0),
            pendingDonations: pendingDonations.map((donation) => ({
                ...donation,
                status: formatStatusLabel(normalizeDonationStatus(donation.status), "pending_review"),
                profile: {
                    name: donation.name || "Unknown"
                }
            })),
            upcomingEvents: upcomingEvents.map((event) => ({
                ...event,
                id: String(event.id),
                image_url: normalizeStoredMedia(event.image_url),
                status: formatStatusLabel(event.status, "upcoming")
            }))
        });
    } catch (err: unknown) {
        console.error("ADMIN DASHBOARD ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/chairman/dashboard", authenticateToken, requireChairman, async (req: AuthenticatedRequest, res) => {
    try {
        const course = await getChairmanCourseForUser(req.user!.id);

        if (!course) {
            return res.status(400).json({ error: "Chairman account must be assigned to a supported course." });
        }

        const alumni = await getChairmanAlumniData(course);
        const employedCount = alumni.filter((item) =>
            ["Employed", "Self-Employed"].includes(item.employment_status || "")
        ).length;
        const tracerRespondents = alumni.filter((item) => item.tracer_count > 0).length;
        const activeParticipants = alumni.filter((item) => item.engagementScore > 0).length;

        res.json({
            course,
            courseLabel: COURSE_LABELS[course],
            summary: {
                totalAlumni: alumni.length,
                employedCount,
                employmentRate: alumni.length ? Math.round((employedCount / alumni.length) * 100) : 0,
                tracerRespondents,
                activeParticipants,
            },
            recentAlumni: alumni.slice(0, 6),
            careerSnapshots: alumni
                .filter((item) => item.employment_status || item.company || item.job_title)
                .slice(0, 4),
        });
    } catch (err: unknown) {
        console.error("GET CHAIRMAN DASHBOARD ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/chairman/alumni", authenticateToken, requireChairman, async (req: AuthenticatedRequest, res) => {
    try {
        const course = await getChairmanCourseForUser(req.user!.id);

        if (!course) {
            return res.status(400).json({ error: "Chairman account must be assigned to a supported course." });
        }

        res.json({
            course,
            courseLabel: COURSE_LABELS[course],
            alumni: await getChairmanAlumniData(course),
        });
    } catch (err: unknown) {
        console.error("GET CHAIRMAN ALUMNI ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/chairman/engagement", authenticateToken, requireChairman, async (req: AuthenticatedRequest, res) => {
    try {
        const course = await getChairmanCourseForUser(req.user!.id);

        if (!course) {
            return res.status(400).json({ error: "Chairman account must be assigned to a supported course." });
        }

        const tracerTable = await getTracerTableName();
        const alumni = await getChairmanAlumniData(course);
        const alumniIds = alumni.map((item) => item.id);
        const batchMetrics = new Map<string, {
            batch: string;
            alumni: number;
            active: number;
            employed: number;
            tracer: number;
            event_count: number;
            donation_count: number;
            engagementScore: number;
        }>();

        alumni.forEach((item) => {
            const batch = item.batch || "Unspecified";
            const existing = batchMetrics.get(batch) || {
                batch,
                alumni: 0,
                active: 0,
                employed: 0,
                tracer: 0,
                event_count: 0,
                donation_count: 0,
                engagementScore: 0,
            };

            existing.alumni += 1;
            existing.active += item.engagementScore > 0 ? 1 : 0;
            existing.employed += ["Employed", "Self-Employed"].includes(item.employment_status || "") ? 1 : 0;
            existing.tracer += item.tracer_count > 0 ? 1 : 0;
            existing.event_count += item.event_count;
            existing.donation_count += item.donation_count;
            existing.engagementScore += item.engagementScore;
            batchMetrics.set(batch, existing);
        });

        const topBatches = Array.from(batchMetrics.values())
            .sort((left, right) => {
                if (right.engagementScore !== left.engagementScore) {
                    return right.engagementScore - left.engagementScore;
                }

                return right.alumni - left.alumni;
            })
            .map((entry) => ({
                batch: entry.batch,
                score: entry.alumni ? Math.min(100, Math.round((entry.engagementScore / (entry.alumni * 4)) * 100)) : 0,
                participants: entry.active,
                events: entry.event_count,
                tracer: entry.tracer,
                employed: entry.employed,
            }));

        const recentMonths = Array.from({ length: 6 }, (_value, index) => {
            const date = new Date();
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() - (5 - index));
            return date;
        });

        const monthKey = (value: Date) => {
            const year = value.getUTCFullYear();
            const month = String(value.getUTCMonth() + 1).padStart(2, "0");
            return `${year}-${month}`;
        };

        const monthlyMap = new Map<string, { month: string; score: number; events: number; responses: number }>();

        recentMonths.forEach((date) => {
            monthlyMap.set(monthKey(date), {
                month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
                score: 0,
                events: 0,
                responses: 0,
            });
        });

        if (alumniIds.length > 0) {
            const placeholders = alumniIds.map(() => "?").join(", ");
            const tracerRows = parseRows(await db.query(
                `SELECT created_at
                 FROM ${tracerTable}
                 WHERE user_id IN (${placeholders})`,
                alumniIds
            ));

            tracerRows.forEach((row) => {
                const date = row.created_at ? new Date(String(row.created_at)) : null;
                if (!date || Number.isNaN(date.getTime())) return;
                const target = monthlyMap.get(monthKey(date));
                if (!target) return;
                target.responses += 1;
            });

            const registrationRows = parseRows(await db.query(
                `SELECT created_at
                 FROM event_registrations
                 WHERE alumni_id IN (${placeholders})`,
                alumniIds
            ));

            registrationRows.forEach((row) => {
                const date = row.created_at ? new Date(String(row.created_at)) : null;
                if (!date || Number.isNaN(date.getTime())) return;
                const target = monthlyMap.get(monthKey(date));
                if (!target) return;
                target.events += 1;
            });
        }

        const monthlyEngagement = Array.from(monthlyMap.values()).map((entry) => ({
            ...entry,
            score: entry.responses * 12 + entry.events * 8,
        }));

        const employedCount = alumni.filter((item) =>
            ["Employed", "Self-Employed"].includes(item.employment_status || "")
        ).length;
        const avgEngagementScore = topBatches.length
            ? Number((topBatches.reduce((sum, item) => sum + item.score, 0) / topBatches.length).toFixed(1))
            : 0;

        res.json({
            course,
            courseLabel: COURSE_LABELS[course],
            summary: {
                avgEngagementScore,
                eventParticipants: alumni.filter((item) => item.event_count > 0).length,
                tracerRespondents: alumni.filter((item) => item.tracer_count > 0).length,
                employedCount,
            },
            monthlyEngagement,
            topBatches,
            departmentMetrics: [
                {
                    department: course,
                    label: COURSE_LABELS[course],
                    alumni: alumni.length,
                    active: alumni.filter((item) => item.engagementScore > 0).length,
                    engagementScore: avgEngagementScore,
                    tracerRespondents: alumni.filter((item) => item.tracer_count > 0).length,
                },
            ],
        });
    } catch (err: unknown) {
        console.error("GET CHAIRMAN ENGAGEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   ALUMNI DASHBOARD
========================= */
app.get("/api/alumni/dashboard", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        const announcementTable = await getAnnouncementTableName();
        const hasAnnouncementApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const profile = await getSingleRow(`SELECT course, batch FROM profiles WHERE id = ?`, [req.user.id]);
        const audienceCourse = normalizeText(profile?.course).toLowerCase();
        const audienceBatch = normalizeBatch(profile?.batch).toLowerCase();

        const events = parseRows(await db.query(
            `SELECT id, title, description, date, time, venue, organizer, image_url, status, type, google_form_link
             FROM ${announcementTable}
             WHERE LOWER(status) IN ('upcoming', 'ongoing', 'active')
             ${hasAnnouncementApprovalStatus ? "AND LOWER(COALESCE(approval_status, 'approved')) = 'approved'" : ""}
             ${hasAudienceScope
                ? `AND (
                    LOWER(COALESCE(audience_scope, 'all')) = 'all'
                    OR (LOWER(COALESCE(audience_scope, 'all')) = 'course' AND LOWER(COALESCE(${hasAudienceValue ? "audience_value" : "''"}, '')) = ?)
                    OR (LOWER(COALESCE(audience_scope, 'all')) = 'batch' AND LOWER(COALESCE(${hasAudienceValue ? "audience_value" : "''"}, '')) = ?)
                )`
                : ""}
             ORDER BY
                CASE
                    WHEN LOWER(status) = 'ongoing' THEN 1
                    WHEN LOWER(status) = 'active' THEN 2
                    WHEN LOWER(status) = 'upcoming' THEN 3
                    ELSE 4
                END,
                date ASC
             LIMIT 20`,
            hasAudienceScope ? [audienceCourse, audienceBatch] : []
        ));

        const registrations = parseRows<RegistrationRow>(await db.query<RegistrationRow>(
            `SELECT event_id FROM event_registrations WHERE alumni_id = ?`,
            [req.user.id]
        ));

        const comments = parseRows(await db.query(
            `SELECT ec.id, ec.event_id, ec.content AS text, ec.created_at, p.name AS profile_name
             FROM event_comments ec
             LEFT JOIN profiles p ON p.id = ec.alumni_id
             ORDER BY ec.created_at DESC`
        ));

        const activeSchoolYear = await getActiveOfficerSchoolYear();
        const officers = activeSchoolYear
            ? await getOfficerRosterForSchoolYear(Number(activeSchoolYear.id))
            : [];

        res.json({
            events,
            registrations: registrations.map((r) => String(r.event_id)),
            comments,
            officers: officers.map((row) => ({
                name: row.name,
                role: normalizeOfficerPositionKey(row.position),
                positionLabel: formatOfficerPosition(String(row.position || ""), row.custom_position ? String(row.custom_position) : null),
                photo: normalizeStoredMedia(row.photo ? String(row.photo) : null),
                schoolYear: row.school_year
            }))
        });
    } catch (err: unknown) {
        console.error("ALUMNI DASHBOARD ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   GRADUATE TRACER (Admin)
========================= */
app.get("/api/graduate-tracer", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const tracerTable = await getTracerTableName();
        const tracerColumns = getTracerColumnNames(tracerTable);

        const rows = parseRows(await db.query(
            `SELECT
                gt.id,
                gt.user_id,
                p.name,
                p.email,
                p.student_id,
                p.course,
                p.batch,
                gt.employment_status,
                gt.company,
                gt.industry,
                gt.work_location,
                gt.job_title,
                gt.${tracerColumns.income} AS income,
                gt.relevance,
                gt.${tracerColumns.timeToJob} AS time_to_job,
                gt.further_studies,
                gt.certifications,
                gt.comments,
                gt.created_at
            FROM ${tracerTable} gt
            LEFT JOIN profiles p ON p.id = gt.user_id
            ORDER BY gt.created_at DESC`
        ));

        res.json(rows);
    } catch (err: unknown) {
        console.error("GET GRADUATE TRACER ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/admin/tracer", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const tracerTable = await getTracerTableName();
        const tracerColumns = getTracerColumnNames(tracerTable);
        const hasUpdatedAt = await columnExists(tracerTable, "updated_at");

        const rows = parseRows(await db.query(
            `SELECT
                gt.id,
                gt.user_id,
                p.name,
                p.email,
                p.student_id,
                p.course,
                p.batch,
                gt.employment_status,
                gt.company,
                gt.industry,
                gt.work_location,
                gt.job_title,
                gt.${tracerColumns.income} AS income,
                gt.relevance,
                gt.${tracerColumns.timeToJob} AS time_to_job,
                gt.further_studies,
                gt.certifications,
                gt.comments,
                gt.created_at,
                ${hasUpdatedAt ? "gt.updated_at" : "NULL AS updated_at"}
            FROM ${tracerTable} gt
            LEFT JOIN profiles p ON p.id = gt.user_id
            ORDER BY gt.created_at DESC`
        ));

        res.json(rows);
    } catch (err: unknown) {
        console.error("GET ADMIN TRACER ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   TRACER (Alumni - GET own / POST submit)
========================= */
app.use("/api/tracer", tracerRoutes);

/* =========================
   ENGAGEMENT METRICS
========================= */
app.get("/api/engagement", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const totalAlumniRow = await getSingleRow(
            "SELECT COUNT(*) AS totalAlumni FROM user_roles WHERE role = 'alumni'"
        );

        const registeredEventUsersRow = await getSingleRow(
            "SELECT COUNT(DISTINCT alumni_id) AS engagedAlumni FROM event_registrations"
        );

        const donationUsersRow = await getSingleRow(
            "SELECT COUNT(DISTINCT user_id) AS donorAlumni FROM donations"
        );

        const tracerTable = await getTracerTableName();
        const tracerUsersRow = await getSingleRow(
            `SELECT COUNT(DISTINCT user_id) AS tracerRespondents FROM ${tracerTable}`
        );

        const eventMetrics = parseRows(await db.query(
            `SELECT
                e.id,
                e.title,
                e.status,
                e.date,
                e.venue,
                COUNT(DISTINCT er.id) AS registrations,
                COUNT(DISTINCT ec.id) AS comments,
                e.views,
                e.success_score
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            LEFT JOIN event_comments ec ON ec.event_id = e.id
            GROUP BY e.id
            ORDER BY e.date DESC, e.created_at DESC
            LIMIT 10`
        ));

        const donationBreakdown = parseRows(await db.query(
            `SELECT
                LOWER(status) AS status,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS totalAmount
            FROM donations
            GROUP BY LOWER(status)
            ORDER BY count DESC`
        ));

        res.json({
            overview: {
                totalAlumni: Number(totalAlumniRow?.totalAlumni || 0),
                engagedAlumni: Number(registeredEventUsersRow?.engagedAlumni || 0),
                donorAlumni: Number(donationUsersRow?.donorAlumni || 0),
                tracerRespondents: Number(tracerUsersRow?.tracerRespondents || 0)
            },
            eventMetrics,
            donationBreakdown
        });
    } catch (err: unknown) {
        console.error("GET ENGAGEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   ENGAGEMENT METRICS (alternate endpoint used by frontend)
========================= */
app.get("/api/admin/engagement-metrics", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const eventCountRow = await getSingleRow(`SELECT COUNT(*) AS cnt FROM ${announcementTable}`);
        const regCountRow = await getSingleRow("SELECT COUNT(*) AS cnt FROM event_registrations");
        const commentCountRow = await getSingleRow("SELECT COUNT(*) AS cnt FROM event_comments");
        const donationCountRow = await getSingleRow(
            "SELECT COUNT(*) AS cnt FROM donations WHERE LOWER(status) = 'approved'"
        );
        const totalAlumniRow = await getSingleRow(
            "SELECT COUNT(*) AS cnt FROM user_roles WHERE role = 'alumni'"
        );
        const tracerTable = await getTracerTableName();
        const tracerCountRow = await getSingleRow(
            `SELECT COUNT(*) AS cnt FROM ${tracerTable}`
        );

        const profiles = parseRows(await db.query(
            `SELECT p.id, p.name, p.batch, p.course FROM profiles p
             INNER JOIN user_roles ur ON ur.user_id = p.id
             WHERE ur.role = 'alumni'`
        ));

        const regs = parseRows(await db.query(
            `SELECT er.alumni_id AS user_id FROM event_registrations er`
        ));

        const comments = parseRows(await db.query(
            `SELECT ec.alumni_id AS user_id FROM event_comments ec`
        ));

        const donations = parseRows(await db.query(
            `SELECT d.user_id FROM donations d`
        ));

        const eventMetrics = parseRows(await db.query(
            `SELECT
                e.id,
                e.title,
                e.type,
                e.status,
                e.date,
                e.venue,
                COUNT(DISTINCT er.id) AS registrations,
                COUNT(DISTINCT ec.id) AS comments,
                COALESCE(SUM(CASE WHEN LOWER(d.status) = 'approved' THEN d.amount ELSE 0 END), 0) AS approvedDonations
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            LEFT JOIN event_comments ec ON ec.event_id = e.id
            LEFT JOIN donations d ON LOWER(d.purpose) = LOWER(e.title)
            GROUP BY e.id
            ORDER BY e.date DESC, e.created_at DESC
            LIMIT 10`
        ));

        res.json({
            eventCount: Number(eventCountRow?.cnt || 0),
            regCount: Number(regCountRow?.cnt || 0),
            commentCount: Number(commentCountRow?.cnt || 0),
            donationCount: Number(donationCountRow?.cnt || 0),
            overview: {
                totalAlumni: Number(totalAlumniRow?.cnt || 0),
                tracerRespondents: Number(tracerCountRow?.cnt || 0)
            },
            profiles,
            regs,
            comments,
            donations,
            eventMetrics
        });
    } catch (err: unknown) {
        console.error("GET ENGAGEMENT METRICS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   DONATIONS
========================= */
app.get("/api/donations", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const rows = parseRows<DonationListRow>(await db.query<DonationListRow>(
            `SELECT
                d.id,
                d.user_id,
                p.name,
                p.email,
                p.course,
                p.batch,
                p.student_id,
                d.amount,
                d.method,
                d.status,
                d.purpose,
                d.ref_number,
                d.receipt_url,
                d.message,
                d.created_at,
                d.reviewed_at,
                d.reviewed_by,
                d.review_notes
            FROM donations d
            LEFT JOIN profiles p ON p.id = d.user_id
            ORDER BY d.created_at DESC`
        ));

        // Reshape to match frontend expectation (profile nested object)
        const shaped = rows.map((r) => ({
            id: r.id,
            user_id: r.user_id,
            amount: r.amount,
            method: r.method,
            status: formatStatusLabel(normalizeDonationStatus(r.status), "pending_review"),
            purpose: r.purpose,
            ref_number: r.ref_number,
            receipt_url: normalizeStoredMedia(r.receipt_url),
            message: r.message,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at,
            reviewed_by: r.reviewed_by,
            review_notes: r.review_notes,
            profile: {
                name: r.name || "Unknown",
                email: (r as QueryRow).email || null,
                student_id: r.student_id || null,
                batch: r.batch || null,
                course: r.course || null
            }
        }));

        res.json(shaped);
    } catch (err: unknown) {
        console.error("GET DONATIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/donations/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const donationId = Number(req.params.id);
        if (!donationId) {
            return res.status(400).json({ error: "Invalid donation id" });
        }

        const donation = await getSingleRow(
            `SELECT
                d.id,
                d.user_id,
                d.amount,
                d.method,
                d.status,
                d.purpose,
                d.ref_number,
                d.receipt_url,
                d.message,
                d.created_at,
                d.reviewed_at,
                d.reviewed_by,
                d.review_notes,
                p.name,
                p.email,
                p.student_id,
                p.batch,
                p.course
             FROM donations d
             LEFT JOIN profiles p ON p.id = d.user_id
             WHERE d.id = ?`,
            [donationId]
        );

        if (!donation) {
            return res.status(404).json({ error: "Donation not found" });
        }

        res.json({
            id: donation.id,
            user_id: donation.user_id,
            amount: Number(donation.amount || 0),
            method: donation.method,
            status: formatStatusLabel(normalizeDonationStatus(donation.status), "pending_review"),
            purpose: donation.purpose,
            ref_number: donation.ref_number,
            receipt_url: normalizeStoredMedia(donation.receipt_url ? String(donation.receipt_url) : null),
            message: donation.message,
            created_at: donation.created_at,
            reviewed_at: donation.reviewed_at,
            reviewed_by: donation.reviewed_by,
            review_notes: donation.review_notes,
            profile: {
                name: donation.name || "Unknown",
                email: donation.email || null,
                student_id: donation.student_id || null,
                batch: donation.batch || null,
                course: donation.course || null
            }
        });
    } catch (err: unknown) {
        console.error("GET DONATION DETAIL ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/donations/:id/review", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const donationId = Number(req.params.id);
        if (!donationId) {
            return res.status(400).json({ error: "Invalid donation id" });
        }

        await db.execute(
            `UPDATE donations
             SET reviewed_at = NOW(),
                 reviewed_by = ?
             WHERE id = ?`,
            [req.user?.id || null, donationId]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("REVIEW DONATION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/donations/:id/request-info", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const donationId = Number(req.params.id);
        const notes = normalizeText(req.body?.notes);

        if (!donationId) {
            return res.status(400).json({ error: "Invalid donation id" });
        }

        if (!notes) {
            return res.status(400).json({ error: "Please provide the additional information needed from the donor" });
        }

        const donation = await getSingleRow(
            `SELECT id, user_id, status
             FROM donations
             WHERE id = ?`,
            [donationId]
        );

        if (!donation) {
            return res.status(404).json({ error: "Donation not found" });
        }

        await db.execute(
            `UPDATE donations
             SET status = ?,
                 reviewed_at = NOW(),
                 reviewed_by = ?,
                 review_notes = ?
             WHERE id = ?`,
            ["pending_review", req.user?.id || null, notes, donationId]
        );

        if (donation.user_id) {
            await createUserNotification({
                userId: String(donation.user_id),
                title: "More donation information requested",
                message: notes,
                category: "donation",
                linkUrl: "/alumni/donate",
                actorId: req.user?.id || null
            });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("REQUEST DONATION INFO ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

// Support both PATCH and PUT for status update
const updateDonationStatus = async (req: express.Request, res: express.Response) => {
    try {
        const donationId = Number(req.params.id);
        const status = normalizeDonationStatus(req.body?.status);
        const reviewNotes = normalizeText(req.body?.reviewNotes);

        if (!donationId) {
            return res.status(400).json({ error: "Donation id and status are required" });
        }

        const currentDonation = await getSingleRow(
            `SELECT id, user_id, status, reviewed_at
             FROM donations
             WHERE id = ?`,
            [donationId]
        );

        if (!currentDonation) {
            return res.status(404).json({ error: "Donation not found" });
        }

        if ((status === "approved" || status === "rejected") && !currentDonation.reviewed_at) {
            return res.status(400).json({ error: "Open View Details first before confirming this donation." });
        }

        await db.execute(
            `UPDATE donations
             SET status = ?,
                 reviewed_at = COALESCE(reviewed_at, NOW()),
                 review_notes = CASE WHEN ? = '' THEN review_notes ELSE ? END
             WHERE id = ?`,
            [status, reviewNotes, reviewNotes, donationId]
        );

        const updatedDonation = await getSingleRow(
            `SELECT
                d.id,
                d.user_id,
                d.amount,
                d.method,
                d.status,
                d.purpose,
                d.ref_number,
                d.receipt_url,
                d.message,
                d.reviewed_at,
                d.review_notes,
                d.created_at,
                p.name,
                p.email
            FROM donations d
            LEFT JOIN profiles p ON p.id = d.user_id
            WHERE d.id = ?`,
            [donationId]
        );

        res.json({
            success: true,
            donation: updatedDonation
                ? {
                    ...updatedDonation,
                    status: formatStatusLabel(normalizeDonationStatus(updatedDonation.status), "pending_review"),
                    receipt_url: normalizeStoredMedia(updatedDonation.receipt_url ? String(updatedDonation.receipt_url) : null)
                }
                : null
        });

        if (updatedDonation?.user_id) {
            await createUserNotification({
                userId: String(updatedDonation.user_id),
                title: "Donation status updated",
                message: `Your donation status is now ${formatStatusLabel(normalizeDonationStatus(updatedDonation.status), "pending_review")}.`,
                category: "donation",
                linkUrl: "/alumni/donate"
            });
        }
    } catch (err: unknown) {
        console.error("UPDATE DONATION STATUS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
};

app.patch("/api/donations/:id/status", authenticateToken, requireAdmin, updateDonationStatus);
app.put("/api/donations/:id/status", authenticateToken, requireAdmin, updateDonationStatus);

/* =========================
   DONATION SETTINGS
========================= */
app.get("/api/settings/donation", authenticateToken, async (_req, res) => {
    try {
        const row = await getSingleRow("SELECT * FROM donation_settings ORDER BY id DESC LIMIT 1");
        res.json(row || {});
    } catch (err: unknown) {
        console.error("GET DONATION SETTINGS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/settings/donation", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            gcash_name, gcash_number, gcash_qr,
            personal_personnel, personal_contact, personal_office
        } = req.body || {};

        const existing = await getSingleRow("SELECT id FROM donation_settings LIMIT 1");

        if (existing) {
            await db.execute(
                `UPDATE donation_settings SET
                    gcash_name = ?, gcash_number = ?, gcash_qr = ?,
                    personal_personnel = ?, personal_contact = ?, personal_office = ?
                WHERE id = ?`,
                [gcash_name || null, gcash_number || null, gcash_qr || null,
                personal_personnel || null, personal_contact || null, personal_office || null,
                existing.id]
            );
        } else {
            await db.execute(
                `INSERT INTO donation_settings
                    (gcash_name, gcash_number, gcash_qr, personal_personnel, personal_contact, personal_office)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [gcash_name || null, gcash_number || null, gcash_qr || null,
                personal_personnel || null, personal_contact || null, personal_office || null]
            );
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("SAVE DONATION SETTINGS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   ALUMNI DONATIONS (submit)
========================= */
app.post("/api/donations", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const { amount, method, purpose, ref_number, message, receipt_url } = req.body || {};

        if (!amount || !method) {
            return res.status(400).json({ error: "Amount and method are required" });
        }

        await db.execute(
            `INSERT INTO donations (user_id, amount, method, status, purpose, ref_number, message, receipt_url)
             VALUES (?, ?, ?, 'pending_review', ?, ?, ?, ?)`,
            [req.user.id, amount, method, purpose || null, ref_number || null, message || null, normalizeStoredMedia(receipt_url)]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New donation submitted",
            message: `${Number(amount).toLocaleString()} donation submitted for review.`,
            category: "donation",
            linkUrl: "/admin/donations",
            actorId: req.user.id
        });

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("POST DONATION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   ANNOUNCEMENTS
========================= */
app.get("/api/announcements", authenticateToken, async (_req, res) => {
    try {
        const req = _req as AuthenticatedRequest;
        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const role = req.user?.id ? await getRoleForUser(req.user.id) : "alumni";
        const canModerate = canModerateAnnouncementContent(role);
        const params: DbParam[] = [];
        const profile = !canModerate && req.user?.id
            ? await getSingleRow(`SELECT course, batch FROM profiles WHERE id = ?`, [req.user.id])
            : null;
        const audienceCourse = normalizeText(profile?.course).toLowerCase();
        const audienceBatch = normalizeBatch(profile?.batch).toLowerCase();
        const audienceClause = hasAudienceScope
            ? `(
                LOWER(COALESCE(e.audience_scope, 'all')) = 'all'
                OR (LOWER(COALESCE(e.audience_scope, 'all')) = 'course' AND LOWER(COALESCE(${hasAudienceValue ? "e.audience_value" : "''"}, '')) = ?)
                OR (LOWER(COALESCE(e.audience_scope, 'all')) = 'batch' AND LOWER(COALESCE(${hasAudienceValue ? "e.audience_value" : "''"}, '')) = ?)
            )`
            : "1 = 1";

        const visibilityClause = !canModerate
            ? hasApprovalStatus && hasCreatedBy
                ? `WHERE ((LOWER(COALESCE(e.approval_status, 'approved')) = 'approved' AND ${audienceClause}) OR e.created_by = ?)`
                : hasApprovalStatus
                    ? `WHERE LOWER(COALESCE(e.approval_status, 'approved')) = 'approved' AND ${audienceClause}`
                    : `WHERE ${audienceClause}`
            : "";

        if (!canModerate && hasAudienceScope) {
            params.push(audienceCourse, audienceBatch);
        }

        if (!canModerate && hasApprovalStatus && hasCreatedBy && req.user?.id) {
            params.push(req.user.id);
        }

        const rows = parseRows<EventListRow>(await db.query<EventListRow>(
            `SELECT
                e.id,
                e.title,
                e.description,
                e.date,
                e.time,
                e.venue,
                e.type,
                ${hasGoogleFormLink ? "e.google_form_link" : "NULL AS google_form_link"},
                e.organizer,
                e.image_url,
                e.status,
                e.capacity,
                e.views,
                e.success_score,
                e.created_at,
                e.updated_at,
                ${hasApprovalStatus ? "e.approval_status" : "'approved' AS approval_status"},
                ${hasCreatedBy ? "e.created_by" : "NULL AS created_by"},
                ${hasApprovedBy ? "e.approved_by" : "NULL AS approved_by"},
                ${hasRejectionReason ? "e.rejection_reason" : "NULL AS rejection_reason"},
                ${hasAudienceScope ? "e.audience_scope" : "'all' AS audience_scope"},
                ${hasAudienceValue ? "e.audience_value" : "NULL AS audience_value"},
                ${hasCreatedBy ? "creator.name AS created_by_name" : "NULL AS created_by_name"},
                COUNT(DISTINCT er.id) AS registration_count,
                COUNT(DISTINCT ec.id) AS comment_count
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            LEFT JOIN event_comments ec ON ec.event_id = e.id
            ${hasCreatedBy ? "LEFT JOIN profiles creator ON creator.id = e.created_by" : ""}
            ${visibilityClause}
            GROUP BY e.id
            ORDER BY
                ${hasApprovalStatus
                    ? `CASE
                        WHEN LOWER(COALESCE(e.approval_status, 'approved')) = 'pending_approval' THEN 0
                        WHEN LOWER(COALESCE(e.approval_status, 'approved')) = 'rejected' THEN 1
                        ELSE 2
                    END`
                    : "2"},
                e.date DESC,
                e.created_at DESC`,
            params
        ));

        res.json(rows.map((row) => ({
            ...row,
            id: String(row.id),
            type: normalizeAnnouncementType(String(row.type || "")),
            image_url: normalizeStoredMedia(row.image_url),
            status: normalizeStatus(row.status, getAnnouncementStatusFallback(String(row.type || ""))),
            approvalStatus: normalizeAnnouncementApprovalStatus((row as QueryRow).approval_status, "approved"),
            createdBy: (row as QueryRow).created_by || null,
            approvedBy: (row as QueryRow).approved_by || null,
            rejectionReason: (row as QueryRow).rejection_reason || null,
            audienceScope: normalizeAnnouncementAudienceScope((row as QueryRow).audience_scope),
            audienceValue: (row as QueryRow).audience_value || null,
            audienceLabel: formatAnnouncementAudienceLabel((row as QueryRow).audience_scope, (row as QueryRow).audience_value),
            createdByName: (row as QueryRow).created_by_name || null
        })));
    } catch (err: unknown) {
        console.error("GET ANNOUNCEMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/announcements", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const { title, description, date, time, venue, type, google_form_link, organizer, image_url, status, capacity, audienceScope, audienceValue } = req.body || {};
        const normalizedType = normalizeAnnouncementType(type);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);
        const role = await getRoleForUser(req.user.id);
        const canModerate = canModerateAnnouncementContent(role);
        const approvalStatus = canModerate ? "approved" : "pending_approval";

        if (!title || !date) {
            return res.status(400).json({ error: "Title and date are required" });
        }

        if (normalizedAudienceScope !== "all" && !normalizedAudienceValue) {
            return res.status(400).json({ error: `Please provide the target ${normalizedAudienceScope} audience.` });
        }

        const columns = [
            "title",
            "description",
            "date",
            "time",
            "venue",
            "type",
            ...(hasGoogleFormLink ? ["google_form_link"] : []),
            "organizer",
            "image_url",
            "status",
            "capacity",
            ...(hasApprovalStatus ? ["approval_status"] : []),
            ...(hasCreatedBy ? ["created_by"] : []),
            ...(hasApprovedBy ? ["approved_by"] : []),
            ...(hasRejectionReason ? ["rejection_reason"] : []),
            ...(hasAudienceScope ? ["audience_scope"] : []),
            ...(hasAudienceValue ? ["audience_value"] : [])
        ];

        const values: DbParam[] = [
            title,
            description || null,
            date,
            time || null,
            venue || null,
            normalizedType,
            ...(hasGoogleFormLink ? [google_form_link || null] : []),
            organizer || null,
            normalizeStoredMedia(image_url) || null,
            normalizeStatus(status, getAnnouncementStatusFallback(normalizedType)),
            capacity || 0,
            ...(hasApprovalStatus ? [approvalStatus] : []),
            ...(hasCreatedBy ? [req.user.id] : []),
            ...(hasApprovedBy ? [canModerate ? req.user.id : null] : []),
            ...(hasRejectionReason ? [null] : []),
            ...(hasAudienceScope ? [normalizedAudienceScope] : []),
            ...(hasAudienceValue ? [normalizedAudienceValue] : [])
        ];

        const placeholders = columns.map(() => "?").join(", ");
        const result = await db.execute(
            `INSERT INTO ${announcementTable} (${columns.join(", ")})
             VALUES (${placeholders})`,
            values
        );

        const insertResult = result as ResultSetHeader;
        const newEvent = await getSingleRow(`SELECT * FROM ${announcementTable} WHERE id = ?`, [insertResult.insertId]);

        res.json({
            success: true,
            event: newEvent
                ? {
                    ...newEvent,
                    id: String(newEvent.id),
                    type: normalizeAnnouncementType(String(newEvent.type || normalizedType)),
                    image_url: normalizeStoredMedia(newEvent.image_url),
                    status: normalizeStatus(newEvent.status, getAnnouncementStatusFallback(String(newEvent.type || normalizedType))),
                    approvalStatus: normalizeAnnouncementApprovalStatus(newEvent.approval_status, approvalStatus),
                    audienceScope: normalizeAnnouncementAudienceScope(newEvent.audience_scope || normalizedAudienceScope),
                    audienceValue: newEvent.audience_value || normalizedAudienceValue,
                    audienceLabel: formatAnnouncementAudienceLabel(newEvent.audience_scope || normalizedAudienceScope, newEvent.audience_value || normalizedAudienceValue)
                }
                : null,
            message: canModerate
                ? "Announcement published successfully"
                : "Announcement submitted for admin approval"
        });

        if (canModerate) {
            const alumniUserIds = await getAnnouncementAudienceRecipients(normalizedAudienceScope, normalizedAudienceValue);
            await createUserNotifications({
                userIds: alumniUserIds,
                title: normalizedType === "survey" ? "New survey available" : normalizedType === "event" ? "New event posted" : "New announcement posted",
                message: `${title} has been published in the alumni portal.`,
                category: normalizedType === "survey" ? "survey" : normalizedType === "event" ? "event" : "announcement",
                linkUrl: "/alumni/announcements",
                actorId: req.user.id
            });
        } else {
            const adminUserIds = await getAdminUserIds();
            await createUserNotifications({
                userIds: adminUserIds,
                title: "Announcement approval required",
                message: `${title} was submitted by an alumni user and is waiting for review.`,
                category: "announcement",
                linkUrl: "/admin/announcements",
                actorId: req.user.id
            });
        }
    } catch (err: unknown) {
        console.error("CREATE ANNOUNCEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/announcements/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const eventId = Number(req.params.id);
        const role = await getRoleForUser(req.user.id);
        const canModerate = canModerateAnnouncementContent(role);
        const profile = !canModerate ? await getSingleRow(`SELECT course, batch FROM profiles WHERE id = ?`, [req.user.id]) : null;
        const audienceCourse = normalizeText(profile?.course).toLowerCase();
        const audienceBatch = normalizeBatch(profile?.batch).toLowerCase();

        if (!eventId) {
            return res.status(400).json({ error: "Invalid event id" });
        }

        const event = await getSingleRow(
            `SELECT
                e.id,
                e.title,
                e.description,
                e.date,
                e.time,
                e.venue,
                e.type,
                ${hasGoogleFormLink ? "e.google_form_link" : "NULL AS google_form_link"},
                e.organizer,
                e.image_url,
                e.status,
                e.capacity,
                e.views,
                e.success_score,
                e.created_at,
                e.updated_at,
                ${hasApprovalStatus ? "e.approval_status" : "'approved' AS approval_status"},
                ${hasCreatedBy ? "e.created_by" : "NULL AS created_by"},
                ${hasApprovedBy ? "e.approved_by" : "NULL AS approved_by"},
                ${hasRejectionReason ? "e.rejection_reason" : "NULL AS rejection_reason"},
                ${hasAudienceScope ? "e.audience_scope" : "'all' AS audience_scope"},
                ${hasAudienceValue ? "e.audience_value" : "NULL AS audience_value"},
                ${hasCreatedBy ? "creator.name AS created_by_name" : "NULL AS created_by_name"},
                COUNT(DISTINCT er.id) AS registration_count,
                COUNT(DISTINCT ec.id) AS comment_count
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            LEFT JOIN event_comments ec ON ec.event_id = e.id
            ${hasCreatedBy ? "LEFT JOIN profiles creator ON creator.id = e.created_by" : ""}
            WHERE e.id = ?
            GROUP BY e.id`,
            [eventId]
        );

        if (!event) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        const approvalStatus = normalizeAnnouncementApprovalStatus(event.approval_status, "approved");
        const audienceScope = normalizeAnnouncementAudienceScope(event.audience_scope);
        const audienceValue = event.audience_value ? String(event.audience_value) : null;
        const canViewByAudience =
            audienceScope === "all" ||
            (audienceScope === "course" && audienceCourse && audienceCourse === normalizeText(audienceValue).toLowerCase()) ||
            (audienceScope === "batch" && audienceBatch && audienceBatch === normalizeBatch(audienceValue).toLowerCase());
        if (!canModerate && approvalStatus !== "approved" && String(event.created_by || "") !== req.user.id) {
            return res.status(404).json({ error: "Announcement not found" });
        }
        if (!canModerate && approvalStatus === "approved" && String(event.created_by || "") !== req.user.id && !canViewByAudience) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({
            ...event,
            id: String(event.id),
            type: normalizeAnnouncementType(String(event.type || "")),
            image_url: normalizeStoredMedia(event.image_url),
            status: normalizeStatus(event.status, getAnnouncementStatusFallback(String(event.type || ""))),
            approvalStatus,
            createdBy: event.created_by || null,
            approvedBy: event.approved_by || null,
            rejectionReason: event.rejection_reason || null,
            audienceScope,
            audienceValue,
            audienceLabel: formatAnnouncementAudienceLabel(audienceScope, audienceValue),
            createdByName: event.created_by_name || null
        });
    } catch (err: unknown) {
        console.error("GET ANNOUNCEMENT DETAIL ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.put("/api/announcements/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const eventId = Number(req.params.id);
        const { title, description, date, time, venue, type, google_form_link, organizer, image_url, status, capacity, audienceScope, audienceValue } = req.body || {};
        const normalizedType = normalizeAnnouncementType(type);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);

        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        if (normalizedAudienceScope !== "all" && !normalizedAudienceValue) {
            return res.status(400).json({ error: `Please provide the target ${normalizedAudienceScope} audience.` });
        }

        await db.execute(
            hasGoogleFormLink
                ? `UPDATE ${announcementTable} SET
                    title = ?, description = ?, date = ?, time = ?, venue = ?,
                    type = ?, google_form_link = ?, organizer = ?, image_url = ?, status = ?, capacity = ?${hasAudienceScope ? ", audience_scope = ?" : ""}${hasAudienceValue ? ", audience_value = ?" : ""}
                   WHERE id = ?`
                : `UPDATE ${announcementTable} SET
                    title = ?, description = ?, date = ?, time = ?, venue = ?,
                    type = ?, organizer = ?, image_url = ?, status = ?, capacity = ?${hasAudienceScope ? ", audience_scope = ?" : ""}${hasAudienceValue ? ", audience_value = ?" : ""}
                   WHERE id = ?`,
            hasGoogleFormLink
                ? [
                    title,
                    description || null,
                    date,
                    time || null,
                    venue || null,
                    normalizedType,
                    google_form_link || null,
                    organizer || null,
                    normalizeStoredMedia(image_url) || null,
                    normalizeStatus(status, getAnnouncementStatusFallback(normalizedType)),
                    capacity || 0,
                    ...(hasAudienceScope ? [normalizedAudienceScope] : []),
                    ...(hasAudienceValue ? [normalizedAudienceValue] : []),
                    eventId
                ]
                : [
                    title,
                    description || null,
                    date,
                    time || null,
                    venue || null,
                    normalizedType,
                    organizer || null,
                    normalizeStoredMedia(image_url) || null,
                    normalizeStatus(status, getAnnouncementStatusFallback(normalizedType)),
                    capacity || 0,
                    ...(hasAudienceScope ? [normalizedAudienceScope] : []),
                    ...(hasAudienceValue ? [normalizedAudienceValue] : []),
                    eventId
                ]
        );

        const updated = await getSingleRow(`SELECT * FROM ${announcementTable} WHERE id = ?`, [eventId]);
        res.json({
            success: true,
            event: updated
                ? {
                    ...updated,
                    type: normalizeAnnouncementType(String(updated.type || normalizedType)),
                    image_url: normalizeStoredMedia(updated.image_url),
                    status: normalizeStatus(updated.status, getAnnouncementStatusFallback(String(updated.type || normalizedType))),
                    approvalStatus: normalizeAnnouncementApprovalStatus(updated.approval_status, "approved"),
                    audienceScope: normalizeAnnouncementAudienceScope(updated.audience_scope || normalizedAudienceScope),
                    audienceValue: updated.audience_value || normalizedAudienceValue,
                    audienceLabel: formatAnnouncementAudienceLabel(updated.audience_scope || normalizedAudienceScope, updated.audience_value || normalizedAudienceValue)
                }
                : null
        });
    } catch (err: unknown) {
        console.error("UPDATE EVENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/announcements/:id/approval", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const eventId = Number(req.params.id);
        const approvalStatus = normalizeAnnouncementApprovalStatus(req.body?.approvalStatus, "approved");
        const rejectionReason = normalizeText(req.body?.rejectionReason) || null;

        if (!eventId) {
            return res.status(400).json({ error: "Invalid event id" });
        }

        if (!hasApprovalStatus) {
            return res.status(400).json({ error: "Announcement approval is not available in this database yet" });
        }

        if (!["approved", "rejected"].includes(approvalStatus)) {
            return res.status(400).json({ error: "Invalid approval action" });
        }

        const current = await getSingleRow(
            `SELECT id, title, type, created_by, ${hasAudienceScope ? "audience_scope" : "'all' AS audience_scope"}, ${hasAudienceValue ? "audience_value" : "NULL AS audience_value"}
             FROM ${announcementTable}
             WHERE id = ?`,
            [eventId]
        );

        if (!current) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        const updateFields = [
            "approval_status = ?",
            ...(hasApprovedBy ? ["approved_by = ?"] : []),
            ...(hasRejectionReason ? ["rejection_reason = ?"] : [])
        ];
        const updateValues: DbParam[] = [
            approvalStatus,
            ...(hasApprovedBy ? [approvalStatus === "approved" ? (req.user?.id || null) : null] : []),
            ...(hasRejectionReason ? [approvalStatus === "rejected" ? rejectionReason : null] : []),
            eventId
        ];

        await db.execute(
            `UPDATE ${announcementTable}
             SET ${updateFields.join(", ")}
             WHERE id = ?`,
            updateValues
        );

        if (current.created_by) {
            await createUserNotification({
                userId: String(current.created_by),
                title: "Announcement review updated",
                message: approvalStatus === "approved"
                    ? `"${current.title}" has been approved and published.`
                    : rejectionReason || `"${current.title}" was rejected by an administrator.`,
                category: "announcement",
                linkUrl: "/alumni/announcements",
                actorId: req.user?.id || null
            });
        }

        if (approvalStatus === "approved") {
            const alumniUserIds = await getAnnouncementAudienceRecipients(
                normalizeAnnouncementAudienceScope(current.audience_scope),
                current.audience_value ? String(current.audience_value) : null
            );
            const normalizedType = normalizeAnnouncementType(String(current.type || ""));
            await createUserNotifications({
                userIds: alumniUserIds,
                title: normalizedType === "survey" ? "New survey available" : normalizedType === "event" ? "New event posted" : "New announcement posted",
                message: `${current.title} has been published in the alumni portal.`,
                category: normalizedType === "survey" ? "survey" : normalizedType === "event" ? "event" : "announcement",
                linkUrl: "/alumni/announcements",
                actorId: req.user?.id || null
            });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("ANNOUNCEMENT APPROVAL ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/announcements/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const eventId = Number(req.params.id);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        await db.execute(`DELETE FROM ${announcementTable} WHERE id = ?`, [eventId]);
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE EVENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   EVENT RSVP
========================= */
app.get("/api/events/:id/rsvps", authenticateToken, async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        const rsvps = parseRows(await db.query(
            `SELECT er.*, p.name FROM event_registrations er
             LEFT JOIN profiles p ON p.id = er.alumni_id
             WHERE er.event_id = ?`,
            [eventId]
        ));
        res.json({ rsvps });
    } catch (err: unknown) {
        console.error("GET RSVPS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/events/:id/rsvp", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        const eventId = Number(req.params.id);

        const existing = await getSingleRow(
            "SELECT id FROM event_registrations WHERE event_id = ? AND alumni_id = ?",
            [eventId, req.user.id]
        );

        if (existing) {
            return res.json({ success: true, message: "Already registered" });
        }

        await db.execute(
            "INSERT INTO event_registrations (event_id, alumni_id, status) VALUES (?, ?, 'registered')",
            [eventId, req.user.id]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New event response",
            message: "An alumni member registered for an event announcement.",
            category: "event",
            linkUrl: "/admin/announcements",
            actorId: req.user.id
        });

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("RSVP ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   EVENT COMMENTS
========================= */
app.get("/api/events/:id/comments", authenticateToken, async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        const comments = parseRows(await db.query(
            `SELECT ec.*, p.name AS author_name
             FROM event_comments ec
             LEFT JOIN profiles p ON p.id = ec.alumni_id
             WHERE ec.event_id = ?
             ORDER BY ec.created_at DESC`,
            [eventId]
        ));
        res.json(comments);
    } catch (err: unknown) {
        console.error("GET COMMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/events/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        const eventId = Number(req.params.id);
        const { content, parent_id } = req.body || {};

        if (!content) return res.status(400).json({ error: "Content is required" });

        await db.execute(
            "INSERT INTO event_comments (event_id, alumni_id, content, parent_id) VALUES (?, ?, ?, ?)",
            [eventId, req.user.id, content, parent_id || null]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New announcement comment",
            message: "A new comment was added to an event or announcement thread.",
            category: "comment",
            linkUrl: "/admin/announcements",
            actorId: req.user.id
        });

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("POST COMMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   ACHIEVEMENTS
========================= */
app.get("/api/achievements", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRoleForUser(req.user.id);
        const canModerate = role !== "alumni";

        const rows = parseRows(await db.query(
            `SELECT
                a.*,
                p.name,
                p.batch,
                p.course
             FROM achievements a
             LEFT JOIN profiles p ON p.id = a.alumni_id
             ${canModerate ? "" : "WHERE a.status = 'approved' OR a.alumni_id = ?"}
             ORDER BY a.featured DESC, a.achievement_date DESC, a.created_at DESC`,
            canModerate ? [] : [req.user.id]
        ));

        const achievementIds = rows.map((row) => Number(row.id)).filter((value) => Number.isFinite(value));
        const { reactionCounts, currentReactions, commentCounts } = await getAchievementSocialData(achievementIds, req.user.id);

        res.json(rows.map((row) => ({
            id: Number(row.id),
            alumniId: row.alumni_id,
            name: row.name || "Unknown Alumni",
            batch: row.batch,
            course: row.course,
            title: row.title,
            description: row.description,
            date: row.achievement_date,
            category: row.category,
            organization: row.organization,
            proofImage: normalizeStoredMedia(row.image_url),
            featured: Boolean(row.featured),
            status: normalizeStatus(String(row.status || "pending")),
            rejectionReason: row.rejection_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            reactionCounts: reactionCounts.get(Number(row.id)) || {
                heart: 0
            },
            currentUserReaction: currentReactions.get(Number(row.id)) || null,
            commentCount: commentCounts.get(Number(row.id)) || 0
        })));
    } catch (err: unknown) {
        console.error("GET ACHIEVEMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/achievements", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const { title, description, date, category, organization, proofImage } = req.body || {};

        if (!title || !category || !date) {
            return res.status(400).json({ error: "Title, category, and date are required" });
        }

        const result = await db.execute(
            `INSERT INTO achievements
                (alumni_id, title, description, achievement_date, category, organization, image_url, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                req.user.id,
                title,
                description || null,
                date,
                category,
                organization || null,
                normalizeStoredMedia(proofImage) || null
            ]
        ) as ResultSetHeader;

        const achievement = await getSingleRow("SELECT * FROM achievements WHERE id = ?", [result.insertId]);
        res.json({ success: true, achievement });

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New achievement submitted",
            message: `${title} was submitted for review.`,
            category: "achievement",
            linkUrl: "/admin/achievements",
            actorId: req.user.id
        });
    } catch (err: unknown) {
        console.error("CREATE ACHIEVEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/achievements/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const achievementId = Number(req.params.id);
        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id" });
        }

        const current = await getSingleRow("SELECT * FROM achievements WHERE id = ?", [achievementId]);
        if (!current) {
            return res.status(404).json({ error: "Achievement not found" });
        }

        const {
            title,
            description,
            date,
            category,
            organization,
            proofImage,
            status,
            featured,
            rejectionReason
        } = req.body || {};

        await db.execute(
            `UPDATE achievements SET
                title = ?,
                description = ?,
                achievement_date = ?,
                category = ?,
                organization = ?,
                image_url = ?,
                status = ?,
                featured = ?,
                rejection_reason = ?,
                approved_by = ?
             WHERE id = ?`,
            [
                title ?? current.title,
                description ?? current.description,
                date ?? current.achievement_date,
                category ?? current.category,
                organization ?? current.organization,
                normalizeStoredMedia(proofImage ?? current.image_url) || null,
                normalizeStatus(String(status || current.status || "pending")),
                featured === undefined ? current.featured : (featured ? 1 : 0),
                rejectionReason ?? current.rejection_reason,
                req.user?.id || null,
                achievementId
            ]
        );

        await createUserNotification({
            userId: String(current.alumni_id),
            title: "Achievement review updated",
            message: `Your achievement "${title ?? current.title}" is now ${formatStatusLabel(String(status || current.status || "pending"))}.`,
            category: "achievement",
            linkUrl: "/alumni/achievements",
            actorId: req.user?.id || null
        });

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("UPDATE ACHIEVEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/achievements/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const achievementId = Number(req.params.id);
        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id" });
        }

        await db.execute("DELETE FROM achievements WHERE id = ?", [achievementId]);
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE ACHIEVEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/achievements/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const achievementId = Number(req.params.id);
        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id" });
        }

        const access = await getAchievementAccess(achievementId, req.user.id);
        if (!access.achievement || !access.canAccess) {
            return res.status(404).json({ error: "Achievement not found" });
        }

        const comments = parseRows(await db.query(
            `SELECT
                ac.id,
                ac.achievement_id,
                ac.user_id,
                ac.content,
                ac.created_at,
                ac.updated_at,
                p.name AS author_name,
                p.batch AS author_batch,
                p.course AS author_course,
                p.photo AS author_photo
             FROM achievement_comments ac
             LEFT JOIN profiles p ON p.id = ac.user_id
             WHERE ac.achievement_id = ?
             ORDER BY ac.created_at ASC, ac.id ASC`,
            [achievementId]
        ));

        res.json(comments.map((comment) => ({
            id: Number(comment.id),
            achievementId: Number(comment.achievement_id),
            userId: String(comment.user_id),
            content: comment.content,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            authorName: comment.author_name || "Alumni User",
            authorBatch: comment.author_batch || null,
            authorCourse: comment.author_course || null,
            authorPhoto: normalizeStoredMedia(comment.author_photo ? String(comment.author_photo) : null)
        })));
    } catch (err: unknown) {
        console.error("GET ACHIEVEMENT COMMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/achievements/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const achievementId = Number(req.params.id);
        const content = String(req.body?.content || "").trim();
        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id" });
        }

        if (!content) {
            return res.status(400).json({ error: "Comment content is required" });
        }

        const access = await getAchievementAccess(achievementId, req.user.id);
        if (!access.achievement || !access.canAccess) {
            return res.status(404).json({ error: "Achievement not found" });
        }

        const result = await db.execute(
            `INSERT INTO achievement_comments (achievement_id, user_id, content)
             VALUES (?, ?, ?)`,
            [achievementId, req.user.id, content]
        ) as ResultSetHeader;

        if (String(access.achievement.alumni_id) !== req.user.id) {
            await createUserNotification({
                userId: String(access.achievement.alumni_id),
                title: "New achievement comment",
                message: `Someone commented on "${access.achievement.title}".`,
                category: "achievement",
                linkUrl: "/alumni/achievements",
                actorId: req.user.id
            });
        }

        res.status(201).json({ success: true, commentId: result.insertId });
    } catch (err: unknown) {
        console.error("CREATE ACHIEVEMENT COMMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/achievements/:id/reaction", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const achievementId = Number(req.params.id);
        const reactionType = normalizeAchievementReactionType(req.body?.reactionType);

        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id" });
        }

        if (!reactionType) {
            return res.status(400).json({ error: "A valid reaction type is required" });
        }

        const access = await getAchievementAccess(achievementId, req.user.id);
        if (!access.achievement || !access.canAccess) {
            return res.status(404).json({ error: "Achievement not found" });
        }

        const existing = await getSingleRow(
            `SELECT id, reaction_type
             FROM achievement_reactions
             WHERE achievement_id = ? AND user_id = ?`,
            [achievementId, req.user.id]
        );

        let currentReaction: AchievementReactionType | null = reactionType;

        if (existing && normalizeAchievementReactionType(existing.reaction_type) === reactionType) {
            await db.execute(
                `DELETE FROM achievement_reactions
                 WHERE achievement_id = ? AND user_id = ?`,
                [achievementId, req.user.id]
            );
            currentReaction = null;
        } else if (existing) {
            await db.execute(
                `UPDATE achievement_reactions
                 SET reaction_type = ?
                 WHERE achievement_id = ? AND user_id = ?`,
                [reactionType, achievementId, req.user.id]
            );
        } else {
            await db.execute(
                `INSERT INTO achievement_reactions (achievement_id, user_id, reaction_type)
                 VALUES (?, ?, ?)`,
                [achievementId, req.user.id, reactionType]
            );
        }

        const { reactionCounts } = await getAchievementSocialData([achievementId], req.user.id);
        res.json({
            success: true,
            currentReaction,
            reactionCounts: reactionCounts.get(achievementId) || {
                heart: 0
            }
        });
    } catch (err: unknown) {
        console.error("ACHIEVEMENT REACTION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   FREEDOM WALL
========================= */
app.get("/api/admin/freedom-wall/posts", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const rows = parseRows(await db.query(
            `SELECT
                fwp.id,
                fwp.user_id,
                fwp.content,
                fwp.image_url,
                fwp.category,
                fwp.status,
                fwp.is_pinned,
                fwp.report_count,
                fwp.created_at,
                fwp.updated_at,
                p.name AS author_name,
                p.batch AS author_batch,
                COUNT(DISTINCT r.id) AS reaction_count,
                COUNT(DISTINCT fwc.id) AS comment_count
             FROM freedom_wall_posts fwp
             LEFT JOIN profiles p ON p.id = fwp.user_id
             LEFT JOIN reactions r
                ON r.target_type = 'freedom_wall_post'
               AND r.target_id = fwp.id
             LEFT JOIN freedom_wall_comments fwc
                ON fwc.post_id = fwp.id
               AND fwc.status <> 'deleted'
             GROUP BY fwp.id
             ORDER BY
                CASE
                    WHEN fwp.status = 'reported' THEN 0
                    WHEN fwp.is_pinned = 1 THEN 1
                    WHEN fwp.status = 'published' THEN 2
                    WHEN fwp.status = 'hidden' THEN 3
                    ELSE 4
                END,
                fwp.created_at DESC,
                fwp.id DESC`
        ));

        res.json(rows.map((row) => ({
            id: Number(row.id),
            author: row.author_name || "Alumni User",
            authorBatch: row.author_batch || "Unknown",
            content: row.content,
            imageUrl: normalizeStoredMedia(row.image_url ? String(row.image_url) : null),
            timestamp: row.created_at,
            likes: Number(row.reaction_count || 0),
            comments: Number(row.comment_count || 0),
            isPinned: Boolean(row.is_pinned),
            isFlagged: String(row.status || "") === "reported" || Number(row.report_count || 0) > 0,
            category: row.category || "Discussion",
            status: row.status || "published"
        })));
    } catch (err: unknown) {
        console.error("GET ADMIN FREEDOM WALL POSTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/admin/freedom-wall/posts/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const postId = Number(req.params.id);
        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        const updates: string[] = [];
        const params: DbParam[] = [];

        if (typeof req.body?.isPinned === "boolean") {
            updates.push("is_pinned = ?", "pinned_by = ?");
            params.push(req.body.isPinned ? 1 : 0, req.body.isPinned ? req.user?.id || null : null);
        }

        const requestedStatus = String(req.body?.status || "").trim().toLowerCase();
        if (requestedStatus) {
            if (!["published", "hidden", "reported", "deleted"].includes(requestedStatus)) {
                return res.status(400).json({ error: "Invalid post status." });
            }

            updates.push("status = ?");
            params.push(requestedStatus);

            if (requestedStatus === "published") {
                updates.push("report_count = 0");
            } else if (requestedStatus === "reported") {
                updates.push("report_count = GREATEST(report_count, 1)");
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No moderation changes provided." });
        }

        params.push(postId);
        await db.execute(
            `UPDATE freedom_wall_posts
             SET ${updates.join(", ")}
             WHERE id = ?`,
            params
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("UPDATE ADMIN FREEDOM WALL POST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/admin/freedom-wall/posts/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        await db.execute(
            `UPDATE freedom_wall_posts
             SET status = 'deleted', is_pinned = 0
             WHERE id = ?`,
            [postId]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE ADMIN FREEDOM WALL POST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/freedom-wall/posts", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const rows = parseRows<FreedomWallPostRow>(await db.query<FreedomWallPostRow>(
            `SELECT
                fwp.id,
                fwp.user_id,
                fwp.content,
                fwp.image_url,
                fwp.category,
                fwp.is_pinned,
                fwp.created_at,
                fwp.updated_at,
                p.name AS author_name,
                p.batch AS author_batch,
                p.course AS author_course,
                p.photo AS author_photo
             FROM freedom_wall_posts fwp
             LEFT JOIN profiles p ON p.id = fwp.user_id
             WHERE fwp.status = 'published'
             ORDER BY fwp.is_pinned DESC, fwp.created_at DESC, fwp.id DESC`
        ));

        const postIds = rows.map((row) => Number(row.id)).filter((value) => Number.isFinite(value));
        const { reactionCounts, currentReactions, commentCounts } = await getFreedomWallPostSocialData(postIds, req.user.id);

        res.json(rows.map((row) => ({
            id: Number(row.id),
            userId: row.user_id,
            authorName: row.author_name || "Alumni User",
            authorBatch: row.author_batch || null,
            authorCourse: row.author_course || null,
            authorPhoto: normalizeStoredMedia(row.author_photo ? String(row.author_photo) : null),
            content: row.content,
            imageUrl: normalizeStoredMedia(row.image_url ? String(row.image_url) : null),
            category: row.category || "Discussion",
            isPinned: Boolean(row.is_pinned),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            reactionCounts: reactionCounts.get(Number(row.id)) || {
                heart: 0
            },
            currentUserReaction: currentReactions.get(Number(row.id)) || null,
            commentCount: commentCounts.get(Number(row.id)) || 0
        })));
    } catch (err: unknown) {
        console.error("GET FREEDOM WALL POSTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/freedom-wall/posts", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const content = String(req.body?.content || "").trim();
        const category = normalizeText(req.body?.category) || "Discussion";
        const imageUrl = normalizeStoredMedia(
            typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null
        ) || null;

        if (!content) {
            return res.status(400).json({ error: "Post content is required." });
        }

        const result = await db.execute(
            `INSERT INTO freedom_wall_posts
                (user_id, content, image_url, category, visibility, status)
             VALUES (?, ?, ?, ?, 'alumni_only', 'published')`,
            [req.user.id, content, imageUrl, category]
        ) as ResultSetHeader;

        res.status(201).json({ success: true, postId: result.insertId });
    } catch (err: unknown) {
        console.error("CREATE FREEDOM WALL POST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/freedom-wall/posts/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const postId = Number(req.params.id);
        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        const post = await getSingleRow(
            `SELECT id
             FROM freedom_wall_posts
             WHERE id = ? AND status = 'published'`,
            [postId]
        );

        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }

        const rows = parseRows<FreedomWallCommentRow>(await db.query<FreedomWallCommentRow>(
            `SELECT
                fwc.id,
                fwc.post_id,
                fwc.user_id,
                fwc.parent_id,
                fwc.content,
                fwc.created_at,
                fwc.updated_at,
                p.name AS author_name,
                p.batch AS author_batch,
                p.course AS author_course,
                p.photo AS author_photo
             FROM freedom_wall_comments fwc
             LEFT JOIN profiles p ON p.id = fwc.user_id
             WHERE fwc.post_id = ? AND fwc.status = 'published'
             ORDER BY fwc.created_at ASC, fwc.id ASC`,
            [postId]
        ));

        res.json(rows.map((row) => ({
            id: Number(row.id),
            postId: Number(row.post_id),
            userId: row.user_id,
            parentId: row.parent_id ? Number(row.parent_id) : null,
            content: row.content,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            authorName: row.author_name || "Alumni User",
            authorBatch: row.author_batch || null,
            authorCourse: row.author_course || null,
            authorPhoto: normalizeStoredMedia(row.author_photo ? String(row.author_photo) : null)
        })));
    } catch (err: unknown) {
        console.error("GET FREEDOM WALL COMMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/freedom-wall/posts/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const postId = Number(req.params.id);
        const content = String(req.body?.content || "").trim();

        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        if (!content) {
            return res.status(400).json({ error: "Comment content is required." });
        }

        const post = await getSingleRow(
            `SELECT id, user_id, content
             FROM freedom_wall_posts
             WHERE id = ? AND status = 'published'`,
            [postId]
        );

        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }

        const result = await db.execute(
            `INSERT INTO freedom_wall_comments
                (post_id, user_id, content)
             VALUES (?, ?, ?)`,
            [postId, req.user.id, content]
        ) as ResultSetHeader;

        if (String(post.user_id) !== req.user.id) {
            await createUserNotification({
                userId: String(post.user_id),
                title: "New Freedom Wall comment",
                message: "Someone commented on your Freedom Wall post.",
                category: "community",
                linkUrl: "/alumni/community",
                actorId: req.user.id
            });
        }

        res.status(201).json({ success: true, commentId: result.insertId });
    } catch (err: unknown) {
        console.error("CREATE FREEDOM WALL COMMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/freedom-wall/posts/:id/reaction", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const postId = Number(req.params.id);
        const reactionType = normalizeFreedomWallReactionType(req.body?.reactionType);

        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        if (!reactionType) {
            return res.status(400).json({ error: "A valid reaction type is required." });
        }

        const post = await getSingleRow(
            `SELECT id, user_id
             FROM freedom_wall_posts
             WHERE id = ? AND status = 'published'`,
            [postId]
        );

        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }

        const existing = await getSingleRow(
            `SELECT id, reaction_type
             FROM reactions
             WHERE user_id = ? AND target_type = 'freedom_wall_post' AND target_id = ?`,
            [req.user.id, postId]
        );

        let currentReaction: FreedomWallReactionType | null = reactionType;

        if (existing && normalizeFreedomWallReactionType(existing.reaction_type) === reactionType) {
            await db.execute(
                `DELETE FROM reactions
                 WHERE user_id = ? AND target_type = 'freedom_wall_post' AND target_id = ?`,
                [req.user.id, postId]
            );
            currentReaction = null;
        } else if (existing) {
            await db.execute(
                `UPDATE reactions
                 SET reaction_type = ?
                 WHERE user_id = ? AND target_type = 'freedom_wall_post' AND target_id = ?`,
                [reactionType, req.user.id, postId]
            );
        } else {
            await db.execute(
                `INSERT INTO reactions
                    (user_id, target_type, target_id, reaction_type)
                 VALUES (?, 'freedom_wall_post', ?, ?)`,
                [req.user.id, postId, reactionType]
            );
        }

        if (String(post.user_id) !== req.user.id && currentReaction) {
            await createUserNotification({
                userId: String(post.user_id),
                title: "New Freedom Wall reaction",
                message: `Someone reacted to your Freedom Wall post with ${currentReaction}.`,
                category: "community",
                linkUrl: "/alumni/community",
                actorId: req.user.id
            });
        }

        const { reactionCounts } = await getFreedomWallPostSocialData([postId], req.user.id);
        res.json({
            success: true,
            currentReaction,
            reactionCounts: reactionCounts.get(postId) || {
                heart: 0
            }
        });
    } catch (err: unknown) {
        console.error("FREEDOM WALL REACTION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   SURVEYS
========================= */
app.get("/api/surveys", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRoleForUser(req.user.id);
        const canManageSurveys = role !== "alumni";
        const announcementTable = await getAnnouncementTableName();

        const surveyRows = parseRows(await db.query(
            `SELECT
                s.*,
                e.title AS event_title,
                COUNT(DISTINCT sa.respondent_id) AS response_count
             FROM surveys s
             LEFT JOIN ${announcementTable} e ON e.id = s.event_id
             LEFT JOIN survey_answers sa ON sa.survey_id = s.id
             ${canManageSurveys ? "" : "WHERE s.status = 'published'"}
             GROUP BY s.id
             ORDER BY s.created_at DESC, s.id DESC`
        ));

        const surveys = await Promise.all(surveyRows.map(async (row) => {
            const questions = parseRows(await db.query(
                `SELECT *
                 FROM survey_questions
                 WHERE survey_id = ?
                 ORDER BY question_order ASC, id ASC`,
                [row.id]
            ));

            const userAnswers = canManageSurveys
                ? []
                : parseRows(await db.query(
                    `SELECT question_id, answer_text, answer_value, answer_json, rating_value
                     FROM survey_answers
                     WHERE survey_id = ? AND respondent_id = ?`,
                    [row.id, req.user?.id || null]
                ));

            return {
                id: Number(row.id),
                eventId: row.event_id ? Number(row.event_id) : null,
                title: row.title,
                description: row.description,
                surveyType: row.survey_type,
                status: row.status,
                targetAudience: row.target_audience,
                isAnonymous: Boolean(row.is_anonymous),
                opensAt: row.opens_at,
                closesAt: row.closes_at,
                eventTitle: row.event_title,
                responseCount: Number(row.response_count || 0),
                questions: questions.map((question) => ({
                    id: Number(question.id),
                    questionText: question.question_text,
                    questionType: question.question_type,
                    questionOrder: Number(question.question_order),
                    isRequired: Boolean(question.is_required),
                    options: question.options_json
                        ? (typeof question.options_json === "string" ? JSON.parse(String(question.options_json)) : question.options_json)
                        : [],
                    minRating: question.min_rating,
                    maxRating: question.max_rating,
                    placeholder: question.placeholder
                })),
                userAnswers: userAnswers.map((answer) => ({
                    questionId: Number(answer.question_id),
                    answerText: answer.answer_text,
                    answerValue: answer.answer_value,
                    answerJson: answer.answer_json
                        ? (typeof answer.answer_json === "string" ? JSON.parse(String(answer.answer_json)) : answer.answer_json)
                        : null,
                    ratingValue: answer.rating_value
                }))
            };
        }));

        res.json(surveys);
    } catch (err: unknown) {
        console.error("GET SURVEYS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/surveys", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        if (!req.user?.id) return res.sendStatus(401);

        const {
            title,
            description,
            eventId,
            surveyType,
            status,
            targetAudience,
            isAnonymous,
            opensAt,
            closesAt,
            questions
        } = req.body || {};

        if (!title || !surveyType || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: "Title, type, and at least one question are required" });
        }

        await conn.beginTransaction();

        const [result] = await conn.execute<ResultSetHeader>(
            `INSERT INTO surveys
                (event_id, title, description, survey_type, status, target_audience, is_anonymous, opens_at, closes_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                eventId || null,
                title,
                description || null,
                surveyType,
                status || "draft",
                targetAudience || "all_alumni",
                isAnonymous ? 1 : 0,
                opensAt || null,
                closesAt || null,
                req.user.id,
                req.user.id
            ]
        );

        for (let index = 0; index < questions.length; index += 1) {
            const question = questions[index];
            await conn.execute(
                `INSERT INTO survey_questions
                    (survey_id, question_text, question_type, question_order, is_required, options_json, min_rating, max_rating, placeholder)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    result.insertId,
                    question.questionText,
                    question.questionType,
                    index + 1,
                    question.isRequired ? 1 : 0,
                    question.options?.length ? JSON.stringify(question.options) : null,
                    question.minRating || null,
                    question.maxRating || null,
                    question.placeholder || null
                ]
            );
        }

        await conn.commit();
        res.json({ success: true, surveyId: result.insertId });

        if ((status || "draft") === "published") {
            const alumniUserIds = await getAlumniUserIds();
            await createUserNotifications({
                userIds: alumniUserIds,
                title: "New survey published",
                message: `${title} is now open for responses.`,
                category: "survey",
                linkUrl: "/alumni/announcements",
                actorId: req.user.id
            });
        }
    } catch (err: unknown) {
        await conn.rollback();
        console.error("CREATE SURVEY ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

app.patch("/api/surveys/:id/status", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const surveyId = Number(req.params.id);
        const { status } = req.body || {};

        if (!surveyId || !status) {
            return res.status(400).json({ error: "Survey id and status are required" });
        }

        await db.execute(
            "UPDATE surveys SET status = ?, updated_by = ? WHERE id = ?",
            [status, req.user?.id || null, surveyId]
        );

        const survey = await getSingleRow("SELECT title FROM surveys WHERE id = ?", [surveyId]);
        if (survey && String(status) === "published") {
            const alumniUserIds = await getAlumniUserIds();
            await createUserNotifications({
                userIds: alumniUserIds,
                title: "Survey available",
                message: `${survey.title} is now live.`,
                category: "survey",
                linkUrl: "/alumni/announcements",
                actorId: req.user?.id || null
            });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("UPDATE SURVEY STATUS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/surveys/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const surveyId = Number(req.params.id);
        if (!surveyId) {
            return res.status(400).json({ error: "Invalid survey id" });
        }

        await db.execute("DELETE FROM surveys WHERE id = ?", [surveyId]);
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE SURVEY ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/surveys/:id/responses", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        if (!req.user?.id) return res.sendStatus(401);

        const surveyId = Number(req.params.id);
        const { answers } = req.body || {};

        if (!surveyId || !Array.isArray(answers)) {
            return res.status(400).json({ error: "Survey id and answers are required" });
        }

        await conn.beginTransaction();
        await conn.execute(
            "DELETE FROM survey_answers WHERE survey_id = ? AND respondent_id = ?",
            [surveyId, req.user.id]
        );

        for (const answer of answers) {
            await conn.execute(
                `INSERT INTO survey_answers
                    (survey_id, question_id, respondent_id, answer_text, answer_value, answer_json, rating_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    answer.questionId,
                    req.user.id,
                    answer.answerText || null,
                    answer.answerValue || null,
                    answer.answerJson ? JSON.stringify(answer.answerJson) : null,
                    answer.ratingValue || null
                ]
            );
        }

        await conn.commit();
        res.json({ success: true });

        const adminUserIds = await getAdminUserIds();
        const survey = await getSingleRow("SELECT title FROM surveys WHERE id = ?", [surveyId]);
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New survey response",
            message: survey?.title ? `A new response was submitted for ${survey.title}.` : "A new survey response was submitted.",
            category: "survey",
            linkUrl: "/admin/announcements",
            actorId: req.user.id
        });
    } catch (err: unknown) {
        await conn.rollback();
        console.error("SUBMIT SURVEY RESPONSE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

app.get("/api/surveys/:id/responses", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const surveyId = Number(req.params.id);
        if (!surveyId) {
            return res.status(400).json({ error: "Invalid survey id" });
        }

        const rows = parseRows(await db.query(
            `SELECT
                sa.id,
                sa.question_id,
                sa.respondent_id,
                sa.answer_text,
                sa.answer_value,
                sa.answer_json,
                sa.rating_value,
                sa.submitted_at,
                sq.question_text,
                sq.question_type,
                p.name AS respondent_name,
                p.batch,
                p.course
             FROM survey_answers sa
             INNER JOIN survey_questions sq ON sq.id = sa.question_id
             LEFT JOIN profiles p ON p.id = sa.respondent_id
             WHERE sa.survey_id = ?
             ORDER BY sa.submitted_at DESC, sq.question_order ASC`,
            [surveyId]
        ));

        res.json(rows.map((row) => ({
            id: Number(row.id),
            questionId: Number(row.question_id),
            respondentId: row.respondent_id,
            respondentName: row.respondent_name || "Anonymous",
            batch: row.batch,
            course: row.course,
            questionText: row.question_text,
            questionType: row.question_type,
            answerText: row.answer_text,
            answerValue: row.answer_value,
            answerJson: row.answer_json
                ? (typeof row.answer_json === "string" ? JSON.parse(String(row.answer_json)) : row.answer_json)
                : null,
            ratingValue: row.rating_value,
            submittedAt: row.submitted_at
        })));
    } catch (err: unknown) {
        console.error("GET SURVEY RESPONSES ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

/* =========================
   OFFICERS
========================= */
app.get("/api/officers", authenticateToken, async (_req, res) => {
    try {
        const rows = parseRows<OfficerSchoolYearRow>(await db.query<OfficerSchoolYearRow>(
            `SELECT
                sy.id,
                sy.start_year,
                sy.end_year,
                sy.label,
                sy.is_current,
                sy.created_at,
                sy.updated_at,
                COUNT(o.id) AS officer_count
             FROM officer_school_year sy
             LEFT JOIN officers o ON o.school_year_id = sy.id
             GROUP BY sy.id
             ORDER BY sy.start_year DESC, sy.end_year DESC`
        ));

        const schoolYears = rows.map((row) => ({
            id: Number(row.id),
            startYear: Number(row.start_year),
            endYear: Number(row.end_year),
            label: row.label || `${row.start_year} - ${row.end_year}`,
            isCurrent: Boolean(row.is_current),
            officerCount: Number(row.officer_count || 0),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
        const currentSchoolYear = schoolYears.find((item) => item.isCurrent) || schoolYears[0] || null;

        res.json({
            currentSchoolYearId: currentSchoolYear?.id || null,
            schoolYears
        });
    } catch (err: unknown) {
        console.error("GET OFFICERS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/officers/:schoolYearId", authenticateToken, async (req, res) => {
    try {
        const schoolYearId = Number(req.params.schoolYearId);
        if (!schoolYearId) {
            return res.status(400).json({ error: "Invalid school year id" });
        }

        const schoolYear = await getSingleRow<OfficerSchoolYearRow>(
            `SELECT
                sy.id,
                sy.start_year,
                sy.end_year,
                sy.label,
                sy.is_current,
                sy.created_at,
                sy.updated_at,
                COUNT(o.id) AS officer_count
             FROM officer_school_year sy
             LEFT JOIN officers o ON o.school_year_id = sy.id
             WHERE sy.id = ?
             GROUP BY sy.id`,
            [schoolYearId]
        );

        if (!schoolYear) {
            return res.status(404).json({ error: "School year not found" });
        }

        const officers = parseRows<OfficerRosterRow>(await db.query<OfficerRosterRow>(
            `SELECT
                o.id,
                o.school_year_id,
                o.position,
                o.custom_position,
                o.display_order,
                o.alumni_id,
                o.snapshot_name,
                o.snapshot_email,
                o.snapshot_course,
                o.snapshot_batch,
                o.snapshot_contact_number,
                o.snapshot_photo,
                o.created_at,
                o.updated_at
             FROM officers o
             WHERE o.school_year_id = ?
             ORDER BY o.display_order ASC, o.snapshot_name ASC`,
            [schoolYearId]
        ));

        res.json({
            schoolYear: {
                id: Number(schoolYear.id),
                startYear: Number(schoolYear.start_year),
                endYear: Number(schoolYear.end_year),
                label: schoolYear.label || `${schoolYear.start_year} - ${schoolYear.end_year}`,
                isCurrent: Boolean(schoolYear.is_current),
                officerCount: Number(schoolYear.officer_count || 0),
                createdAt: schoolYear.created_at,
                updatedAt: schoolYear.updated_at
            },
            officers: officers.map((row) => ({
                id: Number(row.id),
                schoolYearId: Number(row.school_year_id),
                alumniId: row.alumni_id,
                position: row.position,
                positionLabel: formatOfficerPosition(row.position, row.custom_position),
                customPosition: row.custom_position,
                displayOrder: Number(row.display_order || 0),
                name: row.snapshot_name,
                email: row.snapshot_email,
                course: row.snapshot_course,
                batch: row.snapshot_batch,
                contactNumber: row.snapshot_contact_number,
                photo: normalizeStoredMedia(row.snapshot_photo),
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }))
        });
    } catch (err: unknown) {
        console.error("GET OFFICER SCHOOL YEAR ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/officers/bundles", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    let conn: PoolConnection | null = null;
    let transactionStarted = false;

    try {
        conn = await db.getConnection();
        const schoolYearData = parseSchoolYearInput(req.body?.schoolYear);
        const officersInput = Array.isArray(req.body?.officers) ? req.body.officers : [];
        const makeCurrent = req.body?.makeCurrent !== false;

        if (!schoolYearData) {
            return res.status(400).json({ error: "School year must use the format YYYY - YYYY" });
        }

        if (officersInput.length === 0) {
            return res.status(400).json({ error: "At least one officer assignment is required" });
        }

        const allowedPositions = new Set([
            "president",
            "vice_president",
            "secretary",
            "assistant_secretary",
            "treasurer",
            "assistant_treasurer",
            "auditor",
            "pio",
            "pro",
            "board_member"
        ]);

        const normalizedAssignments: NormalizedOfficerAssignment[] = officersInput
            .map((item: Record<string, unknown>, index: number): NormalizedOfficerAssignment => ({
                alumniId: String(item?.alumniId || "").trim(),
                position: normalizeOfficerPositionKey(item?.position),
                name: normalizeText(item?.name),
                contactNumber: normalizePhone(item?.contactNumber),
                photoBase64: normalizeStoredMedia(item?.photoBase64 ? String(item.photoBase64) : null),
                customPosition: item?.customPosition ? normalizeText(item.customPosition) : null,
                displayOrder: getOfficerDisplayOrder(String(item?.position || ""), index)
            }))
            .filter((item: NormalizedOfficerAssignment): item is NormalizedOfficerAssignment => Boolean(item.position && (item.alumniId || item.name)));

        if (normalizedAssignments.length === 0) {
            return res.status(400).json({ error: "No valid officer assignments were provided" });
        }

        if (normalizedAssignments.some((item) => !allowedPositions.has(item.position))) {
            return res.status(400).json({ error: "One or more officer positions are invalid" });
        }

        const requiredPositions = ["president", "vice_president", "secretary", "treasurer", "auditor", "pio"];
        const presentPositions = new Set(normalizedAssignments.map((item) => item.position));
        const missingRequiredPositions = requiredPositions.filter((position) => !presentPositions.has(position));

        if (missingRequiredPositions.length > 0) {
            return res.status(400).json({
                error: `Missing required positions: ${missingRequiredPositions.map((item) => formatOfficerPosition(item)).join(", ")}`
            });
        }

        const duplicateLockedPositions = normalizedAssignments
            .filter((item) => item.position !== "board_member")
            .map((item) => item.position)
            .filter((position, index, array) => array.indexOf(position) !== index);

        if (duplicateLockedPositions.length > 0) {
            return res.status(400).json({
                error: `Duplicate officer positions found: ${[...new Set(duplicateLockedPositions)].map((item) => formatOfficerPosition(item)).join(", ")}`
            });
        }

        const duplicateAlumniIds = normalizedAssignments
            .map((item) => item.alumniId)
            .filter(Boolean)
            .filter((alumniId, index, array) => array.indexOf(alumniId) !== index);

        if (duplicateAlumniIds.length > 0) {
            return res.status(400).json({ error: "Each alumni profile can only be assigned once per school year bundle" });
        }

        const profileMap = new Map<string, RowDataPacket>();
        const uniqueAlumniIds = [...new Set(normalizedAssignments.map((item) => item.alumniId).filter(Boolean))];

        if (uniqueAlumniIds.length > 0) {
            const placeholders = uniqueAlumniIds.map(() => "?").join(", ");
            const [profileRows] = await conn.query<RowDataPacket[]>(
                `SELECT id, name, email, course, batch, contact_number, photo
                 FROM profiles
                 WHERE id IN (${placeholders})`,
                uniqueAlumniIds
            );

            profileRows.forEach((row) => {
                profileMap.set(String(row.id), row);
            });

            const missingProfiles = uniqueAlumniIds.filter((alumniId) => !profileMap.has(alumniId));
            if (missingProfiles.length > 0) {
                return res.status(400).json({ error: "One or more selected alumni profiles could not be found" });
            }
        }

        const directOfficerPositions = [...new Set(
            normalizedAssignments
                .filter((item) => !item.alumniId && item.position !== "board_member")
                .map((item) => item.position)
        )];

        const directOfficerAccountMap = new Map<string, RowDataPacket>();

        if (directOfficerPositions.length > 0) {
            const rolePlaceholders = directOfficerPositions.map(() => "?").join(", ");
            const [roleRows] = await conn.query<RowDataPacket[]>(
                `SELECT
                    ur.role,
                    ur.user_id AS id,
                    p.name,
                    p.email,
                    p.course,
                    p.batch,
                    p.contact_number,
                    p.photo
                 FROM user_roles ur
                 LEFT JOIN profiles p ON p.id = ur.user_id
                 WHERE ur.role IN (${rolePlaceholders}) AND COALESCE(ur.archived, 0) = 0`,
                directOfficerPositions
            );

            roleRows.forEach((row) => {
                if (row.role) {
                    directOfficerAccountMap.set(String(row.role), row);
                }
            });

            const missingOfficerAccounts = directOfficerPositions.filter((position) => !directOfficerAccountMap.has(position));
            if (missingOfficerAccounts.length > 0) {
                return res.status(400).json({
                    error: `Missing officer account for: ${missingOfficerAccounts.map((item) => formatOfficerPosition(item)).join(", ")}`
                });
            }
        }

        await conn.beginTransaction();
        transactionStarted = true;

        if (makeCurrent) {
            await conn.query("UPDATE officer_school_year SET is_current = 0");
        }

        const [existingSchoolYears] = await conn.query<RowDataPacket[]>(
            "SELECT id FROM officer_school_year WHERE start_year = ? AND end_year = ? LIMIT 1",
            [schoolYearData.startYear, schoolYearData.endYear]
        );

        let schoolYearId: number;

        if (Array.isArray(existingSchoolYears) && existingSchoolYears.length > 0) {
            schoolYearId = Number(existingSchoolYears[0].id);
            await conn.query(
                `UPDATE officer_school_year
                 SET label = ?, is_current = ?, created_by = ?
                 WHERE id = ?`,
                [schoolYearData.label, makeCurrent ? 1 : 0, req.user?.id || null, schoolYearId]
            );
            await conn.query("DELETE FROM officers WHERE school_year_id = ?", [schoolYearId]);
        } else {
            const [insertSchoolYearResult] = await conn.query<ResultSetHeader>(
                `INSERT INTO officer_school_year (start_year, end_year, label, is_current, created_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [schoolYearData.startYear, schoolYearData.endYear, schoolYearData.label, makeCurrent ? 1 : 0, req.user?.id || null]
            );
            schoolYearId = insertSchoolYearResult.insertId;
        }

        for (const assignment of normalizedAssignments) {
            let profile = assignment.alumniId ? profileMap.get(assignment.alumniId) : undefined;

            if (!assignment.alumniId && assignment.position !== "board_member") {
                const officerAccount = directOfficerAccountMap.get(assignment.position);

                if (!officerAccount) {
                    continue;
                }

                await conn.query(
                    `UPDATE profiles
                     SET name = ?, contact_number = ?, photo = ?
                     WHERE id = ?`,
                    [
                        assignment.name || String(officerAccount.name || ""),
                        assignment.contactNumber || null,
                        assignment.photoBase64 !== null ? assignment.photoBase64 : normalizeStoredMedia(officerAccount.photo ? String(officerAccount.photo) : null),
                        String(officerAccount.id)
                    ]
                );

                profile = {
                    ...officerAccount,
                    id: String(officerAccount.id),
                    name: assignment.name || String(officerAccount.name || "Unknown Officer"),
                    contact_number: assignment.contactNumber || null,
                    photo: assignment.photoBase64 !== null ? assignment.photoBase64 : normalizeStoredMedia(officerAccount.photo ? String(officerAccount.photo) : null)
                };
            }

            if (!profile) {
                continue;
            }

            await conn.query(
                `INSERT INTO officers
                    (school_year_id, alumni_id, position, custom_position, display_order, snapshot_name, snapshot_email, snapshot_course, snapshot_batch, snapshot_contact_number, snapshot_photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    schoolYearId,
                    assignment.alumniId || String(profile.id || ""),
                    assignment.position,
                    assignment.customPosition,
                    assignment.displayOrder,
                    assignment.name || String(profile.name || "Unknown Alumni"),
                    profile.email ? String(profile.email) : null,
                    profile.course ? String(profile.course) : null,
                    profile.batch ? String(profile.batch) : null,
                    assignment.contactNumber || (profile.contact_number ? String(profile.contact_number) : null),
                    assignment.photoBase64 !== null ? assignment.photoBase64 : normalizeStoredMedia(profile.photo ? String(profile.photo) : null)
                ]
            );
        }

        await conn.commit();
        transactionStarted = false;

        res.status(201).json({
            success: true,
            schoolYearId,
            schoolYear: schoolYearData.label
        });
    } catch (err: unknown) {
        if (conn && transactionStarted) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error("SAVE OFFICER BUNDLE ROLLBACK ERROR:", rollbackError);
            }
        }
        console.error("SAVE OFFICER BUNDLE ERROR:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: getErrorMessage(err) });
        }
    } finally {
        conn?.release();
    }
});

/* =========================
   NOTIFICATIONS
========================= */
app.get("/api/user-notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await syncStaleTracerNotification(req.user.id);

        const rows = parseRows<UserNotificationRow>(await db.query<UserNotificationRow>(
            `SELECT *
             FROM user_notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 30`,
            [req.user.id]
        ));

        const unreadRow = await getSingleRow(
            `SELECT COUNT(*) AS unreadCount
             FROM user_notifications
             WHERE user_id = ? AND is_read = 0`,
            [req.user.id]
        );

        res.json({
            notifications: rows.map((row) => ({
                id: row.id,
                title: row.title,
                message: row.message,
                category: row.category || "general",
                linkUrl: row.link_url,
                isRead: Boolean(row.is_read),
                createdAt: row.created_at
            })),
            unreadCount: Number(unreadRow?.unreadCount || 0)
        });
    } catch (err: unknown) {
        console.error("GET USER NOTIFICATIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/user-notifications/:id/read", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        await db.execute(
            `UPDATE user_notifications
             SET is_read = 1
             WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("READ USER NOTIFICATION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/user-notifications/read-all", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        await db.execute(
            `UPDATE user_notifications
             SET is_read = 1
             WHERE user_id = ? AND is_read = 0`,
            [req.user.id]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("READ ALL USER NOTIFICATIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/notifications", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const rows = parseRows(await db.query(
            `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
        ));
        res.json(rows);
    } catch (err: unknown) {
        console.error("GET NOTIFICATIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/notifications/send", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const { subject, message, recipients } = req.body || {};

        if (!subject || !message) {
            return res.status(400).json({ error: "Subject and message are required" });
        }

        let recipientRows: Array<{ email: string; name: string }> = [];

        if (recipients === "all" || !recipients) {
            recipientRows = parseRows(await db.query(
                `SELECT p.email, p.name
                 FROM profiles p
                 INNER JOIN user_roles ur ON ur.user_id = p.id
                 WHERE ur.role = 'alumni' AND p.email IS NOT NULL AND p.email <> ''`
            ));
        } else if (recipients === "pending_tracer") {
            const tracerTable = await getTracerTableName();
            recipientRows = parseRows(await db.query(
                `SELECT p.email, p.name
                 FROM profiles p
                 INNER JOIN user_roles ur ON ur.user_id = p.id
                 LEFT JOIN ${tracerTable} gt ON gt.user_id = p.id
                 WHERE ur.role = 'alumni'
                   AND gt.user_id IS NULL
                   AND p.email IS NOT NULL
                   AND p.email <> ''`
            ));
        }

        if (recipientRows.length > 0) {
            await Promise.all(recipientRows.map((recipient) =>
                sendMail({
                    to: recipient.email,
                    subject,
                    text: message,
                    html: `
                        <p>Hello ${recipient.name || "Alumni"},</p>
                        <p>${String(message).replace(/\n/g, "<br />")}</p>
                    `
                })
            ));
        }

        const notifId = uuidv4();
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");

        await db.execute(
            `INSERT INTO notifications (id, subject, message, type, status, recipients, recipient_count, sent_at, created_at, created_by)
             VALUES (?, ?, ?, 'email', 'sent', ?, ?, ?, ?, ?)`,
            [notifId, subject, message, recipients || "all", recipientRows.length, now, now, req.user?.id || null]
        );

        const alumniUserIds = await getAlumniUserIds();
        await createUserNotifications({
            userIds: alumniUserIds,
            title: subject,
            message,
            category: "notification",
            linkUrl: "/alumni",
            actorId: req.user?.id || null
        });

        res.json({ success: true, id: notifId, recipientCount: recipientRows.length });
    } catch (err: unknown) {
        console.error("SEND NOTIFICATION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.use(cors());
app.use(express.json());

app.get("/api/admin/tracer/:id/pdf/preview", authenticateToken, assertTracerAdminAccess, previewTracerPdfByRecordId);
app.get("/api/admin/tracer/:id/pdf", authenticateToken, assertTracerAdminAccess, exportTracerPdfByRecordId);
app.use("/api/email", emailRoutes);
app.use("/api/tracer", tracerRoutes);

export default app;
