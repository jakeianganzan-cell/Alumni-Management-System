import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Event, RSVP, Comment, Metrics, EngagementOverview } from './types/db';

type DbParam = string | number | boolean | Date | Buffer | null;

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ustp_alumni',
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
