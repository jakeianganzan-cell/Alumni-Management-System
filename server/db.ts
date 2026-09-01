import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Event, RSVP, Comment, Metrics, EngagementOverview } from './types/db';
import { config } from './config';
import { logger } from './utils/logger';

type DbParam = string | number | boolean | Date | Buffer | null;

const DB_HOST = config.dbHost;
const DB_PORT = config.dbPort;
const DB_USER = config.dbUser;
const DB_PASSWORD = config.dbPassword;
const DB_NAME = config.dbName;
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const parseBooleanEnv = (value: string | undefined) =>
  ["1", "true", "yes", "require", "required"].includes(String(value || "").trim().toLowerCase());

const DB_SSL_CA = config.dbSslCa;
const DB_SSL_CA_FILE = config.dbSslCaFile;
const DB_SSL_ENABLED =
  parseBooleanEnv(config.dbSsl) ||
  Boolean(DB_SSL_CA || DB_SSL_CA_FILE);
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as Record<string, unknown>).message);
  }
  return "Unknown error";
};

const getErrorCode = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as Record<string, unknown>).code;
    return typeof code === 'string' ? code : String(code || "");
  }
  return "";
};

const RETRIABLE_DB_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "PROTOCOL_SEQUENCE_TIMEOUT"
]);

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const isRetriableDatabaseError = (error: unknown) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    RETRIABLE_DB_ERROR_CODES.has(code) ||
    message.includes("read econnreset") ||
    message.includes("connection lost") ||
    message.includes("connection reset")
  );
};

const withDatabaseRetry = async <T>(operation: () => Promise<T>, retries = 2): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetriableDatabaseError(error)) {
        throw error;
      }

      await sleep(150 * (attempt + 1));
    }
  }

  throw lastError;
};

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

const POOL_CONFIG = {
  maxIdle: Number(process.env.DB_POOL_MAX_IDLE || 15),
  idleTimeout: Number(process.env.DB_POOL_IDLE_TIMEOUT || 30000),
  connectionLimit: Number(process.env.DB_POOL_CONNECTION_LIMIT || 25),
  queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT || 250),
};

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: getSslConfig(),
  waitForConnections: true,
  connectionLimit: POOL_CONFIG.connectionLimit,
  maxIdle: POOL_CONFIG.maxIdle,
  idleTimeout: POOL_CONFIG.idleTimeout,
  queueLimit: POOL_CONFIG.queueLimit,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Warn on sustained pool saturation without logging every normal query.
let activeConnections = 0;
let lastSaturationWarningAt = 0;
const SATURATION_WARN_THRESHOLD = Math.max(1, Math.ceil(POOL_CONFIG.connectionLimit * 0.8));
const SATURATION_WARNING_INTERVAL_MS = 5000;

pool.on('acquire', () => {
  activeConnections += 1;
  const now = Date.now();
  if (activeConnections >= SATURATION_WARN_THRESHOLD && now - lastSaturationWarningAt >= SATURATION_WARNING_INTERVAL_MS) {
    lastSaturationWarningAt = now;
    logger.warn(`[Database] High pool usage: ${activeConnections}/${POOL_CONFIG.connectionLimit}`);
  }
});

pool.on('release', () => {
  activeConnections = Math.max(0, activeConnections - 1);
});

interface EventRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  date: Date | string | null;
  time: string | null;
  venue: string | null;
  organizer: string | null;
  image_url: string | null;
  status: Event["status"];
  capacity: number;
  views: number;
  success_score: number;
  created_at: string;
  updated_at: string;
}

interface RSVPRow extends RowDataPacket {
  id: number;
  event_id: number;
  alumni_id: string;
  status: RSVP["status"];
  created_at: string;
}

interface CommentRow extends RowDataPacket {
  id: number;
  event_id: number;
  alumni_id: string;
  parent_id: number | null;
  content: string;
  likes: number;
  created_at: string;
}

interface CountRow extends RowDataPacket {
  rsvps?: number;
  comments?: number;
  views?: number;
}

const mapEvent = (row: EventRow): Event => ({
  id: row.id,
  title: row.title,
  description: row.description,
  date: row.date ? new Date(row.date).toISOString().split('T')[0] : '',
  time: row.time,
  venue: row.venue,
  organizer: row.organizer,
  image_url: row.image_url,
  status: row.status,
  capacity: row.capacity,
  views: row.views,
  success_score: row.success_score,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapRSVP = (row: RSVPRow): RSVP => ({
  id: row.id,
  event_id: row.event_id,
  alumni_id: row.alumni_id,
  status: row.status,
  created_at: row.created_at,
});

const mapComment = (row: CommentRow): Comment => ({
  id: row.id,
  event_id: row.event_id,
  alumni_id: row.alumni_id,
  parent_id: row.parent_id,
  content: row.content,
  likes: row.likes,
  created_at: row.created_at,
});

export const db = {
  async end() {
    await pool.end();
  },

  async getConnection() {
    return await withDatabaseRetry(() => pool.getConnection());
  },

  async query<T extends RowDataPacket>(sql: string, params?: DbParam[]): Promise<T[]> {
    const [rows] = await withDatabaseRetry(() => pool.query<T[]>(sql, params));
    return rows;
  },

  async execute(sql: string, params?: DbParam[]) {
    const [result] = await withDatabaseRetry(() => pool.execute(sql, params));
    return result;
  },

  async getEvents(status?: string | null, limit?: number): Promise<Event[]> {
    let sql = 'SELECT * FROM announcements';
    const params: Array<string | number> = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY date ASC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const [rows] = await pool.query<EventRow[]>(sql, params);
    return rows.map(mapEvent);
  },

  async getEventById(id: number): Promise<Event | undefined> {
    const [rows] = await pool.query<EventRow[]>('SELECT * FROM announcements WHERE id = ?', [id]);
    return rows.length ? mapEvent(rows[0]) : undefined;
  },

  async createEvent(eventData: Partial<Event>): Promise<Event> {
    const sql = `
      INSERT INTO announcements 
      (title, description, date, time, venue, organizer, image_url, status, capacity, views, success_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      eventData.title || null,
      eventData.description || null,
      eventData.date || null,
      eventData.time || null,
      eventData.venue || null,
      eventData.organizer || null,
      eventData.image_url || null,
      eventData.status || 'upcoming',
      eventData.capacity || 0,
      eventData.views || 0,
      eventData.success_score || 0
    ];

    const [result] = await pool.execute<ResultSetHeader>(sql, params);
    return await this.getEventById(result.insertId) as Event;
  },

  async getRSVPsForEvent(eventId: number): Promise<RSVP[]> {
    const [rows] = await pool.query<RSVPRow[]>(
      'SELECT * FROM event_registrations WHERE event_id = ?',
      [eventId]
    );

    return rows.map(mapRSVP);
  },

  async rsvpEvent(eventId: number, alumniId: string): Promise<void> {
    await pool.execute(
      'INSERT INTO event_registrations (event_id, alumni_id, status) VALUES (?, ?, ?)',
      [eventId, alumniId, 'registered']
    );
  },

  async getCommentsForEvent(eventId: number): Promise<Comment[]> {
    const [rows] = await pool.query<CommentRow[]>(
      'SELECT * FROM event_comments WHERE event_id = ? ORDER BY created_at DESC',
      [eventId]
    );

    return rows.map(mapComment);
  },

  async addComment(
    eventId: number,
    alumniId: string,
    content: string,
    parentId?: number | null
  ): Promise<void> {
    await pool.execute(
      `INSERT INTO event_comments 
       (event_id, alumni_id, content, parent_id, likes) 
       VALUES (?, ?, ?, ?, 0)`,
      [eventId, alumniId, content, parentId || null]
    );
  },

  async getEventMetrics(eventId: number): Promise<Metrics> {
    const [[rsvpRows], [commentRows], [viewRows]] = await Promise.all([
      pool.query<CountRow[]>('SELECT COUNT(*) as rsvps FROM event_registrations WHERE event_id = ?', [eventId]),
      pool.query<CountRow[]>('SELECT COUNT(*) as comments FROM event_comments WHERE event_id = ?', [eventId]),
      pool.query<CountRow[]>('SELECT views FROM announcements WHERE id = ?', [eventId]),
    ]);

    const rsvps = rsvpRows[0]?.rsvps ?? 0;
    const comments = commentRows[0]?.comments ?? 0;
    const views = viewRows[0]?.views ?? 0;
    const attendance = Math.floor(rsvps * 0.8);

    return {
      views,
      rsvps,
      attendance,
      comments,
      likes: comments
    };
  },

  async getEventRecommendations(alumniId: string): Promise<Event[]> {
    const [pastEvents] = await pool.query<RowDataPacket[]>(
      'SELECT event_id FROM event_registrations WHERE alumni_id = ? LIMIT 3',
      [alumniId]
    );

    if (!pastEvents.length) {
      return this.getEvents('upcoming', 3);
    }

    const [upcoming] = await pool.query<EventRow[]>(
      "SELECT * FROM announcements WHERE status = 'upcoming' LIMIT 3"
    );

    return upcoming.map(mapEvent);
  },

  async getEngagementOverview(): Promise<EngagementOverview[]> {
    // N+1 fix: Batch all COUNT queries into a single query
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        a.id,
        a.title,
        a.success_score,
        COALESCE(er.rsvp_count, 0) AS attendance,
        COALESCE(ec.comment_count, 0) AS comments
      FROM announcements a
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS rsvp_count
        FROM event_registrations
        GROUP BY event_id
      ) er ON er.event_id = a.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS comment_count
        FROM event_comments
        GROUP BY event_id
      ) ec ON ec.event_id = a.id
      ORDER BY a.created_at DESC
      LIMIT 5`
    );

    return rows.map((row) => ({
      title: String(row.title || ''),
      success_score: Number(row.success_score || 0),
      attendance: Number(row.attendance || 0),
      comments: Number(row.comments || 0),
      avg_feedback: 4.5,
    }));
  }
};

export default db;
