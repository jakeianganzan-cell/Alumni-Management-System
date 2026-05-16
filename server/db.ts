import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Event, RSVP, Comment, Metrics, EngagementOverview } from './types/db';

type DbParam = string | number | boolean | Date | Buffer | null;

interface MaxAllowedPacketRow extends RowDataPacket {
  maxAllowedPacket: number | string;
}

const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ustp_alumni';
const DEFAULT_MAX_ALLOWED_PACKET = 64 * 1024 * 1024;

const parseBooleanEnv = (value: string | undefined) =>
  ["1", "true", "yes", "require", "required"].includes(String(value || "").trim().toLowerCase());

const DB_SSL_CA = process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA;
const DB_SSL_ENABLED =
  parseBooleanEnv(process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED) ||
  Boolean(DB_SSL_CA);
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const getSslConfig = () => {
  if (!DB_SSL_ENABLED) return undefined;

  return {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
    ...(DB_SSL_CA ? { ca: DB_SSL_CA.replace(/\\n/g, "\n") } : {}),
  };
};

const parsePacketLimit = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ALLOWED_PACKET;
};

const MYSQL_MAX_ALLOWED_PACKET = parsePacketLimit(
  process.env.MYSQL_MAX_ALLOWED_PACKET || process.env.DB_MAX_ALLOWED_PACKET,
);

const ensureMysqlPacketLimit = async () => {
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;

  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      ssl: getSslConfig(),
    });

    const [rows] = await connection.query<MaxAllowedPacketRow[]>(
      'SELECT @@global.max_allowed_packet AS maxAllowedPacket',
    );
    const currentLimit = Number(rows[0]?.maxAllowedPacket || 0);

    if (currentLimit < MYSQL_MAX_ALLOWED_PACKET) {
      await connection.query(`SET GLOBAL max_allowed_packet = ${MYSQL_MAX_ALLOWED_PACKET}`);
      console.log(`MySQL max_allowed_packet increased to ${MYSQL_MAX_ALLOWED_PACKET} bytes`);
    }
  } catch (error) {
    console.warn('Unable to verify or increase MySQL max_allowed_packet:', error);
  } finally {
    await connection?.end();
  }
};

await ensureMysqlPacketLimit();

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: getSslConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('Connected to MySQL database!');
    conn.release();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
})();

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
  async getConnection() {
    return await pool.getConnection();
  },

  async query<T extends RowDataPacket>(sql: string, params?: DbParam[]): Promise<T[]> {
    const [rows] = await pool.query<T[]>(sql, params);
    return rows;
  },

  async execute(sql: string, params?: DbParam[]) {
    const [result] = await pool.execute(sql, params);
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
    const [rsvpRows] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) as rsvps FROM event_registrations WHERE event_id = ?',
      [eventId]
    );

    const [commentRows] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) as comments FROM event_comments WHERE event_id = ?',
      [eventId]
    );

    const [viewRows] = await pool.query<CountRow[]>(
      'SELECT views FROM announcements WHERE id = ?',
      [eventId]
    );

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
    const [events] = await pool.query<EventRow[]>(
      'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 5'
    );

    const overview = await Promise.all(events.map(async (event) => {
      const [rsvpRows] = await pool.query<CountRow[]>(
        'SELECT COUNT(*) as rsvps FROM event_registrations WHERE event_id = ?',
        [event.id]
      );

      const [commentRows] = await pool.query<CountRow[]>(
        'SELECT COUNT(*) as comments FROM event_comments WHERE event_id = ?',
        [event.id]
      );

      return {
        title: event.title,
        success_score: event.success_score,
        attendance: rsvpRows[0]?.rsvps ?? 0,
        comments: commentRows[0]?.comments ?? 0,
        avg_feedback: 4.5
      };
    }));

    return overview;
  }
};

export default db;
