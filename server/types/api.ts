import type { Event, RSVP, Comment, Metrics, EngagementOverview } from './db'

export interface APIResponse<T = unknown> {
  events?: Event[];
  event?: Event;
  rsvps?: RSVP[];
  comments?: Comment[];
  metrics?: Metrics;
  overview?: EngagementOverview[];
  data?: T
  success?: boolean;
  error?: string;
}

