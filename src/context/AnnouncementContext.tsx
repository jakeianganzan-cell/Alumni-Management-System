import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, getAuthToken, readApiResponse } from "@/lib/api";

export type AnnouncementType = "announcement" | "event" | "survey";
export type AnnouncementStatus =
  | "active"
  | "inactive"
  | "upcoming"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "archived";
export type AnnouncementApprovalStatus = "pending_approval" | "approved" | "rejected";
export type AnnouncementAudienceScope = "all" | "course" | "batch";

export interface Announcement {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  venue?: string;
  organizer?: string;
  image_url?: string;
  type: AnnouncementType;
  google_form_link?: string;
  status: AnnouncementStatus;
  start_datetime?: string | null;
  start_date?: string | null;
  start_time?: string | null;
  end_datetime?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  duration_status?: "Upcoming" | "Active" | "Ended" | "Archived";
  computed_status?: "Upcoming" | "Active" | "Ended" | "Archived";
  remaining_time?: string;
  is_expired?: boolean;
  auto_archive_at?: string | null;
  archived_at?: string | null;
  capacity?: number;
  views: number;
  success_score?: number;
  registration_count?: number;
  interestEnabled?: boolean;
  interestCount?: number;
  interestPercentage?: number;
  comment_count?: number;
  approvalStatus?: AnnouncementApprovalStatus;
  rejectionReason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  approvedBy?: string | null;
  audienceScope?: AnnouncementAudienceScope;
  audienceValue?: string | null;
  audienceLabel?: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  announcement_id: number;
  alumni_id: string;
  parent_id?: number;
  content: string;
  likes: number;
  created_at: string;
  author_name?: string;
}

export interface AnnouncementMetrics {
  views: number;
  rsvps: number;
  attendance: number;
  comments: number;
  likes: number;
}

interface AnnouncementRsvp {
  alumni_id: string;
}

interface AnnouncementContextType {
  announcements: Announcement[];
  loading: boolean;
  currentAnnouncement: Announcement | null;
  metrics: Record<number, AnnouncementMetrics>;
  comments: Record<number, Comment[]>;
  rsvpStatus: Record<number, boolean>;
  recommendations: Announcement[];
  loadAnnouncements: (statusOrType?: string) => Promise<void>;
  loadAnnouncement: (id: number) => Promise<void>;
  createAnnouncement: (
    data: Omit<Announcement, "id" | "views" | "created_at" | "updated_at">
  ) => Promise<Announcement>;
  rsvpAnnouncement: (announcementId: number) => Promise<void>;
  addComment: (announcementId: number, content: string, parentId?: number) => Promise<void>;
  loadRecommendations: () => Promise<void>;
  refreshMetrics: (announcementId: number) => Promise<void>;
}

const AnnouncementContext = createContext<AnnouncementContextType | null>(null);

export const AnnouncementProvider = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const alumniId = user?.id || profile?.student_id || "demo-user";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [metrics, setMetrics] = useState<Record<number, AnnouncementMetrics>>({});
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [rsvpStatus, setRsvpStatus] = useState<Record<number, boolean>>({});
  const [recommendations, setRecommendations] = useState<Announcement[]>([]);

  const loadAnnouncements = useCallback(async (statusOrType?: string) => {
    if (!getAuthToken()) {
      setAnnouncements([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/announcements`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Announcement[]>(res);
      const filtered = statusOrType
        ? data.filter((item) => item.type === statusOrType || item.status === statusOrType)
        : data;
      setAnnouncements(filtered);
    } catch (error) {
      console.error("Failed to load announcements:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnnouncement = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${API_URL}/announcements/${id}`, {
          headers: getAuthHeaders(),
        });
        const data = await readApiResponse<Announcement>(res);
        if (!data) return;

        setCurrentAnnouncement(data);

        const requestComments = fetch(`${API_URL}/events/${id}/comments`, {
          headers: getAuthHeaders(),
        }).then((response) => readApiResponse<Comment[]>(response));

        const requestRsvps =
          data.type === "event"
            ? fetch(`${API_URL}/events/${id}/rsvps`, {
                headers: getAuthHeaders(),
              }).then((response) =>
                readApiResponse<AnnouncementRsvp[] | { rsvps?: AnnouncementRsvp[] }>(response)
              )
            : Promise.resolve<AnnouncementRsvp[] | { rsvps?: AnnouncementRsvp[] }>([]);

        const [announcementComments, rsvpResponse] = await Promise.all([requestComments, requestRsvps]);
        const rsvps: AnnouncementRsvp[] = Array.isArray(rsvpResponse)
          ? rsvpResponse
          : rsvpResponse.rsvps || [];

        setMetrics((prev) => ({
          ...prev,
          [id]: {
            views: data.views || 0,
            rsvps: data.type === "event" ? Number(data.registration_count || rsvps.length || 0) : 0,
            attendance: 0,
            comments: Number(data.comment_count || announcementComments.length || 0),
            likes: 0,
          },
        }));
        setComments((prev) => ({ ...prev, [id]: announcementComments }));
        setRsvpStatus((prev) => ({
          ...prev,
          [id]: data.type === "event" ? Boolean(rsvps.find((rsvp) => rsvp.alumni_id === alumniId)) : false,
        }));
      } catch (error) {
        console.error("Failed to load announcement:", error);
      }
    },
    [alumniId]
  );

  const createAnnouncement = async (
    data: Omit<Announcement, "id" | "views" | "created_at" | "updated_at">
  ): Promise<Announcement> => {
    const res = await fetch(`${API_URL}/announcements`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await readApiResponse<unknown>(res);
    await loadAnnouncements();
    if (payload && typeof payload === "object" && "event" in payload) {
      const event = (payload as { event?: Announcement }).event;
      if (event) {
        return event;
      }
      throw new Error("Announcement payload did not include the created event");
    }
    return payload as Announcement;
  };

  const rsvpAnnouncement = async (announcementId: number) => {
    const announcement = announcements.find((item) => Number(item.id) === announcementId);
    if (!alumniId || announcement?.type !== "event") return;

    await fetch(`${API_URL}/events/${announcementId}/rsvp`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ responseStatus: "Going" }),
    });
    setRsvpStatus((prev) => ({ ...prev, [announcementId]: true }));
    await refreshMetrics(announcementId);
  };

  const addComment = async (announcementId: number, content: string, parentId?: number) => {
    if (!alumniId) return;

    await fetch(`${API_URL}/events/${announcementId}/comments`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ alumniId, content, parent_id: parentId }),
    });

    const commentsRes = await fetch(`${API_URL}/events/${announcementId}/comments`, {
      headers: getAuthHeaders(),
    });
    const newComments = await readApiResponse<Comment[]>(commentsRes);
    setComments((prev) => ({ ...prev, [announcementId]: newComments }));
    await refreshMetrics(announcementId);
  };

  const loadRecommendations = useCallback(async () => {
    setRecommendations([]);
  }, []);

  const refreshMetrics = async (announcementId: number) => {
    try {
      const announcementRes = await fetch(`${API_URL}/announcements/${announcementId}`, {
        headers: getAuthHeaders(),
      });
      const announcement = await readApiResponse<Announcement>(announcementRes);
      const commentsRes = await fetch(`${API_URL}/events/${announcementId}/comments`, {
        headers: getAuthHeaders(),
      });
      const announcementComments = await readApiResponse<Comment[]>(commentsRes);

      let rsvps: AnnouncementRsvp[] = [];
      if (announcement?.type === "event") {
        const rsvpsRes = await fetch(`${API_URL}/events/${announcementId}/rsvps`, {
          headers: getAuthHeaders(),
        });
        const rsvpResponse = await readApiResponse<AnnouncementRsvp[] | { rsvps?: AnnouncementRsvp[] }>(rsvpsRes);
        rsvps = Array.isArray(rsvpResponse) ? rsvpResponse : rsvpResponse.rsvps || [];
      }

      setMetrics((prev) => ({
        ...prev,
        [announcementId]: {
          views: announcement?.views || 0,
          rsvps: announcement?.type === "event" ? Number(announcement.registration_count || rsvps.length || 0) : 0,
          attendance: 0,
          comments: Number(announcement?.comment_count || announcementComments.length || 0),
          likes: 0,
        },
      }));
    } catch (error) {
      console.error("Failed to refresh announcement metrics:", error);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAnnouncements([]);
      setRecommendations([]);
      setCurrentAnnouncement(null);
      return;
    }

    loadAnnouncements();
    loadRecommendations();
  }, [authLoading, loadAnnouncements, loadRecommendations, user]);

  return (
    <AnnouncementContext.Provider
      value={{
        announcements,
        loading,
        currentAnnouncement,
        metrics,
        comments,
        rsvpStatus,
        recommendations,
        loadAnnouncements,
        loadAnnouncement,
        createAnnouncement,
        rsvpAnnouncement,
        addComment,
        loadRecommendations,
        refreshMetrics,
      }}
    >
      {children}
    </AnnouncementContext.Provider>
  );
};

export const useAnnouncements = () => {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error("useAnnouncements must be used within AnnouncementProvider");
  }
  return context;
};
