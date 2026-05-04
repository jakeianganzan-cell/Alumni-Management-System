export interface Event {
  id: number;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  venue: string | null;
  organizer: string | null;
  image_url: string | null;

  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

  capacity: number;
  views: number;
  success_score: number;

  created_at: string;
  updated_at: string;
}

export interface RSVP {
  id: number;
  event_id: number;
  alumni_id: string;

  status: 'registered' | 'attended' | 'cancelled';

  created_at: string;
}

export interface Comment {
  id: number;
  event_id: number;
  alumni_id: string;

  parent_id: number | null;
  content: string;
  likes: number;

  author_name?: string | null;

  created_at: string;
}

export interface Profile {
  id: string;
  graduation_year?: number | null;
  job_title?: string | null;
  company?: string | null;
  industry?: string | null;

  employment_status?:
  'employed' |
  'unemployed' |
  'self_employed' |
  'student' |
  'retired' |
  null;

  bio?: string | null;
  avatar_url?: string | null;

  updated_at: string;
}

export interface Donation {
  id: number;
  alumni_id: string | null;
  amount: number;
  campaign?: string | null;
  message?: string | null;
  receipt_url?: string | null;
  created_at: string;
}

export interface Achievement {
  id: number;
  alumni_id: string;
  title: string;
  description?: string | null;
  year?: number | null;
  category?: string | null;
  image_url?: string | null;
  created_at: string;
}

export interface GraduateTracer {
  id: number;
  alumni_id: string;
  graduation_year: number;

  employment_status?: string | null;

  salary_range?:
  '0-20k' |
  '20k-50k' |
  '50k-100k' |
  '100k+' |
  null;

  industry?: string | null;
  job_title?: string | null;
  company?: string | null;

  satisfaction_score?: number | null;

  submitted_at: string;
}

export interface Officer {
  id: number;
  alumni_id: string;
  position: string;

  term_start?: string | null;
  term_end?: string | null;

  contact_email?: string | null;
  is_active?: boolean | null;

  created_at: string;
}

export interface Metrics {
  views: number;
  rsvps: number;
  attendance: number;
  comments: number;
  likes: number;
}

export interface EngagementOverview {
  title: string;
  success_score: number;
  attendance: number;
  comments: number;
  avg_feedback: number | null;
}
