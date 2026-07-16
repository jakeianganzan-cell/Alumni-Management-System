import "./env";
import express from "express";
import cors from "cors";
import type { CorsOptions } from "cors";
import path from "path";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import ExcelJS from "exceljs";
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
import { COURSE_LABELS, COURSE_OPTIONS, normalizeCourseCode, normalizeCourseOptions, SYSTEM_COURSES, type CourseOption } from "./courseCatalog";

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
    borNumber?: string;
    advancedStudiesLevel?: string;
    advancedStudiesStatus?: string;
    advancedStudiesProgram?: string;
    advancedStudiesSchool?: string;
    advancedStudiesStartYear?: string;
    advancedStudiesExpectedCompletionYear?: string;
}

interface AlumniImportPreparedRow {
    rowNumber: number;
    name: string;
    batch: string;
    email: string;
    course: string;
    contactNumber: string;
    borNumber: string | null;
    advancedStudiesLevel: string | null;
    advancedStudiesStatus: string | null;
    advancedStudiesProgram: string | null;
    advancedStudiesSchool: string | null;
    advancedStudiesStartYear: string | null;
    advancedStudiesExpectedCompletionYear: string | null;
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

interface RecentDonationRow extends QueryRow {
    id: number;
    amount: number;
    purpose: string | null;
    message: string | null;
    created_at: string | null;
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

interface AlumniProjectRow extends QueryRow {
    id: number | string; title: string; description: string | null; category: string; batch_year: string | null;
    lead_officer_id: string | null; lead_officer_name: string | null; lead_alumni_id: string | null; lead_alumni_name: string | null;
    organization_name: string | null; alumni_group: string | null; start_date: string | null; end_date: string | null; status: string;
    estimated_value: number | string | null; funding_source: string | null; beneficiaries: string | null; accomplishments: string | null;
    remarks: string | null; related_contribution_id: string | null; contribution_record_id: string | null; created_by: string | null;
    created_at: string; updated_at: string; file_count: number | string | null;
}
interface AlumniProjectFileRow extends QueryRow {
    id: number | string; project_id: number | string; file_name: string; file_path: string | null; file_url: string | null;
    file_type: string | null; file_category: string | null; uploaded_by: string | null; uploaded_at: string | null; created_at: string;
}
interface AlumniFeeTypeRow extends QueryRow {
    id: number | string;
    fee_name: string;
    amount: number | string;
    description: string | null;
    applicable_batch_year: string | null;
    applicable_program_id: string | null;
    due_date: string | null;
    assigned_officer_id: string | null;
    is_required: number | boolean | null;
    status: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    officer_name: string | null;
    officer_email: string | null;
    created_by_name: string | null;
}
interface AlumniFeePaymentRow extends QueryRow {
    id: number | string;
    alumni_id: string;
    fee_type_id: number | string;
    amount_paid: number | string;
    paid_date: string;
    received_by: string | null;
    payment_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    received_by_name: string | null;
}
interface AlumniFeeRecordRow extends QueryRow {
    alumni_id: string;
    alumni_name: string | null;
    alumni_email: string | null;
    alumni_student_id: string | null;
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

interface SystemSettingsRow extends QueryRow {
    id: number;
    system_name: string | null;
    system_short_name: string | null;
    institution_name: string | null;
    institution_address: string | null;
    institution_email: string | null;
    institution_contact: string | null;
    website_url: string | null;
    footer_copyright_text?: string | null;
    logo_path: string | null;
    login_logo_path: string | null;
    favicon_path: string | null;
    login_background_path: string | null;
    login_backgrounds_json?: string | null;
    login_slideshow_enabled?: number | boolean | null;
    primary_color: string | null;
    secondary_color: string | null;
    sidebar_color: string | null;
    header_color: string | null;
    button_color: string | null;
    card_color: string | null;
    welcome_message: string | null;
    login_subtitle: string | null;
    about_content: string | null;
    mission: string | null;
    vision: string | null;
    history: string | null;
    facebook_link: string | null;
    twitter_link: string | null;
    instagram_link: string | null;
    theme_mode: string | null;
    updated_at: string | null;
}

interface ConcernRow extends QueryRow {
    id: number;
    alumni_id: string | null;
    alumni_name?: string | null;
    alumni_email?: string | null;
    reporter_name?: string | null;
    reporter_email?: string | null;
    subject: string;
    category: string;
    message: string;
    status: string;
    admin_reply: string | null;
    replied_at: string | null;
    created_at: string;
    updated_at: string;
}

interface AccountPostItem {
    id: string;
    type: "announcement" | "achievement" | "freedom_wall";
    typeLabel: string;
    title: string;
    preview: string;
    status: string | null;
    datePosted: string | null;
    updatedAt: string | null;
    details: Record<string, unknown>;
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
    alumni_id: string | null;
    snapshot_name: string;
    snapshot_email: string | null;
    snapshot_course: string | null;
    snapshot_batch: string | null;
    snapshot_contact_number: string | null;
    snapshot_photo: string | null;
    created_at: string;
    updated_at: string;
}

interface AlumniOfficerRow extends QueryRow {
    id: number | string;
    alumni_id: string | null;
    full_name: string;
    position: string;
    custom_position: string | null;
    batch_year: string | null;
    department_id: string | null;
    program_id: string | null;
    contact_number: string | null;
    email: string | null;
    photo: string | null;
    term_start: string | null;
    term_end: string | null;
    status: string;
    remarks: string | null;
    is_archived: number | boolean | null;
    archived_at: string | null;
    archived_by: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
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
    email: string;
    course: string;
    batch: string;
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

const normalizeRoleValue = (value: unknown) => String(value || "").trim().toLowerCase();

const getRolesForUser = async (userId: string) => {
    const rows = parseRows(await db.query(
        `SELECT role
         FROM user_roles
         WHERE user_id = ? AND COALESCE(archived, 0) = 0
         ORDER BY CASE WHEN role = 'alumni' THEN 99 WHEN role = 'chairman' THEN 20 WHEN role IN ('president', 'admin') THEN 1 ELSE 10 END, role ASC`,
        [userId]
    ));

    const roles = rows
        .map((row) => normalizeRoleValue(row.role))
        .filter(Boolean);

    return roles.length > 0 ? Array.from(new Set(roles)) : ["alumni"];
};

const getRoleForUser = async (userId: string, selectedRole?: string | null) => {
    const roles = await getRolesForUser(userId);
    const requestedRole = normalizeRoleValue(selectedRole);

    if (requestedRole && roles.includes(requestedRole)) {
        return requestedRole;
    }

    return roles[0] || "alumni";
};

const getRequestRole = async (req: AuthenticatedRequest) => {
    if (!req.user?.id) return "alumni";
    return getRoleForUser(req.user.id, req.user.role);
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

const ensureAlumniProfileColumns = async () => {
    const columns = [
        { table: "profiles", name: "bor_number", sql: "ALTER TABLE profiles ADD COLUMN bor_number VARCHAR(100) NULL" },
        { table: "profiles", name: "bor_date", sql: "ALTER TABLE profiles ADD COLUMN bor_date DATE NULL" },
        { table: "profiles", name: "graduation_batch", sql: "ALTER TABLE profiles ADD COLUMN graduation_batch VARCHAR(100) NULL" },
        { table: "profiles", name: "academic_year", sql: "ALTER TABLE profiles ADD COLUMN academic_year VARCHAR(30) NULL" },
        { table: "profiles", name: "graduation_semester", sql: "ALTER TABLE profiles ADD COLUMN graduation_semester VARCHAR(50) NULL" },
        { table: "profiles", name: "advanced_studies_level", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_level VARCHAR(50) NULL" },
        { table: "profiles", name: "advanced_studies_status", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_status VARCHAR(50) NULL" },
        { table: "profiles", name: "advanced_studies_program", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_program VARCHAR(255) NULL" },
        { table: "profiles", name: "advanced_studies_school", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_school VARCHAR(255) NULL" },
        { table: "profiles", name: "advanced_studies_start_year", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_start_year VARCHAR(10) NULL" },
        { table: "profiles", name: "advanced_studies_expected_completion_year", sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_expected_completion_year VARCHAR(10) NULL" },
        { table: "imported_alumni_records", name: "bor_number", sql: "ALTER TABLE imported_alumni_records ADD COLUMN bor_number VARCHAR(100) NULL" },
        { table: "imported_alumni_records", name: "bor_date", sql: "ALTER TABLE imported_alumni_records ADD COLUMN bor_date DATE NULL" },
        { table: "imported_alumni_records", name: "graduation_batch", sql: "ALTER TABLE imported_alumni_records ADD COLUMN graduation_batch VARCHAR(100) NULL" },
        { table: "imported_alumni_records", name: "academic_year", sql: "ALTER TABLE imported_alumni_records ADD COLUMN academic_year VARCHAR(30) NULL" },
        { table: "imported_alumni_records", name: "graduation_semester", sql: "ALTER TABLE imported_alumni_records ADD COLUMN graduation_semester VARCHAR(50) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_level", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_level VARCHAR(50) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_status", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_status VARCHAR(50) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_program", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_program VARCHAR(255) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_school", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_school VARCHAR(255) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_start_year", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_start_year VARCHAR(10) NULL" },
        { table: "imported_alumni_records", name: "advanced_studies_expected_completion_year", sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_expected_completion_year VARCHAR(10) NULL" },
        { table: "imported_alumni_records", name: "email_status", sql: "ALTER TABLE imported_alumni_records ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending'" },
        { table: "imported_alumni_records", name: "email_error", sql: "ALTER TABLE imported_alumni_records ADD COLUMN email_error TEXT NULL" }
    ];

    for (const column of columns) {
        if (!(await tableExists(column.table)) || await columnExists(column.table, column.name)) {
            continue;
        }

        await db.execute(column.sql);
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

const ALUMNI_OFFICER_POSITIONS = new Set([
    "President",
    "Vice President",
    "Secretary",
    "Treasurer",
    "Auditor",
    "Public Information Officer",
    "Business Manager",
    "Representative",
    "Adviser",
    "Custom Position"
]);

const OFFICER_STATUS_VALUES = new Set(["Active", "Inactive", "Completed"]);

const normalizeManagedOfficerPosition = (value: unknown) => {
    const normalized = normalizeText(value).toLowerCase();
    const byValue: Record<string, string> = {
        president: "President",
        "vice president": "Vice President",
        secretary: "Secretary",
        treasurer: "Treasurer",
        auditor: "Auditor",
        "public information officer": "Public Information Officer",
        pio: "Public Information Officer",
        pro: "Public Information Officer",
        "business manager": "Business Manager",
        representative: "Representative",
        adviser: "Adviser",
        advisor: "Adviser",
        "custom position": "Custom Position"
    };

    return byValue[normalized] || "";
};

const normalizeManagedOfficerStatus = (value: unknown) => {
    const normalized = normalizeText(value).toLowerCase();
    const byValue: Record<string, string> = {
        active: "Active",
        inactive: "Inactive",
        completed: "Completed"
    };

    return byValue[normalized] || "";
};

const normalizeOfficerDate = (value: unknown) => {
    const normalized = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const getManagedOfficerDisplayPosition = (position: string | null | undefined, customPosition?: string | null) => {
    if (customPosition) return customPosition;
    const managedPosition = normalizeManagedOfficerPosition(position);
    return managedPosition || formatOfficerPosition(position);
};

const getManagedOfficerChartRole = (position: string | null | undefined) => {
    const managedPosition = normalizeManagedOfficerPosition(position);
    const roleMap: Record<string, string> = {
        President: "president",
        "Vice President": "vice_president",
        Secretary: "secretary",
        Treasurer: "treasurer",
        Auditor: "auditor",
        "Public Information Officer": "pio",
        "Business Manager": "board_member",
        Representative: "board_member",
        Adviser: "board_member",
        "Custom Position": "board_member"
    };

    return roleMap[managedPosition] || normalizeOfficerPositionKey(position);
};

const mapAlumniOfficer = (row: AlumniOfficerRow) => ({
    id: Number(row.id),
    alumniId: row.alumni_id,
    fullName: row.full_name,
    position: row.position,
    positionLabel: getManagedOfficerDisplayPosition(row.position, row.custom_position),
    customPosition: row.custom_position,
    batchYear: row.batch_year,
    departmentId: row.department_id,
    programId: row.program_id,
    contactNumber: row.contact_number,
    email: row.email,
    photo: normalizeStoredMedia(row.photo),
    termStart: row.term_start,
    termEnd: row.term_end,
    status: row.status,
    remarks: row.remarks,
    isArchived: Boolean(row.is_archived),
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const getAlumniOfficerById = async (id: number) => {
    return await getSingleRow<AlumniOfficerRow>("SELECT * FROM alumni_officers WHERE id = ?", [id]);
};

const getActiveManagedOfficerRoster = async () => {
    return parseRows<AlumniOfficerRow>(await db.query<AlumniOfficerRow>(
        `SELECT *
         FROM alumni_officers
         WHERE is_archived = 0 AND status = 'Active'
         ORDER BY
            CASE position
                WHEN 'President' THEN 10
                WHEN 'Vice President' THEN 20
                WHEN 'Secretary' THEN 30
                WHEN 'Treasurer' THEN 50
                WHEN 'Auditor' THEN 70
                WHEN 'Public Information Officer' THEN 80
                ELSE 90
            END,
            full_name ASC`
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

const computeDurationFields = (row: Record<string, unknown>, options?: { ignoreDuration?: boolean }) => {
    const now = new Date();
    const { start, end, archivedAt } = getDurationDatesFromRow(row);
    let computedStatus: DurationComputedStatus = "Active";

    const storedStatus = normalizeStatus(String(row.status || ""), "").toLowerCase();
    if (storedStatus === "ended" || storedStatus === "closed" || storedStatus === "completed") {
        computedStatus = "Completed";
    }

    if (archivedAt || storedStatus === "archived") {
        computedStatus = "Archived";
    } else if (options?.ignoreDuration) {
        computedStatus = computedStatus === "Completed" ? "Completed" : "Active";
    } else if (computedStatus !== "Completed" && start && now.getTime() < start.getTime()) {
        computedStatus = "Upcoming";
    } else if (end && now.getTime() > end.getTime()) {
        const archiveAt = new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000);
        computedStatus = now.getTime() >= archiveAt.getTime() ? "Archived" : "Completed";
    } else if (computedStatus !== "Completed" && (start || end)) {
        computedStatus = "Active";
    }

    const isExpired = computedStatus === "Archived" || computedStatus === "Completed";
    const remainingTime = options?.ignoreDuration
        ? ""
        : computedStatus === "Upcoming"
        ? `Starts ${formatDisplayManilaDateTime(start)}`
        : computedStatus === "Archived"
            ? `Archived after ${formatDisplayManilaDateTime(end)}`
            : computedStatus === "Completed"
                ? `Completed ${formatDisplayManilaDateTime(end)}`
            : buildRemainingTime(end, now);

    return {
        start_datetime: options?.ignoreDuration ? null : start ? formatSqlDateTime(start) : null,
        start_date: options?.ignoreDuration ? null : start ? formatManilaDate(start) : null,
        start_time: options?.ignoreDuration ? null : start ? formatManilaTime(start).slice(0, 5) : null,
        end_datetime: options?.ignoreDuration ? null : end ? formatSqlDateTime(end) : null,
        end_date: options?.ignoreDuration ? null : end ? formatManilaDate(end) : null,
        end_time: options?.ignoreDuration ? null : end ? formatManilaTime(end).slice(0, 5) : null,
        auto_archive_at: options?.ignoreDuration ? null : row.auto_archive_at || (end ? formatSqlDateTime(end) : null),
        archived_at: archivedAt ? formatSqlDateTime(archivedAt) : null,
        duration_status: computedStatus,
        computed_status: computedStatus,
        remaining_time: remainingTime,
        is_expired: isExpired
    };
};

const withDurationFields = <T extends Record<string, unknown>>(row: T, options?: { ignoreDuration?: boolean }) => ({
    ...row,
    ...computeDurationFields(row, options)
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
               AND LOWER(COALESCE(status, '')) <> 'archived'
               AND LOWER(COALESCE(type, 'announcement')) <> 'announcement'`,
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

const SESSION_ACTIVE_STATUS = "Active";
const SESSION_ENDED_STATUS = "Ended";

const ROLE_LABELS: Record<string, string> = {
    admin: "Administrator",
    president: "Administrator",
    vice_president: "Staff",
    secretary: "Staff",
    assistant_secretary: "Staff",
    treasurer: "Staff",
    assistant_treasurer: "Staff",
    auditor: "Staff",
    pio: "Staff",
    appointed: "Staff",
    chairman: "Chairman",
    alumni: "Alumni"
};

const getRoleDisplayLabel = (role: unknown) => {
    const normalized = normalizeRoleValue(role);
    if (normalized === "president" || normalized === "admin") return "Administrator";
    if (normalized === "chairman") return "Chairman";
    if (normalized === "alumni") return "Alumni";
    if (ROLE_LABELS[normalized]) return ROLE_LABELS[normalized];
    return normalized
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ") || "User";
};

const ensureUserSessionTables = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            role_id VARCHAR(50) NOT NULL,
            session_token VARCHAR(128) NOT NULL UNIQUE,
            ip_address VARCHAR(100) NULL,
            browser VARCHAR(120) NULL,
            operating_system VARCHAR(120) NULL,
            device_type VARCHAR(60) NULL,
            login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            logout_time DATETIME NULL,
            last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            INDEX idx_user_sessions_user (user_id),
            INDEX idx_user_sessions_role (role_id),
            INDEX idx_user_sessions_status (status),
            INDEX idx_user_sessions_login_time (login_time),
            INDEX idx_user_sessions_last_activity (last_activity),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NULL,
            session_token VARCHAR(128) NULL,
            action VARCHAR(80) NOT NULL,
            description TEXT NOT NULL,
            role_used VARCHAR(50) NULL,
            device_used VARCHAR(120) NULL,
            browser_used VARCHAR(120) NULL,
            ip_address VARCHAR(100) NULL,
            metadata_json LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_activity_logs_user (user_id),
            INDEX idx_activity_logs_action (action),
            INDEX idx_activity_logs_role (role_used),
            INDEX idx_activity_logs_created_at (created_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);
};

const ensureUserRolesSupportMultipleRoles = async () => {
    if (await columnExists("user_roles", "id")) return;

    await db.execute(`
        ALTER TABLE user_roles
        DROP PRIMARY KEY,
        ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
        ADD UNIQUE KEY uq_user_roles_user_role (user_id, role),
        ADD INDEX idx_user_roles_user (user_id)
    `);
};

const endExpiredSessions = async () => {
    await db.execute(`
        UPDATE user_sessions
        SET status = 'Ended',
            logout_time = COALESCE(logout_time, DATE_ADD(login_time, INTERVAL 7 DAY)),
            last_activity = GREATEST(last_activity, DATE_ADD(login_time, INTERVAL 7 DAY))
        WHERE status = 'Active'
          AND login_time <= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
};

const getRequestIpAddress = (req: express.Request) => {
    const forwardedFor = req.headers["x-forwarded-for"];
    const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return String(firstForwarded || req.socket.remoteAddress || req.ip || "").split(",")[0].trim() || "Unknown";
};

const parseDeviceInfo = (userAgentValue: unknown) => {
    const userAgent = String(userAgentValue || "");
    const lower = userAgent.toLowerCase();

    const browser = lower.includes("edg/") ? "Microsoft Edge"
        : lower.includes("opr/") || lower.includes("opera") ? "Opera"
        : lower.includes("firefox/") ? "Firefox"
        : lower.includes("crios/") ? "Mobile Chrome"
        : lower.includes("chrome/") && (lower.includes("mobile") || lower.includes("android")) ? "Mobile Chrome"
        : lower.includes("chrome/") ? "Chrome"
        : lower.includes("safari/") ? "Safari"
        : "Unknown Browser";

    const operatingSystem = lower.includes("windows nt") ? "Windows"
        : lower.includes("android") ? "Android"
        : lower.includes("iphone") || lower.includes("ipad") ? "iOS"
        : lower.includes("mac os x") ? "macOS"
        : lower.includes("linux") ? "Linux"
        : "Unknown OS";

    const deviceType = lower.includes("mobile") || lower.includes("iphone") || lower.includes("android") ? "Mobile"
        : lower.includes("tablet") || lower.includes("ipad") ? "Tablet"
        : "Desktop";

    return { browser, operatingSystem, deviceType };
};

const recordActivityLog = async ({
    userId,
    sessionToken,
    action,
    description,
    roleUsed,
    deviceUsed,
    browserUsed,
    ipAddress,
    metadata
}: {
    userId?: string | null;
    sessionToken?: string | null;
    action: string;
    description: string;
    roleUsed?: string | null;
    deviceUsed?: string | null;
    browserUsed?: string | null;
    ipAddress?: string | null;
    metadata?: Record<string, unknown> | null;
}) => {
    try {
        await ensureUserSessionTables();
        await db.execute(
            `INSERT INTO activity_logs
                (user_id, session_token, action, description, role_used, device_used, browser_used, ip_address, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId || null,
                sessionToken || null,
                action,
                description,
                roleUsed || null,
                deviceUsed || null,
                browserUsed || null,
                ipAddress || null,
                metadata ? JSON.stringify(metadata) : null,
                formatSqlDateTime(new Date())
            ]
        );
    } catch (error) {
        console.error("ACTIVITY LOG ERROR:", error);
    }
};

const createAuthenticatedSession = async ({
    user,
    role,
    req
}: {
    user: { id: string; email: string };
    role: string;
    req: express.Request;
}) => {
    await ensureUserSessionTables();

    const selectedRole = await getRoleForUser(user.id, role);
    const sessionToken = uuidv4();
    const ipAddress = getRequestIpAddress(req);
    const deviceInfo = parseDeviceInfo(req.headers["user-agent"]);
    const now = formatSqlDateTime(new Date());

    await db.execute(
        `INSERT INTO user_sessions
            (user_id, role_id, session_token, ip_address, browser, operating_system, device_type, login_time, last_activity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            user.id,
            selectedRole,
            sessionToken,
            ipAddress,
            deviceInfo.browser,
            deviceInfo.operatingSystem,
            deviceInfo.deviceType,
            now,
            now,
            SESSION_ACTIVE_STATUS
        ]
    );

    const authPayload = await buildAuthPayload({ id: user.id, email: user.email }, selectedRole);
    const fullName = String(authPayload.profile?.name || authPayload.user.email || "User");
    const roleLabel = getRoleDisplayLabel(selectedRole);
    const token = jwt.sign(
        { id: user.id, email: authPayload.user.email, role: selectedRole, sessionId: sessionToken },
        JWT_SECRET,
        { expiresIn: "7d" }
    );

    await recordActivityLog({
        userId: user.id,
        sessionToken,
        action: "User Login",
        description: `${fullName} logged in as ${roleLabel} using ${deviceInfo.browser} on ${deviceInfo.operatingSystem}.`,
        roleUsed: selectedRole,
        deviceUsed: deviceInfo.deviceType,
        browserUsed: deviceInfo.browser,
        ipAddress,
        metadata: { operatingSystem: deviceInfo.operatingSystem }
    });

    if (selectedRole === "alumni") {
        await recordAlumniLoginActivity(String(user.id));
    }

    return {
        token,
        sessionToken,
        ...authPayload
    };
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

const DEFAULT_SYSTEM_SETTINGS = {
    system_name: "Alumni Management Portal",
    system_short_name: "Alumni Portal",
    institution_name: "Your Institution",
    institution_address: "",
    institution_email: "",
    institution_contact: "",
    website_url: "",
    footer_copyright_text: "Generated by Alumni Management System",
    logo_path: "",
    login_logo_path: "",
    favicon_path: "",
    login_background_path: "",
    login_backgrounds_json: "[]",
    login_slideshow_enabled: 0,
    programs_json: JSON.stringify(normalizeCourseOptions(COURSE_OPTIONS)),
    primary_color: "#550000",
    secondary_color: "#3f3f46",
    sidebar_color: "#383838",
    header_color: "#550000",
    button_color: "#550000",
    card_color: "#f7f7f7",
    welcome_message: "Welcome to the Alumni Management Portal",
    login_subtitle: "Sign in using your alumni ID or official email.",
    about_content: "A centralized portal for alumni records, engagement, tracer studies, announcements, achievements, donations, and community updates.",
    mission: "Provide a reliable alumni platform that supports communication, graduate tracking, engagement, and institutional decision-making.",
    vision: "A connected alumni community that helps the institution improve programs, services, and graduate outcomes.",
    history: "",
    facebook_link: "",
    twitter_link: "",
    instagram_link: "",
    theme_mode: "light"
};

const SYSTEM_SETTING_COLUMNS = [
    "system_name",
    "system_short_name",
    "institution_name",
    "institution_address",
    "institution_email",
    "institution_contact",
    "website_url",
    "footer_copyright_text",
    "logo_path",
    "login_logo_path",
    "favicon_path",
    "login_background_path",
    "login_backgrounds_json",
    "login_slideshow_enabled",
    "programs_json",
    "primary_color",
    "secondary_color",
    "sidebar_color",
    "header_color",
    "button_color",
    "card_color",
    "welcome_message",
    "login_subtitle",
    "about_content",
    "mission",
    "vision",
    "history",
    "facebook_link",
    "twitter_link",
    "instagram_link",
    "theme_mode"
] as const;

type SystemSettingColumn = typeof SYSTEM_SETTING_COLUMNS[number];

const SYSTEM_TEXTAREA_FIELDS = new Set<SystemSettingColumn>([
    "institution_address",
    "footer_copyright_text",
    "login_subtitle",
    "about_content",
    "mission",
    "vision",
    "history"
]);

const COLOR_FIELDS = new Set<SystemSettingColumn>([
    "primary_color",
    "secondary_color",
    "sidebar_color",
    "header_color",
    "button_color",
    "card_color"
]);

const normalizeHexColor = (value: unknown, fallback: string) => {
    const normalized = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
};

const normalizeThemeMode = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();
    return ["light", "dark", "auto", "custom"].includes(normalized) ? normalized : "light";
};

const safeParseJsonArray = (value: unknown) => {
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
    try {
        const parsed = JSON.parse(String(value || "[]"));
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
        return [];
    }
};

const safeParseProgramOptions = (value: unknown): CourseOption[] => {
    try {
        const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
        return normalizeCourseOptions(parsed);
    } catch {
        return normalizeCourseOptions(COURSE_OPTIONS);
    }
};
const mapSystemSettingsRow = (row: Partial<SystemSettingsRow> | null | undefined) => {
    const source: Partial<SystemSettingsRow> = row || {};
    const loginBackgrounds = safeParseJsonArray(source.login_backgrounds_json);
    const programs = safeParseProgramOptions(source.programs_json);

    return {
        id: Number(source.id || 1),
        systemName: String(source.system_name || DEFAULT_SYSTEM_SETTINGS.system_name),
        systemShortName: String(source.system_short_name || DEFAULT_SYSTEM_SETTINGS.system_short_name),
        institutionName: String(source.institution_name || DEFAULT_SYSTEM_SETTINGS.institution_name),
        institutionAddress: String(source.institution_address || DEFAULT_SYSTEM_SETTINGS.institution_address),
        institutionEmail: String(source.institution_email || DEFAULT_SYSTEM_SETTINGS.institution_email),
        institutionContact: String(source.institution_contact || DEFAULT_SYSTEM_SETTINGS.institution_contact),
        websiteUrl: String(source.website_url || DEFAULT_SYSTEM_SETTINGS.website_url),
        footerCopyrightText: String(source.footer_copyright_text || DEFAULT_SYSTEM_SETTINGS.footer_copyright_text),
        logoPath: normalizeStoredMedia(source.logo_path || "") || "",
        loginLogoPath: normalizeStoredMedia(source.login_logo_path || "") || "",
        faviconPath: normalizeStoredMedia(source.favicon_path || "") || "",
        loginBackgroundPath: normalizeStoredMedia(source.login_background_path || "") || "",
        loginBackgrounds: loginBackgrounds.map((item) => normalizeStoredMedia(item) || item),
        loginSlideshowEnabled: normalizeBoolean(source.login_slideshow_enabled),
        programs,
        primaryColor: String(source.primary_color || DEFAULT_SYSTEM_SETTINGS.primary_color),
        secondaryColor: String(source.secondary_color || DEFAULT_SYSTEM_SETTINGS.secondary_color),
        sidebarColor: String(source.sidebar_color || DEFAULT_SYSTEM_SETTINGS.sidebar_color),
        headerColor: String(source.header_color || DEFAULT_SYSTEM_SETTINGS.header_color),
        buttonColor: String(source.button_color || DEFAULT_SYSTEM_SETTINGS.button_color),
        cardColor: String(source.card_color || DEFAULT_SYSTEM_SETTINGS.card_color),
        welcomeMessage: String(source.welcome_message || DEFAULT_SYSTEM_SETTINGS.welcome_message),
        loginSubtitle: String(source.login_subtitle || DEFAULT_SYSTEM_SETTINGS.login_subtitle),
        aboutContent: String(source.about_content || DEFAULT_SYSTEM_SETTINGS.about_content),
        mission: String(source.mission || DEFAULT_SYSTEM_SETTINGS.mission),
        vision: String(source.vision || DEFAULT_SYSTEM_SETTINGS.vision),
        history: String(source.history || DEFAULT_SYSTEM_SETTINGS.history),
        facebookLink: String(source.facebook_link || DEFAULT_SYSTEM_SETTINGS.facebook_link),
        twitterLink: String(source.twitter_link || DEFAULT_SYSTEM_SETTINGS.twitter_link),
        instagramLink: String(source.instagram_link || DEFAULT_SYSTEM_SETTINGS.instagram_link),
        themeMode: normalizeThemeMode(source.theme_mode),
        updatedAt: source.updated_at ? String(source.updated_at) : null
    };
};

const normalizeSystemSettingsInput = (body: Record<string, unknown>) => {
    const mapped: Record<SystemSettingColumn, string | number> = { ...DEFAULT_SYSTEM_SETTINGS };
    const aliases: Record<SystemSettingColumn, string> = {
        system_name: "systemName",
        system_short_name: "systemShortName",
        institution_name: "institutionName",
        institution_address: "institutionAddress",
        institution_email: "institutionEmail",
        institution_contact: "institutionContact",
        website_url: "websiteUrl",
        footer_copyright_text: "footerCopyrightText",
        logo_path: "logoPath",
        login_logo_path: "loginLogoPath",
        favicon_path: "faviconPath",
        login_background_path: "loginBackgroundPath",
        login_backgrounds_json: "loginBackgrounds",
        login_slideshow_enabled: "loginSlideshowEnabled",
        programs_json: "programs",
        primary_color: "primaryColor",
        secondary_color: "secondaryColor",
        sidebar_color: "sidebarColor",
        header_color: "headerColor",
        button_color: "buttonColor",
        card_color: "cardColor",
        welcome_message: "welcomeMessage",
        login_subtitle: "loginSubtitle",
        about_content: "aboutContent",
        mission: "mission",
        vision: "vision",
        history: "history",
        facebook_link: "facebookLink",
        twitter_link: "twitterLink",
        instagram_link: "instagramLink",
        theme_mode: "themeMode"
    };

    for (const column of SYSTEM_SETTING_COLUMNS) {
        const inputKey = aliases[column];
        const rawValue = body[inputKey] ?? body[column];

        if (column === "login_backgrounds_json") {
            mapped[column] = JSON.stringify(safeParseJsonArray(rawValue));
        } else if (column === "programs_json") {
            mapped[column] = JSON.stringify(normalizeCourseOptions(rawValue));
        } else if (column === "login_slideshow_enabled") {
            mapped[column] = normalizeBoolean(rawValue) ? 1 : 0;
        } else if (column === "theme_mode") {
            mapped[column] = normalizeThemeMode(rawValue);
        } else if (COLOR_FIELDS.has(column)) {
            mapped[column] = normalizeHexColor(rawValue, String(DEFAULT_SYSTEM_SETTINGS[column]));
        } else if (column.endsWith("_path")) {
            mapped[column] = normalizeStoredMedia(typeof rawValue === "string" ? rawValue : "") || "";
        } else if (SYSTEM_TEXTAREA_FIELDS.has(column)) {
            mapped[column] = String(rawValue || "").trim();
        } else {
            mapped[column] = normalizeText(rawValue);
        }
    }

    return mapped;
};

const ensureSystemSettingsTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS system_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            system_name VARCHAR(255),
            system_short_name VARCHAR(100),
            institution_name VARCHAR(255),
            institution_address TEXT,
            institution_email VARCHAR(255),
            institution_contact VARCHAR(100),
            website_url TEXT,
            footer_copyright_text TEXT,
            logo_path LONGTEXT,
            login_logo_path LONGTEXT,
            favicon_path LONGTEXT,
            login_background_path LONGTEXT,
            login_backgrounds_json LONGTEXT,
            login_slideshow_enabled TINYINT(1) NOT NULL DEFAULT 0,
            programs_json LONGTEXT,
            primary_color VARCHAR(20),
            secondary_color VARCHAR(20),
            sidebar_color VARCHAR(20),
            header_color VARCHAR(20),
            button_color VARCHAR(20),
            card_color VARCHAR(20),
            welcome_message VARCHAR(255),
            login_subtitle TEXT,
            about_content TEXT,
            mission TEXT,
            vision TEXT,
            history TEXT,
            facebook_link TEXT,
            twitter_link TEXT,
            instagram_link TEXT,
            theme_mode ENUM('light', 'dark', 'auto', 'custom') DEFAULT 'light',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    const columnsToAdd = [
        { name: "footer_copyright_text", sql: "ALTER TABLE system_settings ADD COLUMN footer_copyright_text TEXT AFTER website_url" },
        { name: "login_backgrounds_json", sql: "ALTER TABLE system_settings ADD COLUMN login_backgrounds_json LONGTEXT AFTER login_background_path" },
        { name: "login_slideshow_enabled", sql: "ALTER TABLE system_settings ADD COLUMN login_slideshow_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER login_backgrounds_json" },
        { name: "programs_json", sql: "ALTER TABLE system_settings ADD COLUMN programs_json LONGTEXT AFTER login_slideshow_enabled" }
    ];

    for (const column of columnsToAdd) {
        try {
            if (!(await columnExists("system_settings", column.name))) {
                await db.execute(column.sql);
            }
        } catch (error) {
            console.error(`SYSTEM SETTINGS COLUMN MIGRATION ERROR: ${column.name}`, error);
        }
    }

    const existing = await getSingleRow<SystemSettingsRow>("SELECT id FROM system_settings LIMIT 1");
    if (!existing) {
        const columns = SYSTEM_SETTING_COLUMNS.join(", ");
        const placeholders = SYSTEM_SETTING_COLUMNS.map(() => "?").join(", ");
        await db.execute(
            `INSERT INTO system_settings (${columns}) VALUES (${placeholders})`,
            SYSTEM_SETTING_COLUMNS.map((column) => DEFAULT_SYSTEM_SETTINGS[column])
        );
    }
};

const ensureAlumniFeeRecordsTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS alumni_fee_types (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            fee_name VARCHAR(150) NOT NULL,
            amount DECIMAL(12, 2) NOT NULL,
            description TEXT NULL,
            applicable_batch_year VARCHAR(20) NULL,
            applicable_program_id VARCHAR(255) NULL,
            due_date DATE NULL,
            assigned_officer_id VARCHAR(36) NULL,
            is_required TINYINT(1) NOT NULL DEFAULT 1,
            status VARCHAR(30) NOT NULL DEFAULT 'Active',
            created_by VARCHAR(36) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_alumni_fee_types_status (status, is_required),
            INDEX idx_alumni_fee_types_scope (applicable_batch_year, applicable_program_id),
            INDEX idx_alumni_fee_types_officer (assigned_officer_id),
            FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS alumni_fee_payments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            alumni_id VARCHAR(36) NOT NULL,
            fee_type_id BIGINT NOT NULL,
            amount_paid DECIMAL(12, 2) NOT NULL,
            paid_date DATE NOT NULL,
            received_by VARCHAR(36) NULL,
            payment_note TEXT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Paid',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_alumni_fee_payment (alumni_id, fee_type_id),
            INDEX idx_alumni_fee_payments_alumni (alumni_id),
            INDEX idx_alumni_fee_payments_fee (fee_type_id),
            INDEX idx_alumni_fee_payments_status (status),
            FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (fee_type_id) REFERENCES alumni_fee_types(id) ON DELETE CASCADE,
            FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);
};const ensureAlumniProjectTables = async () => {
    await db.execute(`CREATE TABLE IF NOT EXISTS alumni_projects (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT NULL, category VARCHAR(100) NOT NULL, batch_year VARCHAR(20) NULL,
        lead_officer_id VARCHAR(36) NULL, lead_alumni_id VARCHAR(36) NULL, organization_name VARCHAR(255) NULL, alumni_group VARCHAR(255) NULL,
        start_date DATE NULL, end_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'Planned', estimated_value DECIMAL(14,2) NULL,
        funding_source VARCHAR(255) NULL, beneficiaries TEXT NULL, related_contribution_id VARCHAR(100) NULL, accomplishments TEXT NULL, remarks TEXT NULL,
        contribution_record_id VARCHAR(100) NULL, created_by VARCHAR(36) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_alumni_projects_status (status), INDEX idx_alumni_projects_category (category), INDEX idx_alumni_projects_batch (batch_year), INDEX idx_alumni_projects_dates (start_date),
        FOREIGN KEY (lead_officer_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY (lead_alumni_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS alumni_project_files (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL, file_name VARCHAR(255) NOT NULL, file_path LONGTEXT NULL, file_type VARCHAR(120) NULL,
        file_url LONGTEXT NULL, file_category VARCHAR(100) NOT NULL DEFAULT 'Photo', uploaded_by VARCHAR(36) NULL, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alumni_project_files_project (project_id), FOREIGN KEY (project_id) REFERENCES alumni_projects(id) ON DELETE CASCADE, FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    )`);

    const projectColumns = [
        { name: "lead_alumni_id", sql: "ALTER TABLE alumni_projects ADD COLUMN lead_alumni_id VARCHAR(36) NULL AFTER lead_officer_id" },
        { name: "organization_name", sql: "ALTER TABLE alumni_projects ADD COLUMN organization_name VARCHAR(255) NULL AFTER lead_alumni_id" },
        { name: "alumni_group", sql: "ALTER TABLE alumni_projects ADD COLUMN alumni_group VARCHAR(255) NULL AFTER organization_name" },
        { name: "related_contribution_id", sql: "ALTER TABLE alumni_projects ADD COLUMN related_contribution_id VARCHAR(100) NULL AFTER beneficiaries" },
        { name: "contribution_record_id", sql: "ALTER TABLE alumni_projects ADD COLUMN contribution_record_id VARCHAR(100) NULL AFTER related_contribution_id" }
    ];
    for (const column of projectColumns) {
        if (!(await columnExists("alumni_projects", column.name))) await db.execute(column.sql);
    }
    const fileColumns = [
        { name: "file_path", sql: "ALTER TABLE alumni_project_files ADD COLUMN file_path LONGTEXT NULL AFTER file_name" },
        { name: "uploaded_at", sql: "ALTER TABLE alumni_project_files ADD COLUMN uploaded_at TIMESTAMP NULL DEFAULT NULL AFTER uploaded_by" },
        { name: "file_url", sql: "ALTER TABLE alumni_project_files ADD COLUMN file_url LONGTEXT NULL AFTER file_type" },
        { name: "file_category", sql: "ALTER TABLE alumni_project_files ADD COLUMN file_category VARCHAR(100) NOT NULL DEFAULT 'Project File' AFTER file_url" }
    ];
    for (const column of fileColumns) {
        if (!(await columnExists("alumni_project_files", column.name))) await db.execute(column.sql);
    }
    await db.execute("UPDATE alumni_projects SET organization_name = COALESCE(NULLIF(organization_name, ''), alumni_group), related_contribution_id = COALESCE(NULLIF(related_contribution_id, ''), contribution_record_id) WHERE organization_name IS NULL OR related_contribution_id IS NULL");
    await db.execute("UPDATE alumni_project_files SET file_path = COALESCE(NULLIF(file_path, ''), file_url), uploaded_at = COALESCE(uploaded_at, created_at) WHERE file_path IS NULL OR uploaded_at IS NULL");
};
const getSystemSettings = async () => {
    await ensureSystemSettingsTable();
    const row = await getSingleRow<SystemSettingsRow>("SELECT * FROM system_settings ORDER BY id ASC LIMIT 1");
    return mapSystemSettingsRow(row);
};

const brandingUploadDir = () => path.join(process.cwd(), "../public/uploads/branding");

const saveBrandingUpload = async (fileName: string, dataUrl: string) => {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Upload must be an image file.");
    }

    const mimeType = match[1].toLowerCase();
    const extensionMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "image/x-icon": "ico",
        "image/vnd.microsoft.icon": "ico"
    };
    const extension = extensionMap[mimeType];
    if (!extension) {
        throw new Error("Only PNG, JPG, GIF, WebP, SVG, and ICO images are allowed.");
    }

    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("Image uploads must be 5MB or smaller.");
    }

    const safeBaseName = normalizeText(fileName)
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "branding";
    const storedName = `${Date.now()}-${safeBaseName}-${uuidv4().slice(0, 8)}.${extension}`;
    const uploadDir = brandingUploadDir();
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), buffer);
    return `/uploads/branding/${storedName}`;
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

const normalizeAdvancedStudiesLevel = (value: unknown) => {
    const text = normalizeText(value);
    const key = text.toLowerCase().replace(/[^a-z]/g, "");

    if (!text) return null;
    if (["master", "masters", "masterdegree", "mastersdegree"].includes(key)) return "Master's Degree";
    if (["doctoral", "doctorate", "doctoraldegree", "doctoratedegree", "phd"].includes(key)) return "Doctoral Degree";
    return null;
};

const normalizeAdvancedStudiesStatus = (value: unknown) => {
    const text = normalizeText(value);
    const key = text.toLowerCase().replace(/[^a-z]/g, "");

    if (!text) return null;
    if (["currentlyenrolled", "enrolled", "ongoing"].includes(key)) return "Currently enrolled";
    if (["completed", "finished", "graduated"].includes(key)) return "Completed";
    if (["onleave", "leave"].includes(key)) return "On leave";
    if (["discontinued", "stopped"].includes(key)) return "Discontinued";
    return null;
};

const normalizeOptionalYear = (value: unknown) => {
    const year = normalizeBatch(value);
    return /^\d{4}$/.test(year) ? year : null;
};

const normalizeSupportedCourse = (value: unknown, programs: CourseOption[] = COURSE_OPTIONS) => normalizeCourseCode(normalizeText(value), programs);

const CONCERN_CATEGORIES = new Set([
    "Account",
    "Login Issue",
    "Event",
    "Donation",
    "Document Request",
    "Technical Issue",
    "General Concern"
]);

const CONCERN_STATUSES = new Set(["Pending", "Read", "Replied", "Resolved"]);

const normalizeConcernCategory = (value: unknown) => {
    const category = normalizeText(value);
    return CONCERN_CATEGORIES.has(category) ? category : "";
};

const normalizeConcernStatus = (value: unknown) => {
    const status = normalizeText(value);
    return CONCERN_STATUSES.has(status) ? status : "";
};

const normalizeConcernDetails = (value: unknown) => String(value || "").trim();

const validateSupportedCourse = (value: unknown, programOptions: CourseOption[] = COURSE_OPTIONS) => {
    const normalizedCourse = normalizeSupportedCourse(value, programOptions);

    if (!normalizedCourse) {
        return {
            ok: false,
            course: null,
            message: `Course must be one of: ${programOptions.map((program) => program.code).join(", ")}.`,
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

const validateImportRow = (row: AlumniImportInputRow, rowNumber: number, programOptions: CourseOption[] = COURSE_OPTIONS) => {
    const fullName = normalizeText(row.fullName || row.name);
    const graduationYear = normalizeBatch(row.graduationYear || row.year);
    const emailAddress = normalizeEmail(row.emailAddress || row.email);
    const courseValidation = validateSupportedCourse(row.program || row.course, programOptions);
    const contactNumber = normalizePhone(row.contactNumber);
    const borNumber = normalizeText(row.borNumber) || null;
    const advancedStudiesLevel = normalizeAdvancedStudiesLevel(row.advancedStudiesLevel);
    const advancedStudiesStatus = normalizeAdvancedStudiesStatus(row.advancedStudiesStatus);
    const advancedStudiesProgram = normalizeText(row.advancedStudiesProgram) || null;
    const advancedStudiesSchool = normalizeText(row.advancedStudiesSchool) || null;
    const advancedStudiesStartYear = normalizeOptionalYear(row.advancedStudiesStartYear);
    const advancedStudiesExpectedCompletionYear = normalizeOptionalYear(row.advancedStudiesExpectedCompletionYear);
    const hasAdvancedStudiesDetails = Boolean(
        advancedStudiesStatus ||
        advancedStudiesProgram ||
        advancedStudiesSchool ||
        advancedStudiesStartYear ||
        advancedStudiesExpectedCompletionYear
    );

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

    if (hasAdvancedStudiesDetails && !advancedStudiesLevel) {
        return { ok: false as const, failure: { rowNumber, fullName, emailAddress, reason: "Advanced studies level is required when advanced studies details are provided", category: "invalid" as const } };
    }
    return {
        ok: true as const,
        prepared: {
            rowNumber,
            name: fullName,
            batch: graduationYear,
            email: emailAddress,
            course: courseValidation.course,
            contactNumber,
            borNumber,
            advancedStudiesLevel,
            advancedStudiesStatus,
            advancedStudiesProgram,
            advancedStudiesSchool,
            advancedStudiesStartYear,
            advancedStudiesExpectedCompletionYear
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
    schoolyear: "graduationYear",
    yeargraduated: "graduationYear",
    program: "program",
    course: "course",
    degreeprogram: "program",
    contact: "contactNumber",
    contactnumber: "contactNumber",
    mobilenumber: "contactNumber",
    phone: "contactNumber",
    phonenumber: "contactNumber",
    bornumber: "borNumber",
    borno: "borNumber",
    boardresolutionnumber: "borNumber",
    boardresolution: "borNumber",
    advancedstudies: "advancedStudiesLevel",
    advancedstudieslevel: "advancedStudiesLevel",
    furtherstudies: "advancedStudiesLevel",
    degreelevel: "advancedStudiesLevel",
    mastersdoctoral: "advancedStudiesLevel",
    advancedstudiesstatus: "advancedStudiesStatus",
    studystatus: "advancedStudiesStatus",
    advancedstudiesprogram: "advancedStudiesProgram",
    graduateprogram: "advancedStudiesProgram",
    advancedstudiesschool: "advancedStudiesSchool",
    graduateuniversity: "advancedStudiesSchool",
    advancedstudiesstartyear: "advancedStudiesStartYear",
    startyear: "advancedStudiesStartYear",
    advancedstudiesexpectedcompletionyear: "advancedStudiesExpectedCompletionYear",
    expectedcompletionyear: "advancedStudiesExpectedCompletionYear",
    completionyear: "advancedStudiesExpectedCompletionYear",
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
        throw new Error("Import file must include headers: name, email, and program.");
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

    if (normalizedName.endsWith(".xlsx") || normalizedType.includes("spreadsheetml")) {
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        worksheet = workbook.worksheets[0];
    } else if (normalizedName.endsWith(".xls")) {
        throw new Error("Legacy .xls files are not supported. Save the file as .xlsx before importing.");
    } else {
        throw new Error("Only .xlsx alumni import files are supported.");
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
const EMAIL_QUEUE_PURPOSE: TargetedEmailPurpose = "graduate_tracer_reminder";
const EMAIL_QUEUE_STAGES = ["first", "second", "third", "final"] as const;
type EmailQueueStage = typeof EMAIL_QUEUE_STAGES[number];
type EmailQueuePriority = "low" | "normal" | "high";

type EmailQueueSettings = {
    dailyEmailLimit: number;
    batchSizePerSendCycle: number;
    sendIntervalMinutes: number;
    queueProcessingEnabled: boolean;
    reminderPriorityLevel: EmailQueuePriority;
    lastProcessedAt: string | null;
    lastDailyCheckAt: string | null;
};

const DEFAULT_EMAIL_QUEUE_SETTINGS: EmailQueueSettings = {
    dailyEmailLimit: 300,
    batchSizePerSendCycle: 50,
    sendIntervalMinutes: 60,
    queueProcessingEnabled: true,
    reminderPriorityLevel: "normal",
    lastProcessedAt: null,
    lastDailyCheckAt: null
};

const normalizeQueueInt = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(Math.floor(parsed), max));
};

const normalizeQueuePriority = (value: unknown): EmailQueuePriority => {
    const normalized = normalizeText(value).toLowerCase();
    return normalized === "high" || normalized === "low" ? normalized : "normal";
};

const mapEmailQueueSettings = (row?: QueryRow | null): EmailQueueSettings => ({
    dailyEmailLimit: normalizeQueueInt(row?.daily_email_limit, DEFAULT_EMAIL_QUEUE_SETTINGS.dailyEmailLimit, 1, 10000),
    batchSizePerSendCycle: normalizeQueueInt(row?.batch_size_per_send_cycle, DEFAULT_EMAIL_QUEUE_SETTINGS.batchSizePerSendCycle, 1, 1000),
    sendIntervalMinutes: normalizeQueueInt(row?.send_interval_minutes, DEFAULT_EMAIL_QUEUE_SETTINGS.sendIntervalMinutes, 1, 1440),
    queueProcessingEnabled: normalizeBoolean(row?.queue_processing_enabled, DEFAULT_EMAIL_QUEUE_SETTINGS.queueProcessingEnabled),
    reminderPriorityLevel: normalizeQueuePriority(row?.reminder_priority_level || DEFAULT_EMAIL_QUEUE_SETTINGS.reminderPriorityLevel),
    lastProcessedAt: row?.last_processed_at ? String(row.last_processed_at) : null,
    lastDailyCheckAt: row?.last_daily_check_at ? String(row.last_daily_check_at) : null
});

const ensureEmailQueueTables = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS email_queue_settings (
            id TINYINT PRIMARY KEY DEFAULT 1,
            daily_email_limit INT NOT NULL DEFAULT 300,
            batch_size_per_send_cycle INT NOT NULL DEFAULT 50,
            send_interval_minutes INT NOT NULL DEFAULT 60,
            queue_processing_enabled TINYINT(1) NOT NULL DEFAULT 1,
            reminder_priority_level VARCHAR(20) NOT NULL DEFAULT 'normal',
            last_processed_at DATETIME NULL,
            last_daily_check_at DATETIME NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS email_queue (
            id VARCHAR(36) PRIMARY KEY,
            alumni_id VARCHAR(36) NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            recipient_name VARCHAR(255) NULL,
            email_purpose VARCHAR(100) NOT NULL,
            reminder_stage VARCHAR(30) NOT NULL,
            priority VARCHAR(20) NOT NULL DEFAULT 'normal',
            subject VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            scheduled_for DATETIME NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            last_attempt_at DATETIME NULL,
            sent_at DATETIME NULL,
            provider_message_id VARCHAR(255) NULL,
            error_message TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL,
            INDEX idx_email_queue_status_schedule (status, scheduled_for),
            INDEX idx_email_queue_alumni_purpose (alumni_id, email_purpose),
            INDEX idx_email_queue_created (created_at),
            FOREIGN KEY (alumni_id) REFERENCES profiles(id) ON DELETE CASCADE
        )
    `);

    const existing = await getSingleRow("SELECT id FROM email_queue_settings WHERE id = 1 LIMIT 1");
    if (!existing) {
        await db.execute(
            `INSERT INTO email_queue_settings
                (id, daily_email_limit, batch_size_per_send_cycle, send_interval_minutes, queue_processing_enabled, reminder_priority_level)
             VALUES (1, 300, 50, 60, 1, 'normal')`
        );
    }
};

const getEmailQueueSettings = async () => {
    await ensureEmailQueueTables();
    return mapEmailQueueSettings(await getSingleRow("SELECT * FROM email_queue_settings WHERE id = 1 LIMIT 1"));
};

const saveEmailQueueSettings = async (input: Record<string, unknown>) => {
    await ensureEmailQueueTables();
    const settings = {
        dailyEmailLimit: normalizeQueueInt(input.dailyEmailLimit ?? input.daily_email_limit, DEFAULT_EMAIL_QUEUE_SETTINGS.dailyEmailLimit, 1, 10000),
        batchSizePerSendCycle: normalizeQueueInt(input.batchSizePerSendCycle ?? input.batch_size_per_send_cycle, DEFAULT_EMAIL_QUEUE_SETTINGS.batchSizePerSendCycle, 1, 1000),
        sendIntervalMinutes: normalizeQueueInt(input.sendIntervalMinutes ?? input.send_interval_minutes, DEFAULT_EMAIL_QUEUE_SETTINGS.sendIntervalMinutes, 1, 1440),
        queueProcessingEnabled: normalizeBoolean(input.queueProcessingEnabled ?? input.queue_processing_enabled, DEFAULT_EMAIL_QUEUE_SETTINGS.queueProcessingEnabled),
        reminderPriorityLevel: normalizeQueuePriority(input.reminderPriorityLevel ?? input.reminder_priority_level)
    };

    await db.execute(
        `UPDATE email_queue_settings
         SET daily_email_limit = ?, batch_size_per_send_cycle = ?, send_interval_minutes = ?, queue_processing_enabled = ?, reminder_priority_level = ?
         WHERE id = 1`,
        [settings.dailyEmailLimit, settings.batchSizePerSendCycle, settings.sendIntervalMinutes, settings.queueProcessingEnabled ? 1 : 0, settings.reminderPriorityLevel]
    );

    return getEmailQueueSettings();
};

const addMonths = (date: Date, months: number) => {
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + months);
    return next;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getGraduationDateFromBatch = (batch: unknown) => {
    const year = Number(normalizeBatch(batch));
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
    return new Date(`${year}-06-30T00:00:00${MANILA_UTC_OFFSET}`);
};

const getNextTracerReminderSchedule = (batch: unknown, sentCount: number, lastSentAt?: unknown): { stage: EmailQueueStage; dueAt: Date } | null => {
    if (sentCount >= EMAIL_QUEUE_STAGES.length) return null;
    const stage = EMAIL_QUEUE_STAGES[sentCount];

    if (sentCount === 0) {
        const graduationDate = getGraduationDateFromBatch(batch);
        return graduationDate ? { stage, dueAt: addMonths(graduationDate, 6) } : null;
    }

    const lastSent = parseDateTimeValue(lastSentAt);
    if (!lastSent) return null;
    return { stage, dueAt: addDays(lastSent, sentCount === 1 ? 14 : 30) };
};

const getTracerReminderCopy = (stage: EmailQueueStage, institutionName?: string | null) => {
    const label = stage === "first" ? "First" : stage === "second" ? "Second" : stage === "third" ? "Third" : "Final";
    const sender = normalizeText(institutionName) || "Alumni Office";
    return {
        subject: `${label} Reminder: Please Complete Your Graduate Tracer Survey`,
        message:
            `Dear Alumni,\n\n` +
            `This is your ${label.toLowerCase()} reminder to complete the Graduate Tracer Survey in the alumni portal. ` +
            `Your response helps the school monitor graduate outcomes, improve academic programs, and support future alumni services.\n\n` +
            `If you already completed the tracer form, no further action is needed.\n\n` +
            `Best regards,\n${sender} Alumni Association`
    };
};

const getEmailQueueStats = async () => {
    await ensureEmailQueueTables();
    const statusRows = parseRows(await db.query(
        `SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status`
    ));
    const sentToday = await getSingleRow(
        `SELECT COUNT(*) AS count
         FROM email_logs
         WHERE status = 'sent'
           AND sent_at >= CURRENT_DATE()
           AND sent_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)`
    );
    const nextPending = await getSingleRow(
        `SELECT MIN(scheduled_for) AS nextScheduledAt FROM email_queue WHERE status = 'pending'`
    );
    const settings = await getEmailQueueSettings();
    const byStatus = Object.fromEntries(statusRows.map((row) => [String(row.status || "pending"), Number(row.count || 0)]));

    return {
        pending: Number(byStatus.pending || 0),
        sending: Number(byStatus.sending || 0),
        sent: Number(byStatus.sent || 0),
        failed: Number(byStatus.failed || 0),
        sentToday: Number(sentToday?.count || 0),
        remainingToday: Math.max(0, settings.dailyEmailLimit - Number(sentToday?.count || 0)),
        nextScheduledAt: nextPending?.nextScheduledAt || null
    };
};

const enqueueDueTracerReminders = async (options: { force?: boolean; createdBy?: string | null } = {}) => {
    await ensureEmailQueueTables();
    const settings = await getEmailQueueSettings();
    if (!settings.queueProcessingEnabled && !options.force) return { queued: 0, skipped: 0, disabled: true };

    const today = formatManilaDate(new Date());
    if (!options.force && settings.lastDailyCheckAt && String(settings.lastDailyCheckAt).slice(0, 10) === today) {
        return { queued: 0, skipped: 0, alreadyChecked: true };
    }

    const hasTracerForm = await tableExists("tracer_form");
    const hasGraduateTracerForms = await tableExists("graduate_tracer_forms");
    const tracerJoin = hasTracerForm ? "LEFT JOIN tracer_form tf ON tf.user_id = p.id" : "";
    const graduateJoin = hasGraduateTracerForms ? "LEFT JOIN graduate_tracer_forms gtf ON gtf.alumni_id = p.id" : "";
    const tracerIncomplete = hasTracerForm ? "(tf.id IS NULL OR LOWER(COALESCE(tf.submission_status, '')) NOT IN ('completed', 'submitted'))" : "1 = 1";
    const graduateIncomplete = hasGraduateTracerForms ? "(gtf.id IS NULL OR LOWER(COALESCE(gtf.form_status, '')) NOT IN ('completed', 'submitted'))" : "1 = 1";
    const rows = parseRows(await db.query(
        `SELECT
            p.id,
            p.name,
            p.email,
            p.batch,
            (SELECT COUNT(*) FROM email_logs el WHERE el.alumni_id = p.id AND el.email_purpose = ? AND el.status = 'sent') AS sent_count,
            (SELECT MAX(el.sent_at) FROM email_logs el WHERE el.alumni_id = p.id AND el.email_purpose = ? AND el.status = 'sent') AS last_sent_at
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id
         ${tracerJoin}
         ${graduateJoin}
         WHERE ur.role = 'alumni'
           AND COALESCE(ur.archived, 0) = 0
           AND p.email IS NOT NULL
           AND TRIM(p.email) <> ''
           AND p.email LIKE '%@%.%'
           AND p.email NOT LIKE '% %'
           AND ${tracerIncomplete}
           AND ${graduateIncomplete}
         ORDER BY p.batch ASC, p.name ASC
         LIMIT 2000`,
        [EMAIL_QUEUE_PURPOSE, EMAIL_QUEUE_PURPOSE]
    ));
    const institutionName = String((await getSystemSettings()).institutionName || "");
    const now = new Date();
    const nowSql = formatSqlDateTime(now);
    let queued = 0;
    let skipped = 0;

    for (const row of rows) {
        const recipientEmail = normalizeEmail(row.email);
        if (!EMAIL_REGEX.test(recipientEmail)) { skipped += 1; continue; }
        const schedule = getNextTracerReminderSchedule(row.batch, Number(row.sent_count || 0), row.last_sent_at);
        if (!schedule || schedule.dueAt.getTime() > now.getTime()) { skipped += 1; continue; }

        const activeDuplicate = await getSingleRow(
            `SELECT id FROM email_queue
             WHERE alumni_id = ? AND email_purpose = ? AND reminder_stage = ? AND status IN ('pending', 'sending')
             LIMIT 1`,
            [String(row.id), EMAIL_QUEUE_PURPOSE, schedule.stage]
        );
        if (activeDuplicate) { skipped += 1; continue; }

        const recentSent = await getSingleRow(
            `SELECT id FROM email_logs
             WHERE alumni_id = ? AND email_purpose = ? AND status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
             LIMIT 1`,
            [String(row.id), EMAIL_QUEUE_PURPOSE]
        );
        if (recentSent) { skipped += 1; continue; }

        const copy = getTracerReminderCopy(schedule.stage, institutionName);
        await db.execute(
            `INSERT INTO email_queue
                (id, alumni_id, recipient_email, recipient_name, email_purpose, reminder_stage, priority, subject, message, status, scheduled_for, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            [uuidv4(), String(row.id), recipientEmail, normalizeText(row.name) || "Alumni", EMAIL_QUEUE_PURPOSE, schedule.stage, settings.reminderPriorityLevel, copy.subject, copy.message, formatSqlDateTime(schedule.dueAt), nowSql, options.createdBy || null]
        );
        queued += 1;
    }

    await db.execute("UPDATE email_queue_settings SET last_daily_check_at = ? WHERE id = 1", [nowSql]);
    return { queued, skipped, disabled: false };
};

const processEmailQueue = async (options: { force?: boolean } = {}) => {
    await ensureEmailQueueTables();
    const settings = await getEmailQueueSettings();
    if (!settings.queueProcessingEnabled && !options.force) return { processed: 0, sent: 0, failed: 0, skipped: true, reason: "disabled" };

    const now = new Date();
    if (!options.force && settings.lastProcessedAt) {
        const lastProcessed = parseDateTimeValue(settings.lastProcessedAt);
        if (lastProcessed && now.getTime() - lastProcessed.getTime() < settings.sendIntervalMinutes * 60 * 1000) {
            return { processed: 0, sent: 0, failed: 0, skipped: true, reason: "interval" };
        }
    }

    const sentTodayRow = await getSingleRow(
        `SELECT COUNT(*) AS count
         FROM email_logs
         WHERE status = 'sent'
           AND sent_at >= CURRENT_DATE()
           AND sent_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)`
    );
    const remainingToday = Math.max(0, settings.dailyEmailLimit - Number(sentTodayRow?.count || 0));
    const sendLimit = Math.min(settings.batchSizePerSendCycle, remainingToday);
    if (sendLimit <= 0) return { processed: 0, sent: 0, failed: 0, skipped: true, reason: "daily_limit" };

    const queueRows = parseRows(await db.query(
        `SELECT * FROM email_queue
         WHERE status = 'pending' AND scheduled_for <= ?
         ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, scheduled_for ASC, created_at ASC
         LIMIT ${sendLimit}`,
        [formatSqlDateTime(now)]
    ));

    let sent = 0;
    let failed = 0;

    for (const row of queueRows) {
        const queueId = String(row.id);
        const attemptAt = formatSqlDateTime(new Date());
        await db.execute("UPDATE email_queue SET status = 'sending', attempts = attempts + 1, last_attempt_at = ? WHERE id = ?", [attemptAt, queueId]);

        try {
            const result = await sendTargetedAlumniEmail({
                to: normalizeEmail(row.recipient_email),
                name: String(row.recipient_name || "Alumni"),
                purpose: EMAIL_QUEUE_PURPOSE,
                subject: String(row.subject || "Graduate Tracer Reminder"),
                message: String(row.message || "Please complete your Graduate Tracer Survey.")
            });
            const sentAt = formatSqlDateTime(new Date());
            await db.execute(
                `UPDATE email_queue SET status = 'sent', sent_at = ?, provider_message_id = ?, error_message = NULL WHERE id = ?`,
                [sentAt, result.messageId, queueId]
            );
            await db.execute(
                `INSERT INTO email_logs
                    (id, alumni_id, recipient_email, email_purpose, subject, message, status, error_message, sent_at, created_at, created_by, provider_message_id)
                 VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, ?, ?, ?, ?)`,
                [uuidv4(), String(row.alumni_id), normalizeEmail(row.recipient_email), EMAIL_QUEUE_PURPOSE, String(row.subject), String(row.message), sentAt, sentAt, row.created_by || null, result.messageId]
            );
            sent += 1;
        } catch (error: unknown) {
            const safeError = getSafeMailingError(error);
            await db.execute(
                `UPDATE email_queue SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, error_message = ? WHERE id = ?`,
                [safeError, queueId]
            );
            failed += 1;
        }
    }

    await db.execute("UPDATE email_queue_settings SET last_processed_at = ? WHERE id = 1", [formatSqlDateTime(new Date())]);
    return { processed: queueRows.length, sent, failed, skipped: false, remainingToday: Math.max(0, remainingToday - sent) };
};

let emailQueueTimer: NodeJS.Timeout | null = null;

const startEmailQueueJob = () => {
    if (emailQueueTimer) return;
    const run = async () => {
        try {
            await enqueueDueTracerReminders();
            await processEmailQueue();
        } catch (error) {
            console.error("EMAIL QUEUE JOB ERROR:", error);
        }
    };
    run().catch((error) => console.error("EMAIL QUEUE START ERROR:", error));
    emailQueueTimer = setInterval(run, 5 * 60 * 1000);
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
    temporaryPassword,
    borNumber,
    advancedStudiesLevel,
    advancedStudiesStatus,
    advancedStudiesProgram,
    advancedStudiesSchool,
    advancedStudiesStartYear,
    advancedStudiesExpectedCompletionYear
}: {
    name: string;
    email: string;
    course?: string | null;
    batch?: string | null;
    studentId?: string | null;
    contactNumber?: string | null;
    photoBase64?: string | null;
    temporaryPassword: string;
    borNumber?: string | null;
    advancedStudiesLevel?: string | null;
    advancedStudiesStatus?: string | null;
    advancedStudiesProgram?: string | null;
    advancedStudiesSchool?: string | null;
    advancedStudiesStartYear?: string | null;
    advancedStudiesExpectedCompletionYear?: string | null;
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
        (id, name, email, student_id, course, batch, contact_number, photo, bor_number, advanced_studies_level, advanced_studies_status, advanced_studies_program, advanced_studies_school, advanced_studies_start_year, advanced_studies_expected_completion_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            name,
            email,
            alumniId,
            course || null,
            batch || null,
            contactNumber || null,
            normalizeStoredMedia(photoBase64) || null,
            normalizeText(borNumber) || null,
            normalizeAdvancedStudiesLevel(advancedStudiesLevel),
            normalizeAdvancedStudiesStatus(advancedStudiesStatus),
            normalizeText(advancedStudiesProgram) || null,
            normalizeText(advancedStudiesSchool) || null,
            normalizeOptionalYear(advancedStudiesStartYear),
            normalizeOptionalYear(advancedStudiesExpectedCompletionYear)
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
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN bor_number VARCHAR(100) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN bor_date DATE NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN graduation_batch VARCHAR(100) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN academic_year VARCHAR(30) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN graduation_semester VARCHAR(50) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_level VARCHAR(50) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_status VARCHAR(50) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_program VARCHAR(255) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_school VARCHAR(255) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_start_year VARCHAR(10) NULL"
        },
        {
            table: "profiles",
            sql: "ALTER TABLE profiles ADD COLUMN advanced_studies_expected_completion_year VARCHAR(10) NULL"
        },
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
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN bor_number VARCHAR(100) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN bor_date DATE NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN graduation_batch VARCHAR(100) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN academic_year VARCHAR(30) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN graduation_semester VARCHAR(50) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_level VARCHAR(50) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_status VARCHAR(50) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_program VARCHAR(255) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_school VARCHAR(255) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_start_year VARCHAR(10) NULL"
        },
        {
            table: "imported_alumni_records",
            sql: "ALTER TABLE imported_alumni_records ADD COLUMN advanced_studies_expected_completion_year VARCHAR(10) NULL"
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
            CREATE TABLE IF NOT EXISTS concerns (
                id INT AUTO_INCREMENT PRIMARY KEY,
                alumni_id VARCHAR(36) NULL,
                reporter_name VARCHAR(255) NULL,
                reporter_email VARCHAR(255) NULL,
                subject VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'Pending',
                admin_reply TEXT NULL,
                replied_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_concerns_alumni (alumni_id),
                INDEX idx_concerns_status (status),
                INDEX idx_concerns_created (created_at),
                FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE concerns", error);
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
                alumni_id VARCHAR(36) DEFAULT NULL,
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
        await db.execute("ALTER TABLE officers MODIFY COLUMN alumni_id VARCHAR(36) NULL");
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE officers", error);
    }

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS alumni_officers (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                legacy_officer_id INT DEFAULT NULL,
                alumni_id VARCHAR(36) DEFAULT NULL,
                full_name VARCHAR(255) NOT NULL,
                position VARCHAR(100) NOT NULL,
                custom_position VARCHAR(255) DEFAULT NULL,
                batch_year VARCHAR(20) DEFAULT NULL,
                department_id VARCHAR(100) DEFAULT NULL,
                program_id VARCHAR(150) DEFAULT NULL,
                contact_number VARCHAR(50) DEFAULT NULL,
                email VARCHAR(255) DEFAULT NULL,
                photo LONGTEXT DEFAULT NULL,
                term_start DATE DEFAULT NULL,
                term_end DATE DEFAULT NULL,
                status ENUM('Active', 'Inactive', 'Completed') NOT NULL DEFAULT 'Active',
                remarks TEXT DEFAULT NULL,
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                archived_at DATETIME DEFAULT NULL,
                archived_by VARCHAR(36) DEFAULT NULL,
                created_by VARCHAR(36) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_alumni_officers_legacy (legacy_officer_id),
                INDEX idx_alumni_officers_alumni (alumni_id),
                INDEX idx_alumni_officers_status (status, is_archived),
                INDEX idx_alumni_officers_term (term_start, term_end),
                INDEX idx_alumni_officers_position (position),
                INDEX idx_alumni_officers_batch (batch_year),
                FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        const existingManagedOfficerRecords = await getSingleRow<QueryRow>(
            "SELECT COUNT(*) AS total FROM alumni_officers"
        );

        if (Number(existingManagedOfficerRecords?.total || 0) === 0) {
            await db.execute(`
                INSERT INTO alumni_officers (
                    legacy_officer_id, alumni_id, full_name, position, custom_position, batch_year,
                    department_id, program_id, contact_number, email, photo, term_start, term_end,
                    status, remarks, created_by
                )
                SELECT
                    o.id,
                    o.alumni_id,
                    o.snapshot_name,
                    o.position,
                    o.custom_position,
                    o.snapshot_batch,
                    o.snapshot_course,
                    o.snapshot_course,
                    o.snapshot_contact_number,
                    o.snapshot_email,
                    o.snapshot_photo,
                    MAKEDATE(sy.start_year, 1),
                    MAKEDATE(sy.end_year, 365),
                    CASE WHEN sy.is_current = 1 THEN 'Active' ELSE 'Completed' END,
                    'Migrated from the existing officer school-year roster.',
                    sy.created_by
                FROM officers o
                INNER JOIN officer_school_year sy ON sy.id = o.school_year_id
            `);
        }

        await db.execute(`
            UPDATE alumni_officers
            SET
                custom_position = CASE
                    WHEN position IN ('president', 'vice_president', 'secretary', 'treasurer', 'auditor', 'pio', 'pro') THEN NULL
                    WHEN NULLIF(TRIM(custom_position), '') IS NOT NULL THEN custom_position
                    WHEN position = 'assistant_secretary' THEN 'Assistant Secretary'
                    WHEN position = 'assistant_treasurer' THEN 'Assistant Treasurer'
                    WHEN position = 'board_member' THEN 'Board Member'
                    ELSE 'Officer'
                END,
                position = CASE position
                    WHEN 'president' THEN 'President'
                    WHEN 'vice_president' THEN 'Vice President'
                    WHEN 'secretary' THEN 'Secretary'
                    WHEN 'treasurer' THEN 'Treasurer'
                    WHEN 'auditor' THEN 'Auditor'
                    WHEN 'pio' THEN 'Public Information Officer'
                    WHEN 'pro' THEN 'Public Information Officer'
                    ELSE 'Custom Position'
                END
            WHERE legacy_officer_id IS NOT NULL
              AND position IN ('president', 'vice_president', 'secretary', 'assistant_secretary', 'treasurer', 'assistant_treasurer', 'auditor', 'pio', 'pro', 'board_member')
        `);
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: CREATE TABLE alumni_officers", error);
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
                bor_number VARCHAR(100) DEFAULT NULL,
                advanced_studies_level VARCHAR(50) DEFAULT NULL,
                advanced_studies_status VARCHAR(50) DEFAULT NULL,
                advanced_studies_program VARCHAR(255) DEFAULT NULL,
                advanced_studies_school VARCHAR(255) DEFAULT NULL,
                advanced_studies_start_year VARCHAR(10) DEFAULT NULL,
                advanced_studies_expected_completion_year VARCHAR(10) DEFAULT NULL,
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

const buildAuthPayload = async (user: { id: string; email: string }, selectedRole?: string | null) => {
    const currentUser = await getUserForAuth(user.id);
    const role = await getRoleForUser(user.id, selectedRole);
    const profile = await getProfileForUser(user.id);
    const roles = await getRolesForUser(user.id);
    const isTracerCompleted = role === "alumni"
        ? await getTracerCompletionStatus(user.id)
        : true;

    return {
        role,
        roles,
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

const DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_TITLE = "New survey response";
const DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_CATEGORY = "survey";

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
        "SELECT user_id FROM user_roles WHERE user_id = ? AND role = ?",
        [adminId, "president"]
    );

    if (!existingRole) {
        await db.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
            [adminId, "president"]
        );
    }

    console.log(`âœ… Default admin ensured for ${ADMIN_EMAIL}`);
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
            "SELECT user_id FROM user_roles WHERE user_id = ? AND role = ?",
            [chairmanId, "chairman"]
        );

        if (!existingRole) {
            await db.execute(
                "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
                [chairmanId, "chairman"]
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

        const role = await getRequestRole(req);

        if (!["president", "admin", "chairman", "vice_president", "secretary",
            "assistant_secretary", "treasurer", "assistant_treasurer", "auditor", "pio", "appointed"].includes(role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        next();
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
};

const requireProjectWriteAccess = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const role = await getRequestRole(req);
    if (role === "chairman") {
        return res.status(403).json({ error: "Chairman accounts have read-only access to alumni project summaries and reports." });
    }
    next();
};
const requireProjectDirectoryAccess = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const role = await getRequestRole(req);
    if (role === "chairman") {
        return res.status(403).json({ error: "Chairman accounts can view project summaries and reports only." });
    }
    next();
};
const requireChairman = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const role = await getRequestRole(req);

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
   SYSTEM BRANDING SETTINGS
========================= */
app.get("/api/system-settings", async (_req, res) => {
    try {
        const settings = await getSystemSettings();
        res.json(settings);
    } catch (err: unknown) {
        console.error("GET SYSTEM SETTINGS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/system-settings/upload", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const fileName = normalizeText(req.body?.fileName) || "branding";
        const dataUrl = String(req.body?.dataUrl || "");
        const path = await saveBrandingUpload(fileName, dataUrl);
        res.status(201).json({ path });
    } catch (err: unknown) {
        console.error("SYSTEM BRANDING UPLOAD ERROR:", err);
        res.status(400).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/system-settings", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureSystemSettingsTable();

        const settings = normalizeSystemSettingsInput(req.body || {});
        const existing = await getSingleRow<SystemSettingsRow>("SELECT id FROM system_settings ORDER BY id ASC LIMIT 1");
        const values = SYSTEM_SETTING_COLUMNS.map((column) => settings[column]);

        if (existing?.id) {
            const assignments = SYSTEM_SETTING_COLUMNS.map((column) => `${column} = ?`).join(", ");
            await db.execute(
                `UPDATE system_settings SET ${assignments} WHERE id = ?`,
                [...values, existing.id]
            );
        } else {
            const columns = SYSTEM_SETTING_COLUMNS.join(", ");
            const placeholders = SYSTEM_SETTING_COLUMNS.map(() => "?").join(", ");
            await db.execute(
                `INSERT INTO system_settings (${columns}) VALUES (${placeholders})`,
                values
            );
        }

        const updated = await getSystemSettings();
        res.json({ success: true, message: "System branding settings saved.", settings: updated });
    } catch (err: unknown) {
        console.error("SAVE SYSTEM SETTINGS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

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

const ensureConcernGuestReportSupport = async () => {
    try {
        if (!(await tableExists("concerns"))) return;

        const columns = [
            { name: "reporter_name", sql: "ALTER TABLE concerns ADD COLUMN reporter_name VARCHAR(255) NULL" },
            { name: "reporter_email", sql: "ALTER TABLE concerns ADD COLUMN reporter_email VARCHAR(255) NULL" }
        ];

        for (const column of columns) {
            if (!(await columnExists("concerns", column.name))) {
                await db.execute(column.sql);
            }
        }

        await db.execute("ALTER TABLE concerns MODIFY COLUMN alumni_id VARCHAR(36) NULL");
    } catch (error) {
        console.error("SCHEMA UPDATE ERROR: concerns guest reporting", error);
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

    await ensureUserRolesSupportMultipleRoles();
    await ensureDefaultAdmin();
    await ensureChairmanAccounts();
    await ensureDatabaseColumns();
    await ensureAlumniProfileColumns();
    await ensureConcernGuestReportSupport();
    await ensureEmailQueueTables();
    await ensureAnnouncementEventSurveyEngagementTables();
    await ensureEventRsvpTables();
    await ensureDashboardSlideTable();
    await ensureSystemSettingsTable();
    await ensureAlumniFeeRecordsTable();
    await ensureAlumniProjectTables();
    await ensureAlumniLoginActivityTable();
    await ensureUserSessionTables();
    await endExpiredSessions();
    await ensureAnnouncementInterestTable();
    startDurationAutoArchiveJob();
    startEmailQueueJob();
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

        const roles = await getRolesForUser(String(user.id));
        const authIdentity = {
            id: String(user.id),
            email: String(user.email || identifier)
        };

        if (roles.length > 1) {
            const profile = await getProfileForUser(authIdentity.id);
            const loginToken = jwt.sign(
                { id: authIdentity.id, email: authIdentity.email, roles, purpose: "role_selection" },
                JWT_SECRET,
                { expiresIn: "10m" }
            );

            return res.json({
                requiresRoleSelection: true,
                loginToken,
                roles,
                profile,
                user: authIdentity
            });
        }

        const payload = await createAuthenticatedSession({
            user: authIdentity,
            role: roles[0] || "alumni",
            req
        });

        res.json(payload);
    } catch (err: unknown) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/auth/select-role", async (req, res) => {
    try {
        const { loginToken, role } = req.body || {};
        const selectedRole = normalizeRoleValue(role);

        if (!loginToken || !selectedRole) {
            return res.status(400).json({ error: "Role selection is required." });
        }

        const decoded = jwt.verify(String(loginToken), JWT_SECRET) as Record<string, unknown>;
        const roles = Array.isArray(decoded.roles)
            ? decoded.roles.map((item) => normalizeRoleValue(item)).filter(Boolean)
            : [];

        if (decoded.purpose !== "role_selection" || !decoded.id || !roles.includes(selectedRole)) {
            return res.status(403).json({ error: "Selected role is not assigned to this account." });
        }

        const liveRoles = await getRolesForUser(String(decoded.id));
        if (!liveRoles.includes(selectedRole)) {
            return res.status(403).json({ error: "Selected role is no longer assigned to this account." });
        }

        const payload = await createAuthenticatedSession({
            user: { id: String(decoded.id), email: String(decoded.email || "") },
            role: selectedRole,
            req
        });

        res.json(payload);
    } catch (err: unknown) {
        console.error("SELECT ROLE ERROR:", err);
        res.status(401).json({ error: err instanceof Error ? err.message : "Role selection expired." });
    }
});

app.post("/api/auth/logout", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.sessionId) {
            return res.json({ success: true });
        }

        await ensureUserSessionTables();
        const sessionRow = await getSingleRow(
            `SELECT us.*, p.name
             FROM user_sessions us
             LEFT JOIN profiles p ON p.id = us.user_id
             WHERE us.session_token = ?
             LIMIT 1`,
            [req.user.sessionId]
        );

        await db.execute(
            "UPDATE user_sessions SET status = 'Ended', logout_time = COALESCE(logout_time, NOW()), last_activity = NOW() WHERE session_token = ?",
            [req.user.sessionId]
        );

        if (sessionRow) {
            const fullName = String(sessionRow.name || req.user.email || "User");
            await recordActivityLog({
                userId: req.user.id,
                sessionToken: req.user.sessionId,
                action: "User Logout",
                description: `${fullName} logged out from ${getRoleDisplayLabel(sessionRow.role_id)} session.`,
                roleUsed: String(sessionRow.role_id || req.user.role || ""),
                deviceUsed: sessionRow.device_type ? String(sessionRow.device_type) : null,
                browserUsed: sessionRow.browser ? String(sessionRow.browser) : null,
                ipAddress: sessionRow.ip_address ? String(sessionRow.ip_address) : null
            });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("LOGOUT ERROR:", err);
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
        }, req.user.role);

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

        const role = await getRequestRole(req);
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
            const programOptions = (await getSystemSettings()).programs;
            const courseValidation = validateSupportedCourse(normalizedCourse, programOptions);

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
        }, req.user.role);

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

app.post("/api/concerns/public", async (req, res) => {
    try {
        const reporterName = normalizeText(req.body?.reporterName || req.body?.reporter_name) || "Login page reporter";
        const reporterEmail = normalizeEmail(req.body?.reporterEmail || req.body?.reporter_email) || null;
        const identifier = normalizeText(req.body?.identifier);
        const subject = normalizeText(req.body?.subject) || "Login issue";
        const category = normalizeConcernCategory(req.body?.category) || "Login Issue";
        const rawMessage = normalizeConcernDetails(req.body?.message);

        if (reporterEmail && !EMAIL_REGEX.test(reporterEmail)) {
            return res.status(400).json({ error: "Enter a valid email address." });
        }

        if (!subject || !category || !rawMessage) {
            return res.status(400).json({ error: "Subject, category, and concern details are required." });
        }

        const message = identifier ? `${rawMessage}\n\nLogin identifier: ${identifier}` : rawMessage;
        const result = await db.execute(
            `INSERT INTO concerns (alumni_id, reporter_name, reporter_email, subject, category, message, status)
             VALUES (NULL, ?, ?, ?, ?, ?, 'Pending')`,
            [reporterName, reporterEmail, subject, category, message]
        ) as ResultSetHeader;

        const concern = await getSingleRow<ConcernRow>(
            `SELECT id, alumni_id, reporter_name, reporter_email, subject, category, message, status, admin_reply, replied_at, created_at, updated_at
             FROM concerns
             WHERE id = ?`,
            [result.insertId]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New login problem report",
            message: `${category}: ${subject}`,
            category: "concern",
            linkUrl: "/admin/account?section=reports",
            actorId: null
        });

        res.status(201).json({
            message: "Problem report submitted successfully.",
            concern
        });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});
app.get("/api/concerns/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRequestRole(req);
        if (role !== "alumni") {
            return res.status(403).json({ error: "Alumni access required" });
        }

        const concerns = parseRows<ConcernRow>(await db.query<ConcernRow>(
            `SELECT id, alumni_id, subject, category, message, status, admin_reply, replied_at, created_at, updated_at
             FROM concerns
             WHERE alumni_id = ?
             ORDER BY created_at DESC, id DESC`,
            [req.user.id]
        ));

        res.json(concerns);
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.post("/api/concerns", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRequestRole(req);
        if (role !== "alumni") {
            return res.status(403).json({ error: "Alumni access required" });
        }

        const subject = normalizeText(req.body?.subject);
        const category = normalizeConcernCategory(req.body?.category);
        const message = normalizeConcernDetails(req.body?.message);

        if (!subject || !category || !message) {
            return res.status(400).json({ error: "Subject, category, and concern details are required." });
        }

        const result = await db.execute(
            `INSERT INTO concerns (alumni_id, subject, category, message, status)
             VALUES (?, ?, ?, ?, 'Pending')`,
            [req.user.id, subject, category, message]
        ) as ResultSetHeader;

        const concern = await getSingleRow<ConcernRow>(
            `SELECT id, alumni_id, subject, category, message, status, admin_reply, replied_at, created_at, updated_at
             FROM concerns
             WHERE id = ? AND alumni_id = ?`,
            [result.insertId, req.user.id]
        );

        const adminUserIds = await getAdminUserIds();
        await createUserNotifications({
            userIds: adminUserIds,
            title: "New problem report",
            message: `${category}: ${subject}`,
            category: "concern",
            linkUrl: "/admin/account?section=reports",
            actorId: req.user.id
        });

        res.status(201).json({
            message: "Concern submitted successfully.",
            concern
        });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});
app.delete("/api/concerns/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRequestRole(req);
        if (role !== "alumni") {
            return res.status(403).json({ error: "Alumni access required" });
        }

        const concernId = Number(req.params.id);
        if (!Number.isInteger(concernId) || concernId <= 0) {
            return res.status(400).json({ error: "Invalid concern ID." });
        }

        const result = await db.execute(
            "DELETE FROM concerns WHERE id = ? AND alumni_id = ?",
            [concernId, req.user.id]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Problem report not found or already removed." });
        }

        res.json({ message: "Problem report removed successfully." });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.get("/api/admin/concerns", authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res) => {
    try {
        const concerns = parseRows<ConcernRow>(await db.query<ConcernRow>(
            `SELECT
                c.id,
                c.alumni_id,
                COALESCE(p.name, u.email, c.reporter_name, 'Login page reporter') AS alumni_name,
                COALESCE(p.email, u.email, c.reporter_email) AS alumni_email,
                c.reporter_name,
                c.reporter_email,
                c.subject,
                c.category,
                c.message,
                c.status,
                c.admin_reply,
                c.replied_at,
                c.created_at,
                c.updated_at
             FROM concerns c
             LEFT JOIN profiles p ON p.id = c.alumni_id
             LEFT JOIN users u ON u.id = c.alumni_id
             ORDER BY c.created_at DESC, c.id DESC`
        ));

        res.json(concerns);
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.patch("/api/admin/concerns/:id/reply", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const concernId = Number(req.params.id);
        const reply = normalizeConcernDetails(req.body?.admin_reply || req.body?.reply);
        const requestedStatus = normalizeConcernStatus(req.body?.status);
        const status = requestedStatus || "Replied";

        if (!Number.isInteger(concernId) || concernId <= 0) {
            return res.status(400).json({ error: "Invalid concern ID." });
        }

        if (!reply) {
            return res.status(400).json({ error: "Admin reply is required." });
        }

        const result = await db.execute(
            `UPDATE concerns
             SET admin_reply = ?, replied_at = NOW(), status = ?
             WHERE id = ?`,
            [reply, status, concernId]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Concern not found." });
        }

        const concern = await getSingleRow<ConcernRow>(
            `SELECT
                c.id,
                c.alumni_id,
                COALESCE(p.name, u.email, c.reporter_name, 'Login page reporter') AS alumni_name,
                COALESCE(p.email, u.email, c.reporter_email) AS alumni_email,
                c.reporter_name,
                c.reporter_email,
                c.subject,
                c.category,
                c.message,
                c.status,
                c.admin_reply,
                c.replied_at,
                c.created_at,
                c.updated_at
             FROM concerns c
             LEFT JOIN profiles p ON p.id = c.alumni_id
             LEFT JOIN users u ON u.id = c.alumni_id
             WHERE c.id = ?`,
            [concernId]
        );

        res.json({
            message: "Reply saved successfully.",
            concern
        });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.patch("/api/admin/concerns/:id/status", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const concernId = Number(req.params.id);
        const status = normalizeConcernStatus(req.body?.status);

        if (!Number.isInteger(concernId) || concernId <= 0) {
            return res.status(400).json({ error: "Invalid concern ID." });
        }

        if (!status) {
            return res.status(400).json({ error: "Status must be Pending, Read, Replied, or Resolved." });
        }

        const result = await db.execute(
            "UPDATE concerns SET status = ? WHERE id = ?",
            [status, concernId]
        ) as ResultSetHeader;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Concern not found." });
        }

        const concern = await getSingleRow<ConcernRow>(
            `SELECT
                c.id,
                c.alumni_id,
                COALESCE(p.name, u.email, c.reporter_name, 'Login page reporter') AS alumni_name,
                COALESCE(p.email, u.email, c.reporter_email) AS alumni_email,
                c.reporter_name,
                c.reporter_email,
                c.subject,
                c.category,
                c.message,
                c.status,
                c.admin_reply,
                c.replied_at,
                c.created_at,
                c.updated_at
             FROM concerns c
             LEFT JOIN profiles p ON p.id = c.alumni_id
             LEFT JOIN users u ON u.id = c.alumni_id
             WHERE c.id = ?`,
            [concernId]
        );

        res.json({
            message: "Concern status updated successfully.",
            concern
        });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.get("/api/account/my-posts", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const role = await getRequestRole(req);
        if (role !== "alumni") {
            return res.status(403).json({ error: "Alumni access required" });
        }

        const announcementTable = await getAnnouncementTableName();
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasArchivedAt = await columnExists(announcementTable, "archived_at");
        const hasGoogleFormLink = await columnExists(announcementTable, "google_form_link");

        const announcementRows = hasCreatedBy
            ? parseRows<QueryRow>(await db.query<QueryRow>(
                `SELECT
                    id,
                    title,
                    description,
                    date,
                    organizer,
                    image_url,
                    status,
                    type,
                    ${hasApprovalStatus ? "approval_status" : "NULL AS approval_status"},
                    ${hasGoogleFormLink ? "google_form_link" : "NULL AS google_form_link"},
                    created_at,
                    updated_at
                 FROM ${announcementTable}
                 WHERE created_by = ?
                   AND LOWER(COALESCE(type, 'announcement')) = 'announcement'
                   AND LOWER(COALESCE(status, '')) <> 'archived'
                   ${hasArchivedAt ? "AND archived_at IS NULL" : ""}
                 ORDER BY created_at DESC`,
                [req.user.id]
            ))
            : [];

        const achievementRows = parseRows<QueryRow>(await db.query<QueryRow>(
            `SELECT id, title, description, achievement_date, category, organization, image_url, status, created_at, updated_at
             FROM achievements
             WHERE alumni_id = ? AND LOWER(COALESCE(status, '')) <> 'archived'
             ORDER BY created_at DESC`,
            [req.user.id]
        ));

        const freedomWallRows = parseRows<QueryRow>(await db.query<QueryRow>(
            `SELECT id, content, category, image_url, status, created_at, updated_at
             FROM freedom_wall_posts
             WHERE user_id = ? AND LOWER(COALESCE(status, '')) <> 'deleted'
             ORDER BY created_at DESC`,
            [req.user.id]
        ));

        const posts: AccountPostItem[] = [
            ...announcementRows.map((row) => ({
                id: String(row.id),
                type: "announcement" as const,
                typeLabel: "Announcement",
                title: String(row.title || "Untitled announcement"),
                preview: String(row.description || ""),
                status: String(row.approval_status || row.status || "pending_approval"),
                datePosted: row.created_at ? String(row.created_at) : null,
                updatedAt: row.updated_at ? String(row.updated_at) : null,
                details: {
                    title: row.title || "",
                    description: row.description || "",
                    date: row.date || "",
                    organizer: row.organizer || "",
                    imageUrl: normalizeStoredMedia(row.image_url ? String(row.image_url) : null) || "",
                    status: row.status || "",
                    approvalStatus: row.approval_status || null,
                    googleFormLink: row.google_form_link || null
                }
            })),
            ...achievementRows.map((row) => ({
                id: String(row.id),
                type: "achievement" as const,
                typeLabel: "Achievement",
                title: String(row.title || "Untitled achievement"),
                preview: String(row.description || ""),
                status: String(row.status || "pending"),
                datePosted: row.created_at ? String(row.created_at) : null,
                updatedAt: row.updated_at ? String(row.updated_at) : null,
                details: {
                    title: row.title || "",
                    description: row.description || "",
                    date: row.achievement_date || "",
                    category: row.category || "",
                    organization: row.organization || "",
                    proofImage: normalizeStoredMedia(row.image_url ? String(row.image_url) : null) || "",
                    status: row.status || ""
                }
            })),
            ...freedomWallRows.map((row) => ({
                id: String(row.id),
                type: "freedom_wall" as const,
                typeLabel: "Freedom Wall",
                title: "Freedom Wall Post",
                preview: String(row.content || ""),
                status: String(row.status || "published"),
                datePosted: row.created_at ? String(row.created_at) : null,
                updatedAt: row.updated_at ? String(row.updated_at) : null,
                details: {
                    content: row.content || "",
                    category: row.category || "Discussion",
                    imageUrl: normalizeStoredMedia(row.image_url ? String(row.image_url) : null) || "",
                    status: row.status || ""
                }
            }))
        ].sort((a, b) => {
            const aTime = a.datePosted ? new Date(a.datePosted).getTime() : 0;
            const bTime = b.datePosted ? new Date(b.datePosted).getTime() : 0;
            return bTime - aTime;
        });

        res.json(posts);
    } catch (error: unknown) {
        console.error("GET MY POSTS ERROR:", error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.patch("/api/account/my-posts/announcements/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const announcementId = Number(req.params.id);
        const announcementTable = await getAnnouncementTableName();
        const hasCreatedBy = await columnExists(announcementTable, "created_by");
        const hasApprovalStatus = await columnExists(announcementTable, "approval_status");
        const hasApprovedBy = await columnExists(announcementTable, "approved_by");
        const hasRejectionReason = await columnExists(announcementTable, "rejection_reason");

        if (!announcementId || !hasCreatedBy) {
            return res.status(400).json({ error: "Invalid announcement id." });
        }

        const current = await getSingleRow<QueryRow>(
            `SELECT * FROM ${announcementTable}
             WHERE id = ? AND created_by = ? AND LOWER(COALESCE(type, 'announcement')) = 'announcement'`,
            [announcementId, req.user.id]
        );

        if (!current) {
            return res.status(404).json({ error: "Announcement post not found." });
        }

        const title = normalizeText(req.body?.title);
        const description = String(req.body?.description || "").trim();
        const date = normalizeDateOnly(req.body?.date);
        const organizer = normalizeText(req.body?.organizer);
        const imageUrl = normalizeStoredMedia(typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null) || null;

        if (!title || !date) {
            return res.status(400).json({ error: "Title and date are required." });
        }

        await db.execute(
            `UPDATE ${announcementTable}
             SET title = ?,
                 description = ?,
                 date = ?,
                 organizer = ?,
                 image_url = ?,
                 status = 'active'
                 ${hasApprovalStatus ? ", approval_status = 'pending_approval'" : ""}
                 ${hasApprovedBy ? ", approved_by = NULL" : ""}
                 ${hasRejectionReason ? ", rejection_reason = NULL" : ""}
             WHERE id = ? AND created_by = ?`,
            [title, description || null, date, organizer || null, imageUrl, announcementId, req.user.id]
        );

        res.json({ success: true, message: "Announcement updated and sent for admin review." });
    } catch (error: unknown) {
        console.error("UPDATE OWN ANNOUNCEMENT ERROR:", error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.patch("/api/account/my-posts/achievements/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const achievementId = Number(req.params.id);
        if (!achievementId) {
            return res.status(400).json({ error: "Invalid achievement id." });
        }

        const current = await getSingleRow<QueryRow>(
            "SELECT * FROM achievements WHERE id = ? AND alumni_id = ? AND LOWER(COALESCE(status, '')) <> 'archived'",
            [achievementId, req.user.id]
        );

        if (!current) {
            return res.status(404).json({ error: "Achievement post not found." });
        }

        const title = normalizeText(req.body?.title);
        const description = String(req.body?.description || "").trim();
        const date = normalizeDateOnly(req.body?.date);
        const category = normalizeText(req.body?.category);
        const organization = normalizeText(req.body?.organization);
        const proofImage = normalizeStoredMedia(typeof req.body?.proofImage === "string" ? req.body.proofImage : null) || null;

        if (!title || !category || !date) {
            return res.status(400).json({ error: "Title, category, and date are required." });
        }

        await db.execute(
            `UPDATE achievements
             SET title = ?,
                 description = ?,
                 achievement_date = ?,
                 category = ?,
                 organization = ?,
                 image_url = ?,
                 status = 'pending',
                 featured = 0,
                 approved_by = NULL,
                 rejection_reason = NULL
             WHERE id = ? AND alumni_id = ?`,
            [title, description || null, date, category, organization || null, proofImage, achievementId, req.user.id]
        );

        res.json({ success: true, message: "Achievement updated and sent for admin review." });
    } catch (error: unknown) {
        console.error("UPDATE OWN ACHIEVEMENT ERROR:", error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.patch("/api/account/my-posts/freedom-wall/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const postId = Number(req.params.id);
        if (!postId) {
            return res.status(400).json({ error: "Invalid Freedom Wall post id." });
        }

        const current = await getSingleRow<QueryRow>(
            "SELECT * FROM freedom_wall_posts WHERE id = ? AND user_id = ? AND LOWER(COALESCE(status, '')) <> 'deleted'",
            [postId, req.user.id]
        );

        if (!current) {
            return res.status(404).json({ error: "Freedom Wall post not found." });
        }

        const content = String(req.body?.content || "").trim();
        const category = normalizeText(req.body?.category) || "Discussion";
        const imageUrl = normalizeStoredMedia(typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null) || null;

        if (!content) {
            return res.status(400).json({ error: "Post content is required." });
        }

        await db.execute(
            `UPDATE freedom_wall_posts
             SET content = ?, category = ?, image_url = ?, edited_at = NOW()
             WHERE id = ? AND user_id = ?`,
            [content, category, imageUrl, postId, req.user.id]
        );

        res.json({ success: true, message: "Freedom Wall post updated successfully." });
    } catch (error: unknown) {
        console.error("UPDATE OWN FREEDOM WALL POST ERROR:", error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

app.delete("/api/account/my-posts/:type/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);

        const postId = Number(req.params.id);
        const postType = String(req.params.type || "");
        if (!postId) {
            return res.status(400).json({ error: "Invalid post id." });
        }

        let result: ResultSetHeader;

        if (postType === "announcements") {
            const announcementTable = await getAnnouncementTableName();
            const hasCreatedBy = await columnExists(announcementTable, "created_by");
            const hasArchivedAt = await columnExists(announcementTable, "archived_at");

            if (!hasCreatedBy) {
                return res.status(400).json({ error: "Announcement ownership is not available." });
            }

            result = await db.execute(
                `UPDATE ${announcementTable}
                 SET status = 'archived' ${hasArchivedAt ? ", archived_at = NOW()" : ""}
                 WHERE id = ? AND created_by = ? AND LOWER(COALESCE(type, 'announcement')) = 'announcement'`,
                [postId, req.user.id]
            ) as ResultSetHeader;
        } else if (postType === "achievements") {
            result = await db.execute(
                "UPDATE achievements SET status = 'archived' WHERE id = ? AND alumni_id = ?",
                [postId, req.user.id]
            ) as ResultSetHeader;
        } else if (postType === "freedom-wall") {
            result = await db.execute(
                "UPDATE freedom_wall_posts SET status = 'deleted' WHERE id = ? AND user_id = ?",
                [postId, req.user.id]
            ) as ResultSetHeader;
        } else {
            return res.status(400).json({ error: "Invalid post type." });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Post not found." });
        }

        res.json({ success: true, message: "Post removed successfully." });
    } catch (error: unknown) {
        console.error("DELETE OWN POST ERROR:", error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

/* =========================
   PROFILES / ALUMNI
========================= */
app.get("/api/profiles", authenticateToken, async (_req, res) => {
    try {
        await ensureAlumniProfileColumns();
        const rows = parseRows(await db.query(
            `SELECT 
                p.id,
                p.name,
                p.email,
                p.student_id,
                p.course,
                p.batch,
                p.bor_number,
                p.advanced_studies_level,
                p.advanced_studies_status,
                p.advanced_studies_program,
                p.advanced_studies_school,
                p.advanced_studies_start_year,
                p.advanced_studies_expected_completion_year,
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
        await ensureAlumniProfileColumns();
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
            sendEmail: shouldSend,
            borNumber,
            bor_number,
            advancedStudiesLevel,
            advanced_studies_level,
            advancedStudiesStatus,
            advanced_studies_status,
            advancedStudiesProgram,
            advanced_studies_program,
            advancedStudiesSchool,
            advanced_studies_school,
            advancedStudiesStartYear,
            advanced_studies_start_year,
            advancedStudiesExpectedCompletionYear,
            advanced_studies_expected_completion_year
        } = _req.body || {};

        const normalizedName = normalizeText(name);
        const normalizedEmail = normalizeEmail(email);
        const normalizedBatch = normalizeBatch(batch || year);
        const normalizedStudentId = normalizeText(studentId || student_id || requestedAlumniId);
        const normalizedContactNumber = normalizePhone(contactNumber) || null;
        const normalizedBorNumber = normalizeText(borNumber || bor_number) || null;
        const normalizedAdvancedStudiesLevel = normalizeAdvancedStudiesLevel(advancedStudiesLevel || advanced_studies_level);
        const normalizedAdvancedStudiesStatus = normalizeAdvancedStudiesStatus(advancedStudiesStatus || advanced_studies_status);
        const normalizedAdvancedStudiesProgram = normalizeText(advancedStudiesProgram || advanced_studies_program) || null;
        const normalizedAdvancedStudiesSchool = normalizeText(advancedStudiesSchool || advanced_studies_school) || null;
        const normalizedAdvancedStudiesStartYear = normalizeOptionalYear(advancedStudiesStartYear || advanced_studies_start_year);
        const normalizedAdvancedStudiesExpectedCompletionYear = normalizeOptionalYear(advancedStudiesExpectedCompletionYear || advanced_studies_expected_completion_year);
        const hasAdvancedStudiesDetails = Boolean(normalizedAdvancedStudiesStatus || normalizedAdvancedStudiesProgram || normalizedAdvancedStudiesSchool || normalizedAdvancedStudiesStartYear || normalizedAdvancedStudiesExpectedCompletionYear);
        const programOptions = (await getSystemSettings()).programs;
        const courseValidation = validateSupportedCourse(course || program, programOptions);

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

        if (hasAdvancedStudiesDetails && !normalizedAdvancedStudiesLevel) {
            return res.status(400).json({ error: "Select Master's Degree or Doctoral Degree when entering advanced studies details." });
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
            temporaryPassword,
            borNumber: normalizedBorNumber,
            advancedStudiesLevel: normalizedAdvancedStudiesLevel,
            advancedStudiesStatus: normalizedAdvancedStudiesStatus,
            advancedStudiesProgram: normalizedAdvancedStudiesProgram,
            advancedStudiesSchool: normalizedAdvancedStudiesSchool,
            advancedStudiesStartYear: normalizedAdvancedStudiesStartYear,
            advancedStudiesExpectedCompletionYear: normalizedAdvancedStudiesExpectedCompletionYear
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
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream"
    ],
    limit: "15mb"
});

app.post("/api/profiles/import", authenticateToken, requireAdmin, alumniImportFileParser, async (req: AuthenticatedRequest, res) => {
    const conn = await db.getConnection();

    try {
        await ensureAlumniProfileColumns();
        const importSchoolYear = normalizeBatch(String(req.headers["x-school-year"] || ""));

        if (!/^\d{4}$/.test(importSchoolYear)) {
            return res.status(400).json({ error: "Set a valid 4-digit school year before importing alumni records." });
        }

        const programOptions = (await getSystemSettings()).programs;
        const parsedRows = Buffer.isBuffer(req.body)
            ? await parseAlumniImportFile(
                req.body,
                String(req.headers["x-file-name"] || ""),
                String(req.headers["content-type"] || "")
            )
            : Array.isArray(req.body?.rows)
                ? req.body.rows as AlumniImportInputRow[]
                : [];
        const rows = parsedRows.map((row) => ({ ...row, graduationYear: importSchoolYear, year: importSchoolYear }));
        const importBatchId = uuidv4();

        if (rows.length === 0) {
            return res.status(400).json({ error: "No alumni rows were provided" });
        }

        const validRows: AlumniImportPreparedRow[] = [];
        const failedRows: AlumniImportFailure[] = [];
        const seenEmails = new Set<string>();

        rows.forEach((row, index) => {
            const result = validateImportRow(row, index + 1, programOptions);

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
                    temporaryPassword,
                    borNumber: row.borNumber,
                    advancedStudiesLevel: row.advancedStudiesLevel,
                    advancedStudiesStatus: row.advancedStudiesStatus,
                    advancedStudiesProgram: row.advancedStudiesProgram,
                    advancedStudiesSchool: row.advancedStudiesSchool,
                    advancedStudiesStartYear: row.advancedStudiesStartYear,
                    advancedStudiesExpectedCompletionYear: row.advancedStudiesExpectedCompletionYear
                });
                userId = createdAccount.userId;
                alumniId = createdAccount.alumniId;

                await conn.query(
                    `INSERT INTO imported_alumni_records
                        (import_batch_id, imported_profile_id, full_name, graduation_year, email_address, contact_number, bor_number, advanced_studies_level, advanced_studies_status, advanced_studies_program, advanced_studies_school, advanced_studies_start_year, advanced_studies_expected_completion_year, generated_alumni_id, status, email_status, imported_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', 'pending', ?)`,
                    [
                        importBatchId,
                        userId,
                        row.name,
                        row.batch,
                        row.email,
                        row.contactNumber,
                        row.borNumber,
                        row.advancedStudiesLevel,
                        row.advancedStudiesStatus,
                        row.advancedStudiesProgram,
                        row.advancedStudiesSchool,
                        row.advancedStudiesStartYear,
                        row.advancedStudiesExpectedCompletionYear,
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
   ADMIN SESSION MONITORING
========================= */
app.get("/api/admin/sessions", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureUserSessionTables();
        await endExpiredSessions();

        const search = String(req.query.search || "").trim();
        const role = normalizeRoleValue(req.query.role);
        const status = String(req.query.status || "").trim();
        const dateFrom = String(req.query.dateFrom || "").trim();
        const dateTo = String(req.query.dateTo || "").trim();
        const where: string[] = [];
        const params: DbParam[] = [];

        if (search) {
            where.push("(p.name LIKE ? OR u.email LIKE ? OR us.ip_address LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (role === "administrator") {
            where.push("us.role_id IN ('admin', 'president')");
        } else if (role === "staff") {
            where.push("us.role_id NOT IN ('admin', 'president', 'chairman', 'alumni')");
        } else if (role) {
            where.push("us.role_id = ?");
            params.push(role);
        }

        if (status && status !== "all") {
            where.push("us.status = ?");
            params.push(status === SESSION_ACTIVE_STATUS ? SESSION_ACTIVE_STATUS : SESSION_ENDED_STATUS);
        }

        if (dateFrom) {
            where.push("us.login_time >= ?");
            params.push(`${dateFrom} 00:00:00`);
        }

        if (dateTo) {
            where.push("us.login_time <= ?");
            params.push(`${dateTo} 23:59:59`);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const sessions = parseRows(await db.query(
            `SELECT
                us.id,
                us.user_id,
                us.role_id,
                us.session_token,
                us.ip_address,
                us.browser,
                us.operating_system,
                us.device_type,
                us.login_time,
                us.logout_time,
                us.last_activity,
                us.status,
                p.name AS full_name,
                u.email
             FROM user_sessions us
             LEFT JOIN profiles p ON p.id = us.user_id
             LEFT JOIN users u ON u.id = us.user_id
             ${whereSql}
             ORDER BY us.login_time DESC
             LIMIT 300`,
            params
        ));

        const activityWhere: string[] = ["al.action IN ('User Login', 'User Logout', 'Force Logout')"];
        const activityParams: DbParam[] = [];

        if (search) {
            activityWhere.push("(p.name LIKE ? OR u.email LIKE ? OR al.ip_address LIKE ?)");
            activityParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (role === "administrator") {
            activityWhere.push("al.role_used IN ('admin', 'president')");
        } else if (role === "staff") {
            activityWhere.push("al.role_used NOT IN ('admin', 'president', 'chairman', 'alumni')");
        } else if (role) {
            activityWhere.push("al.role_used = ?");
            activityParams.push(role);
        }

        if (dateFrom) {
            activityWhere.push("al.created_at >= ?");
            activityParams.push(`${dateFrom} 00:00:00`);
        }

        if (dateTo) {
            activityWhere.push("al.created_at <= ?");
            activityParams.push(`${dateTo} 23:59:59`);
        }

        const activities = parseRows(await db.query(
            `SELECT
                al.id,
                al.user_id,
                al.action,
                al.description,
                al.role_used,
                al.device_used,
                al.browser_used,
                al.ip_address,
                al.created_at,
                p.name AS full_name,
                u.email
             FROM activity_logs al
             LEFT JOIN profiles p ON p.id = al.user_id
             LEFT JOIN users u ON u.id = al.user_id
             WHERE ${activityWhere.join(" AND ")}
             ORDER BY al.created_at DESC
             LIMIT 300`,
            activityParams
        ));

        const stats = await getSingleRow(
            `SELECT
                COUNT(DISTINCT CASE WHEN status = 'Active' THEN user_id END) AS activeUsers,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeSessions,
                SUM(CASE WHEN status = 'Active' AND role_id IN ('admin', 'president') THEN 1 ELSE 0 END) AS loggedInAdministrators,
                SUM(CASE WHEN status = 'Active' AND role_id NOT IN ('admin', 'president', 'chairman', 'alumni') THEN 1 ELSE 0 END) AS loggedInStaff,
                SUM(CASE WHEN status = 'Active' AND role_id = 'chairman' THEN 1 ELSE 0 END) AS loggedInChairmen
             FROM user_sessions`
        );

        res.json({
            sessions: sessions.map((session) => ({
                id: Number(session.id),
                userId: String(session.user_id || ""),
                fullName: String(session.full_name || session.email || "Unknown user"),
                email: session.email ? String(session.email) : null,
                role: String(session.role_id || ""),
                roleLabel: getRoleDisplayLabel(session.role_id),
                sessionToken: String(session.session_token || ""),
                ipAddress: session.ip_address ? String(session.ip_address) : null,
                browser: session.browser ? String(session.browser) : null,
                operatingSystem: session.operating_system ? String(session.operating_system) : null,
                deviceType: session.device_type ? String(session.device_type) : null,
                loginTime: session.login_time || null,
                logoutTime: session.logout_time || null,
                lastActivity: session.last_activity || null,
                status: String(session.status || SESSION_ENDED_STATUS),
                isCurrent: req.user?.sessionId ? String(session.session_token) === req.user.sessionId : false
            })),
            activities: activities.map((activity) => ({
                id: Number(activity.id),
                userId: activity.user_id ? String(activity.user_id) : null,
                fullName: String(activity.full_name || activity.email || "Unknown user"),
                email: activity.email ? String(activity.email) : null,
                action: String(activity.action || ""),
                description: String(activity.description || ""),
                role: activity.role_used ? String(activity.role_used) : null,
                roleLabel: getRoleDisplayLabel(activity.role_used),
                deviceUsed: activity.device_used ? String(activity.device_used) : null,
                browserUsed: activity.browser_used ? String(activity.browser_used) : null,
                ipAddress: activity.ip_address ? String(activity.ip_address) : null,
                createdAt: activity.created_at || null
            })),
            stats: {
                activeUsers: Number(stats?.activeUsers || 0),
                activeSessions: Number(stats?.activeSessions || 0),
                loggedInAdministrators: Number(stats?.loggedInAdministrators || 0),
                loggedInStaff: Number(stats?.loggedInStaff || 0),
                loggedInChairmen: Number(stats?.loggedInChairmen || 0)
            }
        });
    } catch (err: unknown) {
        console.error("ADMIN SESSIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/sessions/:id/terminate", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureUserSessionTables();
        const session = await getSingleRow(
            `SELECT us.*, p.name, u.email
             FROM user_sessions us
             LEFT JOIN profiles p ON p.id = us.user_id
             LEFT JOIN users u ON u.id = us.user_id
             WHERE us.id = ?
             LIMIT 1`,
            [String(req.params.id)]
        );

        if (!session) {
            return res.status(404).json({ error: "Session not found." });
        }

        await db.execute(
            "UPDATE user_sessions SET status = 'Ended', logout_time = COALESCE(logout_time, NOW()), last_activity = NOW() WHERE id = ?",
            [String(req.params.id)]
        );

        const actorProfile = req.user?.id ? await getProfileForUser(req.user.id) : null;
        await recordActivityLog({
            userId: session.user_id ? String(session.user_id) : null,
            sessionToken: session.session_token ? String(session.session_token) : null,
            action: "Force Logout",
            description: `${String(actorProfile?.name || req.user?.email || "Administrator")} force logged out ${String(session.name || session.email || "a user")} from ${getRoleDisplayLabel(session.role_id)} session.`,
            roleUsed: session.role_id ? String(session.role_id) : null,
            deviceUsed: session.device_type ? String(session.device_type) : null,
            browserUsed: session.browser ? String(session.browser) : null,
            ipAddress: session.ip_address ? String(session.ip_address) : null,
            metadata: { terminatedBy: req.user?.id || null }
        });

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("TERMINATE SESSION ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/admin/sessions/terminate-all", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureUserSessionTables();
        const activeSessions = parseRows(await db.query(
            `SELECT us.*, p.name, u.email
             FROM user_sessions us
             LEFT JOIN profiles p ON p.id = us.user_id
             LEFT JOIN users u ON u.id = us.user_id
             WHERE us.status = 'Active'`
        ));

        await db.execute(
            "UPDATE user_sessions SET status = 'Ended', logout_time = COALESCE(logout_time, NOW()), last_activity = NOW() WHERE status = 'Active'"
        );

        const actorProfile = req.user?.id ? await getProfileForUser(req.user.id) : null;
        await Promise.all(activeSessions.map((session) => recordActivityLog({
            userId: session.user_id ? String(session.user_id) : null,
            sessionToken: session.session_token ? String(session.session_token) : null,
            action: "Force Logout",
            description: `${String(actorProfile?.name || req.user?.email || "Administrator")} force logged out ${String(session.name || session.email || "a user")} from ${getRoleDisplayLabel(session.role_id)} session.`,
            roleUsed: session.role_id ? String(session.role_id) : null,
            deviceUsed: session.device_type ? String(session.device_type) : null,
            browserUsed: session.browser ? String(session.browser) : null,
            ipAddress: session.ip_address ? String(session.ip_address) : null,
            metadata: { terminatedBy: req.user?.id || null, bulk: true }
        })));

        res.json({ success: true, terminated: activeSessions.length });
    } catch (err: unknown) {
        console.error("TERMINATE ALL SESSIONS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
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

        const recentDonors = parseRows<RecentDonationRow>(await db.query<RecentDonationRow>(
            `SELECT
                d.id,
                d.amount,
                d.purpose,
                d.message,
                d.created_at,
                p.name
            FROM donations d
            LEFT JOIN profiles p ON p.id = d.user_id
            WHERE ${donationStatusSql("d.status")} IN ('approved', 'approve')
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
        await ensureUserSessionTables();
        await endExpiredSessions();
        const sessionStats = await getSingleRow(
            `SELECT
                COUNT(DISTINCT CASE WHEN status = 'Active' THEN user_id END) AS activeUsers,
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeSessions,
                SUM(CASE WHEN status = 'Active' AND role_id IN ('admin', 'president') THEN 1 ELSE 0 END) AS loggedInAdministrators,
                SUM(CASE WHEN status = 'Active' AND role_id NOT IN ('admin', 'president', 'chairman', 'alumni') THEN 1 ELSE 0 END) AS loggedInStaff,
                SUM(CASE WHEN status = 'Active' AND role_id = 'chairman' THEN 1 ELSE 0 END) AS loggedInChairmen
             FROM user_sessions`
        );
        const recentLoginActivities = parseRows(await db.query(
            `SELECT al.id, al.description, al.role_used, al.device_used, al.browser_used, al.ip_address, al.created_at, p.name AS full_name
             FROM activity_logs al
             LEFT JOIN profiles p ON p.id = al.user_id
             WHERE al.action = 'User Login'
             ORDER BY al.created_at DESC
             LIMIT 6`
        ));

        res.json({
            totalAlumni: Number(totalAlumniRow?.totalAlumni || 0),
            tracerCount: Number(tracerCountRow?.tracerCount || 0),
            tracerData: tracerRows,
            recentTracer: tracerRows,
            totalDonations: Number(totalDonationsRow?.totalDonations || 0),
            sessionStats: {
                activeUsers: Number(sessionStats?.activeUsers || 0),
                activeSessions: Number(sessionStats?.activeSessions || 0),
                loggedInAdministrators: Number(sessionStats?.loggedInAdministrators || 0),
                loggedInStaff: Number(sessionStats?.loggedInStaff || 0),
                loggedInChairmen: Number(sessionStats?.loggedInChairmen || 0)
            },
            recentLoginActivities: recentLoginActivities.map((activity) => ({
                id: String(activity.id),
                description: String(activity.description || ""),
                fullName: activity.full_name ? String(activity.full_name) : null,
                role: activity.role_used ? String(activity.role_used) : null,
                roleLabel: getRoleDisplayLabel(activity.role_used),
                deviceUsed: activity.device_used ? String(activity.device_used) : null,
                browserUsed: activity.browser_used ? String(activity.browser_used) : null,
                ipAddress: activity.ip_address ? String(activity.ip_address) : null,
                createdAt: activity.created_at || null
            })),
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
            recentDonors: recentDonors.map((donation) => ({
                id: String(donation.id),
                donorName: donation.name || "Alumni donor",
                amount: Number(donation.amount || 0),
                donatedAt: donation.created_at,
                purpose: donation.purpose || "General donation",
                message: donation.message || null
            })),
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
            `SELECT d.id, d.amount, d.method, d.status, d.purpose, d.message, d.created_at, p.name
             FROM donations d
             LEFT JOIN profiles p ON p.id = d.user_id
             WHERE ${donationStatusSql("d.status")} IN ('approved', 'approve')
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
        const legacyOfficers = activeSchoolYear
            ? await getOfficerRosterForSchoolYear(Number(activeSchoolYear.id))
            : [];
        const managedOfficers = await getActiveManagedOfficerRoster();
        const officers = legacyOfficers.length > 0 ? legacyOfficers : managedOfficers;

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


        await ensureAlumniProjectTables();
        const alumniProjects = parseRows<AlumniProjectRow>(await db.query<AlumniProjectRow>(
            `SELECT p.*, officer_profile.name AS lead_officer_name, alumni_profile.name AS lead_alumni_name,
                (SELECT COUNT(*) FROM alumni_project_files pf WHERE pf.project_id = p.id) AS file_count
             FROM alumni_projects p
             LEFT JOIN profiles officer_profile ON officer_profile.id = p.lead_officer_id
             LEFT JOIN profiles alumni_profile ON alumni_profile.id = p.lead_alumni_id
             WHERE p.status IN ('Planned', 'Ongoing', 'Completed')
               AND (p.batch_year IS NULL OR p.batch_year = '' OR LOWER(p.batch_year) = ?)
             ORDER BY
                CASE p.status
                    WHEN 'Ongoing' THEN 1
                    WHEN 'Planned' THEN 2
                    WHEN 'Completed' THEN 3
                    ELSE 4
                END,
                COALESCE(p.start_date, p.created_at) DESC,
                p.created_at DESC
             LIMIT 8`,
            [audienceBatch]
        ));
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
            alumniProjects: alumniProjects.map(mapAlumniProject),
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
                message: donation.message || null,
                created_at: donation.created_at,
                donorName: donation.name || "Alumni donor"
            })),
            slideshow: slides.map(mapDashboardSlide),
            registrations: registrations.map((r) => String(r.event_id)),
            comments,
            officers: officers.map((row: AlumniOfficerRow | QueryRow) => ({
                name: row.full_name || row.name,
                role: getManagedOfficerChartRole(String(row.position || "")),
                positionLabel: getManagedOfficerDisplayPosition(String(row.position || ""), row.custom_position ? String(row.custom_position) : null),
                photo: normalizeStoredMedia(row.photo ? String(row.photo) : null),
                schoolYear: row.term_start && row.term_end ? `${row.term_start} to ${row.term_end}` : row.school_year
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

const PROJECT_CATEGORIES = ["School Support Project", "Infrastructure Project", "Scholarship Program", "Community Outreach", "Environmental Project", "Fundraising Project", "Educational Activity", "Alumni Association Project", "Batch Initiative", "Other"] as const;
const PROJECT_STATUSES = ["Planned", "Ongoing", "Completed", "Cancelled", "Archived"] as const;
const projectOption = (value: unknown, options: readonly string[], fallback: string) => {
    const normalized = normalizeText(value).toLowerCase();
    const aliases: Record<string, string> = { "alumni fundraising": "Fundraising Project", "educational project": "Educational Activity" };
    return options.find((item) => item.toLowerCase() === normalized) || aliases[normalized] || fallback;
};
const mapAlumniProject = (row: AlumniProjectRow) => ({
    id: Number(row.id), title: row.title, description: row.description || "", category: projectOption(row.category, PROJECT_CATEGORIES, "Other"),
    batchYear: row.batch_year || "", leadOfficerId: row.lead_officer_id || "", leadOfficer: row.lead_officer_name || "",
    leadAlumniId: row.lead_alumni_id || "", leadAlumni: row.lead_alumni_name || "",
    organizationName: row.organization_name || row.alumni_group || "", alumniGroup: row.organization_name || row.alumni_group || "",
    startDate: row.start_date || "", endDate: row.end_date || "", status: projectOption(row.status, PROJECT_STATUSES, "Planned"),
    estimatedValue: Number(row.estimated_value || 0), fundingSource: row.funding_source || "", beneficiaries: row.beneficiaries || "",
    accomplishments: row.accomplishments || "", remarks: row.remarks || "",
    relatedContributionId: row.related_contribution_id || row.contribution_record_id || "", contributionRecordId: row.related_contribution_id || row.contribution_record_id || "",
    createdAt: row.created_at, updatedAt: row.updated_at, fileCount: Number(row.file_count || 0)
});
const listAlumniProjects = async (query: Record<string, unknown> = {}) => {
    await ensureAlumniProjectTables();
    const where = ["1 = 1"], params: DbParam[] = [];
    const search = normalizeText(query.search), batch = normalizeText(query.batchYear), category = normalizeText(query.category), status = normalizeText(query.status);
    if (search) {
        const value = `%${search}%`;
        where.push("(LOWER(p.title) LIKE LOWER(?) OR LOWER(COALESCE(p.organization_name, p.alumni_group, '')) LIKE LOWER(?) OR LOWER(COALESCE(officer_profile.name, '')) LIKE LOWER(?) OR LOWER(COALESCE(alumni_profile.name, '')) LIKE LOWER(?))");
        params.push(value, value, value, value);
    }
    if (batch) { where.push("p.batch_year = ?"); params.push(batch); }
    if (category) { where.push("p.category = ?"); params.push(projectOption(category, PROJECT_CATEGORIES, "Other")); }
    if (status) { where.push("p.status = ?"); params.push(projectOption(status, PROJECT_STATUSES, "Planned")); }
    return parseRows<AlumniProjectRow>(await db.query<AlumniProjectRow>(
        `SELECT p.*, officer_profile.name AS lead_officer_name, alumni_profile.name AS lead_alumni_name,
            (SELECT COUNT(*) FROM alumni_project_files pf WHERE pf.project_id = p.id) AS file_count
         FROM alumni_projects p
         LEFT JOIN profiles officer_profile ON officer_profile.id = p.lead_officer_id
         LEFT JOIN profiles alumni_profile ON alumni_profile.id = p.lead_alumni_id
         WHERE ${where.join(" AND ")}
         ORDER BY p.start_date DESC, p.created_at DESC`, params
    ));
};
const normalizeProjectInput = (body: Record<string, unknown>) => {
    const title = normalizeText(body.title), category = projectOption(body.category, PROJECT_CATEGORIES, "Other");
    const startDate = normalizeDateOnly(body.startDate), endDate = normalizeDateOnly(body.endDate);
    if (!title) throw new Error("Project title is required.");
    if (startDate && endDate && startDate > endDate) throw new Error("End date cannot be earlier than the start date.");
    return {
        title, description: normalizeText(body.description) || null, category, batchYear: normalizeText(body.batchYear) || null,
        leadOfficerId: normalizeText(body.leadOfficerId) || null, leadAlumniId: normalizeText(body.leadAlumniId) || null,
        organizationName: normalizeText(body.organizationName ?? body.alumniGroup) || null, startDate: startDate || null, endDate: endDate || null,
        status: projectOption(body.status, PROJECT_STATUSES, "Planned"), estimatedValue: Number(body.estimatedValue) || null,
        fundingSource: normalizeText(body.fundingSource) || null, beneficiaries: normalizeText(body.beneficiaries) || null,
        accomplishments: normalizeText(body.accomplishments) || null, remarks: normalizeText(body.remarks) || null,
        relatedContributionId: normalizeText(body.relatedContributionId ?? body.contributionRecordId) || null
    };
};
const getAlumniProjectSummary = async (query: Record<string, unknown> = {}) => {
    const rows = await listAlumniProjects(query);
    const by = (key: "batch_year" | "category" | "start_date") => {
        const map = new Map<string, number>();
        rows.forEach((row) => {
            const label = key === "start_date" ? String(row.start_date || "").slice(0, 4) || "Not set" : String(row[key] || "Not set");
            map.set(label, (map.get(label) || 0) + 1);
        });
        return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
    };
    const statusCount = (value: string) => rows.filter((row) => projectOption(row.status, PROJECT_STATUSES, "Planned") === value).length;
    return {
        totalProjects: rows.length, plannedProjects: statusCount("Planned"), ongoingProjects: statusCount("Ongoing"), completedProjects: statusCount("Completed"),
        archivedProjects: statusCount("Archived"), cancelledProjects: statusCount("Cancelled"), totalEstimatedValue: rows.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0),
        byBatch: by("batch_year"), byCategory: by("category"), annualTrends: by("start_date"),
        statusDistribution: PROJECT_STATUSES.map((label) => ({ label, value: statusCount(label) }))
    };
};
const projectExportRows = (rows: AlumniProjectRow[]) => rows.map((row) => {
    const project = mapAlumniProject(row);
    return { "Project Title": project.title, Category: project.category, "Batch Year": project.batchYear, "Lead Officer": project.leadOfficer, "Lead Alumni": project.leadAlumni, Organization: project.organizationName, Status: project.status, "Start Date": project.startDate, "End Date": project.endDate, Beneficiaries: project.beneficiaries, "Estimated Value": project.estimatedValue, "Source of Funds": project.fundingSource, "Related Contribution": project.relatedContributionId, Accomplishments: project.accomplishments, Remarks: project.remarks };
});
const sendAlumniProjectsExcel = async (res: express.Response, rows: AlumniProjectRow[]) => {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Alumni Projects"), records = projectExportRows(rows);
    sheet.columns = Object.keys(records[0] || { "Project Title": "" }).map((header) => ({ header, key: header, width: Math.min(42, Math.max(16, header.length + 4)) }));
    records.forEach((record) => sheet.addRow(record));
    sheet.getRow(1).font = { bold: true };
    res.attachment("alumni-projects-report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
};
const escapePdfText = (value: unknown) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
const sendAlumniProjectsPdf = (res: express.Response, rows: AlumniProjectRow[]) => {
    const lines = ["Alumni Projects Report", "Generated: " + new Date().toLocaleDateString(), ""];
    projectExportRows(rows).slice(0, 45).forEach((record, index) => lines.push(String(index + 1) + ". " + record["Project Title"] + " | " + record.Status + " | " + record.Category + " | PHP " + Number(record["Estimated Value"] || 0).toLocaleString()));
    const commands = lines.map((line, index) => (index ? "0 -15 Td " : "") + "(" + escapePdfText(line).slice(0, 110) + ") Tj").join(" ");
    const content = "BT /F1 12 Tf 50 770 Td " + commands + " ET";
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Length " + Buffer.byteLength(content) + " >>\nstream\n" + content + "\nendstream"];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += String(index + 1) + " 0 obj\n" + object + "\nendobj\n"; });
    const xref = Buffer.byteLength(pdf);
    pdf += "xref\n0 " + String(objects.length + 1) + "\n0000000000 65535 f \n";
    pdf += offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("");
    pdf += "trailer\n<< /Size " + String(objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + String(xref) + "\n%%EOF";
    res.setHeader("Content-Type", "application/pdf"); res.attachment("alumni-projects-report.pdf"); res.send(Buffer.from(pdf, "utf8"));
};app.get("/api/admin/alumni-projects/reports/summary", authenticateToken, requireAdmin, async (req, res) => { try { res.json(await getAlumniProjectSummary(req.query as Record<string, unknown>)); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects/summary", authenticateToken, requireAdmin, async (req, res) => { try { res.json(await getAlumniProjectSummary(req.query as Record<string, unknown>)); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects/export/pdf", authenticateToken, requireAdmin, async (req, res) => { try { sendAlumniProjectsPdf(res, await listAlumniProjects(req.query as Record<string, unknown>)); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects/export/excel", authenticateToken, requireAdmin, async (req, res) => { try { await sendAlumniProjectsExcel(res, await listAlumniProjects(req.query as Record<string, unknown>)); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects/export/:format", authenticateToken, requireAdmin, async (req, res) => { try { res.json({ format: req.params.format, projects: (await listAlumniProjects(req.query as Record<string, unknown>)).map(mapAlumniProject) }); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects", authenticateToken, requireAdmin, requireProjectDirectoryAccess, async (req, res) => { try { res.json((await listAlumniProjects(req.query as Record<string, unknown>)).map(mapAlumniProject)); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.get("/api/admin/alumni-projects/:id", authenticateToken, requireAdmin, requireProjectDirectoryAccess, async (req, res) => { try { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid project id." }); await ensureAlumniProjectTables(); const row = await getSingleRow<AlumniProjectRow>(`SELECT p.*, officer_profile.name AS lead_officer_name, alumni_profile.name AS lead_alumni_name, 0 AS file_count FROM alumni_projects p LEFT JOIN profiles officer_profile ON officer_profile.id = p.lead_officer_id LEFT JOIN profiles alumni_profile ON alumni_profile.id = p.lead_alumni_id WHERE p.id = ?`, [id]); if (!row) return res.status(404).json({ error: "Project not found." }); const files = parseRows<AlumniProjectFileRow>(await db.query<AlumniProjectFileRow>("SELECT * FROM alumni_project_files WHERE project_id = ? ORDER BY uploaded_at DESC, created_at DESC", [id])); res.json({ ...mapAlumniProject(row), files: files.map((file) => ({ id: Number(file.id), name: file.file_name, type: file.file_type || "", path: normalizeStoredMedia(file.file_path || file.file_url || "") || file.file_path || file.file_url || "", url: normalizeStoredMedia(file.file_path || file.file_url || "") || file.file_path || file.file_url || "", category: file.file_category || "File", uploadedAt: file.uploaded_at || file.created_at, createdAt: file.created_at })) }); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
app.post("/api/admin/alumni-projects", authenticateToken, requireAdmin, requireProjectWriteAccess, async (req: AuthenticatedRequest, res) => { try { const project = normalizeProjectInput(req.body || {}); const result = await db.execute("INSERT INTO alumni_projects (title, description, category, batch_year, lead_officer_id, lead_alumni_id, organization_name, alumni_group, start_date, end_date, status, estimated_value, funding_source, beneficiaries, related_contribution_id, accomplishments, remarks, contribution_record_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [project.title, project.description, project.category, project.batchYear, project.leadOfficerId, project.leadAlumniId, project.organizationName, project.organizationName, project.startDate, project.endDate, project.status, project.estimatedValue, project.fundingSource, project.beneficiaries, project.relatedContributionId, project.accomplishments, project.remarks, project.relatedContributionId, req.user?.id || null]) as ResultSetHeader; res.status(201).json({ id: result.insertId }); } catch (e: unknown) { res.status(400).json({ error: getErrorMessage(e) }); } });
app.put("/api/admin/alumni-projects/:id", authenticateToken, requireAdmin, requireProjectWriteAccess, async (req, res) => { try { const id = Number(req.params.id), project = normalizeProjectInput(req.body || {}); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid project id." }); const result = await db.execute("UPDATE alumni_projects SET title=?, description=?, category=?, batch_year=?, lead_officer_id=?, lead_alumni_id=?, organization_name=?, alumni_group=?, start_date=?, end_date=?, status=?, estimated_value=?, funding_source=?, beneficiaries=?, related_contribution_id=?, accomplishments=?, remarks=?, contribution_record_id=? WHERE id=?", [project.title, project.description, project.category, project.batchYear, project.leadOfficerId, project.leadAlumniId, project.organizationName, project.organizationName, project.startDate, project.endDate, project.status, project.estimatedValue, project.fundingSource, project.beneficiaries, project.relatedContributionId, project.accomplishments, project.remarks, project.relatedContributionId, id]) as ResultSetHeader; if (!result.affectedRows) return res.status(404).json({ error: "Project not found." }); res.json({ success: true }); } catch (e: unknown) { res.status(400).json({ error: getErrorMessage(e) }); } });
app.delete("/api/admin/alumni-projects/:id", authenticateToken, requireAdmin, requireProjectWriteAccess, async (req, res) => { try { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid project id." }); const result = await db.execute("UPDATE alumni_projects SET status = 'Archived' WHERE id = ? AND status <> 'Archived'", [id]) as ResultSetHeader; if (!result.affectedRows) return res.status(404).json({ error: "Active project not found." }); res.status(204).send(); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } });
const uploadAlumniProjectFile = async (req: AuthenticatedRequest, res: express.Response) => { try { const id = Number(req.params.id), name = normalizeText(req.body?.fileName ?? req.body?.name) || "Project attachment", path = normalizeStoredMedia(String(req.body?.filePath || req.body?.path || req.body?.url || req.body?.dataUrl || "")), category = normalizeText(req.body?.category) || "Project File"; if (!Number.isInteger(id) || id <= 0 || !path) return res.status(400).json({ error: "A valid project and attachment are required." }); const project = await getSingleRow("SELECT id FROM alumni_projects WHERE id = ?", [id]); if (!project) return res.status(404).json({ error: "Project not found." }); const result = await db.execute("INSERT INTO alumni_project_files (project_id, file_name, file_path, file_type, file_url, file_category, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())", [id, name, path, normalizeText(req.body?.fileType ?? req.body?.type) || null, path, category, req.user?.id || null]) as ResultSetHeader; res.status(201).json({ id: result.insertId }); } catch (e: unknown) { res.status(400).json({ error: getErrorMessage(e) }); } };
app.post("/api/admin/alumni-projects/:id/upload-file", authenticateToken, requireAdmin, requireProjectWriteAccess, uploadAlumniProjectFile);
app.post("/api/admin/alumni-projects/:id/files", authenticateToken, requireAdmin, requireProjectWriteAccess, uploadAlumniProjectFile);
app.delete("/api/admin/alumni-projects/:projectId/files/:fileId", authenticateToken, requireAdmin, requireProjectWriteAccess, async (req, res) => { try { await db.execute("DELETE FROM alumni_project_files WHERE id = ? AND project_id = ?", [Number(req.params.fileId), Number(req.params.projectId)]); res.status(204).send(); } catch (e: unknown) { res.status(500).json({ error: getErrorMessage(e) }); } })
const ALUMNI_FEE_TYPE_STATUSES = ["Active", "Archived"] as const;
const ALUMNI_PAYMENT_STATUSES = ["Paid", "Unpaid"] as const;
const ALUMNI_COMPLETION_STATUSES = ["Complete", "Incomplete"] as const;
const PAYMENT_INSTRUCTION = "Please pay personally or in person to the assigned alumni officer or authorized staff. The system records payment completion only and does not process online payments.";

const normalizeFeeOption = (value: unknown, options: readonly string[], fallback: string) => {
    const text = normalizeText(value);
    return options.find((option) => option.toLowerCase() === text.toLowerCase()) || fallback;
};
const normalizeFeeTypeStatus = (value: unknown) => normalizeFeeOption(value, ALUMNI_FEE_TYPE_STATUSES, "Active");
const normalizePaymentStatus = (value: unknown) => normalizeFeeOption(value, ALUMNI_PAYMENT_STATUSES, "Paid");
const normalizeCompletionStatus = (value: unknown) => normalizeFeeOption(value, ALUMNI_COMPLETION_STATUSES, "");
const sameScopeValue = (a: unknown, b: unknown) => normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();

const mapAlumniFeeType = (row: AlumniFeeTypeRow) => ({
    id: Number(row.id),
    feeName: row.fee_name,
    amount: Number(row.amount || 0),
    description: row.description || "",
    applicableBatchYear: row.applicable_batch_year || "",
    applicableProgramId: row.applicable_program_id || "",
    dueDate: row.due_date || null,
    assignedOfficerId: row.assigned_officer_id || "",
    assignedOfficerName: row.officer_name || "Authorized staff",
    assignedOfficerEmail: row.officer_email || null,
    isRequired: normalizeBoolean(row.is_required, true),
    status: normalizeFeeTypeStatus(row.status),
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || "System user",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paymentInstruction: PAYMENT_INSTRUCTION
});

const getAlumniFeeTypeRows = async (query: Record<string, unknown> = {}) => {
    await ensureAlumniFeeRecordsTable();
    const where = [normalizeBoolean(query.includeArchived) ? "1 = 1" : "LOWER(f.status) <> 'archived'"];
    const params: DbParam[] = [];
    const search = normalizeText(query.search), batchYear = normalizeText(query.batchYear), program = normalizeText(query.program), officerId = normalizeText(query.assignedOfficerId);
    if (search) {
        const value = `%${search}%`;
        where.push("(LOWER(f.fee_name) LIKE LOWER(?) OR LOWER(COALESCE(f.description, '')) LIKE LOWER(?) OR LOWER(COALESCE(officer.name, '')) LIKE LOWER(?))");
        params.push(value, value, value);
    }
    if (batchYear) { where.push("LOWER(COALESCE(f.applicable_batch_year, '')) = LOWER(?)"); params.push(batchYear); }
    if (program) { where.push("LOWER(COALESCE(f.applicable_program_id, '')) = LOWER(?)"); params.push(program); }
    if (officerId) { where.push("f.assigned_officer_id = ?"); params.push(officerId); }
    if (normalizeText(query.status)) { where.push("LOWER(f.status) = LOWER(?)"); params.push(normalizeFeeTypeStatus(query.status)); }
    return parseRows<AlumniFeeTypeRow>(await db.query<AlumniFeeTypeRow>(
        `SELECT f.*, officer.name AS officer_name, officer.email AS officer_email, creator.name AS created_by_name
         FROM alumni_fee_types f
         LEFT JOIN profiles officer ON officer.id = f.assigned_officer_id
         LEFT JOIN profiles creator ON creator.id = f.created_by
         WHERE ${where.join(" AND ")}
         ORDER BY CASE WHEN f.status = 'Active' THEN 0 ELSE 1 END, COALESCE(f.due_date, '9999-12-31') ASC, f.created_at DESC`,
        params
    ));
};

const normalizeAlumniFeeTypeInput = (input: Record<string, unknown>) => {
    const feeName = normalizeText(input.feeName ?? input.fee_name);
    const amount = Number(input.amount);
    if (!feeName) throw new Error("Fee name is required.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid fee amount.");
    return {
        feeName,
        amount,
        description: normalizeText(input.description) || null,
        applicableBatchYear: normalizeText(input.applicableBatchYear ?? input.applicable_batch_year) || null,
        applicableProgramId: normalizeText(input.applicableProgramId ?? input.applicable_program_id) || null,
        dueDate: normalizeDateOnly(input.dueDate ?? input.due_date) || null,
        assignedOfficerId: normalizeText(input.assignedOfficerId ?? input.assigned_officer_id) || null,
        isRequired: input.isRequired === undefined && input.is_required === undefined ? true : normalizeBoolean(input.isRequired ?? input.is_required),
        status: normalizeFeeTypeStatus(input.status)
    };
};

const getActiveRequiredFeeTypes = async () => {
    return parseRows<AlumniFeeTypeRow>(await db.query<AlumniFeeTypeRow>(
        `SELECT f.*, officer.name AS officer_name, officer.email AS officer_email, creator.name AS created_by_name
         FROM alumni_fee_types f
         LEFT JOIN profiles officer ON officer.id = f.assigned_officer_id
         LEFT JOIN profiles creator ON creator.id = f.created_by
         WHERE LOWER(f.status) = 'active' AND COALESCE(f.is_required, 1) = 1
         ORDER BY COALESCE(f.due_date, '9999-12-31') ASC, f.fee_name ASC`
    ));
};

const getAlumniFeePaymentRows = async () => {
    return parseRows<AlumniFeePaymentRow>(await db.query<AlumniFeePaymentRow>(
        `SELECT p.*, receiver.name AS received_by_name
         FROM alumni_fee_payments p
         LEFT JOIN profiles receiver ON receiver.id = p.received_by`
    ));
};

const getAlumniRowsForFeeRecords = async () => {
    return parseRows<AlumniFeeRecordRow>(await db.query<AlumniFeeRecordRow>(
        `SELECT p.id AS alumni_id, p.name AS alumni_name, p.email AS alumni_email, p.student_id AS alumni_student_id, p.batch, p.course
         FROM profiles p
         INNER JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'alumni' AND COALESCE(ur.archived, 0) = 0
         GROUP BY p.id, p.name, p.email, p.student_id, p.batch, p.course
         ORDER BY p.name ASC`
    ));
};

const feeAppliesToAlumni = (fee: AlumniFeeTypeRow, alumni: AlumniFeeRecordRow) => {
    const batchMatches = !normalizeText(fee.applicable_batch_year) || sameScopeValue(fee.applicable_batch_year, alumni.batch);
    const programMatches = !normalizeText(fee.applicable_program_id) || sameScopeValue(fee.applicable_program_id, alumni.course);
    return batchMatches && programMatches;
};

const buildFeeRecordForAlumni = (alumni: AlumniFeeRecordRow, feeTypes: AlumniFeeTypeRow[], paymentMap: Map<string, AlumniFeePaymentRow>) => {
    const applicableFees = feeTypes.filter((fee) => feeAppliesToAlumni(fee, alumni));
    const mappedFees = applicableFees.map((fee) => {
        const payment = paymentMap.get(`${alumni.alumni_id}:${fee.id}`);
        const paid = Boolean(payment) && normalizePaymentStatus(payment?.status) === "Paid";
        return {
            ...mapAlumniFeeType(fee),
            paymentId: payment ? Number(payment.id) : null,
            paid,
            amountPaid: paid ? Number(payment?.amount_paid || 0) : 0,
            paidDate: paid ? payment?.paid_date || null : null,
            receivedBy: paid ? payment?.received_by || null : null,
            receivedByName: paid ? payment?.received_by_name || "Authorized staff" : null,
            paymentNote: paid ? payment?.payment_note || "" : ""
        };
    });
    const unpaidFees = mappedFees.filter((fee) => !fee.paid);
    const paidFees = mappedFees.filter((fee) => fee.paid);
    const status = unpaidFees.length === 0 ? "Complete" : "Incomplete";
    return {
        alumniId: alumni.alumni_id,
        alumni: {
            id: alumni.alumni_id,
            name: alumni.alumni_name || "Unknown alumni",
            email: alumni.alumni_email || null,
            studentId: alumni.alumni_student_id || null,
            batch: alumni.batch || null,
            program: alumni.course || null
        },
        status,
        requiredFeeCount: mappedFees.length,
        paidFeeCount: paidFees.length,
        unpaidFeeCount: unpaidFees.length,
        totalRequired: mappedFees.reduce((total, fee) => total + Number(fee.amount || 0), 0),
        totalPaid: paidFees.reduce((total, fee) => total + Number(fee.amountPaid || 0), 0),
        totalUnpaid: unpaidFees.reduce((total, fee) => total + Number(fee.amount || 0), 0),
        requiredFees: mappedFees,
        paidFees,
        unpaidFees,
        paymentInstruction: PAYMENT_INSTRUCTION
    };
};

type AlumniFeeCompletionRecord = ReturnType<typeof buildFeeRecordForAlumni>;

const getAlumniFeeCompletionRecords = async (query: Record<string, unknown> = {}) => {
    await ensureAlumniFeeRecordsTable();
    const [alumniRows, feeTypes, payments] = await Promise.all([getAlumniRowsForFeeRecords(), getActiveRequiredFeeTypes(), getAlumniFeePaymentRows()]);
    const paymentMap = new Map(payments.map((payment) => [`${payment.alumni_id}:${payment.fee_type_id}`, payment]));
    let records = alumniRows.map((alumni) => buildFeeRecordForAlumni(alumni, feeTypes, paymentMap));
    const search = normalizeText(query.search).toLowerCase(), batchYear = normalizeText(query.batchYear), program = normalizeText(query.program), officerId = normalizeText(query.assignedOfficerId), status = normalizeCompletionStatus(query.status);
    if (search) records = records.filter((record) => [record.alumni.name, record.alumni.email || "", record.alumni.studentId || "", ...record.requiredFees.map((fee) => fee.feeName)].some((value) => value.toLowerCase().includes(search)));
    if (batchYear) records = records.filter((record) => sameScopeValue(record.alumni.batch, batchYear));
    if (program) records = records.filter((record) => sameScopeValue(record.alumni.program, program));
    if (officerId) records = records.filter((record) => record.requiredFees.some((fee) => fee.assignedOfficerId === officerId));
    if (status) records = records.filter((record) => record.status === status);
    return records;
};

const summarizeAlumniFeeRecords = (records: AlumniFeeCompletionRecord[]) => ({
    totalAlumni: records.length,
    completeCount: records.filter((record) => record.status === "Complete").length,
    incompleteCount: records.filter((record) => record.status === "Incomplete").length,
    totalRequired: records.reduce((total, record) => total + record.totalRequired, 0),
    totalCollected: records.reduce((total, record) => total + record.totalPaid, 0),
    totalUnpaid: records.reduce((total, record) => total + record.totalUnpaid, 0),
    requiredFeeAssignments: records.reduce((total, record) => total + record.requiredFeeCount, 0),
    paidFeeAssignments: records.reduce((total, record) => total + record.paidFeeCount, 0),
    unpaidFeeAssignments: records.reduce((total, record) => total + record.unpaidFeeCount, 0),
    byStatus: ALUMNI_COMPLETION_STATUSES.map((label) => ({ label, value: records.filter((record) => record.status === label).length }))
});

app.get("/api/admin/donations/fee-records/types", authenticateToken, requireAdmin, async (req, res) => {
    try { res.json((await getAlumniFeeTypeRows(req.query as Record<string, unknown>)).map(mapAlumniFeeType)); }
    catch (err: unknown) { console.error("GET FEE TYPES ERROR:", err); res.status(500).json({ error: getErrorMessage(err) }); }
});
app.post("/api/admin/donations/fee-records/types", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const fee = normalizeAlumniFeeTypeInput(req.body || {});
        const result = await db.execute(
            "INSERT INTO alumni_fee_types (fee_name, amount, description, applicable_batch_year, applicable_program_id, due_date, assigned_officer_id, is_required, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [fee.feeName, fee.amount, fee.description, fee.applicableBatchYear, fee.applicableProgramId, fee.dueDate, fee.assignedOfficerId, fee.isRequired ? 1 : 0, fee.status, req.user?.id || null]
        ) as ResultSetHeader;
        res.status(201).json({ id: result.insertId });
    } catch (err: unknown) { res.status(400).json({ error: getErrorMessage(err) }); }
});
app.put("/api/admin/donations/fee-records/types/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid fee type id." });
        const fee = normalizeAlumniFeeTypeInput(req.body || {});
        const result = await db.execute(
            "UPDATE alumni_fee_types SET fee_name = ?, amount = ?, description = ?, applicable_batch_year = ?, applicable_program_id = ?, due_date = ?, assigned_officer_id = ?, is_required = ?, status = ? WHERE id = ?",
            [fee.feeName, fee.amount, fee.description, fee.applicableBatchYear, fee.applicableProgramId, fee.dueDate, fee.assignedOfficerId, fee.isRequired ? 1 : 0, fee.status, id]
        ) as ResultSetHeader;
        if (!result.affectedRows) return res.status(404).json({ error: "Fee type not found." });
        res.json({ success: true });
    } catch (err: unknown) { res.status(400).json({ error: getErrorMessage(err) }); }
});
app.delete("/api/admin/donations/fee-records/types/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid fee type id." });
        const result = await db.execute("UPDATE alumni_fee_types SET status = 'Archived' WHERE id = ? AND LOWER(status) <> 'archived'", [id]) as ResultSetHeader;
        if (!result.affectedRows) return res.status(404).json({ error: "Active fee type not found." });
        res.status(204).send();
    } catch (err: unknown) { res.status(500).json({ error: getErrorMessage(err) }); }
});
app.get("/api/admin/donations/fee-records/reports/summary", authenticateToken, requireAdmin, async (req, res) => {
    try { res.json(summarizeAlumniFeeRecords(await getAlumniFeeCompletionRecords(req.query as Record<string, unknown>))); }
    catch (err: unknown) { console.error("GET FEE RECORD SUMMARY ERROR:", err); res.status(500).json({ error: getErrorMessage(err) }); }
});
app.get("/api/admin/donations/fee-records/export/:format", authenticateToken, requireAdmin, async (req, res) => {
    try { res.json({ format: req.params.format, records: await getAlumniFeeCompletionRecords(req.query as Record<string, unknown>) }); }
    catch (err: unknown) { res.status(500).json({ error: getErrorMessage(err) }); }
});
app.get("/api/admin/donations/fee-records", authenticateToken, requireAdmin, async (req, res) => {
    try { res.json(await getAlumniFeeCompletionRecords(req.query as Record<string, unknown>)); }
    catch (err: unknown) { console.error("GET FEE RECORDS ERROR:", err); res.status(500).json({ error: getErrorMessage(err) }); }
});
app.post("/api/admin/donations/fee-records/payments/mark-paid", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureAlumniFeeRecordsTable();
        const alumniId = normalizeText(req.body?.alumniId), feeTypeId = Number(req.body?.feeTypeId), paidDate = normalizeDateOnly(req.body?.paidDate) || new Date().toISOString().slice(0, 10);
        if (!alumniId) return res.status(400).json({ error: "Select an alumni profile." });
        if (!Number.isInteger(feeTypeId) || feeTypeId <= 0) return res.status(400).json({ error: "Select a valid fee." });
        const fee = await getSingleRow<AlumniFeeTypeRow>("SELECT f.*, NULL AS officer_name, NULL AS officer_email, NULL AS created_by_name FROM alumni_fee_types f WHERE id = ? AND LOWER(status) = 'active'", [feeTypeId]);
        if (!fee) return res.status(404).json({ error: "Active fee type not found." });
        const amountPaid = Number(req.body?.amountPaid ?? fee.amount);
        if (!Number.isFinite(amountPaid) || amountPaid <= 0) return res.status(400).json({ error: "Enter a valid paid amount." });
        const note = normalizeText(req.body?.paymentNote ?? req.body?.payment_note) || null;
        const result = await db.execute(
            `INSERT INTO alumni_fee_payments (alumni_id, fee_type_id, amount_paid, paid_date, received_by, payment_note, status)
             VALUES (?, ?, ?, ?, ?, ?, 'Paid')
             ON DUPLICATE KEY UPDATE amount_paid = VALUES(amount_paid), paid_date = VALUES(paid_date), received_by = VALUES(received_by), payment_note = VALUES(payment_note), status = 'Paid', updated_at = CURRENT_TIMESTAMP`,
            [alumniId, feeTypeId, amountPaid, paidDate, req.user?.id || null, note]
        ) as ResultSetHeader;
        res.status(201).json({ id: result.insertId, success: true });
    } catch (err: unknown) { res.status(400).json({ error: getErrorMessage(err) }); }
});
app.post("/api/admin/donations/fee-records/payments/mark-unpaid", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const alumniId = normalizeText(req.body?.alumniId), feeTypeId = Number(req.body?.feeTypeId);
        if (!alumniId || !Number.isInteger(feeTypeId) || feeTypeId <= 0) return res.status(400).json({ error: "Select a valid alumni and fee." });
        await db.execute("UPDATE alumni_fee_payments SET status = 'Unpaid', updated_at = CURRENT_TIMESTAMP WHERE alumni_id = ? AND fee_type_id = ?", [alumniId, feeTypeId]);
        res.json({ success: true });
    } catch (err: unknown) { res.status(400).json({ error: getErrorMessage(err) }); }
});
app.get("/api/alumni/fee-records/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) return res.sendStatus(401);
        await ensureAlumniFeeRecordsTable();
        const alumni = await getSingleRow<AlumniFeeRecordRow>(
            "SELECT p.id AS alumni_id, p.name AS alumni_name, p.email AS alumni_email, p.student_id AS alumni_student_id, p.batch, p.course FROM profiles p WHERE p.id = ?",
            [req.user.id]
        );
        if (!alumni) return res.status(404).json({ error: "Alumni profile not found." });
        const [feeTypes, payments] = await Promise.all([getActiveRequiredFeeTypes(), getAlumniFeePaymentRows()]);
        const paymentMap = new Map(payments.map((payment) => [`${payment.alumni_id}:${payment.fee_type_id}`, payment]));
        res.json(buildFeeRecordForAlumni(alumni, feeTypes, paymentMap));
    } catch (err: unknown) { res.status(500).json({ error: getErrorMessage(err) }); }
});/* =========================
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

app.post("/api/settings/donation/verify-password", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user?.id) {
            return res.sendStatus(401);
        }

        const { password } = req.body || {};
        const normalizedPassword = String(password || "");

        if (!normalizedPassword) {
            return res.status(400).json({ error: "Password is required." });
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

        const matches = await bcrypt.compare(normalizedPassword, String(account.password_hash));
        if (!matches) {
            return res.status(401).json({ error: "Incorrect password. Please try again." });
        }

        res.json({ success: true });
    } catch (err: unknown) {
        console.error("VERIFY DONATION SETTINGS PASSWORD ERROR:", err);
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
            const normalizedType = normalizeAnnouncementType(String(row.type || ""));
            const duration = withDurationFields(row as Record<string, unknown>, { ignoreDuration: normalizedType === "announcement" });
            return {
            ...duration,
            id: String(row.id),
            type: normalizedType,
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
        const usesDurationWindow = normalizedType !== "announcement";
        const enabledInterest = normalizedType === "event" || normalizeBoolean(interestEnabled ?? interest_enabled);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);
        const durationWindow = usesDurationWindow ? getDurationWindowFromBody(req.body || {}) : getDurationWindowFromBody({});
        const effectiveDate = normalizeDateOnly(date) || (durationWindow.start ? formatManilaDate(durationWindow.start) : "");
        const effectiveTime = usesDurationWindow ? time || (durationWindow.start ? formatManilaTime(durationWindow.start).slice(0, 5) : null) : null;
        const normalizedStatus = normalizeStatus(status, getAnnouncementStatusFallback(normalizedType));
        const role = await getRequestRole(req);
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
            normalizedStatus,
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
                    ...withDurationFields(newEvent, { ignoreDuration: normalizeAnnouncementType(String(newEvent.type || normalizedType)) === "announcement" }),
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
        const role = await getRequestRole(req);
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
        const eventType = normalizeAnnouncementType(String(event.type || ""));
        const eventDuration = withDurationFields(event, { ignoreDuration: eventType === "announcement" });
        if (!canModerate && eventDuration.computed_status === "Archived" && String(event.created_by || "") !== req.user.id) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({
            ...eventDuration,
            id: String(event.id),
            type: eventType,
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

        const role = await getRequestRole(req);
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

        const role = await getRequestRole(req);
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
        const usesDurationWindow = normalizedType !== "announcement";
        const enabledInterest = normalizedType === "event" || normalizeBoolean(interestEnabled ?? interest_enabled);
        const normalizedAudienceScope = normalizeAnnouncementAudienceScope(audienceScope);
        const normalizedAudienceValue = normalizeAnnouncementAudienceValue(normalizedAudienceScope, audienceValue);
        const durationWindow = usesDurationWindow ? getDurationWindowFromBody(req.body || {}) : getDurationWindowFromBody({});
        const effectiveDate = normalizeDateOnly(date) || (durationWindow.start ? formatManilaDate(durationWindow.start) : "");
        const effectiveTime = usesDurationWindow ? time || (durationWindow.start ? formatManilaTime(durationWindow.start).slice(0, 5) : null) : null;
        const normalizedStatus = normalizeStatus(status, getAnnouncementStatusFallback(normalizedType));

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
            ...(hasArchivedAt && ((durationWindow.end && durationWindow.end.getTime() > Date.now()) || (normalizedType === "announcement" && normalizedStatus !== "archived")) ? ["archived_at = NULL"] : [])
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
                    normalizedStatus,
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
                    normalizedStatus,
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
                    ...withDurationFields(updated, { ignoreDuration: normalizeAnnouncementType(String(updated.type || normalizedType)) === "announcement" }),
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

        const content = await getSingleRow(`SELECT type FROM ${announcementTable} WHERE id = ?`, [eventId]);
        if (!content) return res.status(404).json({ error: "Announcement not found" });
        if (normalizeAnnouncementType(String(content.type || "")) === "announcement") {
            return res.status(400).json({ error: "Announcements do not use archive. Delete the announcement to remove it." });
        }

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

        const role = await getRequestRole(req);
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
        const role = await getRequestRole(req);
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

// Alumni officers management
const normalizeAlumniOfficerPayload = async (input: Record<string, unknown>) => {
    const alumniId = normalizeText(input.alumniId) || null;
    const position = normalizeManagedOfficerPosition(input.position);
    const customPosition = normalizeText(input.customPosition) || null;
    const status = normalizeManagedOfficerStatus(input.status || "Active");
    const termStart = normalizeOfficerDate(input.termStart);
    const termEnd = normalizeOfficerDate(input.termEnd);
    let fullName = normalizeText(input.fullName);
    let email = normalizeEmail(input.email) || null;
    let departmentId = normalizeText(input.departmentId) || null;
    let programId = normalizeText(input.programId) || null;
    let batchYear = normalizeBatch(input.batchYear) || null;
    let contactNumber = normalizePhone(input.contactNumber) || null;
    let photo = input.photo ? normalizeStoredMedia(String(input.photo)) : null;

    if (!position || !ALUMNI_OFFICER_POSITIONS.has(position)) throw new Error("Select a supported officer position");
    if (position === "Custom Position" && !customPosition) throw new Error("Provide the custom officer position");
    if (!status || !OFFICER_STATUS_VALUES.has(status)) throw new Error("Select a valid officer status");
    if (termStart && termEnd && termStart > termEnd) throw new Error("Term end must be on or after term start");

    if (alumniId) {
        const profile = await getSingleRow<QueryRow>(
            "SELECT id, name, email, course, batch, contact_number, photo FROM profiles WHERE id = ?",
            [alumniId]
        );
        if (!profile) throw new Error("The selected alumni profile could not be found");
        fullName = fullName || normalizeText(profile.name);
        email = email || normalizeEmail(profile.email) || null;
        departmentId = departmentId || normalizeText(profile.course) || null;
        programId = programId || normalizeText(profile.course) || null;
        batchYear = batchYear || normalizeBatch(profile.batch) || null;
        contactNumber = contactNumber || normalizePhone(profile.contact_number) || null;
        photo = photo || normalizeStoredMedia(profile.photo ? String(profile.photo) : null);
    }

    if (!fullName) throw new Error("Officer full name is required");

    return {
        alumniId,
        fullName,
        position,
        customPosition: position === "Custom Position" ? customPosition : null,
        batchYear,
        departmentId,
        programId,
        contactNumber,
        email,
        photo,
        termStart,
        termEnd,
        status,
        remarks: normalizeText(input.remarks) || null
    };
};

app.get("/api/alumni-officers", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const search = normalizeText(req.query.search);
        const batchYear = normalizeText(req.query.batchYear || req.query.year);
        const position = normalizeManagedOfficerPosition(req.query.position);
        const department = normalizeText(req.query.department);
        const status = normalizeManagedOfficerStatus(req.query.status);
        const includeArchived = normalizeBoolean(req.query.includeArchived) || normalizeBoolean(req.query.history);
        const where: string[] = [];
        const params: DbParam[] = [];

        if (!includeArchived) where.push("is_archived = 0");
        if (search) {
            where.push("LOWER(CONCAT_WS(' ', full_name, email, position, custom_position, batch_year, department_id, program_id)) LIKE ?");
            params.push(`%${search.toLowerCase()}%`);
        }
        if (batchYear) {
            where.push("batch_year = ?");
            params.push(batchYear);
        }
        if (position) {
            where.push("position = ?");
            params.push(position);
        }
        if (department) {
            where.push("department_id = ?");
            params.push(department);
        }
        if (status) {
            where.push("status = ?");
            params.push(status);
        }

        const rows = parseRows<AlumniOfficerRow>(await db.query<AlumniOfficerRow>(
            `SELECT * FROM alumni_officers
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY is_archived ASC, term_start DESC, created_at DESC, full_name ASC`,
            params
        ));

        res.json(rows.map(mapAlumniOfficer));
    } catch (err: unknown) {
        console.error("GET ALUMNI OFFICERS ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.get("/api/alumni-officers/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid officer id" });

        const officer = await getAlumniOfficerById(id);
        if (!officer) return res.status(404).json({ error: "Officer not found" });
        res.json(mapAlumniOfficer(officer));
    } catch (err: unknown) {
        console.error("GET ALUMNI OFFICER ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/alumni-officers", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const officer = await normalizeAlumniOfficerPayload(req.body || {});
        const result = await db.execute(
            `INSERT INTO alumni_officers (
                alumni_id, full_name, position, custom_position, batch_year, department_id, program_id,
                contact_number, email, photo, term_start, term_end, status, remarks, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                officer.alumniId, officer.fullName, officer.position, officer.customPosition, officer.batchYear,
                officer.departmentId, officer.programId, officer.contactNumber, officer.email, officer.photo,
                officer.termStart, officer.termEnd, officer.status, officer.remarks, req.user?.id || null
            ]
        ) as ResultSetHeader;
        const saved = await getAlumniOfficerById(Number(result.insertId));
        res.status(201).json(saved ? mapAlumniOfficer(saved) : { id: Number(result.insertId) });
    } catch (err: unknown) {
        const message = getErrorMessage(err);
        res.status(message.includes("required") || message.includes("Select") || message.includes("Term") || message.includes("custom") || message.includes("selected") ? 400 : 500)
            .json({ error: message });
    }
});

app.put("/api/alumni-officers/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid officer id" });
        if (!await getAlumniOfficerById(id)) return res.status(404).json({ error: "Officer not found" });

        const officer = await normalizeAlumniOfficerPayload(req.body || {});
        await db.execute(
            `UPDATE alumni_officers SET
                alumni_id = ?, full_name = ?, position = ?, custom_position = ?, batch_year = ?, department_id = ?,
                program_id = ?, contact_number = ?, email = ?, photo = ?, term_start = ?, term_end = ?, status = ?, remarks = ?
             WHERE id = ?`,
            [
                officer.alumniId, officer.fullName, officer.position, officer.customPosition, officer.batchYear,
                officer.departmentId, officer.programId, officer.contactNumber, officer.email, officer.photo,
                officer.termStart, officer.termEnd, officer.status, officer.remarks, id
            ]
        );
        const saved = await getAlumniOfficerById(id);
        res.json(saved ? mapAlumniOfficer(saved) : { id });
    } catch (err: unknown) {
        const message = getErrorMessage(err);
        res.status(message.includes("required") || message.includes("Select") || message.includes("Term") || message.includes("custom") || message.includes("selected") ? 400 : 500)
            .json({ error: message });
    }
});

app.post("/api/alumni-officers/:id/archive", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid officer id" });
        const result = await db.execute(
            "UPDATE alumni_officers SET is_archived = 1, archived_at = NOW(), archived_by = ? WHERE id = ? AND is_archived = 0",
            [req.user?.id || null, id]
        ) as ResultSetHeader;
        if (!result.affectedRows) return res.status(404).json({ error: "Active officer not found" });
        const saved = await getAlumniOfficerById(id);
        res.json(saved ? mapAlumniOfficer(saved) : { id });
    } catch (err: unknown) {
        console.error("ARCHIVE ALUMNI OFFICER ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.post("/api/alumni-officers/:id/restore", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid officer id" });
        const result = await db.execute(
            "UPDATE alumni_officers SET is_archived = 0, archived_at = NULL, archived_by = NULL WHERE id = ? AND is_archived = 1",
            [id]
        ) as ResultSetHeader;
        if (!result.affectedRows) return res.status(404).json({ error: "Archived officer not found" });
        const saved = await getAlumniOfficerById(id);
        res.json(saved ? mapAlumniOfficer(saved) : { id });
    } catch (err: unknown) {
        console.error("RESTORE ALUMNI OFFICER ERROR:", err);
        res.status(500).json({ error: getErrorMessage(err) });
    }
});

app.delete("/api/alumni-officers/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid officer id" });
        const result = await db.execute("DELETE FROM alumni_officers WHERE id = ?", [id]) as ResultSetHeader;
        if (!result.affectedRows) return res.status(404).json({ error: "Officer not found" });
        res.status(204).send();
    } catch (err: unknown) {
        console.error("DELETE ALUMNI OFFICER ERROR:", err);
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
                email: normalizeEmail(item?.email),
                course: normalizeText(item?.course),
                batch: normalizeBatch(item?.batch),
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
            const profile = assignment.alumniId ? profileMap.get(assignment.alumniId) : null;
            if (assignment.alumniId && !profile) {
                continue;
            }

            const snapshotName = assignment.name || (profile?.name ? String(profile.name) : "");
            if (!snapshotName) {
                continue;
            }

            await conn.query(
                `INSERT INTO officers
                    (school_year_id, alumni_id, position, custom_position, display_order, snapshot_name, snapshot_email, snapshot_course, snapshot_batch, snapshot_contact_number, snapshot_photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    schoolYearId,
                    assignment.alumniId || null,
                    assignment.position,
                    assignment.customPosition,
                    assignment.displayOrder,
                    snapshotName,
                    assignment.email || (profile?.email ? String(profile.email) : null),
                    assignment.course || (profile?.course ? String(profile.course) : null),
                    assignment.batch || (profile?.batch ? String(profile.batch) : null),
                    assignment.contactNumber || (profile?.contact_number ? String(profile.contact_number) : null),
                    assignment.photoBase64 !== null
                        ? assignment.photoBase64
                        : normalizeStoredMedia(profile?.photo ? String(profile.photo) : null)
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
               AND NOT (title = ? AND COALESCE(category, '') = ?)
             ORDER BY created_at DESC
             LIMIT 30`,
            [
                req.user.id,
                DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_TITLE,
                DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_CATEGORY
            ]
        ));

        const unreadRow = await getSingleRow(
            `SELECT COUNT(*) AS unreadCount
             FROM user_notifications
             WHERE user_id = ?
               AND is_read = 0
               AND NOT (title = ? AND COALESCE(category, '') = ?)`,
            [
                req.user.id,
                DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_TITLE,
                DEPRECATED_SURVEY_RESPONSE_NOTIFICATION_CATEGORY
            ]
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

app.get("/api/admin/email-queue/settings", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const settings = await getEmailQueueSettings();
        const stats = await getEmailQueueStats();
        res.json({ settings, stats });
    } catch (err: unknown) {
        console.error("GET EMAIL QUEUE SETTINGS ERROR:", err);
        res.status(500).json({ error: "Unable to load email queue settings." });
    }
});

app.put("/api/admin/email-queue/settings", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const settings = await saveEmailQueueSettings(req.body || {});
        const stats = await getEmailQueueStats();
        res.json({ success: true, message: "Email queue settings saved.", settings, stats });
    } catch (err: unknown) {
        console.error("SAVE EMAIL QUEUE SETTINGS ERROR:", err);
        res.status(500).json({ error: "Unable to save email queue settings." });
    }
});

app.get("/api/admin/email-queue", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        await ensureEmailQueueTables();
        const rows = parseRows(await db.query(
            `SELECT id, alumni_id, recipient_email, recipient_name, email_purpose, reminder_stage, priority, subject, status, scheduled_for, attempts, last_attempt_at, sent_at, error_message, created_at
             FROM email_queue
             ORDER BY created_at DESC
             LIMIT 100`
        ));
        res.json({ rows, stats: await getEmailQueueStats() });
    } catch (err: unknown) {
        console.error("GET EMAIL QUEUE ERROR:", err);
        res.status(500).json({ error: "Unable to load email queue." });
    }
});

app.post("/api/admin/email-queue/enqueue-tracer-reminders", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        const result = await enqueueDueTracerReminders({ force: true, createdBy: req.user?.id || null });
        res.json({ success: true, message: `${result.queued} tracer reminder${result.queued === 1 ? "" : "s"} queued.`, ...result, stats: await getEmailQueueStats() });
    } catch (err: unknown) {
        console.error("ENQUEUE TRACER REMINDERS ERROR:", err);
        res.status(500).json({ error: "Unable to queue tracer reminders." });
    }
});

app.post("/api/admin/email-queue/process", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const result = await processEmailQueue({ force: true });
        res.json({ success: true, message: `${result.sent} queued email${result.sent === 1 ? "" : "s"} sent.`, ...result, stats: await getEmailQueueStats() });
    } catch (err: unknown) {
        console.error("PROCESS EMAIL QUEUE ERROR:", err);
        res.status(500).json({ error: "Unable to process email queue." });
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










