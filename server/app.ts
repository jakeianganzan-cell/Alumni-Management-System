import "./env";
import express from "express";
import cors from "cors";
import type { CorsOptions } from "cors";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import db from "./db.ts";
import { sendAlumniCredentialsEmail, sendTargetedAlumniEmail, type TargetedEmailPurpose } from "./services/emailService";
import { generatePassword } from "./utils/generatePassword";
import { authenticateToken } from "./middleware/auth";
import tracerRoutes from "./routes/tracer.routes";
import emailRoutes from "./routes/emailRoutes";
import { AuthenticatedRequest } from "./types/auth";
import {
    assertTracerAdminAccess,
    bulkDownloadTracerPdfs,
    exportTracerPdfByRecordId,
    getAdminTracerRecord,
    listTracerRecords,
    previewTracerPdfByRecordId
} from "./controllers/tracer.controller";
import { COURSE_LABELS, COURSE_OPTIONS, normalizeCourseCode, SYSTEM_COURSES } from "./courseCatalog";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const ADMIN_EMAIL = "forjakeproject@gmail.com";
const ADMIN_PASSWORD = "administrator123";
const ADMIN_NAME = "System Administrator";
const APP_BASE_URL = process.env.APP_BASE_URL || "";

const parseCsvEnv = (value: string | undefined) =>
    String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const DEFAULT_LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

const configuredCorsOrigins = new Set([
    ...DEFAULT_LOCAL_FRONTEND_ORIGINS,
    ...parseCsvEnv(process.env.FRONTEND_URL),
    ...parseCsvEnv(process.env.CLIENT_ORIGIN),
    ...parseCsvEnv(process.env.ALLOWED_ORIGINS),
    ...parseCsvEnv(process.env.APP_BASE_URL)
]);

const normalizeOrigin = (value: string) => {
    try {
        return new URL(value).origin;
    } catch {
        return value.replace(/\/+$/, "");
    }
};

const allowedCorsOrigins = new Set(Array.from(configuredCorsOrigins).map(normalizeOrigin));

const corsOptions: CorsOptions = {
    credentials: true,
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }

        const normalizedOrigin = normalizeOrigin(origin);

        if (process.env.CORS_ALLOW_ALL === "true" || allowedCorsOrigins.has(normalizedOrigin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked origin: ${origin}`));
    }
};

type QueryRow = RowDataPacket & Record<string, unknown>;
type DbParam = string | number | boolean | Date | Buffer | null;
type DurationComputedStatus = "Upcoming" | "Active" | "Completed" | "Archived";

interface AlumniImportInputRow {
    fullName?: string;
    name?: string;
    graduationYear?: string;
    year?: string;
    emailAddress?: string;
    email?: string;
    program?: string;
    course?: string;
    contactNumber?: string;
}

interface AlumniImportPreparedRow {
    rowNumber: number;
    name: string;
    batch: string;
    email: string;
    course: string;
    contactNumber: string;
}

interface AlumniImportFailure {
    rowNumber: number;
    emailAddress: string;
    fullName: string;
    reason: string;
    category?: "invalid" | "duplicate" | "database" | "email";
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

type EventRsvpResponseStatus = "Going" | "Interested" | "Not Going";
type EventAttendanceStatus = "Pending" | "Attended" | "Absent";
type EventVerificationStatus = "Pending" | "Verified" | "Not Verified";

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
    start_datetime?: string | Date | null;
    end_datetime?: string | Date | null;
    auto_archive_at?: string | Date | null;
    archived_at?: string | Date | null;
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

interface MonthlyEngagementRow extends QueryRow {
    month_key: string;
    activity_type: string;
    activity_count: number | string;
}

interface CourseContributionRow extends QueryRow {
    course: string | null;
    alumni_count: number | string;
    donation_count: number | string;
    donated_amount: number | string;
    event_count: number | string;
    survey_count: number | string;
    achievement_count: number | string;
    freedom_wall_count: number | string;
    comment_count: number | string;
    contribution_score: number | string;
}

interface AlumniInsightRow extends QueryRow {
    alumni_id: string;
    name: string | null;
    course: string | null;
    batch: string | null;
    login_count: number | string;
    event_count: number | string;
    survey_count: number | string;
    donation_count: number | string;
    donated_amount: number | string;
    freedom_wall_count: number | string;
    comment_count: number | string;
    reaction_count: number | string;
    stored_score: number | string;
    last_login_at: string | Date | null;
    last_activity_at: string | Date | null;
}

interface DonationTrendRow extends QueryRow {
    month_key: string;
    donation_count: number | string;
    donated_amount: number | string;
}

interface HeatmapRow extends QueryRow {
    day_index: number | string;
    day_label: string;
    hour_block: number | string;
    activity_count: number | string;
}

interface EmploymentCourseRow extends QueryRow {
    course: string | null;
    employed_count: number | string;
    tracer_count: number | string;
}

interface AnnouncementInterestSummaryRow extends QueryRow {
    alumni_id: string;
    name: string | null;
    email: string | null;
    student_id: string | null;
    course: string | null;
    batch: string | null;
    interest_status: string | null;
    interested_at: string | null;
    updated_at: string | null;
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

const getErrorCode = (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error) {
        return String(error.code || "");
    }

    return "";
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

const MANILA_UTC_OFFSET = "+08:00";

const normalizeDateOnly = (value: unknown) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    return formatManilaDate(parsed);
};

const normalizeTimeOnly = (value: unknown, fallback = "00:00") => {
    const text = String(value || "").trim();
    if (!text) return fallback;
    const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    return match ? `${match[1]}:${match[2]}:${match[3] || "00"}` : fallback;
};

const parseManilaDateTime = (dateValue: unknown, timeValue: unknown, fallbackTime = "00:00") => {
    const date = normalizeDateOnly(dateValue);
    if (!date) return null;
    const time = normalizeTimeOnly(timeValue, fallbackTime);
    const parsed = new Date(`${date}T${time}${MANILA_UTC_OFFSET}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseDateTimeValue = (value: unknown) => {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
        const parsed = new Date(text.includes("+") || text.endsWith("Z") ? text : `${text}${MANILA_UTC_OFFSET}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(text)) {
        const parsed = new Date(`${text.replace(" ", "T")}${MANILA_UTC_OFFSET}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getManilaParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        year: map.year,
        month: map.month,
        day: map.day,
        hour: map.hour === "24" ? "00" : map.hour,
        minute: map.minute,
        second: map.second
    };
};

const formatManilaDate = (date: Date) => {
    const parts = getManilaParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatManilaTime = (date: Date) => {
    const parts = getManilaParts(date);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
};

const formatSqlDateTime = (date: Date | null) => {
    if (!date) return null;
    return `${formatManilaDate(date)} ${formatManilaTime(date)}`;
};

const formatDisplayManilaDateTime = (date: Date | null) => {
    if (!date) return "Not set";
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).format(date);
};

const getDurationWindowFromBody = (body: Record<string, unknown>) => {
    const legacyDate = body.date;
    const legacyTime = body.time;
    const start = parseDateTimeValue(body.start_datetime)
        || parseManilaDateTime(body.start_date, body.start_time, "00:00")
        || parseManilaDateTime(legacyDate, legacyTime || "00:00", "00:00");
    const end = parseDateTimeValue(body.end_datetime)
        || parseManilaDateTime(body.end_date, body.end_time, "23:59")
        || parseManilaDateTime(legacyDate, body.end_time || "23:59", "23:59");

    return {
        start,
        end,
        startSql: formatSqlDateTime(start),
        endSql: formatSqlDateTime(end)
    };
};

const getDurationDatesFromRow = (row: Record<string, unknown>) => {
    const start = parseDateTimeValue(row.start_datetime) || parseManilaDateTime(row.date, row.time || "00:00", "00:00");
    const end = parseDateTimeValue(row.end_datetime) || parseManilaDateTime(row.date, row.end_time || "23:59", "23:59");
    const archivedAt = parseDateTimeValue(row.archived_at);
    return { start, end, archivedAt };
};

const buildRemainingTime = (target: Date | null, now = new Date()) => {
    if (!target) return "No end time set";
    const totalMinutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [
        days ? `${days} day${days === 1 ? "" : "s"}` : "",
        hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
        minutes || (!days && !hours) ? `${minutes} minute${minutes === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    return `${parts.join(" ")} remaining`;
};

const computeDurationFields = (row: Record<string, unknown>) => {
    const now = new Date();
    const { start, end, archivedAt } = getDurationDatesFromRow(row);
    let computedStatus: DurationComputedStatus = "Active";

    const storedStatus = normalizeStatus(String(row.status || ""), "").toLowerCase();
    if (storedStatus === "ended" || storedStatus === "closed" || storedStatus === "completed") {
        computedStatus = "Completed";
    }

    if (archivedAt || storedStatus === "archived") {
        computedStatus = "Archived";
    } else if (computedStatus !== "Completed" && start && now.getTime() < start.getTime()) {
        computedStatus = "Upcoming";
    } else if (end && now.getTime() > end.getTime()) {
        const archiveAt = new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000);
        computedStatus = now.getTime() >= archiveAt.getTime() ? "Archived" : "Completed";
    } else if (computedStatus !== "Completed" && (start || end)) {
        computedStatus = "Active";
    }

    const isExpired = computedStatus === "Archived" || computedStatus === "Completed";
    const remainingTime = computedStatus === "Upcoming"
        ? `Starts ${formatDisplayManilaDateTime(start)}`
        : computedStatus === "Archived"
            ? `Archived after ${formatDisplayManilaDateTime(end)}`
            : computedStatus === "Completed"
                ? `Completed ${formatDisplayManilaDateTime(end)}`
            : buildRemainingTime(end, now);

    return {
        start_datetime: start ? formatSqlDateTime(start) : null,
        start_date: start ? formatManilaDate(start) : null,
        start_time: start ? formatManilaTime(start).slice(0, 5) : null,
        end_datetime: end ? formatSqlDateTime(end) : null,
        end_date: end ? formatManilaDate(end) : null,
        end_time: end ? formatManilaTime(end).slice(0, 5) : null,
        auto_archive_at: row.auto_archive_at || (end ? formatSqlDateTime(end) : null),
        archived_at: archivedAt ? formatSqlDateTime(archivedAt) : null,
        duration_status: computedStatus,
        computed_status: computedStatus,
        remaining_time: remainingTime,
        is_expired: isExpired
    };
};

const withDurationFields = <T extends Record<string, unknown>>(row: T) => ({
    ...row,
    ...computeDurationFields(row)
});

const autoArchiveExpiredContent = async () => {
    const announcementTable = await getAnnouncementTableName();
    const nowSql = formatSqlDateTime(new Date());

    if (await tableExists(announcementTable)) {
        await db.execute(
            `UPDATE ${announcementTable}
             SET status = 'archived',
                 archived_at = COALESCE(archived_at, ?),
                 auto_archive_at = COALESCE(auto_archive_at, end_datetime)
             WHERE end_datetime IS NOT NULL
               AND DATE_ADD(end_datetime, INTERVAL 7 DAY) < ?
               AND archived_at IS NULL
               AND LOWER(COALESCE(status, '')) <> 'archived'`,
            [nowSql, nowSql]
        );
    }

    if (await tableExists("surveys")) {
        await db.execute(
            `UPDATE surveys
             SET status = 'archived',
                 archived_at = COALESCE(archived_at, ?),
                 auto_archive_at = COALESCE(auto_archive_at, end_datetime)
             WHERE end_datetime IS NOT NULL
               AND DATE_ADD(end_datetime, INTERVAL 7 DAY) < ?
               AND archived_at IS NULL
               AND LOWER(COALESCE(status, '')) <> 'archived'`,
            [nowSql, nowSql]
        );
    }

    if (await tableExists("events")) {
        await db.execute(
            `UPDATE events
             SET status = 'archived',
                 archived_at = COALESCE(archived_at, ?),
                 auto_archive_at = COALESCE(auto_archive_at, end_datetime)
             WHERE end_datetime IS NOT NULL
               AND DATE_ADD(end_datetime, INTERVAL 7 DAY) < ?
               AND archived_at IS NULL
               AND LOWER(COALESCE(status, '')) <> 'archived'`,
            [nowSql, nowSql]
        );
    }
};

let autoArchiveTimer: NodeJS.Timeout | null = null;

const startDurationAutoArchiveJob = () => {
    if (autoArchiveTimer) return;
    const run = () => {
        autoArchiveExpiredContent().catch((error) => {
            console.error("AUTO ARCHIVE JOB ERROR:", error);
        });
    };
    run();
    autoArchiveTimer = setInterval(run, 5 * 60 * 1000);
};

const normalizeEventRsvpStatus = (value: unknown): EventRsvpResponseStatus | null => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (normalized === "going") return "Going";
    if (normalized === "interested") return "Interested";
    if (normalized === "not going" || normalized === "declined" || normalized === "notgoing") return "Not Going";
    return null;
};

const normalizeAttendanceStatus = (value: unknown): EventAttendanceStatus | null => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (normalized === "pending") return "Pending";
    if (normalized === "attended" || normalized === "checked in" || normalized === "checkedin") return "Attended";
    if (normalized === "absent") return "Absent";
    return null;
};

const normalizeVerificationStatus = (value: unknown): EventVerificationStatus | null => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (normalized === "pending") return "Pending";
    if (normalized === "verified" || normalized === "approved") return "Verified";
    if (normalized === "not verified" || normalized === "notverified" || normalized === "rejected") return "Not Verified";
    return null;
};

const ensureEventRsvpTables = async () => {
    const announcementTable = await getAnnouncementTableName();

    await db.execute(`
        CREATE TABLE IF NOT EXISTS event_rsvps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            alumni_id VARCHAR(36) NOT NULL,
            response_status VARCHAR(30) NOT NULL,
            attendance_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
            verification_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
            checked_in_at DATETIME NULL,
            engagement_awarded TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_event_alumni (event_id, alumni_id),
            INDEX idx_event_rsvps_event (event_id),
            INDEX idx_event_rsvps_alumni (alumni_id),
            FOREIGN KEY (event_id) REFERENCES ${announcementTable}(id) ON DELETE CASCADE,
            FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    const rsvpColumns = [
        { name: "attendance_status", sql: "ALTER TABLE event_rsvps ADD COLUMN attendance_status VARCHAR(30) NOT NULL DEFAULT 'Pending'" },
        { name: "verification_status", sql: "ALTER TABLE event_rsvps ADD COLUMN verification_status VARCHAR(30) NOT NULL DEFAULT 'Pending'" },
        { name: "checked_in_at", sql: "ALTER TABLE event_rsvps ADD COLUMN checked_in_at DATETIME NULL" },
        { name: "engagement_awarded", sql: "ALTER TABLE event_rsvps ADD COLUMN engagement_awarded TINYINT(1) DEFAULT 0" },
        { name: "updated_at", sql: "ALTER TABLE event_rsvps ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" }
    ];

    for (const column of rsvpColumns) {
        try {
            await db.execute(column.sql);
        } catch (error) {
            if (!getErrorMessage(error).toLowerCase().includes("duplicate column")) {
                console.error(`SCHEMA UPDATE ERROR: ${column.name}`, error);
            }
        }
    }

    try {
        await db.execute("ALTER TABLE event_rsvps ADD UNIQUE KEY unique_event_alumni (event_id, alumni_id)");
    } catch {
        // Older databases already have this key under a different name.
    }

    await db.execute(
        `UPDATE event_rsvps
         SET attendance_status = 'Attended'
         WHERE LOWER(COALESCE(attendance_status, '')) IN ('checked_in', 'checked in', 'attended')`
    );
    await db.execute(
        `UPDATE event_rsvps
         SET attendance_status = 'Absent'
         WHERE LOWER(COALESCE(attendance_status, '')) = 'absent'`
    );
    await db.execute(
        `UPDATE event_rsvps
         SET attendance_status = 'Pending'
         WHERE COALESCE(attendance_status, '') = ''`
    );
    await db.execute(
        `UPDATE event_rsvps
         SET verification_status = 'Pending'
         WHERE COALESCE(verification_status, '') = ''`
    );

    await db.execute(`
        CREATE TABLE IF NOT EXISTS engagement_points (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            source_type VARCHAR(50) NOT NULL,
            source_id INT NOT NULL,
            points INT NOT NULL,
            reason VARCHAR(255) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_engagement_source (user_id, source_type, source_id),
            INDEX idx_engagement_points_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS engagement_metrics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            alumni_id VARCHAR(36) NOT NULL,
            event_points INT NOT NULL DEFAULT 0,
            survey_points INT NOT NULL DEFAULT 0,
            achievement_points INT NOT NULL DEFAULT 0,
            freedom_wall_points INT NOT NULL DEFAULT 0,
            reaction_points INT NOT NULL DEFAULT 0,
            comment_points INT NOT NULL DEFAULT 0,
            total_score INT NOT NULL DEFAULT 0,
            engagement_level VARCHAR(50) NOT NULL DEFAULT 'Emerging',
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_engagement_metrics_alumni (alumni_id),
            FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
};

const ensureDashboardSlideTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS dashboard_slides (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            caption TEXT,
            media_type VARCHAR(30) NOT NULL DEFAULT 'image',
            image_url LONGTEXT NOT NULL,
            link_url TEXT,
            is_highlighted TINYINT(1) NOT NULL DEFAULT 0,
            display_order INT NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            created_by VARCHAR(36) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_dashboard_slides_visible (status, is_highlighted, display_order),
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    try {
        await db.execute("ALTER TABLE dashboard_slides ADD COLUMN media_type VARCHAR(30) NOT NULL DEFAULT 'image' AFTER caption");
    } catch (error) {
        if (!getErrorMessage(error).toLowerCase().includes("duplicate column")) {
            console.error("DASHBOARD SLIDES MEDIA TYPE MIGRATION ERROR:", error);
        }
    }

    await db.execute(`
        UPDATE dashboard_slides
        SET media_type = CASE
            WHEN image_url REGEXP 'youtube\\\\.com|youtu\\\\.be' THEN 'youtube'
            WHEN image_url REGEXP '\\\\.(mp4|webm|ogg|mov)(\\\\?.*)?$' OR image_url LIKE 'data:video/%' THEN 'video'
            ELSE 'image'
        END
        WHERE COALESCE(media_type, '') = '' OR media_type = 'image'
    `);
};

const ensureAlumniLoginActivityTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS alumni_login_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_alumni_login_events_user (user_id),
            INDEX idx_alumni_login_events_logged_at (logged_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
};

const ensureAnnouncementInterestTable = async () => {
    const announcementTable = await getAnnouncementTableName();
    await db.execute(`
        CREATE TABLE IF NOT EXISTS announcement_interests (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            announcement_id INT NOT NULL,
            alumni_id VARCHAR(36) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'interested',
            interested_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_announcement_interest_alumni (announcement_id, alumni_id),
            INDEX idx_announcement_interests_announcement (announcement_id, status),
            INDEX idx_announcement_interests_alumni (alumni_id),
            FOREIGN KEY (announcement_id) REFERENCES ${announcementTable}(id) ON DELETE CASCADE,
            FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
};

const recordAlumniLoginActivity = async (userId: string) => {
    try {
        await ensureAlumniLoginActivityTable();
        await db.execute(
            "INSERT INTO alumni_login_events (user_id, logged_at) VALUES (?, ?)",
            [userId, formatSqlDateTime(new Date())]
        );
    } catch (error) {
        console.error("ALUMNI LOGIN ACTIVITY ERROR:", error);
    }
};

const normalizeInterestStatus = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "_");
    return normalized === "not_interested" || normalized === "cancelled" || normalized === "false"
        ? "not_interested"
        : "interested";
};

const canTrackInterest = (row: QueryRow | null | undefined) => {
    if (!row) return false;
    const type = normalizeAnnouncementType(String(row.type || ""));
    return type === "event" || normalizeBoolean(row.interest_enabled);
};

const getAnnouncementInterestStatus = async (announcementId: number, alumniId: string) => {
    await ensureAnnouncementInterestTable();
    return getSingleRow(
        `SELECT id, announcement_id, alumni_id, status, interested_at, created_at, updated_at
         FROM announcement_interests
         WHERE announcement_id = ? AND alumni_id = ?`,
        [announcementId, alumniId]
    );
};

const getAnnouncementInterestSummary = async (announcementId: number) => {
    await ensureAnnouncementInterestTable();

    const totalRow = await getSingleRow(
        "SELECT COUNT(*) AS totalAlumni FROM user_roles WHERE role = 'alumni'"
    );
    const interestedRow = await getSingleRow(
        `SELECT COUNT(*) AS interestedCount
         FROM announcement_interests
         WHERE announcement_id = ? AND status = 'interested'`,
        [announcementId]
    );

    const totalAlumni = Number(totalRow?.totalAlumni || 0);
    const interestedCount = Number(interestedRow?.interestedCount || 0);
    const interestPercentage = totalAlumni > 0 ? Number(((interestedCount / totalAlumni) * 100).toFixed(1)) : 0;

    const alumni = parseRows<AnnouncementInterestSummaryRow>(await db.query<AnnouncementInterestSummaryRow>(
        `SELECT
            p.id AS alumni_id,
            p.name,
            p.email,
            p.student_id,
            p.course,
            p.batch,
            ai.status AS interest_status,
            ai.interested_at,
            ai.updated_at
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni'
         LEFT JOIN announcement_interests ai ON ai.announcement_id = ? AND ai.alumni_id = p.id
         ORDER BY
            CASE WHEN ai.status = 'interested' THEN 0 ELSE 1 END,
            p.name ASC`,
        [announcementId]
    ));

    return {
        totalAlumni,
        interestedCount,
        notInterestedCount: Math.max(totalAlumni - interestedCount, 0),
        interestPercentage,
        alumni: alumni.map((row) => ({
            alumniId: String(row.alumni_id),
            name: row.name || "Unknown alumni",
            email: row.email || null,
            studentId: row.student_id || null,
            course: row.course || null,
            batch: row.batch || null,
            isInterested: String(row.interest_status || "").toLowerCase() === "interested",
            interestStatus: String(row.interest_status || "not_interested"),
            interestedAt: row.interested_at || null,
            updatedAt: row.updated_at || null
        }))
    };
};

const getDashboardMonthBuckets = () => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string }> = [];

    for (let offset = 11; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        buckets.push({
            key,
            label: date.toLocaleString("en-US", { month: "short" })
        });
    }

    return buckets;
};

const getCourseLabel = (course: unknown) => {
    const rawCourse = String(course || "").trim();
    if (!rawCourse) return "Unassigned";

    const normalized = normalizeCourseCode(rawCourse);
    return normalized ? COURSE_LABELS[normalized] || rawCourse : rawCourse;
};

const getActivityEngagementCategory = (score: number, daysSinceLastActivity: number | null) => {
    if (score >= 90 && (daysSinceLastActivity === null || daysSinceLastActivity <= 30)) return "Highly Active";
    if (score >= 45 && (daysSinceLastActivity === null || daysSinceLastActivity <= 60)) return "Moderately Active";
    if (daysSinceLastActivity !== null && daysSinceLastActivity > 60) return "At Risk of Inactivity";
    return "Low Engagement";
};

const getDaysSince = (value: unknown) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
};

const getAdminDashboardAnalytics = async () => {
    await ensureAlumniLoginActivityTable();
    await ensureAnnouncementInterestTable();
    await ensureAnnouncementEventSurveyEngagementTables();
    await ensureEventRsvpTables();

    const monthBuckets = getDashboardMonthBuckets();
    const startMonth = `${monthBuckets[0].key}-01 00:00:00`;
    const monthlySources: string[] = [];

    const addMonthlySource = async (tableName: string, activityAt: string, activityType: string, whereClause = "") => {
        if (!(await tableExists(tableName))) return;
        monthlySources.push(`
            SELECT ${activityAt} AS activity_at, '${activityType}' AS activity_type
            FROM ${tableName}
            ${whereClause}
        `);
    };

    await addMonthlySource(
        "alumni_login_events",
        "ale.logged_at",
        "logins",
        "ale INNER JOIN user_roles ur ON ur.user_id = ale.user_id AND ur.role = 'alumni'"
    );
    await addMonthlySource("event_comments", "created_at", "comments");
    await addMonthlySource("achievement_comments", "created_at", "comments");
    await addMonthlySource("announcement_interests", "interested_at", "eventInterest", "WHERE status = 'interested'");
    await addMonthlySource("survey_responses", "submitted_at", "surveyResponses");
    await addMonthlySource("announcement_comments", "created_at", "announcementInteractions", "WHERE LOWER(COALESCE(status, 'visible')) = 'visible'");
    await addMonthlySource("announcement_comment_replies", "created_at", "announcementInteractions", "WHERE LOWER(COALESCE(status, 'visible')) = 'visible'");
    await addMonthlySource("freedom_wall_posts", "created_at", "freedomWall", "WHERE LOWER(COALESCE(status, 'published')) = 'published'");
    await addMonthlySource("freedom_wall_comments", "created_at", "freedomWall", "WHERE LOWER(COALESCE(status, 'published')) = 'published'");
    await addMonthlySource("reactions", "created_at", "freedomWall");

    const monthlyRows = monthlySources.length
        ? parseRows<MonthlyEngagementRow>(await db.query<MonthlyEngagementRow>(
            `SELECT
                month_key,
                activity_type,
                COUNT(*) AS activity_count
             FROM (
                SELECT
                    DATE_FORMAT(activity_at, '%Y-%m') AS month_key,
                    activity_type
                FROM (${monthlySources.join(" UNION ALL ")}) activity
                WHERE activity_at IS NOT NULL
                AND activity_at >= ?
             ) monthly_activity
             GROUP BY month_key, activity_type
             ORDER BY month_key ASC`,
            [startMonth]
        ))
        : [];

    const monthlyEngagement = monthBuckets.map((bucket) => ({
        month: bucket.label,
        monthKey: bucket.key,
        logins: 0,
        comments: 0,
        eventInterest: 0,
        surveyResponses: 0,
        announcementInteractions: 0,
        freedomWall: 0,
        total: 0
    }));

    const monthlyMap = new Map(monthlyEngagement.map((item) => [item.monthKey, item]));
    for (const row of monthlyRows) {
        const month = monthlyMap.get(String(row.month_key || ""));
        if (!month) continue;

        const activityType = String(row.activity_type || "");
        const count = Number(row.activity_count || 0);

        if (
            activityType === "logins" ||
            activityType === "comments" ||
            activityType === "eventInterest" ||
            activityType === "surveyResponses" ||
            activityType === "announcementInteractions" ||
            activityType === "freedomWall"
        ) {
            month[activityType] = count;
        }
        month.total += count;
    }

    const eventContributionSubquery = `
        SELECT alumni_id AS user_id, COUNT(DISTINCT announcement_id) AS event_count
        FROM announcement_interests
        WHERE status = 'interested'
        GROUP BY alumni_id
    `;

    const freedomContributionSubquery = `
        SELECT user_id, SUM(activity_count) AS freedom_wall_count
        FROM (
            SELECT user_id, COUNT(*) AS activity_count FROM freedom_wall_posts WHERE LOWER(COALESCE(status, 'published')) = 'published' GROUP BY user_id
            UNION ALL
            SELECT user_id, COUNT(*) AS activity_count FROM freedom_wall_comments WHERE LOWER(COALESCE(status, 'published')) = 'published' GROUP BY user_id
            UNION ALL
            SELECT user_id, COUNT(*) AS activity_count FROM reactions GROUP BY user_id
        ) freedom_activity
        GROUP BY user_id
    `;

    const commentContributionSubquery = `
        SELECT user_id, SUM(comment_count) AS comment_count
        FROM (
            SELECT alumni_id AS user_id, COUNT(*) AS comment_count FROM event_comments GROUP BY alumni_id
            UNION ALL
            SELECT user_id, COUNT(*) AS comment_count FROM achievement_comments GROUP BY user_id
            UNION ALL
            SELECT user_id, COUNT(*) AS comment_count FROM announcement_comments WHERE LOWER(COALESCE(status, 'visible')) = 'visible' GROUP BY user_id
        ) comment_activity
        GROUP BY user_id
    `;

    const courseContributionRows = parseRows<CourseContributionRow>(await db.query<CourseContributionRow>(
        `SELECT
            COALESCE(NULLIF(TRIM(p.course), ''), 'Unassigned') AS course,
            COUNT(DISTINCT p.id) AS alumni_count,
            COALESCE(SUM(d.donation_count), 0) AS donation_count,
            COALESCE(SUM(d.donated_amount), 0) AS donated_amount,
            COALESCE(SUM(ev.event_count), 0) AS event_count,
            COALESCE(SUM(sr.survey_count), 0) AS survey_count,
            COALESCE(SUM(ach.achievement_count), 0) AS achievement_count,
            COALESCE(SUM(fw.freedom_wall_count), 0) AS freedom_wall_count,
            COALESCE(SUM(cm.comment_count), 0) AS comment_count,
            COALESCE(SUM(
                COALESCE(d.donation_count, 0) * 15 +
                COALESCE(ev.event_count, 0) * 10 +
                COALESCE(sr.survey_count, 0) * 8 +
                COALESCE(ach.achievement_count, 0) * 12 +
                COALESCE(fw.freedom_wall_count, 0) * 5 +
                COALESCE(cm.comment_count, 0) * 4
            ), 0) AS contribution_score
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni'
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS donation_count, COALESCE(SUM(amount), 0) AS donated_amount
            FROM donations
            WHERE LOWER(COALESCE(status, '')) = 'approved'
            GROUP BY user_id
         ) d ON d.user_id = p.id
         LEFT JOIN (${eventContributionSubquery}) ev ON ev.user_id = p.id
         LEFT JOIN (
            SELECT respondent_id AS user_id, COUNT(*) AS survey_count
            FROM survey_responses
            WHERE respondent_id IS NOT NULL
            GROUP BY respondent_id
         ) sr ON sr.user_id = p.id
         LEFT JOIN (
            SELECT alumni_id AS user_id, COUNT(*) AS achievement_count
            FROM achievements
            WHERE LOWER(COALESCE(status, 'approved')) = 'approved'
            GROUP BY alumni_id
         ) ach ON ach.user_id = p.id
         LEFT JOIN (${freedomContributionSubquery}) fw ON fw.user_id = p.id
         LEFT JOIN (${commentContributionSubquery}) cm ON cm.user_id = p.id
         GROUP BY COALESCE(NULLIF(TRIM(p.course), ''), 'Unassigned')
         ORDER BY contribution_score DESC, alumni_count DESC, course ASC
         LIMIT 10`
    ));

    const courseContributions = courseContributionRows.map((row) => ({
        course: String(row.course || "Unassigned"),
        courseLabel: getCourseLabel(row.course),
        alumniCount: Number(row.alumni_count || 0),
        donations: Number(row.donation_count || 0),
        donatedAmount: Number(row.donated_amount || 0),
        events: Number(row.event_count || 0),
        surveyResponses: Number(row.survey_count || 0),
        achievements: Number(row.achievement_count || 0),
        freedomWall: Number(row.freedom_wall_count || 0),
        comments: Number(row.comment_count || 0),
        contributionScore: Number(row.contribution_score || 0)
    }));

    const alumniInsightRows = parseRows<AlumniInsightRow>(await db.query<AlumniInsightRow>(
        `SELECT
            p.id AS alumni_id,
            p.name,
            COALESCE(NULLIF(TRIM(p.course), ''), 'Unassigned') AS course,
            p.batch,
            COALESCE(l.login_count, 0) AS login_count,
            COALESCE(ev.event_count, 0) AS event_count,
            COALESCE(sr.survey_count, 0) AS survey_count,
            COALESCE(d.donation_count, 0) AS donation_count,
            COALESCE(d.donated_amount, 0) AS donated_amount,
            COALESCE(fw.freedom_wall_count, 0) AS freedom_wall_count,
            COALESCE(cm.comment_count, 0) AS comment_count,
            COALESCE(rx.reaction_count, 0) AS reaction_count,
            COALESCE(em.total_score, 0) AS stored_score,
            l.last_login_at,
            GREATEST(
                COALESCE(l.last_login_at, '1970-01-01'),
                COALESCE(ev.last_event_at, '1970-01-01'),
                COALESCE(sr.last_survey_at, '1970-01-01'),
                COALESCE(d.last_donation_at, '1970-01-01'),
                COALESCE(fw.last_freedom_wall_at, '1970-01-01'),
                COALESCE(cm.last_comment_at, '1970-01-01'),
                COALESCE(rx.last_reaction_at, '1970-01-01')
            ) AS last_activity_at
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni'
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS login_count, MAX(logged_at) AS last_login_at
            FROM alumni_login_events
            WHERE logged_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)
            GROUP BY user_id
         ) l ON l.user_id = p.id
         LEFT JOIN (
            SELECT alumni_id AS user_id, COUNT(*) AS event_count, MAX(COALESCE(updated_at, created_at)) AS last_event_at
            FROM event_rsvps
            GROUP BY alumni_id
         ) ev ON ev.user_id = p.id
         LEFT JOIN (
            SELECT respondent_id AS user_id, COUNT(*) AS survey_count, MAX(submitted_at) AS last_survey_at
            FROM survey_responses
            WHERE respondent_id IS NOT NULL
            GROUP BY respondent_id
         ) sr ON sr.user_id = p.id
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS donation_count, COALESCE(SUM(amount), 0) AS donated_amount, MAX(created_at) AS last_donation_at
            FROM donations
            WHERE ${donationStatusSql("status")} IN ('approved', 'approve')
            GROUP BY user_id
         ) d ON d.user_id = p.id
         LEFT JOIN (${freedomContributionSubquery.replace("SUM(activity_count) AS freedom_wall_count", "SUM(activity_count) AS freedom_wall_count, MAX(activity_at) AS last_freedom_wall_at").replace("SELECT user_id, COUNT(*) AS activity_count FROM freedom_wall_posts WHERE", "SELECT user_id, COUNT(*) AS activity_count, MAX(created_at) AS activity_at FROM freedom_wall_posts WHERE").replace("SELECT user_id, COUNT(*) AS activity_count FROM freedom_wall_comments WHERE", "SELECT user_id, COUNT(*) AS activity_count, MAX(created_at) AS activity_at FROM freedom_wall_comments WHERE").replace("SELECT user_id, COUNT(*) AS activity_count FROM reactions GROUP BY user_id", "SELECT user_id, COUNT(*) AS activity_count, MAX(created_at) AS activity_at FROM reactions GROUP BY user_id")}) fw ON fw.user_id = p.id
         LEFT JOIN (
            SELECT user_id, SUM(comment_count) AS comment_count, MAX(last_comment_at) AS last_comment_at
            FROM (
                SELECT alumni_id AS user_id, COUNT(*) AS comment_count, MAX(created_at) AS last_comment_at FROM event_comments GROUP BY alumni_id
                UNION ALL
                SELECT user_id, COUNT(*) AS comment_count, MAX(created_at) AS last_comment_at FROM achievement_comments GROUP BY user_id
                UNION ALL
                SELECT user_id, COUNT(*) AS comment_count, MAX(created_at) AS last_comment_at FROM announcement_comments WHERE LOWER(COALESCE(status, 'visible')) = 'visible' GROUP BY user_id
            ) comment_activity
            GROUP BY user_id
         ) cm ON cm.user_id = p.id
         LEFT JOIN (
            SELECT user_id, COUNT(*) AS reaction_count, MAX(created_at) AS last_reaction_at
            FROM reactions
            GROUP BY user_id
         ) rx ON rx.user_id = p.id
         LEFT JOIN engagement_metrics em ON em.alumni_id = p.id
         ORDER BY last_activity_at DESC
         LIMIT 100`
    ));

    const alumniInsights = alumniInsightRows.map((row) => {
        const score =
            Number(row.stored_score || 0) +
            Number(row.login_count || 0) * 2 +
            Number(row.event_count || 0) * 12 +
            Number(row.survey_count || 0) * 8 +
            Number(row.donation_count || 0) * 18 +
            Number(row.freedom_wall_count || 0) * 5 +
            Number(row.comment_count || 0) * 4 +
            Number(row.reaction_count || 0) * 2;
        const daysSinceLastActivity = getDaysSince(row.last_activity_at);

        return {
            alumniId: String(row.alumni_id),
            name: String(row.name || "Unknown alumni"),
            course: String(row.course || "Unassigned"),
            courseLabel: getCourseLabel(row.course),
            batch: row.batch ? String(row.batch) : "Unassigned",
            score,
            loginCount: Number(row.login_count || 0),
            eventCount: Number(row.event_count || 0),
            surveyCount: Number(row.survey_count || 0),
            donationCount: Number(row.donation_count || 0),
            donatedAmount: Number(row.donated_amount || 0),
            interactionCount: Number(row.freedom_wall_count || 0) + Number(row.comment_count || 0) + Number(row.reaction_count || 0),
            daysSinceLastActivity,
            prediction: getActivityEngagementCategory(score, daysSinceLastActivity),
            eventParticipationLikelihood: Math.min(95, Math.round(25 + Number(row.event_count || 0) * 12 + Number(row.login_count || 0) * 2 + Number(row.survey_count || 0) * 4)),
            donorLikelihood: Math.min(95, Math.round(15 + Number(row.donation_count || 0) * 25 + Number(row.event_count || 0) * 6 + Number(row.login_count || 0) * 2))
        };
    });

    const predictionCounts = ["Highly Active", "Moderately Active", "Low Engagement", "At Risk of Inactivity"].map((category) => {
        const count = alumniInsights.filter((item) => item.prediction === category).length;
        return {
            category,
            count,
            percentage: alumniInsights.length ? Math.round((count / alumniInsights.length) * 100) : 0
        };
    });

    const donationTrendsRows = parseRows<DonationTrendRow>(await db.query<DonationTrendRow>(
        `SELECT
            DATE_FORMAT(created_at, '%Y-%m') AS month_key,
            COUNT(*) AS donation_count,
            COALESCE(SUM(amount), 0) AS donated_amount
         FROM donations
         WHERE ${donationStatusSql("status")} IN ('approved', 'approve')
           AND created_at >= ?
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month_key ASC`,
        [startMonth]
    ));
    const donationTrendMap = new Map(donationTrendsRows.map((row) => [String(row.month_key), row]));
    const donationTrends = monthBuckets.map((bucket) => {
        const row = donationTrendMap.get(bucket.key);
        return {
            month: bucket.label,
            monthKey: bucket.key,
            donationCount: Number(row?.donation_count || 0),
            donatedAmount: Number(row?.donated_amount || 0)
        };
    });

    const heatmapRows = parseRows<HeatmapRow>(await db.query<HeatmapRow>(
        `SELECT
            day_index,
            day_label,
            hour_block,
            COUNT(*) AS activity_count
         FROM (
            SELECT
                DAYOFWEEK(activity_at) - 1 AS day_index,
                DATE_FORMAT(activity_at, '%a') AS day_label,
                HOUR(activity_at) AS hour_block
            FROM (
                SELECT logged_at AS activity_at FROM alumni_login_events
                UNION ALL SELECT created_at AS activity_at FROM event_comments
                UNION ALL SELECT interested_at AS activity_at FROM announcement_interests WHERE status = 'interested'
                UNION ALL SELECT submitted_at AS activity_at FROM survey_responses
                UNION ALL SELECT created_at AS activity_at FROM freedom_wall_posts WHERE LOWER(COALESCE(status, 'published')) = 'published'
                UNION ALL SELECT created_at AS activity_at FROM freedom_wall_comments WHERE LOWER(COALESCE(status, 'published')) = 'published'
                UNION ALL SELECT created_at AS activity_at FROM reactions
                UNION ALL SELECT created_at AS activity_at FROM donations
            ) activity
            WHERE activity_at IS NOT NULL
              AND activity_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         ) heatmap_activity
         GROUP BY day_index, day_label, hour_block
         ORDER BY day_index ASC, hour_block ASC`
    ));
    const heatmap = heatmapRows.map((row) => ({
        dayIndex: Number(row.day_index || 0),
        dayLabel: String(row.day_label || ""),
        hour: Number(row.hour_block || 0),
        activityCount: Number(row.activity_count || 0)
    }));

    const employmentRows = parseRows<EmploymentCourseRow>(await db.query<EmploymentCourseRow>(
        `SELECT
            COALESCE(NULLIF(TRIM(p.course), ''), 'Unassigned') AS course,
            COUNT(DISTINCT tf.user_id) AS tracer_count,
            COUNT(DISTINCT CASE
                WHEN LOWER(COALESCE(tf.employment_status, '')) LIKE '%employed%' THEN tf.user_id
                ELSE NULL
            END) AS employed_count
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni'
         LEFT JOIN tracer_form tf ON tf.user_id = p.id
         GROUP BY COALESCE(NULLIF(TRIM(p.course), ''), 'Unassigned')`
    ));
    const employmentMap = new Map(employmentRows.map((row) => [String(row.course || "Unassigned"), row]));
    const courseComparisons = courseContributions.map((course) => {
        const employment = employmentMap.get(course.course);
        const activeCount = alumniInsights.filter((item) => item.course === course.course && ["Highly Active", "Moderately Active"].includes(item.prediction)).length;
        const tracerCount = Number(employment?.tracer_count || 0);
        const employedCount = Number(employment?.employed_count || 0);
        return {
            ...course,
            activeCount,
            engagementRate: course.alumniCount ? Math.round((activeCount / course.alumniCount) * 100) : 0,
            donationParticipationRate: course.alumniCount ? Math.round((course.donations / course.alumniCount) * 100) : 0,
            eventParticipationRate: course.alumniCount ? Math.round((course.events / course.alumniCount) * 100) : 0,
            surveyParticipationRate: course.alumniCount ? Math.round((course.surveyResponses / course.alumniCount) * 100) : 0,
            employmentRate: tracerCount ? Math.round((employedCount / tracerCount) * 100) : 0
        };
    });

    const currentMonth = monthlyEngagement[monthlyEngagement.length - 1];
    const previousMonth = monthlyEngagement[monthlyEngagement.length - 2];
    const topCourse = courseComparisons[0];
    const topAlumni = [...alumniInsights].sort((a, b) => b.score - a.score).slice(0, 8);
    const atRiskCount = predictionCounts.find((item) => item.category === "At Risk of Inactivity")?.count || 0;
    const donationGrowth = donationTrends.length >= 2
        ? donationTrends[donationTrends.length - 1].donatedAmount - donationTrends[donationTrends.length - 2].donatedAmount
        : 0;
    const insightSummaries = [
        topCourse
            ? `${topCourse.courseLabel} currently leads engagement with ${topCourse.contributionScore} contribution points across events, surveys, donations, and social activity.`
            : "No course engagement activity has been recorded yet.",
        currentMonth && previousMonth
            ? `${currentMonth.month} activity is ${currentMonth.total >= previousMonth.total ? "up" : "down"} by ${Math.abs(currentMonth.total - previousMonth.total)} interactions compared with ${previousMonth.month}.`
            : "Monthly activity history is still building.",
        donationGrowth > 0
            ? `Approved donations increased by ${donationGrowth.toLocaleString()} this month based on live donation records.`
            : "Donation growth is flat or lower this month, so donation campaign follow-ups may be useful.",
        atRiskCount > 0
            ? `${atRiskCount} alumni are predicted at risk of inactivity and should receive engagement reminders.`
            : "No alumni are currently flagged as at risk by the engagement prediction model."
    ];

    return {
        monthlyEngagement,
        courseContributions,
        courseComparisons,
        donationTrends,
        heatmap,
        topAlumni,
        predictionCounts,
        insightSummaries
    };
};

const getEventForRsvp = async (eventId: number) => {
    const announcementTable = await getAnnouncementTableName();
    return getSingleRow(
        `SELECT id, title, type, status, date, time, start_datetime, end_datetime, auto_archive_at, archived_at
         FROM ${announcementTable}
         WHERE id = ?`,
        [eventId]
    );
};

const ensureEventCanAcceptRsvp = (eventRow: QueryRow | undefined | null) => {
    if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
        return "Event not found.";
    }

    const duration = computeDurationFields(eventRow);
    if (duration.is_expired || duration.computed_status === "Archived") {
        return "RSVP is closed for this event.";
    }

    return null;
};

const isEventActiveForCheckIn = (eventRow: QueryRow | undefined | null) => {
    if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
        return false;
    }

    const duration = computeDurationFields(eventRow);
    return duration.computed_status === "Active" && !duration.is_expired;
};

const awardEventAttendancePoints = async (conn: PoolConnection, eventId: number, alumniId: string) => {
    const [pointResult] = await conn.query<ResultSetHeader>(
        `INSERT IGNORE INTO engagement_points (user_id, source_type, source_id, points, reason)
         VALUES (?, 'event_attendance', ?, 10, 'Event attendance')`,
        [alumniId, eventId]
    );

    await conn.query(
        `UPDATE event_rsvps
         SET engagement_awarded = 1
         WHERE event_id = ? AND alumni_id = ?`,
        [eventId, alumniId]
    );

    if (pointResult.affectedRows > 0) {
        await conn.query(
            `INSERT INTO engagement_metrics (alumni_id, event_points, total_score, engagement_level, last_updated)
             VALUES (?, 10, 10, 'Emerging', ?)
             ON DUPLICATE KEY UPDATE
                event_points = event_points + 10,
                total_score = total_score + 10,
                last_updated = VALUES(last_updated)`,
            [alumniId, formatSqlDateTime(new Date())]
        );
        await conn.query(
            `UPDATE engagement_metrics
             SET engagement_level = CASE
                WHEN total_score >= 120 THEN 'Champion'
                WHEN total_score >= 85 THEN 'Highly Active'
                WHEN total_score >= 50 THEN 'Active'
                ELSE 'Emerging'
             END
             WHERE alumni_id = ?`,
            [alumniId]
        );
    }
};

const getEventRsvpSummary = async (eventId: number) => {
    await ensureEventRsvpTables();
    const rows = parseRows(await db.query(
        `SELECT
            er.id,
            er.event_id,
            er.alumni_id,
            er.response_status,
            er.attendance_status,
            er.verification_status,
            er.checked_in_at,
            er.engagement_awarded,
            er.created_at,
            er.updated_at,
            p.name,
            p.email,
            p.student_id,
            p.course,
            p.batch
         FROM event_rsvps er
         LEFT JOIN profiles p ON p.id = er.alumni_id
         WHERE er.event_id = ?
         ORDER BY er.updated_at DESC, er.created_at DESC`,
        [eventId]
    ));

    const counts = {
        going: 0,
        interested: 0,
        notGoing: 0,
        pending: 0,
        attended: 0,
        absent: 0,
        verified: 0,
        notVerified: 0,
        verificationPending: 0
    };

    for (const row of rows) {
        const responseStatus = normalizeEventRsvpStatus(row.response_status) || "Interested";
        const attendanceStatus = normalizeAttendanceStatus(row.attendance_status) || "Pending";
        const verificationStatus = normalizeVerificationStatus(row.verification_status) || "Pending";
        if (responseStatus === "Going") counts.going += 1;
        if (responseStatus === "Interested") counts.interested += 1;
        if (responseStatus === "Not Going") counts.notGoing += 1;
        if (attendanceStatus === "Pending") counts.pending += 1;
        if (attendanceStatus === "Attended") counts.attended += 1;
        if (attendanceStatus === "Absent") counts.absent += 1;
        if (verificationStatus === "Verified") counts.verified += 1;
        if (verificationStatus === "Not Verified") counts.notVerified += 1;
        if (verificationStatus === "Pending") counts.verificationPending += 1;
    }

    return { rsvps: rows, counts };
};

const mapDashboardSlide = (row: QueryRow) => ({
    id: Number(row.id),
    title: String(row.title || ""),
    caption: row.caption ? String(row.caption) : "",
    mediaType: normalizeDashboardSlideMediaType(row.media_type, row.image_url),
    mediaUrl: normalizeStoredMedia(row.image_url),
    imageUrl: normalizeStoredMedia(row.image_url),
    linkUrl: row.link_url ? String(row.link_url) : "",
    isHighlighted: Boolean(row.is_highlighted),
    displayOrder: Number(row.display_order || 0),
    status: String(row.status || "active"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const getYouTubeVideoId = (value: unknown) => {
    const text = normalizeText(value);
    if (!text) return null;

    const directMatch = text.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    if (directMatch) return directMatch[1];

    try {
        const normalizedUrl = /^https?:\/\//i.test(text) ? text : `https://${text}`;
        const url = new URL(normalizedUrl);
        const host = url.hostname.replace(/^www\./i, "").replace(/^m\./i, "").replace(/^music\./i, "").toLowerCase();
        const pathParts = url.pathname.split("/").filter(Boolean);
        const candidate =
            host === "youtu.be"
                ? pathParts[0]
                : host === "youtube.com" || host === "youtube-nocookie.com"
                    ? url.searchParams.get("v") || (["embed", "shorts", "live", "v"].includes(pathParts[0]) ? pathParts[1] : null)
                    : null;

        return candidate && /^[A-Za-z0-9_-]{6,}$/.test(candidate) ? candidate : null;
    } catch {
        return null;
    }
};

const toYouTubeEmbedUrl = (value: unknown) => {
    const videoId = getYouTubeVideoId(value);
    if (!videoId) return null;

    const params = new URLSearchParams({
        autoplay: "1",
        mute: "1",
        playsinline: "1",
        rel: "0",
        enablejsapi: "1"
    });

    if (APP_BASE_URL) {
        try {
            params.set("origin", new URL(APP_BASE_URL).origin);
        } catch {
            // APP_BASE_URL is optional and may be a relative deployment path.
        }
    }

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

const isStoredVideoMedia = (value: unknown) => {
    const text = normalizeText(value);
    return /^data:video\//i.test(text) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(text);
};

const normalizeDashboardSlideMediaType = (mediaType: unknown, mediaUrl: unknown) => {
    const normalized = normalizeText(mediaType).toLowerCase();
    if (normalized === "youtube") return "youtube";
    if (normalized === "video") return "video";
    if (getYouTubeVideoId(mediaUrl)) return "youtube";
    if (isStoredVideoMedia(mediaUrl)) return "video";
    return "image";
};

const prepareDashboardSlideMedia = (mediaType: unknown, mediaUrl: unknown) => {
    const requestedType = normalizeDashboardSlideMediaType(mediaType, mediaUrl);
    if (requestedType === "youtube") {
        const embedUrl = toYouTubeEmbedUrl(mediaUrl);
        return embedUrl ? { mediaType: "youtube", mediaUrl: embedUrl } : null;
    }

    const storedMedia = normalizeStoredMedia(typeof mediaUrl === "string" ? mediaUrl : String(mediaUrl || ""));
    if (!storedMedia) return null;

    return {
        mediaType: requestedType === "video" || isStoredVideoMedia(storedMedia) ? "video" : "image",
        mediaUrl: storedMedia
    };
};

const formatStatusLabel = (value: string | null | undefined, fallback = "pending") => {
    const normalized = normalizeStatus(value, fallback);
    return normalized
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeDonationStatus = (value: unknown) => {
    const normalized = normalizeStatus(String(value || "pending_review"), "pending_review").replace(/[\s-]+/g, "_");
    if (normalized === "pending") {
        return "pending_review";
    }

    if (normalized === "approved" || normalized === "rejected" || normalized === "pending_review") {
        return normalized;
    }

    return "pending_review";
};

const donationStatusSql = (column = "status") =>
    `LOWER(REPLACE(REPLACE(TRIM(COALESCE(${column}, 'pending_review')), '-', '_'), ' ', '_'))`;

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

const normalizeBoolean = (value: unknown, fallback = false) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") return fallback;

    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    return fallback;
};

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

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const ALLOWED_ALUMNI_EMAIL_DOMAINS = ["gmail.com", "email.com"];

const getEmailValidationMessage = (emailAddress: string) => {
    const email = normalizeEmail(emailAddress);

    if (!email || !EMAIL_REGEX.test(email)) {
        return "Enter a valid email address using an allowed domain.";
    }

    const [localPart, domain = ""] = email.split("@");

    if (
        !localPart ||
        !domain ||
        localPart.startsWith(".") ||
        localPart.endsWith(".") ||
        localPart.includes("..") ||
        domain.startsWith(".") ||
        domain.endsWith(".") ||
        domain.includes("..")
    ) {
        return "Enter a valid email address using an allowed domain.";
    }

    const allowedDomain = ALLOWED_ALUMNI_EMAIL_DOMAINS.includes(domain) || domain === "edu.ph" || domain.endsWith(".edu.ph");

    if (!allowedDomain) {
        return "Email must use @gmail.com, @email.com, or an .edu.ph school domain.";
    }

    return "";
};

const validateImportRow = (row: AlumniImportInputRow, rowNumber: number) => {
    const fullName = normalizeText(row.fullName || row.name);
    const graduationYear = normalizeBatch(row.graduationYear || row.year);
    const emailAddress = normalizeEmail(row.emailAddress || row.email);
    const courseValidation = validateSupportedCourse(row.program || row.course);
    const contactNumber = normalizePhone(row.contactNumber);

    if (!fullName) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Name is required", category: "invalid" as const } };
    }

    if (!graduationYear || !/^\d{4}$/.test(graduationYear)) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Year must be a 4-digit year", category: "invalid" as const } };
    }

    const emailValidationMessage = getEmailValidationMessage(emailAddress);
    if (emailValidationMessage) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: emailValidationMessage, category: "invalid" as const } };
    }

    if (!courseValidation.ok || !courseValidation.course) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: courseValidation.message || "Program is required", category: "invalid" as const } };
    }

    return {
        ok: true as const,
        prepared: {
            rowNumber,
            name: fullName,
            batch: graduationYear,
            email: emailAddress,
            course: courseValidation.course,
            contactNumber
        }
    };
};

const normalizeImportHeader = (value: unknown) =>
    normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const IMPORT_HEADER_MAP: Record<string, keyof AlumniImportInputRow> = {
    name: "name",
    fullname: "fullName",
    alumniname: "fullName",
    graduatefullname: "fullName",
    email: "email",
    emailaddress: "emailAddress",
    mail: "email",
    year: "year",
    graduationyear: "graduationYear",
    gradyear: "graduationYear",
    batch: "graduationYear",
    batchyear: "graduationYear",
    yeargraduated: "graduationYear",
    program: "program",
    course: "course",
    degreeprogram: "program",
    contact: "contactNumber",
    contactnumber: "contactNumber",
    mobilenumber: "contactNumber",
    phone: "contactNumber",
    phonenumber: "contactNumber"
};

const getCellText = (cell: ExcelJS.Cell) => {
    const text = normalizeText(cell.text);

    if (text) {
        return text;
    }

    const value = cell.value;

    if (value && typeof value === "object") {
        if ("text" in value) {
            return normalizeText(value.text);
        }

        if ("result" in value) {
            return normalizeText(value.result);
        }
    }

    return normalizeText(value);
};

const worksheetToImportRows = (worksheet: ExcelJS.Worksheet): AlumniImportInputRow[] => {
    let headerRowNumber = 0;
    const headerIndexes = new Map<number, keyof AlumniImportInputRow>();

    worksheet.eachRow((row, rowNumber) => {
        if (headerRowNumber > 0) {
            return;
        }

        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
            const mappedKey = IMPORT_HEADER_MAP[normalizeImportHeader(getCellText(cell))];

            if (mappedKey) {
                headerIndexes.set(columnNumber, mappedKey);
            }
        });

        if (headerIndexes.size > 0) {
            headerRowNumber = rowNumber;
        } else {
            headerIndexes.clear();
        }
    });

    if (headerRowNumber === 0) {
        throw new Error("Import file must include headers: name, email, year, and program.");
    }

    const rows: AlumniImportInputRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) {
            return;
        }

        const parsedRow: AlumniImportInputRow = {};
        let hasValue = false;

        headerIndexes.forEach((key, columnNumber) => {
            const value = getCellText(row.getCell(columnNumber));

            if (value) {
                hasValue = true;
            }

            parsedRow[key] = value;
        });

        if (hasValue) {
            rows.push(parsedRow);
        }
    });

    return rows;
};

const parseAlumniImportFile = async (buffer: Buffer, fileName = "", contentType = "") => {
    const workbook = new ExcelJS.Workbook();
    const normalizedName = fileName.toLowerCase();
    const normalizedType = contentType.toLowerCase();
    let worksheet: ExcelJS.Worksheet | undefined;

    if (normalizedName.endsWith(".csv") || normalizedType.includes("csv") || normalizedType.includes("text/plain")) {
        worksheet = await workbook.csv.read(Readable.from([buffer]));
    } else if (normalizedName.endsWith(".xlsx") || normalizedType.includes("spreadsheetml")) {
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        worksheet = workbook.worksheets[0];
    } else if (normalizedName.endsWith(".xls")) {
        throw new Error("Legacy .xls files are not supported. Save the file as .xlsx or .csv before importing.");
    } else {
        throw new Error("Only .xlsx and .csv alumni import files are supported.");
    }

    if (!worksheet) {
        throw new Error("The uploaded file does not contain any worksheet.");
    }

    return worksheetToImportRows(worksheet);
};

const getSafeEmailError = (error: unknown) => {
    const message = getErrorMessage(error);
    return message.length > 300 ? `${message.slice(0, 300)}...` : message;
};

const MAILING_PURPOSES: Record<TargetedEmailPurpose, string> = {
    graduate_tracer_reminder: "Graduate Tracer Reminder",
    event_invitation: "Event Invitation",
    important_announcement: "Important Announcement",
    document_request: "Document Request",
    account_verification_reminder: "Account Verification Reminder"
};

type MailingReminderReason =
    | "incomplete_requirements"
    | "tracer_stale"
    | "missing_employment"
    | "missing_documents";

const MAILING_REMINDER_REASONS: Record<MailingReminderReason, string> = {
    incomplete_requirements: "Incomplete Requirements",
    tracer_stale: "Tracer Not Updated for 1 Year",
    missing_employment: "Missing Employment Information",
    missing_documents: "Missing Documents"
};

const MAILING_MISSING_INFO_PLACEHOLDER = "[Missing information will be filled automatically for each selected alumnus]";

const isMailingPurpose = (value: unknown): value is TargetedEmailPurpose => {
    return typeof value === "string" && value in MAILING_PURPOSES;
};

const isMailingReminderReason = (value: unknown): value is MailingReminderReason => {
    return typeof value === "string" && value in MAILING_REMINDER_REASONS;
};

const getSafeMailingError = (error: unknown) => {
    const message = getSafeEmailError(error);
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("missing:")) {
        return "Email service is missing required environment variables in the running backend. Check the Brevo API key, sender email, sender name, and frontend URL.";
    }

    if (
        lowerMessage.includes("key not found") ||
        lowerMessage.includes("invalid api key") ||
        lowerMessage.includes("api key is invalid") ||
        lowerMessage.includes("unauthorized")
    ) {
        return "Brevo rejected the configured API key. Update the Brevo API key in the running backend environment.";
    }

    if (/api[-_ ]?key|secret|token|password/i.test(message)) {
        return "Email service is not configured correctly. Ask the system administrator to check the email settings.";
    }

    return message;
};

const getAvailableColumnExpression = async (tableName: string, alias: string, columns: string[], fallback = "NULL") => {
    const availableColumns: string[] = [];

    for (const column of columns) {
        if (await columnExists(tableName, column)) {
            availableColumns.push(`${alias}.${column}`);
        }
    }

    return availableColumns.length > 0 ? `COALESCE(${availableColumns.join(", ")})` : fallback;
};

const mapMailingRecipientRow = (row: QueryRow) => {
    const reasons: string[] = [];

    if (Number(row.incomplete_requirements || 0) === 1) reasons.push(MAILING_REMINDER_REASONS.incomplete_requirements);
    if (Number(row.tracer_stale || 0) === 1) reasons.push(MAILING_REMINDER_REASONS.tracer_stale);
    if (Number(row.missing_employment || 0) === 1) reasons.push(MAILING_REMINDER_REASONS.missing_employment);
    if (Number(row.missing_documents || 0) === 1) reasons.push(MAILING_REMINDER_REASONS.missing_documents);

    return {
        id: String(row.id || ""),
        name: String(row.name || ""),
        email: String(row.email || ""),
        student_id: row.student_id ? String(row.student_id) : null,
        course: row.course ? String(row.course) : null,
        batch: row.batch ? String(row.batch) : null,
        reminder_reason: reasons[0] || MAILING_REMINDER_REASONS.incomplete_requirements,
        reminder_reasons: reasons,
        tracer_last_updated: row.tracer_last_updated || null
    };
};

const formatMailingMissingInfo = (recipient: { reminder_reasons?: string[]; reminder_reason?: string | null }) => {
    const reasons = Array.isArray(recipient.reminder_reasons)
        ? recipient.reminder_reasons.map((reason) => String(reason || "").trim()).filter(Boolean)
        : [];
    const fallbackReason = String(recipient.reminder_reason || "").trim();
    const items = reasons.length > 0
        ? reasons
        : [fallbackReason || MAILING_REMINDER_REASONS.incomplete_requirements];

    return items.map((reason) => `- ${reason}`).join("\n");
};

const buildRecipientMailingMessage = (
    message: string,
    recipient: { reminder_reasons?: string[]; reminder_reason?: string | null }
) => {
    if (!message.includes(MAILING_MISSING_INFO_PLACEHOLDER)) {
        return message;
    }

    return message.split(MAILING_MISSING_INFO_PLACEHOLDER).join(formatMailingMissingInfo(recipient));
};

const getEligibleMailingRecipients = async ({
    search = "",
    course = "",
    batch = "",
    reason = "",
    alumniIds = [],
    limit = 100
}: {
    search?: string;
    course?: string;
    batch?: string;
    reason?: string;
    alumniIds?: string[];
    limit?: number;
}) => {
    const tracerTable = await getTracerTableName();
    const tracerDateExpr = await getAvailableColumnExpression(tracerTable, "tf", ["last_updated", "updated_at", "submitted_at", "created_at"]);
    const employmentStatusExpr = await getAvailableColumnExpression(tracerTable, "tf", ["employment_status"]);
    const jobTitleExpr = await getAvailableColumnExpression(tracerTable, "tf", ["job_title"]);
    const companyExpr = await getAvailableColumnExpression(tracerTable, "tf", ["company"]);
    const hasUserSettings = await tableExists("user_settings");
    const hasGraduateTracerForms = await tableExists("graduate_tracer_forms");
    const hasTracerEmploymentData = await tableExists("tracer_employment_data");
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

    const joins = [
        `LEFT JOIN ${tracerTable} tf ON tf.user_id = p.id`
    ];

    if (hasGraduateTracerForms) {
        joins.push("LEFT JOIN graduate_tracer_forms gtf ON gtf.alumni_id = p.id");
    }

    if (hasGraduateTracerForms && hasTracerEmploymentData) {
        joins.push("LEFT JOIN tracer_employment_data ted ON ted.form_id = gtf.id");
    }

    if (hasUserSettings) {
        joins.push("LEFT JOIN user_settings us ON us.user_id = p.id");
    }

    const employmentStatus = hasTracerEmploymentData ? `COALESCE(NULLIF(${employmentStatusExpr}, ''), NULLIF(ted.employment_status, ''))` : `NULLIF(${employmentStatusExpr}, '')`;
    const jobTitle = hasTracerEmploymentData ? `COALESCE(NULLIF(${jobTitleExpr}, ''), NULLIF(ted.job_title, ''))` : `NULLIF(${jobTitleExpr}, '')`;
    const company = hasTracerEmploymentData ? `COALESCE(NULLIF(${companyExpr}, ''), NULLIF(ted.company, ''))` : `NULLIF(${companyExpr}, '')`;
    const documentExpr = hasUserSettings ? "(us.resume_url IS NULL OR TRIM(us.resume_url) = '')" : "0 = 1";
    const graduateTracerStatusExpr = hasGraduateTracerForms ? "(gtf.id IS NULL OR LOWER(COALESCE(gtf.form_status, '')) NOT IN ('completed', 'submitted'))" : "tf.id IS NULL";

    const incompleteExpr = `(
        p.name IS NULL OR TRIM(p.name) = ''
        OR p.student_id IS NULL OR TRIM(p.student_id) = ''
        OR p.course IS NULL OR TRIM(p.course) = ''
        OR p.batch IS NULL OR TRIM(p.batch) = ''
        OR p.contact_number IS NULL OR TRIM(p.contact_number) = ''
        OR tf.id IS NULL
        OR ${graduateTracerStatusExpr}
    )`;
    const staleExpr = `(${tracerDateExpr} IS NULL OR ${tracerDateExpr} < DATE_SUB(NOW(), INTERVAL 1 YEAR))`;
    const missingEmploymentExpr = `(
        ${employmentStatus} IS NULL
        OR (
            LOWER(${employmentStatus}) IN ('employed', 'self-employed', 'self employed')
            AND (${jobTitle} IS NULL OR ${company} IS NULL)
        )
    )`;
    const missingDocumentsExpr = `(${documentExpr})`;
    const eligibilityExpr = `(${incompleteExpr} OR ${staleExpr} OR ${missingEmploymentExpr} OR ${missingDocumentsExpr})`;
    const reasonFilters: Record<MailingReminderReason, string> = {
        incomplete_requirements: incompleteExpr,
        tracer_stale: staleExpr,
        missing_employment: missingEmploymentExpr,
        missing_documents: missingDocumentsExpr
    };

    const where = [
        "ur.role = 'alumni'",
        "COALESCE(ur.archived, 0) = 0",
        "p.email IS NOT NULL",
        "TRIM(p.email) <> ''",
        "p.email LIKE '%@%.%'",
        "p.email NOT LIKE '% %'",
        eligibilityExpr
    ];
    const params: DbParam[] = [];

    if (search.trim()) {
        const like = `%${search.trim()}%`;
        where.push(`(
            p.name LIKE ?
            OR p.email LIKE ?
            OR p.student_id LIKE ?
            OR p.course LIKE ?
            OR p.batch LIKE ?
        )`);
        params.push(like, like, like, like, like);
    }

    if (course.trim()) {
        where.push("p.course = ?");
        params.push(course.trim());
    }

    if (batch.trim()) {
        where.push("p.batch = ?");
        params.push(batch.trim());
    }

    if (isMailingReminderReason(reason)) {
        where.push(reasonFilters[reason]);
    }

    const normalizedAlumniIds = alumniIds.map((value) => String(value || "").trim()).filter(Boolean);
    if (normalizedAlumniIds.length > 0) {
        where.push(`p.id IN (${normalizedAlumniIds.map(() => "?").join(", ")})`);
        params.push(...normalizedAlumniIds);
    }

    const rows = parseRows(await db.query(
        `SELECT
            p.id,
            p.name,
            p.email,
            p.student_id,
            p.course,
            p.batch,
            ${tracerDateExpr} AS tracer_last_updated,
            CASE WHEN ${incompleteExpr} THEN 1 ELSE 0 END AS incomplete_requirements,
            CASE WHEN ${staleExpr} THEN 1 ELSE 0 END AS tracer_stale,
            CASE WHEN ${missingEmploymentExpr} THEN 1 ELSE 0 END AS missing_employment,
            CASE WHEN ${missingDocumentsExpr} THEN 1 ELSE 0 END AS missing_documents
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id
         ${joins.join("\n")}
         WHERE ${where.join("\nAND ")}
         ORDER BY tracer_stale DESC, incomplete_requirements DESC, missing_employment DESC, missing_documents DESC, p.name ASC
         LIMIT ${safeLimit}`,
        params
    ));

    return rows.map(mapMailingRecipientRow).filter((row) => EMAIL_REGEX.test(normalizeEmail(row.email)));
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
    studentId,
    contactNumber,
    photoBase64,
    temporaryPassword
}: {
    name: string;
    email: string;
    course?: string | null;
    batch?: string | null;
    studentId?: string | null;
    contactNumber?: string | null;
    photoBase64?: string | null;
    temporaryPassword: string;
}) => {
    const alumniId = normalizeText(studentId) || await generateUniqueAlumniId(conn, batch);
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await conn.query(
        "INSERT INTO users (id, email, password_hash, email_status) VALUES (?, ?, ?, ?)",
        [userId, email, hashedPassword, "pending"]
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

const updateCredentialEmailStatus = async (
    userId: string,
    status: "sent" | "failed",
    errorMessage: string | null = null
) => {
    await db.execute(
        `UPDATE users
         SET email_status = ?, email_sent_at = ?, email_error = ?
         WHERE id = ?`,
        [
            status,
            status === "sent" ? new Date() : null,
            errorMessage,
            userId
        ]
    );
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
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN start_datetime DATETIME NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN end_datetime DATETIME NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN auto_archive_at DATETIME NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN archived_at DATETIME NULL`
        },
        {
            table: announcementTable,
            sql: `ALTER TABLE ${announcementTable} ADD COLUMN interest_enabled TINYINT(1) NOT NULL DEFAULT 0`
        },
        {
            table: "surveys",
            sql: "ALTER TABLE surveys ADD COLUMN start_datetime DATETIME NULL"
        },
        {
            table: "surveys",
            sql: "ALTER TABLE surveys ADD COLUMN end_datetime DATETIME NULL"
        },
        {
            table: "surveys",
            sql: "ALTER TABLE surveys ADD COLUMN auto_archive_at DATETIME NULL"
        },
        {
            table: "surveys",
            sql: "ALTER TABLE surveys ADD COLUMN archived_at DATETIME NULL"
        },
        {
            table: "events",
            sql: "ALTER TABLE events ADD COLUMN start_datetime DATETIME NULL"
        },
        {
            table: "events",
            sql: "ALTER TABLE events ADD COLUMN end_datetime DATETIME NULL"
        },
        {
            table: "events",
            sql: "ALTER TABLE events ADD COLUMN auto_archive_at DATETIME NULL"
        },
        {
            table: "events",
            sql: "ALTER TABLE events ADD COLUMN archived_at DATETIME NULL"
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
            table: "users",
            sql: "ALTER TABLE users ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending'"
        },
        {
            table: "users",
            sql: "ALTER TABLE users ADD COLUMN email_sent_at DATETIME NULL"
        },
        {
            table: "users",
            sql: "ALTER TABLE users ADD COLUMN email_error TEXT NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending'"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN email_error TEXT NULL"
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
            CREATE TABLE IF NOT EXISTS email_logs (
                id VARCHAR(36) PRIMARY KEY,
                alumni_id VARCHAR(36) NOT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                email_purpose VARCHAR(100) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                error_message TEXT NULL,
                sent_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(36) NULL,
                provider_message_id VARCHAR(255) NULL,
                INDEX idx_email_logs_alumni (alumni_id),
                INDEX idx_email_logs_purpose (email_purpose),
                INDEX idx_email_logs_created (created_at),
                INDEX idx_email_logs_duplicate_guard (alumni_id, email_purpose, created_at)
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE email_logs", error);
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
                email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
                email_error TEXT NULL,
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
            FROM event_rsvps
            WHERE attendance_status = 'Attended'
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
app.use(cors(corsOptions));
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

const ensureAnnouncementEventSurveyEngagementTables = async () => {
    const announcementTable = await getAnnouncementTableName();

    await db.execute(`
        CREATE TABLE IF NOT EXISTS announcement_comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            announcement_id INT NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            content TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'visible',
            moderated_by VARCHAR(36) DEFAULT NULL,
            moderated_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (announcement_id) REFERENCES ${announcementTable}(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_announcement_comments_announcement (announcement_id, status, created_at),
            INDEX idx_announcement_comments_user (user_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS announcement_comment_replies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            comment_id INT NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            content TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'visible',
            moderated_by VARCHAR(36) DEFAULT NULL,
            moderated_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (comment_id) REFERENCES announcement_comments(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_announcement_comment_replies_comment (comment_id, status, created_at),
            INDEX idx_announcement_comment_replies_user (user_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS event_interests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            alumni_id VARCHAR(36) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Interested',
            verified_by VARCHAR(36) DEFAULT NULL,
            verified_at DATETIME NULL,
            cancelled_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_event_interests_event_alumni (event_id, alumni_id),
            FOREIGN KEY (event_id) REFERENCES ${announcementTable}(id) ON DELETE CASCADE,
            FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_event_interests_event (event_id, status),
            INDEX idx_event_interests_alumni (alumni_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS survey_options (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question_id INT NOT NULL,
            option_label VARCHAR(255) NOT NULL,
            option_value VARCHAR(255) DEFAULT NULL,
            option_order INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
            INDEX idx_survey_options_question (question_id, option_order)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS survey_responses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            survey_id INT NOT NULL,
            respondent_id VARCHAR(36) DEFAULT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
            FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_survey_responses_survey (survey_id, submitted_at),
            INDEX idx_survey_responses_respondent (respondent_id)
        )
    `);

    const compatibilityColumns = [
        { table: "surveys", name: "allow_multiple_responses", sql: "ALTER TABLE surveys ADD COLUMN allow_multiple_responses TINYINT(1) NOT NULL DEFAULT 0" },
        { table: "survey_answers", name: "response_id", sql: "ALTER TABLE survey_answers ADD COLUMN response_id INT DEFAULT NULL" },
        { table: "survey_answers", name: "updated_at", sql: "ALTER TABLE survey_answers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" }
    ];

    for (const column of compatibilityColumns) {
        try {
            if (await tableExists(column.table) && !(await columnExists(column.table, column.name))) {
                await db.execute(column.sql);
            }
        } catch (error) {
            console.error(`SCHEMA UPDATE ERROR: ${column.table}.${column.name}`, error);
        }
    }
};

/* =========================
   STARTUP INIT
========================= */
const getDatabaseTarget = () => {
    const host = process.env.DB_HOST || process.env.MYSQL_HOST || "localhost";
    const port = process.env.DB_PORT || process.env.MYSQL_PORT || "3306";
    const name = process.env.DB_NAME || process.env.MYSQL_DATABASE || "ustp_alumni";

    return `${host}:${port}/${name}`;
};

const describeDatabaseStartupFailure = (error: unknown) => {
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    if (code === "ENOTFOUND") {
        return "DNS cannot resolve DB_HOST. Copy the exact MySQL host from Aiven service details into server/.env.";
    }

    if (code === "ECONNREFUSED") {
        return "MySQL refused the connection. Check DB_HOST, DB_PORT, firewall, and whether the database service is running.";
    }

    if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
        return "MySQL is unreachable from this network. Check internet access, Aiven allowed IP/network settings, and DB_PORT.";
    }

    if (message.toLowerCase().includes("access denied")) {
        return "MySQL rejected the login. Check DB_USER and DB_PASSWORD.";
    }

    return message;
};

const initializeDatabaseBackedStartup = async () => {
    try {
        await db.query<QueryRow>("SELECT 1 AS ok");
    } catch (error) {
        console.error("DATABASE STARTUP ERROR:", {
            target: getDatabaseTarget(),
            code: getErrorCode(error) || undefined,
            message: getErrorMessage(error),
            action: describeDatabaseStartupFailure(error)
        });
        return;
    }

    await ensureDefaultAdmin();
    await ensureChairmanAccounts();
    await ensureDatabaseColumns();
    await ensureAnnouncementEventSurveyEngagementTables();
    await ensureEventRsvpTables();
    await ensureDashboardSlideTable();
    await ensureAlumniLoginActivityTable();
    await ensureAnnouncementInterestTable();
    startDurationAutoArchiveJob();
};

initializeDatabaseBackedStartup().catch((error) => {
    console.error("DATABASE STARTUP INIT ERROR:", error);
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/api/health", async (_req, res) => {
    try {
        await db.query<QueryRow>("SELECT 1 AS ok");
        res.json({ status: "ok", database: "connected" });
    } catch (err: unknown) {
        res.status(500).json({ status: "error", database: "unavailable", error: getErrorMessage(err) });
    }
});

if (process.env.ENABLE_TEST_ROUTE === "true") {
    app.get("/api/test", async (_req, res) => {
        try {
            const rows = await db.query<QueryRow>("SELECT 1 + 1 AS result");
            res.json(parseRows(rows));
        } catch (err: unknown) {
            res.status(500).json({ error: getErrorMessage(err) });
        }
    });
}

/* ROOT */
app.get("/", (_req, res) => {
    res.send("Alumni Management System API is running.");
});

/* =========================
   REGISTER ADMIN
========================= */
app.post("/api/auth/setup-admin", async (req, res) => {
    if (process.env.ENABLE_SETUP_ADMIN !== "true") {
        return res.status(404).json({ error: "Setup route is disabled." });
    }

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
            return res.status(400).json({ error: "Wrong password" });
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

        if (authPayload.role === "alumni") {
            await recordAlumniLoginActivity(String(user.id));
        }

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
            year,
            program,
            studentId,
            student_id,
            alumniId: requestedAlumniId,
            contactNumber,
            photoBase64,
            sendEmail: shouldSend
        } = _req.body || {};

        const normalizedName = normalizeText(name);
        const normalizedEmail = normalizeEmail(email);
        const normalizedBatch = normalizeBatch(batch || year);
        const normalizedStudentId = normalizeText(studentId || student_id || requestedAlumniId);
        const normalizedContactNumber = normalizePhone(contactNumber) || null;
        const courseValidation = validateSupportedCourse(course || program);

        if (!normalizedName) {
            return res.status(400).json({ error: "Name is required." });
        }

        const emailValidationMessage = getEmailValidationMessage(normalizedEmail);
        if (emailValidationMessage) {
            return res.status(400).json({ error: emailValidationMessage });
        }

        if (!normalizedBatch || !/^\d{4}$/.test(normalizedBatch)) {
            return res.status(400).json({ error: "Batch year is required and must be a 4-digit year." });
        }

        if (!courseValidation.ok || !courseValidation.course) {
            return res.status(400).json({ error: courseValidation.message });
        }

        const [existing] = await conn.query<RowDataPacket[]>(
            `SELECT u.id
             FROM users u
             LEFT JOIN profiles p ON p.id = u.id
             WHERE LOWER(u.email) = ? OR LOWER(p.email) = ?
             LIMIT 1`,
            [normalizedEmail, normalizedEmail]
        );

        if (Array.isArray(existing) && existing.length > 0) {
            return res.status(409).json({ error: "This alumni account already exists." });
        }

        if (normalizedStudentId) {
            const [existingStudentId] = await conn.query<RowDataPacket[]>(
                "SELECT id FROM profiles WHERE student_id = ? LIMIT 1",
                [normalizedStudentId]
            );

            if (Array.isArray(existingStudentId) && existingStudentId.length > 0) {
                return res.status(409).json({ error: "This Student/Alumni ID already exists." });
            }
        }

        await conn.beginTransaction();

        const temporaryPassword = generatePassword();
        const { userId, alumniId } = await createAlumniAccount(conn, {
            name: normalizedName,
            email: normalizedEmail,
            course: courseValidation.course,
            batch: normalizedBatch,
            studentId: normalizedStudentId || null,
            contactNumber: normalizedContactNumber,
            photoBase64: photoBase64 || null,
            temporaryPassword
        });

        let emailSent = false;
        let emailMessageId: string | null = null;
        let emailError: string | null = null;

        await conn.commit();

        if (shouldSend !== false) {
            try {
                const emailResult = await sendAlumniCredentialsEmail({
                    to: normalizedEmail,
                    name: normalizedName,
                    alumniId,
                    temporaryPassword
                });
                emailSent = true;
                emailMessageId = emailResult.messageId;
                await updateCredentialEmailStatus(userId, "sent");
            } catch (emailSendError: unknown) {
                emailError = getSafeEmailError(emailSendError);
                console.error("SEND ALUMNI CREDENTIALS ERROR:", {
                    alumniId,
                    email: normalizedEmail,
                    error: emailError
                });
                await updateCredentialEmailStatus(userId, "failed", emailError);
            }
        }

        res.status(201).json({
            success: true,
            message: "Alumni account created successfully.",
            alumniId,
            emailSent,
            emailStatus: emailSent ? "sent" : shouldSend === false ? "pending" : "failed",
            emailMessageId,
            emailError
        });
    } catch (err: unknown) {
        await conn.rollback();
        console.error("CREATE ALUMNI ERROR:", err);
        if (getErrorMessage(err).toLowerCase().includes("duplicate")) {
            return res.status(409).json({ error: "This alumni account already exists." });
        }
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

const alumniImportFileParser = express.raw({
    type: [
        "text/csv",
        "text/plain",
        "application/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream"
    ],
    limit: "15mb"
});

app.post("/api/profiles/import", authenticateToken, requireAdmin, alumniImportFileParser, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        const rows = Buffer.isBuffer(req.body)
            ? await parseAlumniImportFile(
                req.body,
                String(req.headers["x-file-name"] || ""),
                String(req.headers["content-type"] || "")
            )
            : Array.isArray(req.body?.rows)
                ? req.body.rows as AlumniImportInputRow[]
                : [];
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
                    reason: "Duplicate email found in the uploaded file",
                    category: "duplicate"
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
                reason: "Email already exists in the database",
                category: "duplicate"
            });

            return false;
        });

        const importedRows: Array<{
            rowNumber: number;
            alumniId: string;
            emailAddress: string;
            fullName: string;
            emailSent: boolean;
            emailStatus: "sent" | "failed";
        }> = [];
        const failedEmailRows: Array<{ rowNumber: number; alumniId: string; emailAddress: string; fullName: string; reason: string; }> = [];

        for (const row of rowsToImport) {
            let userId = "";
            let alumniId = "";
            const temporaryPassword = generatePassword();

            try {
                await conn.beginTransaction();

                const createdAccount = await createAlumniAccount(conn, {
                    name: row.name,
                    email: row.email,
                    course: row.course,
                    batch: row.batch,
                    contactNumber: row.contactNumber,
                    temporaryPassword
                });
                userId = createdAccount.userId;
                alumniId = createdAccount.alumniId;

                await conn.query(
                    `INSERT INTO imported_alumni_records
                        (import_batch_id, imported_profile_id, full_name, graduation_year, email_address, contact_number, generated_alumni_id, status, email_status, imported_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', 'pending', ?)`,
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

                await conn.commit();
            } catch (insertError: unknown) {
                await conn.rollback();
                failedRows.push({
                    rowNumber: row.rowNumber,
                    fullName: row.name,
                    emailAddress: row.email,
                    reason: `Database insert failed: ${getSafeEmailError(insertError)}`,
                    category: "database"
                });
                continue;
            }

            let emailSent = false;
            let emailStatus: "sent" | "failed" = "failed";

            try {
                await sendAlumniCredentialsEmail({
                    to: row.email,
                    name: row.name,
                    alumniId,
                    temporaryPassword
                });
                emailSent = true;
                emailStatus = "sent";
                await updateCredentialEmailStatus(userId, "sent");
                await db.execute(
                    `UPDATE imported_alumni_records
                     SET email_status = 'sent', email_error = NULL
                     WHERE import_batch_id = ? AND imported_profile_id = ?`,
                    [importBatchId, userId]
                );
            } catch (emailSendError: unknown) {
                const emailError = getSafeEmailError(emailSendError);
                console.error("IMPORT ALUMNI BREVO ERROR:", {
                    rowNumber: row.rowNumber,
                    alumniId,
                    email: row.email,
                    error: emailError
                });
                await updateCredentialEmailStatus(userId, "failed", emailError);
                await db.execute(
                    `UPDATE imported_alumni_records
                     SET email_status = 'failed', email_error = ?, status = 'email_failed'
                     WHERE import_batch_id = ? AND imported_profile_id = ?`,
                    [emailError, importBatchId, userId]
                );
                failedEmailRows.push({
                    rowNumber: row.rowNumber,
                    alumniId,
                    emailAddress: row.email,
                    fullName: row.name,
                    reason: emailError
                });
            }

            importedRows.push({
                rowNumber: row.rowNumber,
                alumniId,
                emailAddress: row.email,
                fullName: row.name,
                emailSent,
                emailStatus
            });
        }

        const duplicateEmails = failedRows.filter((row) => row.category === "duplicate").length;
        const invalidRows = failedRows.filter((row) => row.category === "invalid").length;
        const failedEmailSends = failedEmailRows.length;

        res.json({
            success: true,
            summary: {
                totalRows: rows.length,
                validRows: validRows.length,
                importedRows: importedRows.length,
                successfulImports: importedRows.length,
                duplicateEmails,
                invalidRows,
                failedEmailSends,
                failedRows: failedRows.length + failedEmailSends
            },
            importedRows,
            failedRows: failedRows.sort((a, b) => a.rowNumber - b.rowNumber),
            failedEmailRows: failedEmailRows.sort((a, b) => a.rowNumber - b.rowNumber)
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
        await autoArchiveExpiredContent();
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
            `SELECT COALESCE(SUM(CASE WHEN ${donationStatusSql("status")} IN ('approved', 'approve') THEN amount ELSE 0 END), 0) AS totalDonations
             FROM donations`
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
            WHERE ${donationStatusSql("d.status")} IN ('pending', 'pending_review', 'pendingreview')
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
                e.start_datetime,
                e.end_datetime,
                e.auto_archive_at,
                e.archived_at,
                COUNT(er.id) AS regCount
            FROM ${announcementTable} e
            LEFT JOIN event_registrations er ON er.event_id = e.id
            WHERE LOWER(e.status) IN ('upcoming', 'ongoing', 'active')
            AND e.archived_at IS NULL
            ${hasAnnouncementApprovalStatus ? "AND LOWER(COALESCE(e.approval_status, 'approved')) = 'approved'" : ""}
            GROUP BY e.id
            ORDER BY e.date ASC
            LIMIT 5`
        ));

        const analytics = await getAdminDashboardAnalytics();

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
                ...withDurationFields(event as Record<string, unknown>),
                id: String(event.id),
                image_url: normalizeStoredMedia(event.image_url),
                status: formatStatusLabel(event.status, "upcoming")
            })),
            monthlyEngagement: analytics.monthlyEngagement,
            courseContributions: analytics.courseContributions,
            courseComparisons: analytics.courseComparisons,
            donationTrends: analytics.donationTrends,
            heatmap: analytics.heatmap,
            topAlumni: analytics.topAlumni,
            predictionCounts: analytics.predictionCounts,
            insightSummaries: analytics.insightSummaries
        });
    } catch (err: unknown) {
        console.error("ADMIN DASHBOARD ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/slideshow", authenticateToken, async (_req, res) => {
    try {
        await ensureDashboardSlideTable();
        const rows = parseRows(await db.query(
            `SELECT *
             FROM dashboard_slides
             WHERE LOWER(COALESCE(status, 'active')) = 'active'
             ORDER BY is_highlighted DESC, display_order ASC, created_at DESC`
        ));

        res.json(rows.map(mapDashboardSlide));
    } catch (err: unknown) {
        console.error("GET SLIDESHOW ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/admin/slideshow", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        await ensureDashboardSlideTable();
        const rows = parseRows(await db.query(
            `SELECT *
             FROM dashboard_slides
             ORDER BY CASE WHEN LOWER(COALESCE(status, 'active')) = 'active' THEN 0 ELSE 1 END,
                      is_highlighted DESC,
                      display_order ASC,
                      created_at DESC`
        ));

        res.json(rows.map(mapDashboardSlide));
    } catch (err: unknown) {
        console.error("GET ADMIN SLIDESHOW ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/slideshow", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureDashboardSlideTable();
        const title = normalizeText(req.body?.title) || "Homepage advertisement";
        const caption = normalizeText(req.body?.caption);
        const media = prepareDashboardSlideMedia(
            req.body?.mediaType || req.body?.media_type,
            req.body?.mediaUrl || req.body?.media_url || req.body?.imageUrl || req.body?.image_url
        );
        const linkUrl = normalizeText(req.body?.linkUrl || req.body?.link_url);
        const isHighlighted = normalizeBoolean(req.body?.isHighlighted ?? req.body?.is_highlighted);
        const displayOrder = Number(req.body?.displayOrder ?? req.body?.display_order ?? 0);
        const status = normalizeStatus(req.body?.status, "active");

        if (!media) {
            return res.status(400).json({ error: "A valid slideshow image, video, or YouTube link is required." });
        }

        const result = await db.execute(
            `INSERT INTO dashboard_slides
                (title, caption, media_type, image_url, link_url, is_highlighted, display_order, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, caption || null, media.mediaType, media.mediaUrl, linkUrl || null, isHighlighted ? 1 : 0, Number.isFinite(displayOrder) ? displayOrder : 0, status, req.user?.id || null]
        ) as ResultSetHeader;

        const slide = await getSingleRow("SELECT * FROM dashboard_slides WHERE id = ?", [result.insertId]);
        res.json({ success: true, slide: slide ? mapDashboardSlide(slide) : null });
    } catch (err: unknown) {
        console.error("CREATE SLIDE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.put("/api/admin/slideshow/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureDashboardSlideTable();
        const slideId = Number(req.params.id);
        const title = normalizeText(req.body?.title);
        const caption = normalizeText(req.body?.caption);
        const media = prepareDashboardSlideMedia(
            req.body?.mediaType || req.body?.media_type,
            req.body?.mediaUrl || req.body?.media_url || req.body?.imageUrl || req.body?.image_url
        );
        const linkUrl = normalizeText(req.body?.linkUrl || req.body?.link_url);
        const isHighlighted = normalizeBoolean(req.body?.isHighlighted ?? req.body?.is_highlighted);
        const displayOrder = Number(req.body?.displayOrder ?? req.body?.display_order ?? 0);
        const status = normalizeStatus(req.body?.status, "active");

        if (!slideId) return res.status(400).json({ error: "Invalid slide id." });
        if (!title || !media) {
            return res.status(400).json({ error: "Slide title and valid media are required." });
        }

        await db.execute(
            `UPDATE dashboard_slides
             SET title = ?, caption = ?, media_type = ?, image_url = ?, link_url = ?, is_highlighted = ?, display_order = ?, status = ?
             WHERE id = ?`,
            [title, caption || null, media.mediaType, media.mediaUrl, linkUrl || null, isHighlighted ? 1 : 0, Number.isFinite(displayOrder) ? displayOrder : 0, status, slideId]
        );

        const slide = await getSingleRow("SELECT * FROM dashboard_slides WHERE id = ?", [slideId]);
        res.json({ success: true, slide: slide ? mapDashboardSlide(slide) : null });
    } catch (err: unknown) {
        console.error("UPDATE SLIDE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/admin/slideshow/:id/highlight", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await ensureDashboardSlideTable();
        const slideId = Number(req.params.id);
        if (!slideId) return res.status(400).json({ error: "Invalid slide id." });

        await db.execute(
            "UPDATE dashboard_slides SET is_highlighted = ? WHERE id = ?",
            [normalizeBoolean(req.body?.isHighlighted ?? req.body?.is_highlighted) ? 1 : 0, slideId]
        );
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("HIGHLIGHT SLIDE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/admin/slideshow/reorder", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await ensureDashboardSlideTable();
        const slides = Array.isArray(req.body?.slides) ? req.body.slides : [];
        const normalizedSlides = slides
            .map((slide: Record<string, unknown>) => ({
                id: Number(slide.id),
                displayOrder: Number(slide.displayOrder ?? slide.display_order)
            }))
            .filter((slide: { id: number; displayOrder: number }) => Number.isInteger(slide.id) && Number.isFinite(slide.displayOrder));

        if (normalizedSlides.length === 0) {
            return res.status(400).json({ error: "No valid slideshow order data provided." });
        }

        await Promise.all(normalizedSlides.map((slide: { id: number; displayOrder: number }) =>
            db.execute("UPDATE dashboard_slides SET display_order = ? WHERE id = ?", [slide.displayOrder, slide.id])
        ));

        const rows = parseRows(await db.query(
            `SELECT *
             FROM dashboard_slides
             ORDER BY CASE WHEN LOWER(COALESCE(status, 'active')) = 'active' THEN 0 ELSE 1 END,
                      is_highlighted DESC,
                      display_order ASC,
                      created_at DESC`
        ));

        res.json(rows.map(mapDashboardSlide));
    } catch (err: unknown) {
        console.error("REORDER SLIDES ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/admin/slideshow/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await ensureDashboardSlideTable();
        const slideId = Number(req.params.id);
        if (!slideId) return res.status(400).json({ error: "Invalid slide id." });

        await db.execute("DELETE FROM dashboard_slides WHERE id = ?", [slideId]);
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE SLIDE ERROR:", err);
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
                alumni: entry.alumni,
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
        const eventParticipants = alumni.filter((item) => item.event_count > 0).length;
        const tracerRespondents = alumni.filter((item) => item.tracer_count > 0).length;
        const activeAlumni = alumni.filter((item) => item.engagementScore > 0).length;
        const avgEngagementScore = topBatches.length
            ? Number((topBatches.reduce((sum, item) => sum + item.score, 0) / topBatches.length).toFixed(1))
            : 0;
        const achievementRows = parseRows(await db.query(
            `SELECT LOWER(COALESCE(a.status, 'pending')) AS status, COUNT(*) AS count, COUNT(DISTINCT a.alumni_id) AS alumni_count
             FROM achievements a
             INNER JOIN profiles p ON p.id = a.alumni_id
             WHERE p.course = ?
             GROUP BY LOWER(COALESCE(a.status, 'pending'))`,
            [course]
        ));
        const achievementCounts = {
            pending: 0,
            approved: 0,
            rejected: 0,
            archived: 0,
        };
        let alumniWithAchievements = 0;

        achievementRows.forEach((row) => {
            const key = normalizeStatus(String(row.status || "pending"), "pending") as keyof typeof achievementCounts;
            if (key in achievementCounts) {
                achievementCounts[key] += Number(row.count || 0);
            }

            alumniWithAchievements += Number(row.alumni_count || 0);
        });

        const buildCourseMetric = async (targetCourse: string) => {
            const courseAlumni = targetCourse === course ? alumni : await getChairmanAlumniData(targetCourse);
            const courseBatchMetrics = new Map<string, { alumni: number; engagementScore: number }>();

            courseAlumni.forEach((item) => {
                const batch = item.batch || "Unspecified";
                const existing = courseBatchMetrics.get(batch) || { alumni: 0, engagementScore: 0 };
                existing.alumni += 1;
                existing.engagementScore += item.engagementScore;
                courseBatchMetrics.set(batch, existing);
            });

            const scores = Array.from(courseBatchMetrics.values()).map((entry) =>
                entry.alumni ? Math.min(100, Math.round((entry.engagementScore / (entry.alumni * 4)) * 100)) : 0
            );
            const engagementScore = scores.length
                ? Number((scores.reduce((sum, item) => sum + item, 0) / scores.length).toFixed(1))
                : 0;

            return {
                department: targetCourse,
                label: COURSE_LABELS[targetCourse as keyof typeof COURSE_LABELS] || targetCourse,
                alumni: courseAlumni.length,
                active: courseAlumni.filter((item) => item.engagementScore > 0).length,
                engagementScore,
                tracerRespondents: courseAlumni.filter((item) => item.tracer_count > 0).length,
                isCurrent: targetCourse === course,
            };
        };
        const departmentMetrics = await Promise.all(SYSTEM_COURSES.map((item) => buildCourseMetric(item)));

        res.json({
            course,
            courseLabel: COURSE_LABELS[course],
            summary: {
                avgEngagementScore,
                totalAlumni: alumni.length,
                activeAlumni,
                eventParticipants,
                tracerRespondents,
                employedCount,
                alumniWithAchievements,
            },
            engagementOverview: [
                { label: "Active Alumni", value: activeAlumni },
                { label: "Event Participants", value: eventParticipants },
                { label: "Tracer Updated", value: tracerRespondents },
                { label: "With Achievements", value: alumniWithAchievements },
            ],
            tracerStatus: [
                { label: "Updated", value: tracerRespondents },
                { label: "Pending", value: Math.max(0, alumni.length - tracerRespondents) },
            ],
            achievementSummary: [
                { label: "Approved", value: achievementCounts.approved },
                { label: "Pending", value: achievementCounts.pending },
                { label: "Rejected", value: achievementCounts.rejected },
                { label: "Archived", value: achievementCounts.archived },
            ],
            monthlyEngagement,
            topBatches,
            departmentMetrics,
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
        await autoArchiveExpiredContent();
        const announcementTable = await getAnnouncementTableName();
        const hasAnnouncementApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const profile = await getSingleRow(`SELECT course, batch FROM profiles WHERE id = ?`, [req.user.id]);
        const audienceCourse = normalizeText(profile?.course).toLowerCase();
        const audienceBatch = normalizeBatch(profile?.batch).toLowerCase();

        const eventsRaw = parseRows(await db.query(
            `SELECT id, title, description, date, time, venue, organizer, image_url, status, type, google_form_link,
                    start_datetime, end_datetime, auto_archive_at, archived_at
             FROM ${announcementTable}
             WHERE LOWER(COALESCE(status, 'active')) <> 'archived'
             ${await columnExists(announcementTable, "archived_at") ? "AND archived_at IS NULL" : ""}
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
                date DESC,
                created_at DESC
             LIMIT 60`,
            hasAudienceScope ? [audienceCourse, audienceBatch] : []
        ));
        const events = eventsRaw
            .map((event) => withDurationFields(event as Record<string, unknown>))
            .filter((event) => event.computed_status !== "Archived");

        const totalRegisteredUsers = await getSingleRow(
            "SELECT COUNT(*) AS count FROM user_roles WHERE role = 'alumni'"
        );

        const donationUpdates = parseRows(await db.query(
            `SELECT d.id, d.amount, d.method, d.status, d.purpose, d.created_at, p.name
             FROM donations d
             LEFT JOIN profiles p ON p.id = d.user_id
             WHERE LOWER(COALESCE(d.status, 'pending_review')) IN ('approved', 'pending_review', 'pending')
             ORDER BY d.created_at DESC
             LIMIT 6`
        ));

        const surveyRows = await tableExists("surveys")
            ? parseRows(await db.query(
                `SELECT s.*, COUNT(DISTINCT sa.respondent_id) AS response_count
                 FROM surveys s
                 LEFT JOIN survey_answers sa ON sa.survey_id = s.id
                 WHERE LOWER(COALESCE(s.status, 'draft')) = 'published'
                   AND s.archived_at IS NULL
                 GROUP BY s.id
                 ORDER BY COALESCE(s.start_datetime, s.opens_at, s.created_at) DESC
                 LIMIT 20`
            ))
            : [];

        const surveys = (await Promise.all(surveyRows.map(async (row) => {
            const questions = parseRows(await db.query(
                `SELECT *
                 FROM survey_questions
                 WHERE survey_id = ?
                 ORDER BY question_order ASC, id ASC`,
                [row.id]
            ));
            const userAnswers = parseRows(await db.query(
                `SELECT question_id, answer_text, answer_value, answer_json, rating_value
                 FROM survey_answers
                 WHERE survey_id = ? AND respondent_id = ?`,
                [row.id, req.user?.id || null]
            ));
            const duration = withDurationFields({
                ...row,
                start_datetime: row.start_datetime || row.opens_at,
                end_datetime: row.end_datetime || row.closes_at
            });

            return {
                id: Number(row.id),
                title: row.title,
                description: row.description,
                status: row.status,
                computed_status: duration.computed_status,
                duration_status: duration.duration_status,
                remaining_time: duration.remaining_time,
                is_expired: duration.is_expired,
                start_datetime: duration.start_datetime,
                end_datetime: duration.end_datetime,
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
        }))).filter((survey) => survey.questions.length > 0);

        await ensureDashboardSlideTable();
        const slides = parseRows(await db.query(
            `SELECT *
             FROM dashboard_slides
             WHERE LOWER(COALESCE(status, 'active')) = 'active'
             ORDER BY is_highlighted DESC, display_order ASC, created_at DESC
             LIMIT 10`
        ));

        await ensureEventRsvpTables();
        const registrations = parseRows<RegistrationRow>(await db.query<RegistrationRow>(
            `SELECT event_id FROM event_rsvps WHERE alumni_id = ?`,
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

        const activitySummary = await getSingleRow(
            `SELECT
                (SELECT COUNT(*) FROM alumni_login_events WHERE user_id = ? AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS login30,
                (SELECT COUNT(*) FROM event_rsvps WHERE alumni_id = ?) AS eventCount,
                (SELECT COUNT(*) FROM survey_responses WHERE respondent_id = ?) AS surveyCount,
                (SELECT COUNT(*) FROM donations WHERE user_id = ? AND ${donationStatusSql("status")} IN ('approved', 'approve')) AS donationCount,
                (SELECT COUNT(*) FROM freedom_wall_posts WHERE user_id = ? AND LOWER(COALESCE(status, 'published')) = 'published') AS wallPosts,
                (SELECT COUNT(*) FROM reactions WHERE user_id = ?) AS reactions`,
            [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
        );
        const recommendationItems: Array<{ id: string; type: string; title: string; reason: string; priority: number; link: string }> = [];
        const courseLabel = getCourseLabel(profile?.course);
        const normalizedCourseText = String(profile?.course || courseLabel || "").toLowerCase();
        const joinedEventIds = new Set(registrations.map((r) => String(r.event_id)));
        const answeredSurveyIds = new Set(
            surveys
                .filter((survey) => survey.userAnswers.length > 0)
                .map((survey) => String(survey.id))
        );

        events
            .filter((event) => event.type === "event" && !joinedEventIds.has(String(event.id)))
            .slice(0, 8)
            .forEach((event) => {
                const text = `${event.title || ""} ${event.description || ""}`.toLowerCase();
                const courseMatch = normalizedCourseText && text.includes(normalizedCourseText);
                recommendationItems.push({
                    id: `event-${event.id}`,
                    type: "Event",
                    title: String(event.title || "Recommended event"),
                    reason: courseMatch
                        ? `Matched to your ${courseLabel} profile and current event availability.`
                        : "Recommended because you have not joined this active alumni event yet.",
                    priority: courseMatch ? 95 : 70,
                    link: "/alumni/announcements"
                });
            });

        surveys
            .filter((survey) => !answeredSurveyIds.has(String(survey.id)) && !survey.is_expired)
            .slice(0, 4)
            .forEach((survey) => {
                recommendationItems.push({
                    id: `survey-${survey.id}`,
                    type: "Survey",
                    title: String(survey.title || "Recommended survey"),
                    reason: "Relevant open survey based on your alumni profile and response history.",
                    priority: 82,
                    link: "/alumni/announcements"
                });
            });

        if (Number(activitySummary?.donationCount || 0) > 0) {
            recommendationItems.push({
                id: "donation-campaign",
                type: "Donation",
                title: "Follow current donation campaigns",
                reason: "You have donor activity, so new contribution updates are prioritized for you.",
                priority: 78,
                link: "/alumni/donate"
            });
        }

        if (Number(activitySummary?.login30 || 0) <= 1 && Number(activitySummary?.eventCount || 0) === 0) {
            recommendationItems.push({
                id: "engagement-reminder",
                type: "Activity",
                title: "Reconnect with alumni activities",
                reason: "Your recent login and event activity is low, so the system recommends joining an event or survey.",
                priority: 88,
                link: "/alumni/announcements"
            });
        }

        if (Number(activitySummary?.wallPosts || 0) + Number(activitySummary?.reactions || 0) < 2) {
            recommendationItems.push({
                id: "community-group",
                type: "Community",
                title: "Join alumni community discussions",
                reason: "Recommended to increase your Freedom Wall and alumni group engagement.",
                priority: 65,
                link: "/alumni/community"
            });
        }

        res.json({
            events,
            surveys,
            recommendations: recommendationItems
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 6),
            totalRegisteredUsers: Number(totalRegisteredUsers?.count || 0),
            donationUpdates: donationUpdates.map((donation) => ({
                id: String(donation.id),
                amount: Number(donation.amount || 0),
                method: donation.method || "",
                status: formatStatusLabel(normalizeDonationStatus(donation.status), "pending_review"),
                purpose: donation.purpose || "General donation",
                created_at: donation.created_at,
                donorName: donation.name || "Alumni donor"
            })),
            slideshow: slides.map(mapDashboardSlide),
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

app.get("/api/admin/tracer", authenticateToken, assertTracerAdminAccess, listTracerRecords);

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

        await ensureEventRsvpTables();
        const registeredEventUsersRow = await getSingleRow(
            "SELECT COUNT(DISTINCT alumni_id) AS engagedAlumni FROM event_rsvps WHERE attendance_status = 'Attended'"
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
            LEFT JOIN event_rsvps er ON er.event_id = e.id AND er.attendance_status = 'Attended'
            LEFT JOIN event_comments ec ON ec.event_id = e.id
            GROUP BY e.id
            ORDER BY e.date DESC, e.created_at DESC
            LIMIT 10`
        ));

        const donationBreakdown = parseRows(await db.query(
            `SELECT
                ${donationStatusSql("status")} AS status,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS totalAmount
            FROM donations
            GROUP BY ${donationStatusSql("status")}
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
        await ensureEventRsvpTables();
        const regCountRow = await getSingleRow("SELECT COUNT(*) AS cnt FROM event_rsvps WHERE attendance_status = 'Attended'");
        const commentCountRow = await getSingleRow("SELECT COUNT(*) AS cnt FROM event_comments");
        const donationCountRow = await getSingleRow(
            `SELECT COUNT(*) AS cnt FROM donations WHERE ${donationStatusSql("status")} IN ('approved', 'approve')`
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
            `SELECT er.alumni_id AS user_id FROM event_rsvps er WHERE er.attendance_status = 'Attended'`
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
                COALESCE(SUM(CASE WHEN ${donationStatusSql("d.status")} IN ('approved', 'approve') THEN d.amount ELSE 0 END), 0) AS approvedDonations
            FROM ${announcementTable} e
            LEFT JOIN event_rsvps er ON er.event_id = e.id AND er.attendance_status = 'Attended'
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
            amount: Number(r.amount || 0),
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

app.get("/api/donations/summary", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const statusSql = donationStatusSql("status");
        const summary = await getSingleRow(
            `SELECT
                COALESCE(SUM(CASE WHEN ${statusSql} IN ('approved', 'approve') THEN amount ELSE 0 END), 0) AS approvedTotal,
                COUNT(CASE WHEN ${statusSql} IN ('approved', 'approve') THEN 1 END) AS approvedCount,
                COUNT(CASE WHEN ${statusSql} IN ('pending', 'pending_review', 'pendingreview') THEN 1 END) AS pendingCount,
                COUNT(CASE WHEN ${statusSql} IN ('rejected', 'reject') THEN 1 END) AS rejectedCount,
                COUNT(DISTINCT user_id) AS donorCount,
                COUNT(*) AS totalDonations
             FROM donations`
        );

        res.json({
            approvedTotal: Number(summary?.approvedTotal || 0),
            approvedCount: Number(summary?.approvedCount || 0),
            pendingCount: Number(summary?.pendingCount || 0),
            rejectedCount: Number(summary?.rejectedCount || 0),
            donorCount: Number(summary?.donorCount || 0),
            totalDonations: Number(summary?.totalDonations || 0)
        });
    } catch (err: unknown) {
        console.error("GET DONATION SUMMARY ERROR:", err);
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
        const donationAmount = Number(amount);
        const normalizedMethod = normalizeText(method);
        const normalizedReceipt = normalizeStoredMedia(receipt_url);

        if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
            return res.status(400).json({ error: "Enter a valid donation amount." });
        }

        if (!["GCash", "Personal"].includes(normalizedMethod)) {
            return res.status(400).json({ error: "Amount and method are required" });
        }

        if (normalizedMethod === "GCash" && !normalizeText(ref_number)) {
            return res.status(400).json({ error: "GCash reference number is required." });
        }

        if (!normalizedReceipt) {
            return res.status(400).json({ error: "Receipt image is required." });
        }

        await db.execute(
            `INSERT INTO donations (user_id, amount, method, status, purpose, ref_number, message, receipt_url)
             VALUES (?, ?, ?, 'pending_review', ?, ?, ?, ?)`,
            [req.user.id, donationAmount, normalizedMethod, normalizeText(purpose) || null, normalizeText(ref_number) || null, normalizeText(message) || null, normalizedReceipt]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New donation submitted",
            message: `${donationAmount.toLocaleString()} donation submitted for review.`,
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
        await autoArchiveExpiredContent();
        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const hasStartDatetime = await columnExists(announcementTable, "start_datetime");
        const hasEndDatetime = await columnExists(announcementTable, "end_datetime");
        const hasAutoArchiveAt = await columnExists(announcementTable, "auto_archive_at");
        const hasArchivedAt = await columnExists(announcementTable, "archived_at");
        const hasInterestEnabled = await columnExists(announcementTable, "interest_enabled");
        await ensureAnnouncementInterestTable();
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
                ? `WHERE ((LOWER(COALESCE(e.approval_status, 'approved')) = 'approved' AND ${audienceClause}) OR e.created_by = ?) AND LOWER(COALESCE(e.status, '')) <> 'archived' ${hasArchivedAt ? "AND e.archived_at IS NULL" : ""}`
                : hasApprovalStatus
                    ? `WHERE LOWER(COALESCE(e.approval_status, 'approved')) = 'approved' AND ${audienceClause} AND LOWER(COALESCE(e.status, '')) <> 'archived' ${hasArchivedAt ? "AND e.archived_at IS NULL" : ""}`
                    : `WHERE ${audienceClause} AND LOWER(COALESCE(e.status, '')) <> 'archived' ${hasArchivedAt ? "AND e.archived_at IS NULL" : ""}`
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
                ${hasStartDatetime ? "e.start_datetime" : "NULL AS start_datetime"},
                ${hasEndDatetime ? "e.end_datetime" : "NULL AS end_datetime"},
                ${hasAutoArchiveAt ? "e.auto_archive_at" : "NULL AS auto_archive_at"},
                ${hasArchivedAt ? "e.archived_at" : "NULL AS archived_at"},
                ${hasInterestEnabled ? "e.interest_enabled" : "0 AS interest_enabled"},
                e.created_at,
                e.updated_at,
                ${hasApprovalStatus ? "e.approval_status" : "'approved' AS approval_status"},
                ${hasCreatedBy ? "e.created_by" : "NULL AS created_by"},
                ${hasApprovedBy ? "e.approved_by" : "NULL AS approved_by"},
                ${hasRejectionReason ? "e.rejection_reason" : "NULL AS rejection_reason"},
                ${hasAudienceScope ? "e.audience_scope" : "'all' AS audience_scope"},
                ${hasAudienceValue ? "e.audience_value" : "NULL AS audience_value"},
                ${hasCreatedBy ? "creator.name AS created_by_name" : "NULL AS created_by_name"},
                COUNT(DISTINCT CASE WHEN ai.status = 'interested' THEN ai.id END) AS interest_count,
                COUNT(DISTINCT ac.id) AS comment_count
            FROM ${announcementTable} e
            LEFT JOIN announcement_interests ai ON ai.announcement_id = e.id
            LEFT JOIN announcement_comments ac ON ac.announcement_id = e.id AND ac.status = 'visible'
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

        const mappedAnnouncements = rows.map((row) => {
            const duration = withDurationFields(row as Record<string, unknown>);
            return {
            ...duration,
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
            createdByName: (row as QueryRow).created_by_name || null,
            interestEnabled: normalizeAnnouncementType(String(row.type || "")) === "event" || normalizeBoolean((row as QueryRow).interest_enabled),
            interestCount: Number((row as QueryRow).interest_count || 0),
            registration_count: Number((row as QueryRow).interest_count || 0)
        };
        });

        res.json(canModerate ? mappedAnnouncements : mappedAnnouncements.filter((item) => item.computed_status !== "Archived"));
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
        const hasStartDatetime = await columnExists(announcementTable, "start_datetime");
        const hasEndDatetime = await columnExists(announcementTable, "end_datetime");
        const hasAutoArchiveAt = await columnExists(announcementTable, "auto_archive_at");
        const hasArchivedAt = await columnExists(announcementTable, "archived_at");
        const hasInterestEnabled = await columnExists(announcementTable, "interest_enabled");
        const { title, description, date, time, venue, type, google_form_link, organizer, image_url, status, capacity, audienceScope, audienceValue, interestEnabled, interest_enabled } = req.body || {};
        const normalizedType = normalizeAnnouncementType(type);
        const enabledInterest = normalizedType === "event" || normalizeBoolean(interestEnabled ?? interest_enabled);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);
        const durationWindow = getDurationWindowFromBody(req.body || {});
        const effectiveDate = normalizeDateOnly(date) || (durationWindow.start ? formatManilaDate(durationWindow.start) : "");
        const effectiveTime = time || (durationWindow.start ? formatManilaTime(durationWindow.start).slice(0, 5) : null);
        const role = await getRoleForUser(req.user.id);
        const canModerate = canModerateAnnouncementContent(role);
        const approvalStatus = canModerate ? "approved" : "pending_approval";

        if (!title || !effectiveDate) {
            return res.status(400).json({ error: "Title and date are required" });
        }

        if (durationWindow.start && durationWindow.end && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
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
            ...(hasAudienceValue ? ["audience_value"] : []),
            ...(hasStartDatetime ? ["start_datetime"] : []),
            ...(hasEndDatetime ? ["end_datetime"] : []),
            ...(hasAutoArchiveAt ? ["auto_archive_at"] : []),
            ...(hasArchivedAt ? ["archived_at"] : []),
            ...(hasInterestEnabled ? ["interest_enabled"] : [])
        ];

        const values: DbParam[] = [
            title,
            description || null,
            effectiveDate,
            effectiveTime || null,
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
            ...(hasAudienceValue ? [normalizedAudienceValue] : []),
            ...(hasStartDatetime ? [durationWindow.startSql] : []),
            ...(hasEndDatetime ? [durationWindow.endSql] : []),
            ...(hasAutoArchiveAt ? [durationWindow.endSql] : []),
            ...(hasArchivedAt ? [null] : []),
            ...(hasInterestEnabled ? [enabledInterest ? 1 : 0] : [])
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
                    ...withDurationFields(newEvent),
                    id: String(newEvent.id),
                    type: normalizeAnnouncementType(String(newEvent.type || normalizedType)),
                    image_url: normalizeStoredMedia(newEvent.image_url),
                    status: normalizeStatus(newEvent.status, getAnnouncementStatusFallback(String(newEvent.type || normalizedType))),
                    approvalStatus: normalizeAnnouncementApprovalStatus(newEvent.approval_status, approvalStatus),
                    audienceScope: normalizeAnnouncementAudienceScope(newEvent.audience_scope || normalizedAudienceScope),
                    audienceValue: newEvent.audience_value || normalizedAudienceValue,
                    audienceLabel: formatAnnouncementAudienceLabel(newEvent.audience_scope || normalizedAudienceScope, newEvent.audience_value || normalizedAudienceValue),
                    interestEnabled: normalizedType === "event" || normalizeBoolean(newEvent.interest_enabled)
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

        await autoArchiveExpiredContent();
        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const hasStartDatetime = await columnExists(announcementTable, "start_datetime");
        const hasEndDatetime = await columnExists(announcementTable, "end_datetime");
        const hasAutoArchiveAt = await columnExists(announcementTable, "auto_archive_at");
        const hasArchivedAt = await columnExists(announcementTable, "archived_at");
        const hasInterestEnabled = await columnExists(announcementTable, "interest_enabled");
        await ensureAnnouncementInterestTable();
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
                ${hasStartDatetime ? "e.start_datetime" : "NULL AS start_datetime"},
                ${hasEndDatetime ? "e.end_datetime" : "NULL AS end_datetime"},
                ${hasAutoArchiveAt ? "e.auto_archive_at" : "NULL AS auto_archive_at"},
                ${hasArchivedAt ? "e.archived_at" : "NULL AS archived_at"},
                ${hasInterestEnabled ? "e.interest_enabled" : "0 AS interest_enabled"},
                e.created_at,
                e.updated_at,
                ${hasApprovalStatus ? "e.approval_status" : "'approved' AS approval_status"},
                ${hasCreatedBy ? "e.created_by" : "NULL AS created_by"},
                ${hasApprovedBy ? "e.approved_by" : "NULL AS approved_by"},
                ${hasRejectionReason ? "e.rejection_reason" : "NULL AS rejection_reason"},
                ${hasAudienceScope ? "e.audience_scope" : "'all' AS audience_scope"},
                ${hasAudienceValue ? "e.audience_value" : "NULL AS audience_value"},
                ${hasCreatedBy ? "creator.name AS created_by_name" : "NULL AS created_by_name"},
                COUNT(DISTINCT CASE WHEN ai.status = 'interested' THEN ai.id END) AS interest_count,
                COUNT(DISTINCT ac.id) AS comment_count
            FROM ${announcementTable} e
            LEFT JOIN announcement_interests ai ON ai.announcement_id = e.id
            LEFT JOIN announcement_comments ac ON ac.announcement_id = e.id AND ac.status = 'visible'
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
        const eventDuration = withDurationFields(event);
        if (!canModerate && eventDuration.computed_status === "Archived" && String(event.created_by || "") !== req.user.id) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({
            ...eventDuration,
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
            createdByName: event.created_by_name || null,
            interestEnabled: normalizeAnnouncementType(String(event.type || "")) === "event" || normalizeBoolean(event.interest_enabled),
            interestCount: Number(event.interest_count || 0),
            registration_count: Number(event.interest_count || 0)
        });
    } catch (err: unknown) {
        console.error("GET ANNOUNCEMENT DETAIL ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/announcements/:id/interest-status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementInterestTable();

        const announcementTable = await getAnnouncementTableName();
        const announcementId = Number(req.params.id);
        if (!announcementId) return res.status(400).json({ error: "Invalid announcement id" });

        const announcement = await getSingleRow(
            `SELECT id, title, type, status, approval_status, created_by, interest_enabled
             FROM ${announcementTable}
             WHERE id = ?`,
            [announcementId]
        );
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });
        if (!canTrackInterest(announcement)) {
            return res.status(400).json({ error: "Interest tracking is not enabled for this announcement." });
        }

        const interest = await getAnnouncementInterestStatus(announcementId, req.user.id);
        res.json({
            interest: interest
                ? {
                    announcementId,
                    alumniId: req.user.id,
                    status: normalizeInterestStatus(interest.status),
                    isInterested: normalizeInterestStatus(interest.status) === "interested",
                    interestedAt: interest.interested_at || null,
                    updatedAt: interest.updated_at || null
                }
                : null
        });
    } catch (err: unknown) {
        console.error("GET ANNOUNCEMENT INTEREST STATUS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/announcements/:id/interest", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementInterestTable();
        await autoArchiveExpiredContent();

        const announcementTable = await getAnnouncementTableName();
        const announcementId = Number(req.params.id);
        if (!announcementId) return res.status(400).json({ error: "Invalid announcement id" });

        const role = await getRoleForUser(req.user.id);
        if (role !== "alumni") {
            return res.status(403).json({ error: "Only alumni can mark interest." });
        }

        const announcement = await getSingleRow(
            `SELECT id, title, type, status, approval_status, interest_enabled, archived_at
             FROM ${announcementTable}
             WHERE id = ?`,
            [announcementId]
        );
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });
        if (!canTrackInterest(announcement)) {
            return res.status(400).json({ error: "Interest tracking is not enabled for this announcement." });
        }
        if (normalizeAnnouncementApprovalStatus(announcement.approval_status, "approved") !== "approved") {
            return res.status(400).json({ error: "Interest can only be tracked after publication." });
        }
        if (normalizeStatus(String(announcement.status || ""), "") === "archived" || announcement.archived_at) {
            return res.status(400).json({ error: "Interest tracking is closed for archived content." });
        }

        const existing = await getAnnouncementInterestStatus(announcementId, req.user.id);
        const requested = req.body && Object.prototype.hasOwnProperty.call(req.body, "interested")
            ? (normalizeBoolean(req.body.interested) ? "interested" : "not_interested")
            : existing && normalizeInterestStatus(existing.status) === "interested"
                ? "not_interested"
                : "interested";

        await db.execute(
            `INSERT INTO announcement_interests (announcement_id, alumni_id, status, interested_at)
             VALUES (?, ?, ?, CASE WHEN ? = 'interested' THEN ? ELSE NULL END)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                interested_at = CASE WHEN VALUES(status) = 'interested' THEN COALESCE(interested_at, VALUES(interested_at)) ELSE NULL END`,
            [announcementId, req.user.id, requested, requested, formatSqlDateTime(new Date())]
        );

        const interest = await getAnnouncementInterestStatus(announcementId, req.user.id);
        res.json({
            success: true,
            interest: {
                announcementId,
                alumniId: req.user.id,
                status: normalizeInterestStatus(interest?.status),
                isInterested: normalizeInterestStatus(interest?.status) === "interested",
                interestedAt: interest?.interested_at || null,
                updatedAt: interest?.updated_at || null
            }
        });
    } catch (err: unknown) {
        console.error("SAVE ANNOUNCEMENT INTEREST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/admin/announcements/:id/interests", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const announcementId = Number(req.params.id);
        if (!announcementId) return res.status(400).json({ error: "Invalid announcement id" });

        const announcement = await getSingleRow(
            `SELECT id, title, type, interest_enabled
             FROM ${announcementTable}
             WHERE id = ?`,
            [announcementId]
        );
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });

        const summary = await getAnnouncementInterestSummary(announcementId);
        res.json({
            ...summary,
            announcement: {
                id: String(announcement.id),
                title: announcement.title,
                type: normalizeAnnouncementType(String(announcement.type || "")),
                interestEnabled: canTrackInterest(announcement)
            }
        });
    } catch (err: unknown) {
        console.error("ADMIN ANNOUNCEMENT INTERESTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/admin/events/:eventId/interests", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const event = await getSingleRow(
            `SELECT id, title, type, interest_enabled
             FROM ${announcementTable}
             WHERE id = ?`,
            [eventId]
        );
        if (!event || normalizeAnnouncementType(String(event.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found" });
        }

        const summary = await getAnnouncementInterestSummary(eventId);
        res.json({
            ...summary,
            announcement: {
                id: String(event.id),
                title: event.title,
                type: "event",
                interestEnabled: true
            }
        });
    } catch (err: unknown) {
        console.error("ADMIN EVENT INTERESTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/announcements/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementEventSurveyEngagementTables();
        const announcementId = Number(req.params.id);
        if (!announcementId) return res.status(400).json({ error: "Invalid announcement id" });

        const announcementTable = await getAnnouncementTableName();
        const announcement = await getSingleRow(`SELECT id FROM ${announcementTable} WHERE id = ?`, [announcementId]);
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });

        const role = await getRoleForUser(req.user.id);
        const canModerate = canModerateAnnouncementContent(role);
        const statusClause = canModerate ? "" : "AND ac.status = 'visible'";

        const commentRows = parseRows(await db.query(
            `SELECT
                ac.id,
                ac.announcement_id,
                ac.user_id,
                ac.content,
                ac.status,
                ac.created_at,
                ac.updated_at,
                p.name AS author_name,
                p.email AS author_email,
                p.photo AS author_photo
             FROM announcement_comments ac
             LEFT JOIN profiles p ON p.id = ac.user_id
             WHERE ac.announcement_id = ? ${statusClause}
             ORDER BY ac.created_at ASC, ac.id ASC`,
            [announcementId]
        ));

        const commentIds = commentRows.map((row) => Number(row.id)).filter(Boolean);
        const repliesByComment = new Map<number, QueryRow[]>();
        if (commentIds.length) {
            const placeholders = commentIds.map(() => "?").join(", ");
            const replyRows = parseRows(await db.query(
                `SELECT
                    acr.id,
                    acr.comment_id,
                    acr.user_id,
                    acr.content,
                    acr.status,
                    acr.created_at,
                    acr.updated_at,
                    p.name AS author_name,
                    p.email AS author_email,
                    p.photo AS author_photo
                 FROM announcement_comment_replies acr
                 LEFT JOIN profiles p ON p.id = acr.user_id
                 WHERE acr.comment_id IN (${placeholders}) ${canModerate ? "" : "AND acr.status = 'visible'"}
                 ORDER BY acr.created_at ASC, acr.id ASC`,
                commentIds
            ));
            for (const reply of replyRows) {
                const commentId = Number(reply.comment_id);
                repliesByComment.set(commentId, [...(repliesByComment.get(commentId) || []), reply]);
            }
        }

        res.json(commentRows.map((comment) => ({
            id: Number(comment.id),
            announcementId: Number(comment.announcement_id),
            userId: comment.user_id,
            content: comment.status === "hidden" ? "This comment was hidden by admin." : comment.content,
            status: comment.status,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            authorName: comment.author_name || "Alumni",
            authorEmail: comment.author_email || null,
            authorPhoto: normalizeStoredMedia(comment.author_photo ? String(comment.author_photo) : null),
            replies: (repliesByComment.get(Number(comment.id)) || []).map((reply) => ({
                id: Number(reply.id),
                commentId: Number(reply.comment_id),
                userId: reply.user_id,
                content: reply.status === "hidden" ? "This reply was hidden by admin." : reply.content,
                status: reply.status,
                createdAt: reply.created_at,
                updatedAt: reply.updated_at,
                authorName: reply.author_name || "Alumni",
                authorEmail: reply.author_email || null,
                authorPhoto: normalizeStoredMedia(reply.author_photo ? String(reply.author_photo) : null)
            }))
        })));
    } catch (err: unknown) {
        console.error("GET ANNOUNCEMENT COMMENTS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/announcements/:id/comments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementEventSurveyEngagementTables();
        const announcementId = Number(req.params.id);
        const content = normalizeText(req.body?.content);
        if (!announcementId) return res.status(400).json({ error: "Invalid announcement id" });
        if (!content) return res.status(400).json({ error: "Comment is required." });

        const announcementTable = await getAnnouncementTableName();
        const announcement = await getSingleRow(`SELECT id, title FROM ${announcementTable} WHERE id = ?`, [announcementId]);
        if (!announcement) return res.status(404).json({ error: "Announcement not found" });

        const result = await db.execute(
            "INSERT INTO announcement_comments (announcement_id, user_id, content) VALUES (?, ?, ?)",
            [announcementId, req.user.id, content]
        ) as ResultSetHeader;

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds.filter((id) => id !== req.user?.id),
            title: "New announcement comment",
            message: `A comment was added to ${announcement.title}.`,
            category: "announcement",
            linkUrl: "/admin/announcements",
            actorId: req.user.id
        });

        res.json({ success: true, commentId: result.insertId });
    } catch (err: unknown) {
        console.error("CREATE ANNOUNCEMENT COMMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/announcements/:id/comments/:commentId/replies", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementEventSurveyEngagementTables();
        const announcementId = Number(req.params.id);
        const commentId = Number(req.params.commentId);
        const content = normalizeText(req.body?.content);
        if (!announcementId || !commentId) return res.status(400).json({ error: "Invalid comment target" });
        if (!content) return res.status(400).json({ error: "Reply is required." });

        const comment = await getSingleRow(
            "SELECT id, announcement_id, user_id FROM announcement_comments WHERE id = ? AND announcement_id = ?",
            [commentId, announcementId]
        );
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        const result = await db.execute(
            "INSERT INTO announcement_comment_replies (comment_id, user_id, content) VALUES (?, ?, ?)",
            [commentId, req.user.id, content]
        ) as ResultSetHeader;

        const notifyIds = Array.from(new Set([String(comment.user_id), ...(await getAdminUserIds())])).filter((id) => id && id !== req.user?.id);
        await createUserNotifications({
            userIds: notifyIds,
            title: "New announcement reply",
            message: "A reply was added to an announcement comment.",
            category: "announcement",
            linkUrl: "/alumni/announcements",
            actorId: req.user.id
        });

        res.json({ success: true, replyId: result.insertId });
    } catch (err: unknown) {
        console.error("CREATE ANNOUNCEMENT REPLY ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/admin/announcement-comments/:commentId", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureAnnouncementEventSurveyEngagementTables();
        const commentId = Number(req.params.commentId);
        const status = normalizeText(req.body?.status || "hidden").toLowerCase() === "visible" ? "visible" : "hidden";
        if (!commentId) return res.status(400).json({ error: "Invalid comment id" });
        const result = await db.execute(
            "UPDATE announcement_comments SET status = ?, moderated_by = ?, moderated_at = ? WHERE id = ?",
            [status, req.user?.id || null, formatSqlDateTime(new Date()), commentId]
        ) as ResultSetHeader;
        if (result.affectedRows === 0) return res.status(404).json({ error: "Comment not found" });
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("MODERATE ANNOUNCEMENT COMMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/admin/announcement-comment-replies/:replyId", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureAnnouncementEventSurveyEngagementTables();
        const replyId = Number(req.params.replyId);
        const status = normalizeText(req.body?.status || "hidden").toLowerCase() === "visible" ? "visible" : "hidden";
        if (!replyId) return res.status(400).json({ error: "Invalid reply id" });
        const result = await db.execute(
            "UPDATE announcement_comment_replies SET status = ?, moderated_by = ?, moderated_at = ? WHERE id = ?",
            [status, req.user?.id || null, formatSqlDateTime(new Date()), replyId]
        ) as ResultSetHeader;
        if (result.affectedRows === 0) return res.status(404).json({ error: "Reply not found" });
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("MODERATE ANNOUNCEMENT REPLY ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.put("/api/announcements/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");
        const hasAudienceScope = await columnExists(announcementTable, "audience_scope");
        const hasAudienceValue = await columnExists(announcementTable, "audience_value");
        const hasStartDatetime = await columnExists(announcementTable, "start_datetime");
        const hasEndDatetime = await columnExists(announcementTable, "end_datetime");
        const hasAutoArchiveAt = await columnExists(announcementTable, "auto_archive_at");
        const hasArchivedAt = await columnExists(announcementTable, "archived_at");
        const hasInterestEnabled = await columnExists(announcementTable, "interest_enabled");
        const eventId = Number(req.params.id);
        const { title, description, date, time, venue, type, google_form_link, organizer, image_url, status, capacity, audienceScope, audienceValue, interestEnabled, interest_enabled } = req.body || {};
        const normalizedType = normalizeAnnouncementType(type);
        const enabledInterest = normalizedType === "event" || normalizeBoolean(interestEnabled ?? interest_enabled);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);
        const durationWindow = getDurationWindowFromBody(req.body || {});
        const effectiveDate = normalizeDateOnly(date) || (durationWindow.start ? formatManilaDate(durationWindow.start) : "");
        const effectiveTime = time || (durationWindow.start ? formatManilaTime(durationWindow.start).slice(0, 5) : null);

        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        if (normalizedAudienceScope !== "all" && !normalizedAudienceValue) {
            return res.status(400).json({ error: `Please provide the target ${normalizedAudienceScope} audience.` });
        }
        if (durationWindow.start && durationWindow.end && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
        }

        const durationSetSql = [
            ...(hasStartDatetime ? ["start_datetime = ?"] : []),
            ...(hasEndDatetime ? ["end_datetime = ?"] : []),
            ...(hasAutoArchiveAt ? ["auto_archive_at = ?"] : []),
            ...(hasArchivedAt && durationWindow.end && durationWindow.end.getTime() > Date.now() ? ["archived_at = NULL"] : [])
        ];
        const durationValues: DbParam[] = [
            ...(hasStartDatetime ? [durationWindow.startSql] : []),
            ...(hasEndDatetime ? [durationWindow.endSql] : []),
            ...(hasAutoArchiveAt ? [durationWindow.endSql] : [])
        ];
        const durationSetSuffix = durationSetSql.length ? `, ${durationSetSql.join(", ")}` : "";

        await db.execute(
            hasGoogleFormLink
                ? `UPDATE ${announcementTable} SET
                    title = ?, description = ?, date = ?, time = ?, venue = ?,
                    type = ?, google_form_link = ?, organizer = ?, image_url = ?, status = ?, capacity = ?${hasAudienceScope ? ", audience_scope = ?" : ""}${hasAudienceValue ? ", audience_value = ?" : ""}${hasInterestEnabled ? ", interest_enabled = ?" : ""}${durationSetSuffix}
                   WHERE id = ?`
                : `UPDATE ${announcementTable} SET
                    title = ?, description = ?, date = ?, time = ?, venue = ?,
                    type = ?, organizer = ?, image_url = ?, status = ?, capacity = ?${hasAudienceScope ? ", audience_scope = ?" : ""}${hasAudienceValue ? ", audience_value = ?" : ""}${hasInterestEnabled ? ", interest_enabled = ?" : ""}${durationSetSuffix}
                   WHERE id = ?`,
            hasGoogleFormLink
                ? [
                    title,
                    description || null,
                    effectiveDate,
                    effectiveTime || null,
                    venue || null,
                    normalizedType,
                    google_form_link || null,
                    organizer || null,
                    normalizeStoredMedia(image_url) || null,
                    normalizeStatus(status, getAnnouncementStatusFallback(normalizedType)),
                    capacity || 0,
                    ...(hasAudienceScope ? [normalizedAudienceScope] : []),
                    ...(hasAudienceValue ? [normalizedAudienceValue] : []),
                    ...(hasInterestEnabled ? [enabledInterest ? 1 : 0] : []),
                    ...durationValues,
                    eventId
                ]
                : [
                    title,
                    description || null,
                    effectiveDate,
                    effectiveTime || null,
                    venue || null,
                    normalizedType,
                    organizer || null,
                    normalizeStoredMedia(image_url) || null,
                    normalizeStatus(status, getAnnouncementStatusFallback(normalizedType)),
                    capacity || 0,
                    ...(hasAudienceScope ? [normalizedAudienceScope] : []),
                    ...(hasAudienceValue ? [normalizedAudienceValue] : []),
                    ...(hasInterestEnabled ? [enabledInterest ? 1 : 0] : []),
                    ...durationValues,
                    eventId
                ]
        );

        const updated = await getSingleRow(`SELECT * FROM ${announcementTable} WHERE id = ?`, [eventId]);
        res.json({
            success: true,
            event: updated
                ? {
                    ...withDurationFields(updated),
                    type: normalizeAnnouncementType(String(updated.type || normalizedType)),
                    image_url: normalizeStoredMedia(updated.image_url),
                    status: normalizeStatus(updated.status, getAnnouncementStatusFallback(String(updated.type || normalizedType))),
                    approvalStatus: normalizeAnnouncementApprovalStatus(updated.approval_status, "approved"),
                    audienceScope: normalizeAnnouncementAudienceScope(updated.audience_scope || normalizedAudienceScope),
                    audienceValue: updated.audience_value || normalizedAudienceValue,
                    audienceLabel: formatAnnouncementAudienceLabel(updated.audience_scope || normalizedAudienceScope, updated.audience_value || normalizedAudienceValue),
                    interestEnabled: normalizeAnnouncementType(String(updated.type || normalizedType)) === "event" || normalizeBoolean(updated.interest_enabled)
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

app.patch("/api/announcements/:id/archive", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const eventId = Number(req.params.id);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        await db.execute(
            `UPDATE ${announcementTable}
             SET status = 'archived',
                 archived_at = COALESCE(archived_at, ?),
                 auto_archive_at = COALESCE(auto_archive_at, end_datetime)
             WHERE id = ?`,
            [formatSqlDateTime(new Date()), eventId]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("ARCHIVE ANNOUNCEMENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.patch("/api/announcements/:id/restore", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const announcementTable = await getAnnouncementTableName();
        const eventId = Number(req.params.id);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const durationWindow = getDurationWindowFromBody(req.body || {});
        if (!durationWindow.end || durationWindow.end.getTime() <= Date.now()) {
            return res.status(400).json({ error: "Set a new future end date/time before restoring this item." });
        }
        if (durationWindow.start && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
        }

        await db.execute(
            `UPDATE ${announcementTable}
             SET status = ?,
                 start_datetime = ?,
                 end_datetime = ?,
                 auto_archive_at = ?,
                 archived_at = NULL
             WHERE id = ?`,
            [
                durationWindow.start && durationWindow.start.getTime() > Date.now() ? "upcoming" : "active",
                durationWindow.startSql,
                durationWindow.endSql,
                durationWindow.endSql,
                eventId
            ]
        );

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("RESTORE ANNOUNCEMENT ERROR:", err);
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
app.get("/api/events/:eventId/rsvps", authenticateToken, async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        const summary = await getEventRsvpSummary(eventId);
        res.json(summary);
    } catch (err: unknown) {
        console.error("GET RSVPS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/events/:eventId/rsvp-status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureEventRsvpTables();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const eventRow = await getEventForRsvp(eventId);
        if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found." });
        }

        const rsvp = await getSingleRow(
            `SELECT id, event_id, alumni_id, response_status, attendance_status, verification_status, checked_in_at, engagement_awarded, created_at, updated_at
             FROM event_rsvps
             WHERE event_id = ? AND alumni_id = ?`,
            [eventId, req.user.id]
        );

        res.json({
            rsvp: rsvp || null,
            event: withDurationFields(eventRow)
        });
    } catch (err: unknown) {
        console.error("GET RSVP STATUS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/events/:eventId/rsvp", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureEventRsvpTables();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const responseStatus = normalizeEventRsvpStatus(req.body?.responseStatus || req.body?.response_status);
        if (!responseStatus) {
            return res.status(400).json({ error: "Choose Going, Interested, or Not Going." });
        }

        const eventRow = await getEventForRsvp(eventId);
        const closedReason = ensureEventCanAcceptRsvp(eventRow);
        if (closedReason) return res.status(eventRow ? 400 : 404).json({ error: closedReason });

        const existing = await getSingleRow(
            "SELECT id FROM event_rsvps WHERE event_id = ? AND alumni_id = ?",
            [eventId, req.user.id]
        );

        if (existing) {
            return res.status(409).json({ error: "You already responded to this event. Use Update RSVP instead." });
        }

        await db.execute(
            `INSERT INTO event_rsvps (event_id, alumni_id, response_status, attendance_status, verification_status)
             VALUES (?, ?, ?, 'Pending', 'Pending')`,
            [eventId, req.user.id, responseStatus]
        );

        await db.execute(
            `INSERT INTO event_registrations (event_id, alumni_id, status)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [eventId, req.user.id, responseStatus === "Not Going" ? "cancelled" : "registered"]
        );

        await db.execute(
            `INSERT INTO event_interests (event_id, alumni_id, status)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                cancelled_at = CASE WHEN VALUES(status) = 'Cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE NULL END`,
            [eventId, req.user.id, responseStatus === "Not Going" ? "Cancelled" : "Interested"]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New event response",
            message: `An alumni member responded ${responseStatus} to an event.`,
            category: "event",
            linkUrl: "/admin/announcements",
            actorId: req.user.id
        });

        res.json({ success: true, rsvp: { event_id: eventId, alumni_id: req.user.id, response_status: responseStatus, attendance_status: "Pending", verification_status: "Pending" } });
    } catch (err: unknown) {
        console.error("RSVP ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/events/:eventId/interested", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAnnouncementInterestTable();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const eventRow = await getEventForRsvp(eventId);
        const closedReason = ensureEventCanAcceptRsvp(eventRow);
        if (closedReason) return res.status(eventRow ? 400 : 404).json({ error: closedReason });

        const existing = await getAnnouncementInterestStatus(eventId, req.user.id);
        const requested = req.body && Object.prototype.hasOwnProperty.call(req.body, "interested")
            ? (normalizeBoolean(req.body.interested) ? "interested" : "not_interested")
            : existing && normalizeInterestStatus(existing.status) === "interested"
                ? "not_interested"
                : "interested";

        await db.execute(
            `INSERT INTO announcement_interests (announcement_id, alumni_id, status, interested_at)
             VALUES (?, ?, ?, CASE WHEN ? = 'interested' THEN ? ELSE NULL END)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                interested_at = CASE WHEN VALUES(status) = 'interested' THEN COALESCE(interested_at, VALUES(interested_at)) ELSE NULL END`,
            [eventId, req.user.id, requested, requested, formatSqlDateTime(new Date())]
        );

        const interest = await getAnnouncementInterestStatus(eventId, req.user.id);

        res.json({
            success: true,
            interest: {
                announcementId: eventId,
                alumniId: req.user.id,
                status: normalizeInterestStatus(interest?.status),
                isInterested: normalizeInterestStatus(interest?.status) === "interested",
                interestedAt: interest?.interested_at || null,
                updatedAt: interest?.updated_at || null
            }
        });
    } catch (err: unknown) {
        console.error("EVENT INTEREST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.put("/api/events/:eventId/rsvp", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureEventRsvpTables();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const responseStatus = normalizeEventRsvpStatus(req.body?.responseStatus || req.body?.response_status);
        if (!responseStatus) {
            return res.status(400).json({ error: "Choose Going, Interested, or Not Going." });
        }

        const eventRow = await getEventForRsvp(eventId);
        const closedReason = ensureEventCanAcceptRsvp(eventRow);
        if (closedReason) return res.status(eventRow ? 400 : 404).json({ error: closedReason });

        const existing = await getSingleRow(
            "SELECT attendance_status, engagement_awarded FROM event_rsvps WHERE event_id = ? AND alumni_id = ?",
            [eventId, req.user.id]
        );
        if (normalizeAttendanceStatus(existing?.attendance_status) === "Attended" || Number(existing?.engagement_awarded || 0) === 1) {
            return res.status(400).json({ error: "Cannot update RSVP after attendance has been confirmed." });
        }

        const result = await db.execute(
            `UPDATE event_rsvps
             SET response_status = ?,
                 attendance_status = CASE WHEN ? = 'Going' THEN attendance_status ELSE 'Pending' END,
                 checked_in_at = CASE WHEN ? = 'Going' THEN checked_in_at ELSE NULL END
             WHERE event_id = ? AND alumni_id = ?`,
            [responseStatus, responseStatus, responseStatus, eventId, req.user.id]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No RSVP found to update." });
        }

        await db.execute(
            `INSERT INTO event_registrations (event_id, alumni_id, status)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [eventId, req.user.id, responseStatus === "Not Going" ? "cancelled" : "registered"]
        );

        await db.execute(
            `INSERT INTO event_interests (event_id, alumni_id, status)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                cancelled_at = CASE WHEN VALUES(status) = 'Cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE NULL END`,
            [eventId, req.user.id, responseStatus === "Not Going" ? "Cancelled" : "Interested"]
        );

        const rsvp = await getSingleRow(
            `SELECT id, event_id, alumni_id, response_status, attendance_status, verification_status, checked_in_at, engagement_awarded, created_at, updated_at
             FROM event_rsvps
             WHERE event_id = ? AND alumni_id = ?`,
            [eventId, req.user.id]
        );

        res.json({ success: true, rsvp });
    } catch (err: unknown) {
        console.error("UPDATE RSVP ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/events/:eventId/rsvp", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureEventRsvpTables();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const eventRow = await getEventForRsvp(eventId);
        const closedReason = ensureEventCanAcceptRsvp(eventRow);
        if (closedReason) return res.status(eventRow ? 400 : 404).json({ error: closedReason });

        const existing = await getSingleRow(
            "SELECT attendance_status, engagement_awarded FROM event_rsvps WHERE event_id = ? AND alumni_id = ?",
            [eventId, req.user.id]
        );
        if (normalizeAttendanceStatus(existing?.attendance_status) === "Attended" || Number(existing?.engagement_awarded || 0) === 1) {
            return res.status(400).json({ error: "Cannot cancel after attendance has been confirmed." });
        }

        await db.execute(
            `UPDATE event_interests
             SET status = 'Cancelled',
                 cancelled_at = COALESCE(cancelled_at, NOW())
             WHERE event_id = ? AND alumni_id = ?`,
            [eventId, req.user.id]
        );
        await db.execute("DELETE FROM event_rsvps WHERE event_id = ? AND alumni_id = ?", [eventId, req.user.id]);
        await db.execute("DELETE FROM event_registrations WHERE event_id = ? AND alumni_id = ?", [eventId, req.user.id]);
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("CANCEL RSVP ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/events/:eventId/check-in", authenticateToken, async (req: AuthenticatedRequest, res) => {
    let conn: PoolConnection | null = null;
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureEventRsvpTables();
        await autoArchiveExpiredContent();
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });

        const eventRow = await getEventForRsvp(eventId);
        if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found." });
        }
        if (!isEventActiveForCheckIn(eventRow)) {
            return res.status(400).json({ error: "Check-in is only allowed during the event date/time." });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [rows] = await conn.query<QueryRow[]>(
            `SELECT id, response_status, attendance_status, verification_status, engagement_awarded
             FROM event_rsvps
             WHERE event_id = ? AND alumni_id = ?
             FOR UPDATE`,
            [eventId, req.user.id]
        );
        const rsvp = rows[0];
        if (!rsvp) {
            await conn.rollback();
            return res.status(400).json({ error: "You must RSVP Going before checking in." });
        }
        if (normalizeEventRsvpStatus(rsvp.response_status) !== "Going") {
            await conn.rollback();
            return res.status(400).json({ error: "Only alumni marked Going can check in." });
        }

        await conn.query(
            `UPDATE event_rsvps
             SET attendance_status = 'Attended',
                 checked_in_at = COALESCE(checked_in_at, ?)
             WHERE event_id = ? AND alumni_id = ?`,
            [formatSqlDateTime(new Date()), eventId, req.user.id]
        );
        await awardEventAttendancePoints(conn, eventId, req.user.id);
        await conn.commit();

        const updated = await getSingleRow(
            `SELECT id, event_id, alumni_id, response_status, attendance_status, verification_status, checked_in_at, engagement_awarded, created_at, updated_at
             FROM event_rsvps
             WHERE event_id = ? AND alumni_id = ?`,
            [eventId, req.user.id]
        );
        res.json({ success: true, rsvp: updated, pointsAwarded: 10 });
    } catch (err: unknown) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error("CHECK-IN ROLLBACK ERROR:", rollbackError);
            }
        }
        console.error("CHECK-IN ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn?.release();
    }
});

app.get("/api/admin/events/:eventId/rsvps", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        const eventRow = await getEventForRsvp(eventId);
        if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found." });
        }
        const summary = await getEventRsvpSummary(eventId);
        res.json({ ...summary, event: withDurationFields(eventRow) });
    } catch (err: unknown) {
        console.error("ADMIN EVENT RSVPS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/events/:eventId/mark-attendance", authenticateToken, requireAdmin, async (req, res) => {
    let conn: PoolConnection | null = null;
    try {
        await ensureEventRsvpTables();
        const eventId = Number(req.params.eventId);
        const alumniId = normalizeText(req.body?.alumniId || req.body?.alumni_id);
        const attendanceStatus = normalizeAttendanceStatus(req.body?.attendanceStatus || req.body?.attendance_status);

        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        if (!alumniId) return res.status(400).json({ error: "Alumni id is required." });
        if (!attendanceStatus || attendanceStatus === "Pending") {
            return res.status(400).json({ error: "Choose Attended or Absent." });
        }

        const eventRow = await getEventForRsvp(eventId);
        if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found." });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [rows] = await conn.query<QueryRow[]>(
            `SELECT id, response_status, attendance_status, engagement_awarded
             FROM event_rsvps
             WHERE event_id = ? AND alumni_id = ?
             FOR UPDATE`,
            [eventId, alumniId]
        );
        const rsvp = rows[0];
        if (!rsvp) {
            await conn.rollback();
            return res.status(404).json({ error: "This alumni has no RSVP for the event." });
        }
        if (attendanceStatus === "Attended" && normalizeEventRsvpStatus(rsvp.response_status) !== "Going") {
            await conn.rollback();
            return res.status(400).json({ error: "Only Going RSVPs can be marked Attended." });
        }
        if (attendanceStatus === "Absent" && Number(rsvp.engagement_awarded || 0) === 1) {
            await conn.rollback();
            return res.status(400).json({ error: "Cannot mark Absent after attendance points were already awarded." });
        }

        await conn.query(
            `UPDATE event_rsvps
             SET attendance_status = ?,
                 checked_in_at = CASE WHEN ? = 'Attended' THEN COALESCE(checked_in_at, ?) ELSE NULL END
             WHERE event_id = ? AND alumni_id = ?`,
            [attendanceStatus, attendanceStatus, formatSqlDateTime(new Date()), eventId, alumniId]
        );

        if (attendanceStatus === "Attended") {
            await awardEventAttendancePoints(conn, eventId, alumniId);
        }

        await conn.commit();
        const summary = await getEventRsvpSummary(eventId);
        res.json({ success: true, ...summary });
    } catch (err: unknown) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error("MARK ATTENDANCE ROLLBACK ERROR:", rollbackError);
            }
        }
        console.error("MARK ATTENDANCE ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn?.release();
    }
});

app.post("/api/admin/events/:eventId/verify-interest", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await ensureEventRsvpTables();
        const eventId = Number(req.params.eventId);
        const alumniId = normalizeText(req.body?.alumniId || req.body?.alumni_id);
        const verificationStatus = normalizeVerificationStatus(req.body?.verificationStatus || req.body?.verification_status);

        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        if (!alumniId) return res.status(400).json({ error: "Alumni id is required." });
        if (!verificationStatus || verificationStatus === "Pending") {
            return res.status(400).json({ error: "Choose Verified or Not Verified." });
        }

        const eventRow = await getEventForRsvp(eventId);
        if (!eventRow || normalizeAnnouncementType(String(eventRow.type || "")) !== "event") {
            return res.status(404).json({ error: "Event not found." });
        }

        const result = await db.execute(
            `UPDATE event_rsvps
             SET verification_status = ?
             WHERE event_id = ? AND alumni_id = ?`,
            [verificationStatus, eventId, alumniId]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "This alumni has no event response to verify." });
        }

        await db.execute(
            `INSERT INTO event_interests (event_id, alumni_id, status, verified_by, verified_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), verified_by = VALUES(verified_by), verified_at = VALUES(verified_at)`,
            [eventId, alumniId, verificationStatus === "Verified" ? "Verified" : "Interested", (req as AuthenticatedRequest).user?.id || null, formatSqlDateTime(new Date())]
        );

        const summary = await getEventRsvpSummary(eventId);
        res.json({ success: true, ...summary });
    } catch (err: unknown) {
        console.error("VERIFY EVENT INTEREST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/admin/events/:eventId/interests/:alumniId", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await ensureEventRsvpTables();
        await ensureAnnouncementEventSurveyEngagementTables();
        const eventId = Number(req.params.eventId);
        const alumniId = normalizeText(req.params.alumniId);

        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        if (!alumniId) return res.status(400).json({ error: "Alumni id is required." });

        await db.execute("DELETE FROM event_rsvps WHERE event_id = ? AND alumni_id = ?", [eventId, alumniId]);
        await db.execute("DELETE FROM event_registrations WHERE event_id = ? AND alumni_id = ?", [eventId, alumniId]);
        await db.execute(
            `INSERT INTO event_interests (event_id, alumni_id, status, cancelled_at)
             VALUES (?, ?, 'Cancelled', ?)
             ON DUPLICATE KEY UPDATE status = 'Cancelled', cancelled_at = VALUES(cancelled_at)`,
            [eventId, alumniId, formatSqlDateTime(new Date())]
        );

        const summary = await getEventRsvpSummary(eventId);
        res.json({ success: true, ...summary });
    } catch (err: unknown) {
        console.error("REMOVE EVENT INTEREST ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/events/:eventId/archive", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        const announcementTable = await getAnnouncementTableName();
        await db.execute(
            `UPDATE ${announcementTable}
             SET status = 'archived',
                 archived_at = COALESCE(archived_at, ?),
                 auto_archive_at = COALESCE(auto_archive_at, end_datetime)
             WHERE id = ? AND LOWER(COALESCE(type, '')) = 'event'`,
            [formatSqlDateTime(new Date()), eventId]
        );
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("ADMIN ARCHIVE EVENT ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/events/:eventId/reopen", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        if (!eventId) return res.status(400).json({ error: "Invalid event id" });
        const durationWindow = getDurationWindowFromBody(req.body || {});
        if (!durationWindow.end || durationWindow.end.getTime() <= Date.now()) {
            return res.status(400).json({ error: "Set a new future end date/time before reopening this event." });
        }
        if (durationWindow.start && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
        }

        const announcementTable = await getAnnouncementTableName();
        await db.execute(
            `UPDATE ${announcementTable}
             SET status = ?,
                 start_datetime = ?,
                 end_datetime = ?,
                 auto_archive_at = ?,
                 archived_at = NULL
             WHERE id = ? AND LOWER(COALESCE(type, '')) = 'event'`,
            [
                durationWindow.start && durationWindow.start.getTime() > Date.now() ? "upcoming" : "active",
                durationWindow.startSql,
                durationWindow.endSql,
                durationWindow.endSql,
                eventId
            ]
        );
        res.json({ success: true });
    } catch (err: unknown) {
        console.error("ADMIN REOPEN EVENT ERROR:", err);
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

        await autoArchiveExpiredContent();
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
             ${canManageSurveys ? "" : "WHERE s.status = 'published' AND s.archived_at IS NULL AND LOWER(COALESCE(s.status, '')) <> 'archived'"}
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

            const duration = withDurationFields({
                ...row,
                start_datetime: row.start_datetime || row.opens_at,
                end_datetime: row.end_datetime || row.closes_at
            });

            return {
                id: Number(row.id),
                eventId: row.event_id ? Number(row.event_id) : null,
                title: row.title,
                description: row.description,
                surveyType: row.survey_type,
                status: row.status,
                targetAudience: row.target_audience,
                isAnonymous: Boolean(row.is_anonymous),
                allowMultipleResponses: Boolean(row.allow_multiple_responses),
                opensAt: row.opens_at,
                closesAt: row.closes_at,
                start_datetime: duration.start_datetime,
                start_date: duration.start_date,
                start_time: duration.start_time,
                end_datetime: duration.end_datetime,
                end_date: duration.end_date,
                end_time: duration.end_time,
                auto_archive_at: duration.auto_archive_at,
                archived_at: duration.archived_at,
                duration_status: duration.duration_status,
                computed_status: duration.computed_status,
                remaining_time: duration.remaining_time,
                is_expired: duration.is_expired,
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

        res.json(canManageSurveys ? surveys : surveys.filter((survey) => survey.questions.length > 0));
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
            allowMultipleResponses,
            opensAt,
            closesAt,
            questions
        } = req.body || {};
        const durationWindow = getDurationWindowFromBody({
            ...req.body,
            start_datetime: req.body?.start_datetime || opensAt,
            end_datetime: req.body?.end_datetime || closesAt
        });

        if (!title || !surveyType || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: "Title, type, and at least one question are required" });
        }
        if (durationWindow.start && durationWindow.end && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
        }

        await conn.beginTransaction();

        const [result] = await conn.execute<ResultSetHeader>(
            `INSERT INTO surveys
                (event_id, title, description, survey_type, status, target_audience, is_anonymous, allow_multiple_responses, opens_at, closes_at, start_datetime, end_datetime, auto_archive_at, archived_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            [
                eventId || null,
                title,
                description || null,
                surveyType,
                status || "draft",
                targetAudience || "all_alumni",
                isAnonymous ? 1 : 0,
                allowMultipleResponses ? 1 : 0,
                opensAt || durationWindow.startSql,
                closesAt || durationWindow.endSql,
                durationWindow.startSql,
                durationWindow.endSql,
                durationWindow.endSql,
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

app.put("/api/surveys/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        if (!req.user?.id) return res.sendStatus(401);
        const surveyId = Number(req.params.id);
        const {
            title,
            description,
            eventId,
            surveyType,
            status,
            targetAudience,
            isAnonymous,
            allowMultipleResponses,
            opensAt,
            closesAt,
            questions
        } = req.body || {};

        if (!surveyId) return res.status(400).json({ error: "Invalid survey id" });
        if (!title || !surveyType || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: "Title, type, and at least one question are required" });
        }

        const durationWindow = getDurationWindowFromBody({
            ...req.body,
            start_datetime: req.body?.start_datetime || opensAt,
            end_datetime: req.body?.end_datetime || closesAt
        });

        if (durationWindow.start && durationWindow.end && durationWindow.end.getTime() < durationWindow.start.getTime()) {
            return res.status(400).json({ error: "End date/time must be after the start date/time." });
        }

        await conn.beginTransaction();

        const [updateResult] = await conn.execute<ResultSetHeader>(
            `UPDATE surveys
             SET event_id = ?, title = ?, description = ?, survey_type = ?, status = ?, target_audience = ?,
                 is_anonymous = ?, allow_multiple_responses = ?, opens_at = ?, closes_at = ?, start_datetime = ?, end_datetime = ?,
                 auto_archive_at = ?, archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, ?) ELSE NULL END,
                 updated_by = ?
             WHERE id = ?`,
            [
                eventId || null,
                title,
                description || null,
                surveyType,
                status || "draft",
                targetAudience || "all_alumni",
                isAnonymous ? 1 : 0,
                allowMultipleResponses ? 1 : 0,
                opensAt || durationWindow.startSql,
                closesAt || durationWindow.endSql,
                durationWindow.startSql,
                durationWindow.endSql,
                durationWindow.endSql,
                status || "draft",
                formatSqlDateTime(new Date()),
                req.user.id,
                surveyId
            ]
        );

        if (updateResult.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ error: "Survey not found" });
        }

        await conn.execute("DELETE FROM survey_questions WHERE survey_id = ?", [surveyId]);

        for (let index = 0; index < questions.length; index += 1) {
            const question = questions[index];
            await conn.execute(
                `INSERT INTO survey_questions
                    (survey_id, question_text, question_type, question_order, is_required, options_json, min_rating, max_rating, placeholder)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
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
        res.json({ success: true, surveyId });
    } catch (err: unknown) {
        await conn.rollback();
        console.error("UPDATE SURVEY ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    } finally {
        conn.release();
    }
});

app.patch("/api/surveys/:id/status", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const surveyId = Number(req.params.id);
        const { status } = req.body || {};
        const durationWindow = getDurationWindowFromBody(req.body || {});

        if (!surveyId || !status) {
            return res.status(400).json({ error: "Survey id and status are required" });
        }

        const normalizedStatus = normalizeStatus(String(status), "draft");
        const current = await getSingleRow("SELECT id, archived_at FROM surveys WHERE id = ?", [surveyId]);
        if (!current) {
            return res.status(404).json({ error: "Survey not found" });
        }

        if (normalizedStatus !== "archived" && current.archived_at && (!durationWindow.end || durationWindow.end.getTime() <= Date.now())) {
            return res.status(400).json({ error: "Set a new future end date/time before restoring this survey." });
        }

        const updates = ["status = ?", "updated_by = ?"];
        const params: DbParam[] = [normalizedStatus, req.user?.id || null];
        if (normalizedStatus === "archived") {
            updates.push("archived_at = COALESCE(archived_at, ?)");
            params.push(formatSqlDateTime(new Date()));
        } else if (durationWindow.end) {
            updates.push("start_datetime = ?", "end_datetime = ?", "auto_archive_at = ?", "opens_at = ?", "closes_at = ?", "archived_at = NULL");
            params.push(durationWindow.startSql, durationWindow.endSql, durationWindow.endSql, durationWindow.startSql, durationWindow.endSql);
        }
        params.push(surveyId);

        await db.execute(
            `UPDATE surveys SET ${updates.join(", ")} WHERE id = ?`,
            params
        );

        const survey = await getSingleRow("SELECT title FROM surveys WHERE id = ?", [surveyId]);
        if (survey && normalizedStatus === "published") {
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

        await autoArchiveExpiredContent();
        const survey = await getSingleRow(
            "SELECT id, title, status, allow_multiple_responses, opens_at, closes_at, start_datetime, end_datetime, auto_archive_at, archived_at FROM surveys WHERE id = ?",
            [surveyId]
        );
        if (!survey) {
            return res.status(404).json({ error: "Survey not found" });
        }
        const duration = computeDurationFields({
            ...survey,
            start_datetime: survey.start_datetime || survey.opens_at,
            end_datetime: survey.end_datetime || survey.closes_at
        });
        if (normalizeStatus(String(survey.status || ""), "") !== "published" || duration.is_expired || duration.computed_status !== "Active") {
            return res.status(400).json({ error: "This survey is closed and no longer accepts responses." });
        }

        await conn.beginTransaction();
        if (!normalizeBoolean(survey.allow_multiple_responses)) {
            const existing = await getSingleRow(
                "SELECT id FROM survey_responses WHERE survey_id = ? AND respondent_id = ? LIMIT 1",
                [surveyId, req.user.id]
            ) || await getSingleRow(
                "SELECT id FROM survey_answers WHERE survey_id = ? AND respondent_id = ? LIMIT 1",
                [surveyId, req.user.id]
            );
            if (existing) {
                await conn.rollback();
                return res.status(409).json({ error: "You already answered this survey." });
            }
        }

        const [responseResult] = await conn.execute<ResultSetHeader>(
            "INSERT INTO survey_responses (survey_id, respondent_id) VALUES (?, ?)",
            [surveyId, req.user.id]
        );

        for (const answer of answers) {
            await conn.execute(
                `INSERT INTO survey_answers
                    (response_id, survey_id, question_id, respondent_id, answer_text, answer_value, answer_json, rating_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    responseResult.insertId,
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

app.get("/api/admin/mailing/alumni", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const course = String(req.query.course || "").trim();
        const batch = String(req.query.batch || "").trim();
        const reason = String(req.query.reason || "").trim();
        const rows = await getEligibleMailingRecipients({ search, course, batch, reason, limit: 100 });

        res.json(rows);
    } catch (err: unknown) {
        console.error("GET MAILING ALUMNI ERROR:", err);
        res.status(500).json({ error: "Unable to load alumni recipients." });
    }
});

app.get("/api/admin/mailing/logs", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const rows = parseRows(await db.query(
            `SELECT
                el.id,
                el.alumni_id,
                p.name AS alumni_name,
                p.student_id,
                el.recipient_email,
                el.email_purpose,
                el.subject,
                el.message,
                el.status,
                el.error_message,
                el.sent_at,
                el.created_at
             FROM email_logs el
             LEFT JOIN profiles p ON p.id = el.alumni_id
             ORDER BY el.created_at DESC
             LIMIT 100`
        ));

        res.json(rows);
    } catch (err: unknown) {
        console.error("GET EMAIL LOGS ERROR:", err);
        res.status(500).json({ error: "Unable to load email logs." });
    }
});

app.delete("/api/admin/mailing/logs/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const logId = String(req.params.id || "").trim();

        if (!logId) {
            return res.status(400).json({ error: "Email log id is required." });
        }

        const result = await db.execute(
            "DELETE FROM email_logs WHERE id = ?",
            [logId]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Email log was not found." });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("DELETE EMAIL LOG ERROR:", err);
        res.status(500).json({ error: "Unable to delete email log." });
    }
});

app.get("/api/admin/mailing/filters", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const rows = await getEligibleMailingRecipients({ limit: 500 });
        const courses = Array.from(new Set(rows.map((row) => row.course).filter(Boolean))).sort();
        const batches = Array.from(new Set(rows.map((row) => row.batch).filter(Boolean))).sort();

        res.json({
            courses,
            batches,
            reasons: Object.entries(MAILING_REMINDER_REASONS).map(([value, label]) => ({ value, label }))
        });
    } catch (err: unknown) {
        console.error("GET MAILING FILTERS ERROR:", err);
        res.status(500).json({ error: "Unable to load mailing filters." });
    }
});

app.post("/api/admin/mailing/send", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
        const { alumniId, alumniIds, purpose, subject, message, confirmed } = req.body || {};
        const normalizedSubject = String(subject || "").trim();
        const normalizedMessage = String(message || "").trim();
        const requestedAlumniIds = Array.isArray(alumniIds)
            ? alumniIds
            : alumniId
                ? [alumniId]
                : [];
        const selectedAlumniIds = requestedAlumniIds
            .map((value) => String(value || "").trim())
            .filter(Boolean);
        const uniqueAlumniIds = Array.from(new Set(selectedAlumniIds));

        if (confirmed !== true) {
            return res.status(400).json({ error: "Preview and confirm the email before sending." });
        }

        if (uniqueAlumniIds.length === 0) {
            return res.status(400).json({ error: "Select at least one alumnus before sending email." });
        }

        if (uniqueAlumniIds.length !== selectedAlumniIds.length) {
            return res.status(400).json({ error: "Remove duplicate alumni selections before sending email." });
        }

        if (uniqueAlumniIds.length > 10) {
            return res.status(400).json({ error: "You can send email to a maximum of 10 selected alumni at once." });
        }

        if (!isMailingPurpose(purpose)) {
            return res.status(400).json({ error: "Choose a valid email purpose." });
        }

        if (!normalizedSubject || !normalizedMessage) {
            return res.status(400).json({ error: "Subject and message are required." });
        }

        if (normalizedSubject.length > 255) {
            return res.status(400).json({ error: "Subject must be 255 characters or less." });
        }

        const recipients = await getEligibleMailingRecipients({ alumniIds: uniqueAlumniIds, limit: 10 });

        if (recipients.length !== uniqueAlumniIds.length) {
            return res.status(404).json({ error: "One or more selected alumni are not eligible for follow-up or have no valid email address." });
        }

        const placeholders = uniqueAlumniIds.map(() => "?").join(", ");
        const duplicateRows = parseRows(await db.query(
            `SELECT alumni_id, created_at
             FROM email_logs
             WHERE alumni_id IN (${placeholders})
               AND email_purpose = ?
               AND subject = ?
               AND status = 'sent'
               AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
            [...uniqueAlumniIds, purpose, normalizedSubject]
        ));

        if (duplicateRows.length > 0) {
            return res.status(409).json({ error: "This email was already sent recently to one or more selected alumni. Please wait before sending it again." });
        }

        const sentRecipients: Array<{ id: string; name: unknown; email: string }> = [];
        const failedRecipients: Array<{ id: string; name: unknown; email: string; error: string; logId: string }> = [];

        for (const recipient of recipients) {
            const logId = uuidv4();
            const recipientEmail = normalizeEmail(recipient.email);
            const recipientMessage = buildRecipientMailingMessage(normalizedMessage, recipient);

            try {
                const result = await sendTargetedAlumniEmail({
                    to: recipientEmail,
                    name: String(recipient.name || "Alumni"),
                    purpose,
                    subject: normalizedSubject,
                    message: recipientMessage
                });

                await db.execute(
                    `INSERT INTO email_logs
                        (id, alumni_id, recipient_email, email_purpose, subject, message, status, error_message, sent_at, created_at, created_by, provider_message_id)
                     VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, ?, ?, ?, ?)`,
                    [logId, recipient.id, recipientEmail, purpose, normalizedSubject, recipientMessage, now, now, req.user?.id || null, result.messageId]
                );

                sentRecipients.push({
                    id: String(recipient.id),
                    name: recipient.name,
                    email: recipientEmail
                });
            } catch (sendError: unknown) {
                const safeError = getSafeMailingError(sendError);

                await db.execute(
                    `INSERT INTO email_logs
                        (id, alumni_id, recipient_email, email_purpose, subject, message, status, error_message, sent_at, created_at, created_by, provider_message_id)
                     VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, NULL, ?, ?, NULL)`,
                    [logId, recipient.id, recipientEmail, purpose, normalizedSubject, recipientMessage, safeError, now, req.user?.id || null]
                );

                failedRecipients.push({
                    id: String(recipient.id),
                    name: recipient.name,
                    email: recipientEmail,
                    error: safeError,
                    logId
                });
            }
        }

        if (sentRecipients.length > 0) {
            const recipientLabel =
                sentRecipients.length === 1
                    ? String(sentRecipients[0].name || sentRecipients[0].email)
                    : `${sentRecipients.length} selected alumni`;

            await db.execute(
                `INSERT INTO notifications (id, subject, message, type, status, recipients, recipient_count, sent_at, created_at, created_by)
                 VALUES (?, ?, ?, 'email', 'sent', ?, ?, ?, ?, ?)`,
                [uuidv4(), normalizedSubject, normalizedMessage, recipientLabel, sentRecipients.length, now, now, req.user?.id || null]
            );
        }

        if (sentRecipients.length === 0) {
            return res.status(502).json({
                error: "Email was not sent to any selected alumnus. Check the email logs for safe error messages.",
                failedCount: failedRecipients.length,
                failures: failedRecipients.map(({ id, name, email, error, logId }) => ({ id, name, email, error, logId }))
            });
        }

        return res.status(failedRecipients.length > 0 ? 207 : 200).json({
            success: failedRecipients.length === 0,
            message:
                failedRecipients.length > 0
                    ? `Email sent to ${sentRecipients.length} selected alumni. ${failedRecipients.length} failed.`
                    : `Email sent to ${sentRecipients.length} selected alumni.`,
            sentCount: sentRecipients.length,
            failedCount: failedRecipients.length,
            recipients: sentRecipients,
            failures: failedRecipients.map(({ id, name, email, logId }) => ({ id, name, email, logId }))
        });
    } catch (err: unknown) {
        console.error("SEND TARGETED MAIL ERROR:", {
            message: getErrorMessage(err)
        });
        res.status(500).json({ error: "Unable to send email right now." });
    }
});

app.post("/api/notifications/send", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        return res.status(400).json({
            error: "Bulk mailing is disabled. Use the targeted mailing endpoint and select up to 10 alumni."
        });
    } catch (err: unknown) {
        console.error("SEND NOTIFICATION ERROR:", err);
        res.status(500).json({ error: "Unable to send notification." });
    }
});

app.post("/api/admin/tracer/bulk-download", authenticateToken, assertTracerAdminAccess, bulkDownloadTracerPdfs);
app.get("/api/admin/tracer/:alumniId/pdf/preview", authenticateToken, assertTracerAdminAccess, previewTracerPdfByRecordId);
app.get("/api/admin/tracer/:alumniId/pdf/download", authenticateToken, assertTracerAdminAccess, exportTracerPdfByRecordId);
app.get("/api/admin/tracer/:alumniId/pdf", authenticateToken, assertTracerAdminAccess, exportTracerPdfByRecordId);
app.get("/api/admin/tracer/:alumniId", authenticateToken, assertTracerAdminAccess, getAdminTracerRecord);
app.use("/api/email", authenticateToken, requireAdmin, emailRoutes);

export default app;
