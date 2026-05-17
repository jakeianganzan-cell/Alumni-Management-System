import "./env";
import mysql, { type PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type DbValue = string | number | boolean | Date | null;

type AlumniSeed = {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  course: "BTLED" | "BECED" | "BS ENTREP" | "BSM";
  batchYear: string;
  employmentStatus: string;
  profileImage: string;
  contactNumber: string;
};

type AdminSeed = {
  id: string;
  fullName: string;
  email: string;
  role: "president" | "pio";
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || "ustp_alumni";
const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "";
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || "Password123!";

const parseBooleanEnv = (value: string | undefined) =>
  ["1", "true", "yes", "require", "required"].includes(String(value || "").trim().toLowerCase());

const DB_SSL_CA = process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA;
const DB_SSL_CA_FILE = process.env.DB_SSL_CA_FILE || process.env.MYSQL_SSL_CA_FILE;
const DB_SSL_ENABLED =
  parseBooleanEnv(process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED) ||
  Boolean(DB_SSL_CA || DB_SSL_CA_FILE);
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const readSslCa = () => {
  const caValue = DB_SSL_CA?.trim();

  if (caValue) {
    if (caValue.includes("BEGIN CERTIFICATE")) {
      return caValue.replace(/\\n/g, "\n");
    }

    const caPath = path.isAbsolute(caValue) ? caValue : path.resolve(currentDirPath, caValue);

    if (fs.existsSync(caPath)) {
      return fs.readFileSync(caPath, "utf8");
    }

    return caValue.replace(/\\n/g, "\n");
  }

  const caFilePath = DB_SSL_CA_FILE
    ? path.resolve(currentDirPath, DB_SSL_CA_FILE)
    : path.resolve(currentDirPath, "cert", "ca.pem");

  return fs.existsSync(caFilePath) ? fs.readFileSync(caFilePath, "utf8") : undefined;
};

const getSslConfig = () => {
  if (!DB_SSL_ENABLED) return undefined;
  const ca = readSslCa();

  return {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
    ...(ca ? { ca } : {}),
  };
};

const escapeIdentifier = (value: string) => `\`${value.replace(/`/g, "``")}\``;

const adminUsers: AdminSeed[] = [
  {
    id: "11111111-1111-4111-8111-000000000001",
    fullName: "Atty. Marina Salcedo",
    email: "admin.president@saccalumni.local",
    role: "president",
  },
  {
    id: "11111111-1111-4111-8111-000000000002",
    fullName: "Noel Bataluna",
    email: "admin.pio@saccalumni.local",
    role: "pio",
  },
];

const alumni: AlumniSeed[] = [
  {
    id: "22222222-2222-4222-8222-000000000001",
    fullName: "Jessa Marie Cabahug",
    email: "jessa.cabahug@saccalumni.local",
    studentId: "2018-0001",
    course: "BTLED",
    batchYear: "2018",
    employmentStatus: "Employed - Public School Teacher",
    profileImage: "https://ui-avatars.com/api/?name=Jessa+Marie+Cabahug&background=550000&color=fff",
    contactNumber: "09171230001",
  },
  {
    id: "22222222-2222-4222-8222-000000000002",
    fullName: "Mark Anthony Paderanga",
    email: "mark.paderanga@saccalumni.local",
    studentId: "2019-0002",
    course: "BS ENTREP",
    batchYear: "2019",
    employmentStatus: "Self-employed - Food Cart Owner",
    profileImage: "https://ui-avatars.com/api/?name=Mark+Anthony+Paderanga&background=550000&color=fff",
    contactNumber: "09171230002",
  },
  {
    id: "22222222-2222-4222-8222-000000000003",
    fullName: "Kimberly Tampus",
    email: "kimberly.tampus@saccalumni.local",
    studentId: "2020-0003",
    course: "BECED",
    batchYear: "2020",
    employmentStatus: "Employed - Day Care Worker",
    profileImage: "https://ui-avatars.com/api/?name=Kimberly+Tampus&background=6b7280&color=fff",
    contactNumber: "09171230003",
  },
  {
    id: "22222222-2222-4222-8222-000000000004",
    fullName: "Rodel Saavedra",
    email: "rodel.saavedra@saccalumni.local",
    studentId: "2021-0004",
    course: "BSM",
    batchYear: "2021",
    employmentStatus: "Employed - Rural Health Unit Staff",
    profileImage: "https://ui-avatars.com/api/?name=Rodel+Saavedra&background=374151&color=fff",
    contactNumber: "09171230004",
  },
  {
    id: "22222222-2222-4222-8222-000000000005",
    fullName: "Angelica Mae Ybañez",
    email: "angelica.ybanez@saccalumni.local",
    studentId: "2022-0005",
    course: "BTLED",
    batchYear: "2022",
    employmentStatus: "Employed - Skills Trainer",
    profileImage: "https://ui-avatars.com/api/?name=Angelica+Mae+Ybanez&background=550000&color=fff",
    contactNumber: "09171230005",
  },
  {
    id: "22222222-2222-4222-8222-000000000006",
    fullName: "Christian Dela Peña",
    email: "christian.delapena@saccalumni.local",
    studentId: "2023-0006",
    course: "BS ENTREP",
    batchYear: "2023",
    employmentStatus: "Employed - Branch Sales Associate",
    profileImage: "https://ui-avatars.com/api/?name=Christian+Dela+Pena&background=991b1b&color=fff",
    contactNumber: "09171230006",
  },
  {
    id: "22222222-2222-4222-8222-000000000007",
    fullName: "Patricia Lumantas",
    email: "patricia.lumantas@saccalumni.local",
    studentId: "2024-0007",
    course: "BECED",
    batchYear: "2024",
    employmentStatus: "Employed - Preschool Assistant",
    profileImage: "https://ui-avatars.com/api/?name=Patricia+Lumantas&background=4b5563&color=fff",
    contactNumber: "09171230007",
  },
  {
    id: "22222222-2222-4222-8222-000000000008",
    fullName: "Junrey Abellanosa",
    email: "junrey.abellanosa@saccalumni.local",
    studentId: "2024-0008",
    course: "BSM",
    batchYear: "2024",
    employmentStatus: "Employed - Clinic Assistant",
    profileImage: "https://ui-avatars.com/api/?name=Junrey+Abellanosa&background=111827&color=fff",
    contactNumber: "09171230008",
  },
  {
    id: "22222222-2222-4222-8222-000000000009",
    fullName: "Ma. Lourdes Quijano",
    email: "lourdes.quijano@saccalumni.local",
    studentId: "2017-0009",
    course: "BTLED",
    batchYear: "2017",
    employmentStatus: "Employed - TESDA Assessor",
    profileImage: "https://ui-avatars.com/api/?name=Ma+Lourdes+Quijano&background=550000&color=fff",
    contactNumber: "09171230009",
  },
  {
    id: "22222222-2222-4222-8222-000000000010",
    fullName: "Brian Estrella",
    email: "brian.estrella@saccalumni.local",
    studentId: "2016-0010",
    course: "BS ENTREP",
    batchYear: "2016",
    employmentStatus: "Employed - Cooperative Manager",
    profileImage: "https://ui-avatars.com/api/?name=Brian+Estrella&background=550000&color=fff",
    contactNumber: "09171230010",
  },
];

const userIds = [...adminUsers.map((admin) => admin.id), ...alumni.map((item) => item.id)];
const userEmails = [...adminUsers.map((admin) => admin.email), ...alumni.map((item) => item.email)];
const adminIds = adminUsers.map((admin) => admin.id);
const alumniIds = alumni.map((item) => item.id);
const announcementIds = Array.from({ length: 18 }, (_, index) => 6101 + index);
const eventIds = announcementIds.slice(0, 8);
const achievementIds = Array.from({ length: 10 }, (_, index) => 7101 + index);
const wallPostIds = Array.from({ length: 20 }, (_, index) => 8101 + index);
const wallCommentIds = Array.from({ length: 50 }, (_, index) => 9001 + index);
const surveyIds = Array.from({ length: 6 }, (_, index) => 9101 + index);
const surveyQuestionIds = Array.from({ length: 18 }, (_, index) => 9201 + index);
const dashboardSlideIds = Array.from({ length: 4 }, (_, index) => 9501 + index);
const eventCommentIds = Array.from({ length: 24 }, (_, index) => 12001 + index);
const officerSchoolYearLabels = ["2024 - 2025", "2025 - 2026"];

const image = (slug: string) => `https://images.unsplash.com/${slug}?auto=format&fit=crop&w=1200&q=80`;

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: getSslConfig(),
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(DB_NAME)}`);
  await connection.end();
}

async function ensureColumn(conn: PoolConnection, table: string, column: string, definition: string) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column],
  );

  if (Number(rows[0]?.count || 0) === 0) {
    await conn.query(`ALTER TABLE ${escapeIdentifier(table)} ADD COLUMN ${definition}`);
  }
}

async function createTables(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      student_id VARCHAR(50) UNIQUE,
      course VARCHAR(255),
      batch VARCHAR(10),
      contact_number VARCHAR(50),
      photo LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id VARCHAR(36) PRIMARY KEY,
      role VARCHAR(50) NOT NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS alumni (
      id VARCHAR(36) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      course VARCHAR(100) NOT NULL,
      batch_year VARCHAR(10) NOT NULL,
      employment_status VARCHAR(255),
      profile_image LONGTEXT,
      FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id VARCHAR(36) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) NOT NULL,
      FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      date DATE,
      time TIME,
      venue VARCHAR(255),
      type VARCHAR(100),
      google_form_link TEXT,
      organizer VARCHAR(255),
      image_url LONGTEXT,
      status VARCHAR(50) DEFAULT 'upcoming',
      approval_status VARCHAR(50) NOT NULL DEFAULT 'approved',
      created_by VARCHAR(36) DEFAULT NULL,
      approved_by VARCHAR(36) DEFAULT NULL,
      rejection_reason TEXT,
      audience_scope VARCHAR(20) NOT NULL DEFAULT 'all',
      audience_value VARCHAR(255) DEFAULT NULL,
      capacity INT DEFAULT 0,
      views INT DEFAULT 0,
      success_score INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      date DATE,
      time TIME,
      type VARCHAR(100),
      organizer VARCHAR(255),
      image_url LONGTEXT,
      capacity INT DEFAULT 0,
      views INT DEFAULT 0,
      success_score INT DEFAULT 0,
      event_date DATE NOT NULL,
      event_time TIME,
      venue VARCHAR(255),
      event_type VARCHAR(100),
      status VARCHAR(50) NOT NULL,
      created_by_admin_id VARCHAR(36),
      created_by VARCHAR(36),
      approved_by VARCHAR(36),
      approval_status VARCHAR(50) DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS event_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      alumni_id VARCHAR(36) NOT NULL,
      status VARCHAR(50) DEFAULT 'registered',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_event_registration_event_user (event_id, alumni_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS event_rsvps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      alumni_id VARCHAR(36) NOT NULL,
      response_status VARCHAR(50) NOT NULL,
      attendance_status VARCHAR(50) NOT NULL,
      verification_status VARCHAR(50) DEFAULT 'Pending',
      checked_in_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (alumni_id) REFERENCES alumni(id) ON DELETE CASCADE,
      UNIQUE KEY uq_event_rsvps_event_alumni (event_id, alumni_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS event_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      alumni_id VARCHAR(36) NOT NULL,
      parent_id INT DEFAULT NULL,
      content TEXT NOT NULL,
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES event_comments(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
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
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try {
    await conn.query("ALTER TABLE dashboard_slides ADD COLUMN media_type VARCHAR(30) NOT NULL DEFAULT 'image' AFTER caption");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alumni_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      achievement_date DATE,
      category VARCHAR(100),
      organization VARCHAR(255),
      image_url LONGTEXT,
      certificate_url LONGTEXT,
      featured TINYINT(1) DEFAULT 0,
      status ENUM('pending', 'approved', 'rejected', 'archived') DEFAULT 'pending',
      approved_by VARCHAR(36) DEFAULT NULL,
      approved_at DATETIME NULL,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_achievements_alumni (alumni_id),
      INDEX idx_achievements_status (status),
      INDEX idx_achievements_featured (featured)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS achievement_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      achievement_id INT NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_achievement_comments_achievement (achievement_id, created_at)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS achievement_reactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      achievement_id INT NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      reaction_type VARCHAR(20) NOT NULL DEFAULT 'heart',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_achievement_reactions_user (achievement_id, user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS freedom_wall_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      image_url LONGTEXT,
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
      INDEX idx_wall_posts_status (status),
      INDEX idx_wall_posts_created_at (created_at)
    )
  `);

  await conn.query(`
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
      INDEX idx_wall_comments_post (post_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      target_type ENUM('freedom_wall_post', 'freedom_wall_comment') NOT NULL,
      target_id INT NOT NULL,
      reaction_type ENUM('heart') DEFAULT 'heart',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_reactions_user_target (user_id, target_type, target_id),
      INDEX idx_reactions_target (target_type, target_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT DEFAULT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      survey_type ENUM('before_event', 'after_event', 'general') NOT NULL,
      status ENUM('draft', 'published', 'closed', 'archived') DEFAULT 'draft',
      target_audience ENUM('all_alumni', 'registered_attendees', 'event_attendees', 'selected_batch') DEFAULT 'all_alumni',
      is_anonymous TINYINT(1) DEFAULT 0,
      opens_at DATETIME DEFAULT NULL,
      closes_at DATETIME DEFAULT NULL,
      created_by VARCHAR(36) DEFAULT NULL,
      updated_by VARCHAR(36) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS survey_questions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      survey_id INT NOT NULL,
      question_text TEXT NOT NULL,
      question_type ENUM('short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'yes_no') NOT NULL,
      question_order INT NOT NULL DEFAULT 1,
      is_required TINYINT(1) DEFAULT 1,
      options_json JSON DEFAULT NULL,
      min_rating TINYINT DEFAULT NULL,
      max_rating TINYINT DEFAULT NULL,
      placeholder VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS survey_answers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      survey_id INT NOT NULL,
      question_id INT NOT NULL,
      respondent_id VARCHAR(36) DEFAULT NULL,
      event_registration_id INT DEFAULT NULL,
      answer_text TEXT,
      answer_value VARCHAR(255),
      answer_json JSON DEFAULT NULL,
      rating_value DECIMAL(5,2) DEFAULT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
      FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (event_registration_id) REFERENCES event_registrations(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
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
      engagement_level VARCHAR(50) NOT NULL,
      last_updated DATETIME NOT NULL,
      FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_engagement_metrics_alumni (alumni_id)
    )
  `);

  await conn.query(`
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
      submission_status VARCHAR(50) NOT NULL DEFAULT 'completed',
      ched_payload LONGTEXT NULL,
      submitted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tracer_form_user_id (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn(conn, "user_roles", "archived", "archived TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn(conn, "event_rsvps", "verification_status", "verification_status VARCHAR(50) DEFAULT 'Pending'");
  await ensureColumn(conn, "announcements", "google_form_link", "google_form_link TEXT NULL");
  await ensureColumn(conn, "announcements", "approval_status", "approval_status VARCHAR(50) NOT NULL DEFAULT 'approved'");
  await ensureColumn(conn, "announcements", "created_by", "created_by VARCHAR(36) NULL");
  await ensureColumn(conn, "announcements", "approved_by", "approved_by VARCHAR(36) NULL");
  await ensureColumn(conn, "announcements", "rejection_reason", "rejection_reason TEXT NULL");
  await ensureColumn(conn, "announcements", "audience_scope", "audience_scope VARCHAR(20) NOT NULL DEFAULT 'all'");
  await ensureColumn(conn, "announcements", "audience_value", "audience_value VARCHAR(255) NULL");
  await ensureColumn(conn, "events", "event_date", "event_date DATE NULL");
  await ensureColumn(conn, "events", "event_time", "event_time TIME NULL");
  await ensureColumn(conn, "events", "event_type", "event_type VARCHAR(100) NULL");
  await ensureColumn(conn, "events", "created_by_admin_id", "created_by_admin_id VARCHAR(36) NULL");
  await ensureColumn(conn, "freedom_wall_posts", "category", "category VARCHAR(50) NOT NULL DEFAULT 'Discussion'");
  await ensureColumn(conn, "achievements", "approved_at", "approved_at DATETIME NULL");
}

async function execute(conn: PoolConnection, sql: string, params: DbValue[] = []) {
  await conn.execute(sql, params);
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

async function clearDemoData(conn: PoolConnection) {
  const userPlaceholders = placeholders(userIds);
  const emailPlaceholders = placeholders(userEmails);
  const announcementPlaceholders = placeholders(announcementIds);
  const eventPlaceholders = placeholders(eventIds);
  const achievementPlaceholders = placeholders(achievementIds);
  const wallPostPlaceholders = placeholders(wallPostIds);
  const wallCommentPlaceholders = placeholders(wallCommentIds);
  const surveyPlaceholders = placeholders(surveyIds);
  const surveyQuestionPlaceholders = placeholders(surveyQuestionIds);
  const dashboardSlidePlaceholders = placeholders(dashboardSlideIds);
  const eventCommentPlaceholders = placeholders(eventCommentIds);

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  await conn.query(`DELETE FROM survey_answers WHERE survey_id IN (${surveyPlaceholders}) OR question_id IN (${surveyQuestionPlaceholders}) OR respondent_id IN (${userPlaceholders})`, [
    ...surveyIds,
    ...surveyQuestionIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM survey_questions WHERE survey_id IN (${surveyPlaceholders}) OR id IN (${surveyQuestionPlaceholders})`, [
    ...surveyIds,
    ...surveyQuestionIds,
  ]);
  await conn.query(`DELETE FROM surveys WHERE id IN (${surveyPlaceholders}) OR created_by IN (${userPlaceholders})`, [
    ...surveyIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM achievement_reactions WHERE achievement_id IN (${achievementPlaceholders}) OR user_id IN (${userPlaceholders})`, [
    ...achievementIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM achievement_comments WHERE achievement_id IN (${achievementPlaceholders}) OR user_id IN (${userPlaceholders})`, [
    ...achievementIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM achievements WHERE id IN (${achievementPlaceholders}) OR alumni_id IN (${userPlaceholders})`, [
    ...achievementIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM reactions WHERE user_id IN (${userPlaceholders}) OR (target_type = 'freedom_wall_post' AND target_id IN (${wallPostPlaceholders})) OR (target_type = 'freedom_wall_comment' AND target_id IN (${wallCommentPlaceholders}))`, [
    ...userIds,
    ...wallPostIds,
    ...wallCommentIds,
  ]);
  await conn.query(`DELETE FROM freedom_wall_comments WHERE id IN (${wallCommentPlaceholders}) OR post_id IN (${wallPostPlaceholders}) OR user_id IN (${userPlaceholders})`, [
    ...wallCommentIds,
    ...wallPostIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM freedom_wall_posts WHERE id IN (${wallPostPlaceholders}) OR user_id IN (${userPlaceholders})`, [
    ...wallPostIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM event_rsvps WHERE event_id IN (${eventPlaceholders}) OR alumni_id IN (${userPlaceholders})`, [
    ...eventIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM event_comments WHERE id IN (${eventCommentPlaceholders}) OR event_id IN (${announcementPlaceholders}) OR alumni_id IN (${userPlaceholders})`, [
    ...eventCommentIds,
    ...announcementIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM event_registrations WHERE event_id IN (${announcementPlaceholders}) OR alumni_id IN (${userPlaceholders})`, [
    ...announcementIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM dashboard_slides WHERE id IN (${dashboardSlidePlaceholders}) OR created_by IN (${userPlaceholders})`, [
    ...dashboardSlideIds,
    ...userIds,
  ]);
  await conn.query(`DELETE FROM events WHERE id IN (${eventPlaceholders})`, eventIds);
  await conn.query(`DELETE FROM announcements WHERE id IN (${announcementPlaceholders}) OR created_by IN (${userPlaceholders})`, [
    ...announcementIds,
    ...userIds,
  ]);
  await conn.query(
    `DELETE FROM officer_school_year WHERE label IN (${placeholders(officerSchoolYearLabels)})`,
    officerSchoolYearLabels,
  );
  await conn.query(`DELETE FROM engagement_metrics WHERE alumni_id IN (${userPlaceholders})`, userIds);
  await conn.query(`DELETE FROM tracer_form WHERE user_id IN (${userPlaceholders})`, userIds);
  await conn.query(`DELETE FROM alumni WHERE id IN (${userPlaceholders}) OR email IN (${emailPlaceholders})`, [
    ...userIds,
    ...userEmails,
  ]);
  await conn.query(`DELETE FROM admin_users WHERE id IN (${userPlaceholders}) OR email IN (${emailPlaceholders})`, [
    ...userIds,
    ...userEmails,
  ]);
  await conn.query(`DELETE FROM user_roles WHERE user_id IN (${userPlaceholders})`, userIds);
  await conn.query(`DELETE FROM profiles WHERE id IN (${userPlaceholders}) OR email IN (${emailPlaceholders})`, [
    ...userIds,
    ...userEmails,
  ]);
  await conn.query(`DELETE FROM users WHERE id IN (${userPlaceholders}) OR email IN (${emailPlaceholders})`, [
    ...userIds,
    ...userEmails,
  ]);

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function insertUsers(conn: PoolConnection, passwordHash: string) {
  for (const admin of adminUsers) {
    await execute(conn, "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)", [
      admin.id,
      admin.email,
      passwordHash,
      "2026-04-01 08:00:00",
    ]);
    await execute(conn, "INSERT INTO profiles (id, name, email, student_id, course, batch, contact_number, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      admin.id,
      admin.fullName,
      admin.email,
      null,
      "Administration",
      "2026",
      "088-555-0100",
      `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.fullName)}&background=550000&color=fff`,
      "2026-04-01 08:00:00",
    ]);
    await execute(conn, "INSERT INTO user_roles (user_id, role, archived) VALUES (?, ?, 0)", [admin.id, admin.role]);
    await execute(conn, "INSERT INTO admin_users (id, full_name, email, role) VALUES (?, ?, ?, ?)", [
      admin.id,
      admin.fullName,
      admin.email,
      admin.role,
    ]);
  }

  for (const item of alumni) {
    await execute(conn, "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)", [
      item.id,
      item.email,
      passwordHash,
      "2026-04-01 08:30:00",
    ]);
    await execute(conn, "INSERT INTO profiles (id, name, email, student_id, course, batch, contact_number, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      item.id,
      item.fullName,
      item.email,
      item.studentId,
      item.course,
      item.batchYear,
      item.contactNumber,
      item.profileImage,
      "2026-04-01 08:30:00",
    ]);
    await execute(conn, "INSERT INTO user_roles (user_id, role, archived) VALUES (?, 'alumni', 0)", [item.id]);
    await execute(conn, "INSERT INTO alumni (id, full_name, email, course, batch_year, employment_status, profile_image) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      item.id,
      item.fullName,
      item.email,
      item.course,
      item.batchYear,
      item.employmentStatus,
      item.profileImage,
    ]);
    await execute(conn, "INSERT INTO tracer_form (user_id, employment_status, company, industry, work_location, job_title, income, relevance, submission_status, ched_payload, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)", [
      item.id,
      item.employmentStatus,
      item.employmentStatus.includes("Self-employed") ? "Own Business" : item.employmentStatus.split(" - ")[1] || "Local Organization",
      item.course === "BSM" ? "Health Services" : item.course === "BS ENTREP" ? "Business and Trade" : "Education",
      "Salay, Misamis Oriental",
      item.employmentStatus.split(" - ")[1] || "Alumni Professional",
      "PHP 15,000 - PHP 25,000",
      "Highly related",
      JSON.stringify({ seeded: true, note: "Minimal tracer completion record for demo login access." }),
      "2026-04-10 09:00:00",
    ]);
  }
}

async function insertAnnouncementsAndEvents(conn: PoolConnection) {
  const records = [
    [6101, "SaCC Grand Alumni Homecoming 2026", "A campus-wide alumni homecoming with batch parade, recognition night, and fellowship dinner.", "2026-06-20", "08:00:00", "SaCC Covered Court", "event", null, "Alumni Association", image("photo-1523050854058-8df90110c9f1"), "upcoming", "approved", adminUsers[0].id, adminUsers[0].id, null, "all", null, 350, 214, 87, "2026-04-05 09:00:00"],
    [6102, "Career Mentorship Night for Graduating Students", "Alumni professionals will mentor graduating students on job interviews, resumes, and workplace expectations.", "2026-05-18", "17:30:00", "SaCC Audio Visual Room", "event", null, "PIO Office", image("photo-1517048676732-d65bc937f952"), "ongoing", "approved", adminUsers[1].id, adminUsers[0].id, null, "all", null, 120, 176, 79, "2026-04-06 10:00:00"],
    [6103, "Batch 2018 Thanksgiving Outreach", "Batch 2018 alumni will distribute school supplies to partner elementary learners in Salay.", "2026-05-25", "07:30:00", "Salay Central School", "event", null, "Batch 2018 Officers", image("photo-1488521787991-ed7bbaae773c"), "upcoming", "pending_approval", alumni[0].id, null, null, "batch", "2018", 80, 58, 65, "2026-04-07 13:00:00"],
    [6104, "Entrepreneurship Alumni Trade Fair", "BS ENTREP graduates will showcase local food products, crafts, and startup services.", "2026-07-10", "09:00:00", "SaCC Open Grounds", "event", null, "BS ENTREP Alumni Circle", image("photo-1556742049-0cfed4f6a45d"), "upcoming", "approved", adminUsers[1].id, adminUsers[0].id, null, "course", "BS ENTREP", 150, 132, 76, "2026-04-08 09:15:00"],
    [6105, "Midwifery Alumni Skills Refresher", "A hands-on refresher for BSM alumni covering maternal care updates and community health protocols.", "2026-08-14", "13:00:00", "SaCC Skills Laboratory", "event", null, "BSM Department", image("photo-1584515933487-779824d29309"), "active", "approved", adminUsers[0].id, adminUsers[0].id, null, "course", "BSM", 60, 98, 88, "2026-04-09 11:20:00"],
    [6106, "BECED Storytelling Workshop", "BECED alumni will lead a storytelling workshop for early childhood education students.", "2026-09-05", "09:00:00", "SaCC Library", "event", null, "BECED Alumni Volunteers", image("photo-1503676260728-1c00da094a0b"), "draft", "approved", adminUsers[1].id, adminUsers[0].id, null, "course", "BECED", 70, 41, 45, "2026-04-10 15:00:00"],
    [6107, "Leadership Forum with Alumni Officers", "A forum on community leadership and responsible alumni representation.", "2026-04-12", "14:00:00", "Municipal Session Hall", "event", null, "SaCC Alumni Association", image("photo-1552664730-d307ca884978"), "completed", "approved", adminUsers[0].id, adminUsers[0].id, null, "all", null, 100, 305, 92, "2026-03-20 08:00:00"],
    [6108, "Cancelled Coastal Cleanup Orientation", "This orientation was cancelled due to schedule conflict with municipal activities.", "2026-04-30", "06:00:00", "Salay Seawall", "event", null, "Community Extension Office", image("photo-1500530855697-b586d89ba3ee"), "deleted", "rejected", alumni[5].id, adminUsers[0].id, "Duplicate proposal and incomplete venue clearance.", "all", null, 90, 12, 10, "2026-04-11 12:00:00"],
    [6109, "Alumni ID Claiming Schedule", "New alumni IDs for batches 2016 to 2024 can be claimed at the Registrar extension desk every Friday.", "2026-05-03", null, "Registrar Extension Desk", "announcement", null, "Registrar Office", image("photo-1497366754035-f200968a6e72"), "active", "approved", adminUsers[0].id, adminUsers[0].id, null, "all", null, 0, 221, 70, "2026-04-12 09:00:00"],
    [6111, "Batch 2020 Reunion Planning Committee", "Batch 2020 alumni are invited to join the planning committee for a small reunion later this year.", "2026-05-22", null, "Online Meeting", "announcement", null, "Batch 2020 Representatives", image("photo-1515169067865-5387ec356754"), "active", "pending_approval", alumni[2].id, null, null, "batch", "2020", 0, 44, 50, "2026-04-14 11:00:00"],
    [6112, "Reminder: Update Alumni Profile", "Please update your current employment details and contact number before the annual report closes.", "2026-05-30", null, "Online", "announcement", null, "Alumni Records Team", image("photo-1450101499163-c8848c66ca85"), "active", "approved", adminUsers[1].id, adminUsers[0].id, null, "all", null, 0, 266, 75, "2026-04-15 08:00:00"],
    [6113, "Unofficial Fund Collection Notice", "A post asking alumni for direct bank transfers without association approval.", "2026-05-07", null, "Online", "announcement", null, "Unknown Batch Group", image("photo-1554224155-6726b3ff858f"), "inactive", "rejected", alumni[6].id, adminUsers[0].id, "Fund collection posts must include official SaCC Alumni Association approval.", "all", null, 0, 18, 15, "2026-04-16 13:45:00"],
    [6114, "BTLED Tool Donation Campaign", "BTLED alumni are invited to donate safe, usable tools for livelihood education laboratory demonstrations.", "2026-06-01", null, "BTLED Laboratory", "announcement", null, "BTLED Alumni Circle", image("photo-1504917595217-d4dc5ebe6122"), "archived", "approved", adminUsers[1].id, adminUsers[0].id, null, "course", "BTLED", 0, 91, 58, "2026-03-01 09:30:00"],
    [6115, "SaCC Alumni Employment Pulse Survey", "A short survey about current work status, training needs, and willingness to mentor students.", "2026-05-28", null, "Online", "survey", "https://forms.gle/sacc-employment-pulse-demo", "Alumni Records Team", image("photo-1454165804606-c3d57bc86b40"), "active", "approved", adminUsers[0].id, adminUsers[0].id, null, "all", null, 0, 203, 83, "2026-04-18 09:00:00"],
    [6116, "Homecoming Food Preference Survey", "Help the committee estimate food choices and dietary needs for the homecoming dinner.", "2026-06-01", null, "Online", "survey", "https://forms.gle/sacc-homecoming-food-demo", "Homecoming Committee", image("photo-1555244162-803834f70033"), "closed", "approved", adminUsers[1].id, adminUsers[0].id, null, "all", null, 0, 147, 69, "2026-04-19 09:00:00"],
    [6117, "Alumni Merchandise Pre-order Survey", "A draft survey for alumni shirt and lanyard pre-orders.", "2026-06-15", null, "Online", "survey", "https://forms.gle/sacc-merch-demo", "PIO Office", image("photo-1523381210434-271e8be1f52b"), "draft", "approved", adminUsers[1].id, adminUsers[0].id, null, "all", null, 0, 35, 30, "2026-04-20 09:00:00"],
    [6118, "Archived Alumni Newsletter: March 2026", "A previous monthly newsletter retained for archive and search testing.", "2026-03-31", null, "Online", "announcement", null, "PIO Office", image("photo-1504711434969-e33886168f5c"), "deleted", "approved", adminUsers[1].id, adminUsers[0].id, null, "all", null, 0, 79, 40, "2026-03-31 09:00:00"],
  ];

  for (const row of records) {
    await execute(
      conn,
      `INSERT INTO announcements
        (id, title, description, date, time, venue, type, google_form_link, organizer, image_url, status, approval_status, created_by, approved_by, rejection_reason, audience_scope, audience_value, capacity, views, success_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row as DbValue[],
    );
  }

  const eventTypeLabels = [
    "Homecoming",
    "Career Mentorship",
    "Community Outreach",
    "Trade Fair",
    "Skills Refresher",
    "Workshop",
    "Leadership Forum",
    "Community Extension",
  ];

  for (const [index, row] of records.slice(0, 8).entries()) {
    const createdBy = row[12] as string;
    const approvedBy = row[13] as string | null;
    const adminOwnerId = adminIds.includes(createdBy)
      ? createdBy
      : approvedBy && adminIds.includes(approvedBy)
        ? approvedBy
        : null;

    await execute(
      conn,
      `INSERT INTO events
        (id, title, description, date, time, venue, type, organizer, image_url, status, capacity, views, success_score, created_by, approved_by, approval_status, created_at, event_date, event_time, event_type, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row[0] as number,
        row[1] as string,
        row[2] as string,
        row[3] as string,
        row[4] as string | null,
        row[5] as string,
        row[6] as string,
        row[8] as string,
        row[9] as string,
        row[10] as string,
        row[17] as number,
        row[18] as number,
        row[19] as number,
        createdBy,
        approvedBy,
        row[11] as string,
        row[20] as string,
        row[3] as string,
        row[4] as string | null,
        eventTypeLabels[index],
        adminOwnerId,
      ],
    );
  }
}

async function insertEventRsvpsAndComments(conn: PoolConnection) {
  const rsvps = [
    [6101, alumni[0].id, "going", "checked_in", "2026-06-20 08:13:00"],
    [6101, alumni[1].id, "going", "checked_in", "2026-06-20 08:21:00"],
    [6101, alumni[2].id, "going", "pending", null],
    [6101, alumni[3].id, "interested", "pending", null],
    [6101, alumni[4].id, "going", "checked_in", "2026-06-20 08:34:00"],
    [6101, alumni[5].id, "going", "pending", null],
    [6102, alumni[1].id, "going", "checked_in", "2026-05-18 17:40:00"],
    [6102, alumni[2].id, "going", "checked_in", "2026-05-18 17:45:00"],
    [6102, alumni[4].id, "going", "pending", null],
    [6102, alumni[6].id, "interested", "pending", null],
    [6103, alumni[0].id, "going", "pending", null],
    [6103, alumni[8].id, "going", "pending", null],
    [6103, alumni[9].id, "declined", "no_show", null],
    [6104, alumni[1].id, "going", "pending", null],
    [6104, alumni[5].id, "going", "pending", null],
    [6104, alumni[9].id, "going", "pending", null],
    [6104, alumni[6].id, "interested", "pending", null],
    [6105, alumni[3].id, "going", "checked_in", "2026-08-14 13:10:00"],
    [6105, alumni[7].id, "going", "pending", null],
    [6105, alumni[2].id, "interested", "pending", null],
    [6106, alumni[2].id, "going", "pending", null],
    [6106, alumni[6].id, "going", "pending", null],
    [6106, alumni[0].id, "interested", "pending", null],
    [6107, alumni[0].id, "going", "checked_in", "2026-04-12 14:05:00"],
    [6107, alumni[1].id, "going", "checked_in", "2026-04-12 14:07:00"],
    [6107, alumni[2].id, "going", "checked_in", "2026-04-12 14:08:00"],
    [6107, alumni[3].id, "going", "checked_in", "2026-04-12 14:09:00"],
    [6107, alumni[4].id, "going", "checked_in", "2026-04-12 14:10:00"],
    [6107, alumni[5].id, "going", "no_show", null],
    [6108, alumni[6].id, "declined", "no_show", null],
  ];

  for (const [index, rsvp] of rsvps.entries()) {
    const [eventId, alumniId, responseStatus, attendanceStatus, checkedInAt] = rsvp;
    const appStatus = attendanceStatus === "checked_in" ? "attended" : responseStatus === "declined" ? "cancelled" : "registered";
    const [result] = await conn.execute<ResultSetHeader>(
      "INSERT INTO event_registrations (event_id, alumni_id, status, created_at) VALUES (?, ?, ?, ?)",
      [eventId, alumniId, appStatus, `2026-04-${String(10 + (index % 18)).padStart(2, "0")} 09:00:00`],
    );
    await execute(conn, "INSERT INTO event_rsvps (id, event_id, alumni_id, response_status, attendance_status, verification_status, checked_in_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      6201 + index,
      eventId as number,
      alumniId as string,
      responseStatus as string,
      attendanceStatus as string,
      index % 5 === 0 ? "Not Verified" : index % 3 === 0 ? "Verified" : "Pending",
      checkedInAt as string | null,
      `2026-04-${String(10 + (index % 18)).padStart(2, "0")} 09:00:00`,
    ]);

    if (index < 16) {
      await execute(conn, "UPDATE survey_answers SET event_registration_id = ? WHERE event_registration_id IS NULL AND respondent_id = ? LIMIT 1", [
        result.insertId,
        alumniId as string,
      ]);
    }
  }

  const eventCommentTexts = [
    "Excited to see everyone at the homecoming.",
    "Can batch representatives bring tarpaulin layouts?",
    "Please include parking instructions for those coming from Cagayan de Oro.",
    "The mentorship topic is very useful for fresh graduates.",
    "I can volunteer for resume review during the mentorship night.",
    "Will there be a livestream for alumni outside Misamis Oriental?",
    "Batch 2018 is preparing the school supply packs this weekend.",
    "Thank you for organizing the outreach.",
    "The trade fair is a good venue for small alumni businesses.",
    "Can we reserve one booth for food products?",
    "The midwifery refresher is timely for community health workers.",
    "Please share the required uniform for the skills laboratory.",
    "Storytelling workshop materials are ready from our batch.",
    "I can lend picture books for the session.",
    "The leadership forum gave practical advice for batch officers.",
    "Congratulations to the organizers for a smooth program.",
    "Can the next forum include financial reporting templates?",
    "The cancelled cleanup should be rescheduled after homecoming.",
    "Noted on the venue clearance requirement.",
    "Looking forward to the revised community extension schedule.",
    "Please include alumni entrepreneurs in the panel.",
    "Good initiative for local products.",
    "Can attendees bring students as observers?",
    "This should be repeated every semester.",
  ];

  for (let index = 0; index < eventCommentTexts.length; index += 1) {
    await execute(conn, "INSERT INTO event_comments (id, event_id, alumni_id, parent_id, content, likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      eventCommentIds[index],
      eventIds[index % eventIds.length],
      alumni[index % alumni.length].id,
      null,
      eventCommentTexts[index],
      index % 5,
      `2026-04-${String(11 + (index % 18)).padStart(2, "0")} ${String(9 + (index % 8)).padStart(2, "0")}:15:00`,
    ]);
  }
}

async function insertAchievements(conn: PoolConnection) {
  const rows = [
    [7101, alumni[0].id, "Passed the Licensure Examination for Professional Teachers", "Jessa passed the LET and now teaches livelihood education in a public high school.", "2026-03-18", "Professional Achievement", "Professional Regulation Commission", image("photo-1523580846011-d3a5bc25702b"), 1, "approved", adminUsers[0].id, "2026-03-21 10:00:00", null, "2026-03-19 09:00:00"],
    [7102, alumni[1].id, "Opened Salay Food Hub Cart", "Mark launched a food cart employing two working students from the community.", "2026-02-12", "Entrepreneurship", "Salay Food Hub", image("photo-1556742049-0cfed4f6a45d"), 1, "approved", adminUsers[0].id, "2026-02-14 11:00:00", null, "2026-02-13 09:00:00"],
    [7103, alumni[2].id, "Completed Early Childhood Literacy Training", "Kimberly completed a literacy intervention training and shared materials with BECED students.", "2026-01-28", "Academic Excellence", "DepEd Misamis Oriental", image("photo-1503676260728-1c00da094a0b"), 0, "approved", adminUsers[1].id, "2026-01-30 13:00:00", null, "2026-01-29 09:00:00"],
    [7104, alumni[3].id, "Recognized as Outstanding Rural Health Volunteer", "Rodel received recognition for consistent support during maternal health outreach.", "2026-04-02", "Community Service", "Municipal Health Office", image("photo-1584515933487-779824d29309"), 1, "approved", adminUsers[0].id, "2026-04-04 09:00:00", null, "2026-04-03 09:00:00"],
    [7105, alumni[4].id, "Submitted TESDA Bread and Pastry NC II Proof", "Angelica submitted proof for review after completing a skills certification.", "2026-04-19", "Professional Achievement", "TESDA", image("photo-1514986888952-8cd320577b68"), 0, "pending", null, null, null, "2026-04-19 10:00:00"],
    [7106, alumni[5].id, "Regional Sales Excellence Nomination", "Christian was nominated for quarterly sales excellence in a regional retail branch.", "2026-04-20", "Career Excellence", "Northern Mindanao Retail Group", image("photo-1556761175-b413da4baf72"), 0, "pending", null, null, null, "2026-04-20 15:00:00"],
    [7107, alumni[6].id, "Preschool Parent Orientation Speaker", "Patricia submitted photos from a parent orientation talk for preschool readiness.", "2026-04-21", "Community Service", "Little Steps Learning Center", image("photo-1491438590914-bc09fcaaf77a"), 0, "pending", null, null, null, "2026-04-21 08:30:00"],
    [7108, alumni[7].id, "Clinic Assistant Certificate Upload", "Junrey uploaded a certificate image that was too blurred to verify.", "2026-03-05", "Professional Achievement", "Private Clinic", image("photo-1532938911079-1b06ac7ceec7"), 0, "rejected", adminUsers[1].id, null, "Please upload a clearer certificate image with readable name and date.", "2026-03-06 09:00:00"],
    [7109, alumni[8].id, "Community Skills Training Claim", "The submitted record did not include proof of facilitation or attendance.", "2026-02-25", "Community Service", "Barangay Skills Program", image("photo-1522202176988-66273c2fd55f"), 0, "rejected", adminUsers[0].id, null, "Attach official documentation before resubmitting.", "2026-02-26 11:00:00"],
    [7110, alumni[9].id, "Archived Cooperative Leadership Award", "Older award record retained for archive filtering and historical profile testing.", "2025-11-11", "Career Excellence", "Salay Cooperative Federation", image("photo-1552664730-d307ca884978"), 0, "archived", adminUsers[0].id, "2025-11-15 10:00:00", null, "2025-11-12 09:00:00"],
  ];

  for (const row of rows) {
    await execute(
      conn,
      `INSERT INTO achievements
        (id, alumni_id, title, description, achievement_date, category, organization, image_url, featured, status, approved_by, approved_at, rejection_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row as DbValue[],
    );
  }

  const achievementComments = [
    "Congratulations, this inspires the younger batches.",
    "Well deserved recognition.",
    "Can you share tips for the board exam review?",
    "Proud SaCC graduate here.",
    "Your business story is motivating.",
    "Please visit campus for an entrepreneurship talk.",
    "Great work helping learners.",
    "This training material would help current students.",
    "Thank you for serving the community.",
    "The RHU recognition is meaningful.",
    "Excited for this certification review.",
    "Hoping this gets approved soon.",
    "Nice milestone for career growth.",
    "Keep going, Christian.",
    "Preschool readiness is an important topic.",
    "Please share the slides if available.",
    "Try uploading a clearer image next time.",
    "The admin feedback is helpful.",
    "Documentation is important for verification.",
    "Looking forward to the corrected submission.",
    "Archived but still worth remembering.",
    "Cooperative leadership is a strong alumni contribution.",
    "SaCC alumni are active in many fields.",
    "This is useful for profile activity testing.",
    "The proof image loaded properly.",
    "Great category choice.",
    "This should appear in the approval workflow.",
    "Thanks for sharing your milestone.",
    "The community can learn from this.",
    "More alumni should submit achievements.",
  ];

  for (let index = 0; index < achievementComments.length; index += 1) {
    await execute(conn, "INSERT INTO achievement_comments (achievement_id, user_id, content, created_at) VALUES (?, ?, ?, ?)", [
      achievementIds[index % achievementIds.length],
      alumni[(index + 3) % alumni.length].id,
      achievementComments[index],
      `2026-04-${String(1 + (index % 27)).padStart(2, "0")} ${String(8 + (index % 10)).padStart(2, "0")}:20:00`,
    ]);
  }

  const achievementReactionTypes = ["heart"];
  for (let achievementIndex = 0; achievementIndex < achievementIds.length; achievementIndex += 1) {
    for (let userIndex = 0; userIndex < 5; userIndex += 1) {
      await execute(conn, "INSERT INTO achievement_reactions (achievement_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?)", [
        achievementIds[achievementIndex],
        alumni[(achievementIndex + userIndex) % alumni.length].id,
        achievementReactionTypes[(achievementIndex + userIndex) % achievementReactionTypes.length],
        `2026-04-${String(2 + (achievementIndex % 20)).padStart(2, "0")} ${String(9 + userIndex).padStart(2, "0")}:00:00`,
      ]);
    }
  }
}

async function insertFreedomWall(conn: PoolConnection) {
  const categories = ["Career", "Event", "Achievement", "Advice", "Personal", "Discussion"];
  const statusForPost = (index: number) => {
    if ([4, 14].includes(index)) return "reported";
    if (index === 9) return "hidden";
    if ([12, 18].includes(index)) return "deleted";
    return "published";
  };

  const contents = [
    "Just confirmed my attendance for the SaCC homecoming. Looking forward to seeing batchmates again.",
    "Sharing a job opening for early childhood education assistants in Cagayan de Oro.",
    "Our small food cart business is looking for student interns during weekends.",
    "Does anyone have a copy of the old BTLED laboratory safety checklist?",
    "Thank you to the alumni office for helping update my profile record.",
    "Please avoid posting unverified fund collection links. Always check with the association first.",
    "Batch 2024 BSM alumni, we are planning a clinic skills refresher group chat.",
    "I can mentor graduating students who need help preparing a resume.",
    "SaCC memories: the covered court practice sessions before foundation day were unforgettable.",
    "This post was hidden after duplicate content review.",
    "Congratulations to everyone who passed recent certification exams.",
    "Any alumni entrepreneurs joining the July trade fair?",
    "This deleted sample post should support moderation deleted-state testing.",
    "Looking for BECED alumni who can volunteer for storytelling day.",
    "Reported sample post for moderation queue testing.",
    "The alumni ID claiming schedule helped me plan my visit.",
    "Proud of the scholarship drive. Small pledges can help a student stay enrolled.",
    "Can we have a webinar about cooperative bookkeeping?",
    "Deleted sample with outdated announcement details.",
    "SaCC alumni in health services, please share training resources for community volunteers.",
  ];

  for (let index = 0; index < wallPostIds.length; index += 1) {
    const status = statusForPost(index);
    await execute(
      conn,
      `INSERT INTO freedom_wall_posts
        (id, user_id, content, image_url, category, visibility, status, is_pinned, pinned_by, report_count, created_at)
       VALUES (?, ?, ?, ?, ?, 'alumni_only', ?, ?, ?, ?, ?)`,
      [
        wallPostIds[index],
        alumni[index % alumni.length].id,
        contents[index],
        index % 5 === 0 ? image("photo-1522202176988-66273c2fd55f") : null,
        categories[index % categories.length],
        status,
        index === 0 || index === 16 ? 1 : 0,
        index === 0 || index === 16 ? adminUsers[1].id : null,
        status === "reported" ? 3 + (index % 2) : 0,
        `2026-04-${String(1 + index).padStart(2, "0")} ${String(8 + (index % 8)).padStart(2, "0")}:05:00`,
      ],
    );
  }

  const commentTexts = [
    "See you there!",
    "I will share this with our batch group.",
    "This is very helpful.",
    "Please send more details.",
    "Thank you for the reminder.",
    "I agree with this.",
    "Count me in.",
    "Proud SaCC alumni.",
    "Can admins pin this?",
    "This helped me update my plans.",
    "I know someone interested.",
    "Good suggestion.",
    "Please coordinate with the PIO.",
    "The schedule works for me.",
    "Great opportunity for fresh graduates.",
    "I can volunteer one hour.",
    "Let's keep the wall organized.",
    "This needs verification.",
    "Thanks for flagging this.",
    "Useful for moderation testing.",
    "I miss campus events.",
    "Let's support the scholarship drive.",
    "This is a practical topic.",
    "I can provide sample forms.",
    "The alumni office replied quickly.",
    "Good to know.",
    "Please include venue map.",
    "Can this be livestreamed?",
    "Nice update.",
    "Following this thread.",
    "I support this.",
    "Helpful for BSM alumni.",
    "Helpful for BTLED alumni.",
    "Helpful for BECED alumni.",
    "Helpful for BS ENTREP alumni.",
    "This should be in announcements too.",
    "I will message my classmates.",
    "Thanks for sharing your experience.",
    "This motivates current students.",
    "More career tips please.",
    "The trade fair sounds good.",
    "Please post registration links.",
    "Admin review is important.",
    "Clear and useful post.",
    "This deserves attention.",
    "I can help with documentation.",
    "Nice to see alumni active.",
    "Can we make this monthly?",
    "Good community discussion.",
    "Thank you, everyone.",
  ];

  for (let index = 0; index < wallCommentIds.length; index += 1) {
    const status = index === 17 ? "reported" : index === 28 ? "hidden" : index === 39 ? "deleted" : "published";
    await execute(
      conn,
      `INSERT INTO freedom_wall_comments
        (id, post_id, user_id, parent_id, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        wallCommentIds[index],
        wallPostIds[index % wallPostIds.length],
        alumni[(index + 2) % alumni.length].id,
        null,
        commentTexts[index],
        status,
        `2026-04-${String(2 + (index % 25)).padStart(2, "0")} ${String(8 + (index % 10)).padStart(2, "0")}:45:00`,
      ],
    );
  }

  const reactionTypes = ["heart"];
  let reactionId = 10001;
  for (const postId of wallPostIds.slice(0, 8)) {
    for (const [userIndex, user] of alumni.entries()) {
      await execute(conn, "INSERT INTO reactions (id, user_id, target_type, target_id, reaction_type, created_at) VALUES (?, ?, 'freedom_wall_post', ?, ?, ?)", [
        reactionId,
        user.id,
        postId,
        reactionTypes[(reactionId + userIndex) % reactionTypes.length],
        `2026-04-${String(3 + ((reactionId - 10001) % 24)).padStart(2, "0")} ${String(8 + (userIndex % 8)).padStart(2, "0")}:30:00`,
      ]);
      reactionId += 1;
    }
  }
}

async function insertSurveys(conn: PoolConnection) {
  const surveys = [
    [9101, 6101, "Homecoming Attendance Readiness Survey", "Checks final attendance needs before the grand alumni homecoming.", "before_event", "published", "registered_attendees", 0, "2026-04-20 08:00:00", "2026-06-10 17:00:00", adminUsers[0].id],
    [9102, 6107, "Leadership Forum Feedback Survey", "Collects feedback from alumni who joined the leadership forum.", "after_event", "closed", "event_attendees", 0, "2026-04-12 16:00:00", "2026-04-20 17:00:00", adminUsers[1].id],
    [9103, null, "SaCC Alumni Employment Pulse", "Tracks current employment status and mentoring interest across all alumni.", "general", "published", "all_alumni", 1, "2026-04-15 08:00:00", "2026-05-30 17:00:00", adminUsers[0].id],
    [9104, 6104, "Entrepreneurship Trade Fair Booth Survey", "Draft survey for booth requirements and product categories.", "before_event", "draft", "selected_batch", 0, null, null, adminUsers[1].id],
    [9105, null, "Archived Graduate Skills Needs Survey", "Old survey kept for archive filter testing.", "general", "archived", "all_alumni", 1, "2025-10-01 08:00:00", "2025-11-01 17:00:00", adminUsers[0].id],
    [9106, 6105, "Midwifery Refresher Evaluation", "Short evaluation for BSM alumni joining the skills refresher.", "after_event", "published", "event_attendees", 0, "2026-08-14 15:00:00", "2026-08-22 17:00:00", adminUsers[0].id],
  ];

  for (const survey of surveys) {
    await execute(
      conn,
      `INSERT INTO surveys
        (id, event_id, title, description, survey_type, status, target_audience, is_anonymous, opens_at, closes_at, created_by, updated_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...survey, survey[10] as string, "2026-04-15 08:00:00"] as DbValue[],
    );
  }

  const questionRows = [
    [9201, 9101, "Will you attend the homecoming in person?", "yes_no", 1, 1, null, null, null, null],
    [9202, 9101, "Which activity are you most interested in?", "single_choice", 2, 1, JSON.stringify(["Batch parade", "Recognition night", "Fellowship dinner", "Campus tour"]), null, null, null],
    [9203, 9101, "Any dietary or accessibility notes?", "long_text", 3, 0, null, null, null, "Optional notes"],
    [9204, 9102, "Rate the leadership forum overall.", "rating", 1, 1, null, 1, 5, null],
    [9205, 9102, "What topic should be added next time?", "long_text", 2, 0, null, null, null, "Suggested topic"],
    [9206, 9102, "Would you join another forum?", "yes_no", 3, 1, null, null, null, null],
    [9207, 9103, "Current employment status", "single_choice", 1, 1, JSON.stringify(["Employed", "Self-employed", "Seeking work", "Further studies"]), null, null, null],
    [9208, 9103, "Training topics needed", "multiple_choice", 2, 0, JSON.stringify(["Digital skills", "Business registration", "Teaching strategies", "Health updates", "Financial literacy"]), null, null, null],
    [9209, 9103, "Can you mentor current students?", "yes_no", 3, 1, null, null, null, null],
    [9210, 9104, "Preferred booth category", "single_choice", 1, 1, JSON.stringify(["Food", "Crafts", "Services", "Agribusiness"]), null, null, null],
    [9211, 9104, "Estimated booth space needed", "short_text", 2, 1, null, null, null, "Example: 2m x 2m"],
    [9212, 9104, "Electrical outlet required?", "yes_no", 3, 0, null, null, null, null],
    [9213, 9105, "Skills gap category", "single_choice", 1, 1, JSON.stringify(["Communication", "Technology", "Business", "Clinical", "Teaching"]), null, null, null],
    [9214, 9105, "Preferred training month", "short_text", 2, 0, null, null, null, "Month"],
    [9215, 9105, "Detailed recommendation", "long_text", 3, 0, null, null, null, "Recommendation"],
    [9216, 9106, "Rate the refresher usefulness.", "rating", 1, 1, null, 1, 5, null],
    [9217, 9106, "Which topic needs more time?", "single_choice", 2, 1, JSON.stringify(["Maternal care", "Newborn care", "Records", "Community referrals"]), null, null, null],
    [9218, 9106, "Additional feedback", "long_text", 3, 0, null, null, null, "Feedback"],
  ];

  for (const question of questionRows) {
    await execute(
      conn,
      `INSERT INTO survey_questions
        (id, survey_id, question_text, question_type, question_order, is_required, options_json, min_rating, max_rating, placeholder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      question as DbValue[],
    );
  }

  let answerId = 9301;
  const activeSurveyQuestionGroups = [
    [9101, [9201, 9202, 9203]],
    [9102, [9204, 9205, 9206]],
    [9103, [9207, 9208, 9209]],
    [9106, [9216, 9217, 9218]],
  ] as const;

  for (const [surveyId, questionIds] of activeSurveyQuestionGroups) {
    for (const [alumniIndex, item] of alumni.entries()) {
      if (surveyId === 9106 && item.course !== "BSM") continue;
      if (surveyId === 9102 && alumniIndex > 6) continue;
      for (const [questionIndex, questionId] of questionIds.entries()) {
        const isRating = questionId === 9204 || questionId === 9216;
        const isMulti = questionId === 9208;
        await execute(
          conn,
          `INSERT INTO survey_answers
            (id, survey_id, question_id, respondent_id, answer_text, answer_value, answer_json, rating_value, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            answerId,
            surveyId,
            questionId,
            item.id,
            isRating ? null : questionIndex === 2 ? "I can help if schedule permits." : null,
            isRating ? null : questionIndex === 0 ? (item.employmentStatus.includes("Self-employed") ? "Self-employed" : "Employed") : questionIndex === 1 ? "Recognition night" : "Yes",
            isMulti ? JSON.stringify(["Digital skills", "Financial literacy"]) : null,
            isRating ? 4 + (alumniIndex % 2) : null,
            `2026-04-${String(16 + (answerId % 10)).padStart(2, "0")} ${String(8 + (alumniIndex % 8)).padStart(2, "0")}:10:00`,
          ],
        );
        answerId += 1;
      }
    }
  }
}

async function insertDashboardSlides(conn: PoolConnection) {
  const slides = [
    [9501, "Grand Alumni Homecoming", "Registration and batch parade reminders for the 2026 homecoming.", "image", image("photo-1523050854058-8df90110c9f1"), "/alumni/announcements", 1, 1, "active", adminUsers[0].id],
    [9503, "Career Mentorship Night", "Alumni professionals sharing workplace preparation with graduating students.", "youtube", "https://www.youtube.com/embed/ScMzIvxBSi4?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1", "/alumni/announcements", 0, 3, "active", adminUsers[1].id],
    [9504, "Monthly Alumni Newsletter", "Archived newsletter artwork retained for admin slideshow testing.", "image", image("photo-1504711434969-e33886168f5c"), "/alumni/about", 0, 4, "inactive", adminUsers[1].id],
  ];

  for (const slide of slides) {
    await execute(
      conn,
      `INSERT INTO dashboard_slides
        (id, title, caption, media_type, image_url, link_url, is_highlighted, display_order, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slide as DbValue[],
    );
  }
}

async function insertEngagementMetrics(conn: PoolConnection) {
  for (const item of alumni) {
    const [eventRows] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM event_registrations WHERE alumni_id = ?", [item.id]);
    const [surveyRows] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(DISTINCT survey_id) AS count FROM survey_answers WHERE respondent_id = ?", [item.id]);
    const [achievementRows] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM achievements WHERE alumni_id = ? AND status = 'approved'", [item.id]);
    const [postRows] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM freedom_wall_posts WHERE user_id = ? AND status = 'published'", [item.id]);
    const [reactionRows] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM reactions WHERE user_id = ?", [item.id]);
    const [commentRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM freedom_wall_comments WHERE user_id = ?) +
        (SELECT COUNT(*) FROM event_comments WHERE alumni_id = ?) +
        (SELECT COUNT(*) FROM achievement_comments WHERE user_id = ?) AS count`,
      [item.id, item.id, item.id],
    );

    const eventPoints = Number(eventRows[0]?.count || 0) * 10;
    const surveyPoints = Number(surveyRows[0]?.count || 0) * 8;
    const achievementPoints = Number(achievementRows[0]?.count || 0) * 20;
    const freedomWallPoints = Number(postRows[0]?.count || 0) * 6;
    const reactionPoints = Number(reactionRows[0]?.count || 0) * 2;
    const commentPoints = Number(commentRows[0]?.count || 0) * 3;
    const totalScore = eventPoints + surveyPoints + achievementPoints + freedomWallPoints + reactionPoints + commentPoints;
    const engagementLevel = totalScore >= 120 ? "Champion" : totalScore >= 85 ? "Highly Active" : totalScore >= 50 ? "Active" : "Emerging";

    await execute(
      conn,
      `INSERT INTO engagement_metrics
        (alumni_id, event_points, survey_points, achievement_points, freedom_wall_points, reaction_points, comment_points, total_score, engagement_level, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        eventPoints,
        surveyPoints,
        achievementPoints,
        freedomWallPoints,
        reactionPoints,
        commentPoints,
        totalScore,
        engagementLevel,
        "2026-05-03 08:00:00",
      ],
    );
  }
}

async function insertOfficerBundles(conn: PoolConnection) {
  const bundles = [
    {
      startYear: 2024,
      endYear: 2025,
      isCurrent: 0,
      officers: [
        ["president", alumni[1], 10, null],
        ["vice_president", alumni[2], 20, null],
        ["secretary", alumni[3], 30, null],
        ["treasurer", alumni[4], 40, null],
        ["auditor", alumni[5], 50, null],
        ["pio", alumni[6], 60, null],
        ["assistant_secretary", alumni[7], 70, null],
        ["assistant_treasurer", alumni[8], 80, null],
        ["board_member", alumni[9], 90, "Board Member"],
      ],
    },
    {
      startYear: 2025,
      endYear: 2026,
      isCurrent: 1,
      officers: [
        ["president", alumni[0], 10, null],
        ["vice_president", alumni[1], 20, null],
        ["secretary", alumni[2], 30, null],
        ["treasurer", alumni[3], 40, null],
        ["auditor", alumni[4], 50, null],
        ["pio", alumni[5], 60, null],
        ["assistant_secretary", alumni[6], 70, null],
        ["assistant_treasurer", alumni[7], 80, null],
        ["board_member", alumni[8], 90, "Board Member"],
        ["board_member", alumni[9], 100, "Board Member"],
      ],
    },
  ] as const;

  await conn.query("UPDATE officer_school_year SET is_current = 0");

  for (const bundle of bundles) {
    const label = `${bundle.startYear} - ${bundle.endYear}`;
    const [schoolYearResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO officer_school_year (start_year, end_year, label, is_current, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [bundle.startYear, bundle.endYear, label, bundle.isCurrent, adminUsers[0].id],
    );

    for (const [position, officer, displayOrder, customPosition] of bundle.officers) {
      await execute(
        conn,
        `INSERT INTO officers
          (school_year_id, alumni_id, position, custom_position, display_order, snapshot_name, snapshot_email, snapshot_course, snapshot_batch, snapshot_contact_number, snapshot_photo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          schoolYearResult.insertId,
          officer.id,
          position,
          customPosition,
          displayOrder,
          officer.fullName,
          officer.email,
          officer.course,
          officer.batchYear,
          officer.contactNumber,
          officer.profileImage,
        ],
      );
    }
  }
}

async function seed() {
  await ensureDatabase();

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: getSslConfig(),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  const conn = await pool.getConnection();

  try {
    console.log(`Seeding SaCC demo data into MySQL database "${DB_NAME}"...`);
    await createTables(conn);
    await conn.beginTransaction();
    await clearDemoData(conn);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    await insertUsers(conn, passwordHash);
    await insertAnnouncementsAndEvents(conn);
    await insertEventRsvpsAndComments(conn);
    await insertAchievements(conn);
    await insertFreedomWall(conn);
    await insertSurveys(conn);
    await insertDashboardSlides(conn);
    await insertEngagementMetrics(conn);
    await insertOfficerBundles(conn);

    await conn.commit();

    console.log("SaCC demo seed complete.");
    console.log(`Admin login: ${adminUsers[0].email} / ${DEFAULT_PASSWORD}`);
    console.log(`Alumni login: ${alumni[0].email} / ${DEFAULT_PASSWORD}`);
    console.log("Inserted: 10 alumni, 2 admins, 10 achievements, 10 non-event announcements/surveys, 8 events, 30 RSVPs, 4 dashboard slideshow images, 20 Freedom Wall posts, 50 wall comments, 80 wall reactions, engagement metrics for every alumni, and 2 officer bundles.");
  } catch (error) {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.rollback();
    console.error("Seed failed:", error);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

void seed();
