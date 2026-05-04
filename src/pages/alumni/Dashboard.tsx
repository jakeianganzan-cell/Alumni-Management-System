import { useEffect, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Calendar, Bell, Clock3, ExternalLink, MapPin, MessageCircle, Send, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import salayBackground from "@/assets/salay-background.png";

interface CommentData {
  id: string;
  text: string;
  created_at: string;
  profiles: { name: string } | null;
}

interface AnnouncementData {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  type: string | null;
  image_url: string | null;
  status: string | null;
  google_form_link?: string | null;
}

interface DashboardCommentResponse {
  id: string;
  event_id: string;
  text: string;
  created_at: string;
  profile_name: string | null;
}

interface DashboardResponse {
  events?: AnnouncementData[];
  registrations?: string[];
  officers?: { name: string; role: string; positionLabel?: string; photo?: string | null; schoolYear?: string | null }[];
  comments?: DashboardCommentResponse[];
}

type DashboardOfficer = {
  name: string;
  role: string;
  positionLabel?: string;
  photo?: string | null;
  schoolYear?: string | null;
};

function OfficerCard({
  name,
  role,
  photo,
  size = "md",
  accent = "navy",
  textTone = "dark",
}: {
  name: string;
  role: string;
  photo?: string | null;
  size?: "sm" | "md" | "lg";
  accent?: string;
  textTone?: "dark" | "light";
}) {
  const sizeMap = {
    sm: { avatar: "w-16 h-16", text: "text-lg", name: "text-xs", badge: "text-[10px] px-2" },
    md: { avatar: "w-20 h-20", text: "text-xl", name: "text-xs", badge: "text-[10px] px-2" },
    lg: { avatar: "w-28 h-28", text: "text-3xl", name: "text-sm", badge: "text-xs px-3" },
  };
  const bgMap: Record<string, string> = {
    navy: "bg-navy", gold: "bg-gold", emerald: "bg-emerald-600", teal: "bg-teal-500",
    amber: "bg-amber-500", orange: "bg-orange-500", purple: "bg-purple-600",
    pink: "bg-pink-500", slate: "bg-slate-500", blue: "bg-blue-600",
  };
  const s = sizeMap[size];
  const bg = bgMap[accent] ?? "bg-navy";
  const nameTextClassName = textTone === "light" ? "text-white" : "text-navy-dark";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${s.avatar} rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-lg ${bg}`}>
        {photo ? (
          <img src={resolveAssetUrl(photo) || undefined} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className={`text-white font-bold ${s.text}`}>{name[0]}</span>
        )}
      </div>
      <div className="text-center">
        <p className={`font-bold leading-tight ${s.name} max-w-[100px] ${nameTextClassName}`}>{name}</p>
        <span className={`font-semibold py-0.5 rounded-full mt-0.5 inline-block text-white ${bg} ${s.badge}`}>{role}</span>
      </div>
    </div>
  );
}

function VConn({ h = 6, className = "bg-border" }: { h?: number; className?: string }) {
  return <div className={`mx-auto w-0.5 ${className}`} style={{ height: `${h * 4}px` }} />;
}

export default function AlumniDashboard() {
  const { user, profile } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [comments, setComments] = useState<Record<string, CommentData[]>>({});
  const [registrations, setRegistrations] = useState<Set<string>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementData | null>(null);
  const [officers, setOfficers] = useState<DashboardOfficer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const keepSpinner = announcements.length === 0 && officers.length === 0;
      try {
        const res = await fetch(`${API_URL}/alumni/dashboard`, {
          headers: getAuthHeaders(),
        });
        const data = await readApiResponse<DashboardResponse>(res);

        setAnnouncements(data.events || []);
        setRegistrations(new Set(data.registrations || []));
        setOfficers(
          (data.officers || []).map((officer) => ({
            ...officer,
            role: String(officer.role || "").trim().toLowerCase(),
          })),
        );

        const grouped: Record<string, CommentData[]> = {};
        (data.comments || []).forEach((c) => {
          if (!grouped[c.event_id]) grouped[c.event_id] = [];
          grouped[c.event_id].push({
            id: c.id,
            text: c.text,
            created_at: c.created_at,
            profiles: { name: c.profile_name },
          });
        });
        setComments(grouped);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        if (keepSpinner) {
          setLoading(false);
        }
      }
    };

    void fetchData();
    const interval = window.setInterval(() => {
      void fetchData();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [announcements.length, officers.length, user]);

  const joinEvent = async (eventId: string) => {
    if (!user) return;
    try {
      await fetch(`${API_URL}/events/${eventId}/rsvp`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      setRegistrations((prev) => new Set(prev).add(eventId));
    } catch (e) {
      console.error(e);
    }
  };

  const submitComment = async (eventId: string) => {
    const text = (commentInputs[eventId] ?? "").trim();
    if (!text || !user) return;
    try {
      await fetch(`${API_URL}/events/${eventId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ content: text }),
      });

      const newComment = {
        id: Math.random().toString(),
        text,
        created_at: new Date().toISOString(),
        profiles: { name: profile?.name || "You" },
      };

      setComments((prev) => ({
        ...prev,
        [eventId]: [...(prev[eventId] || []), newComment],
      }));
      setCommentInputs((ci) => ({ ...ci, [eventId]: "" }));
    } catch (err) {
      console.error(err);
    }
  };

  const getOfficer = (...roles: string[]) =>
    officers.find((officer) => roles.map((role) => role.toLowerCase()).includes(officer.role)) || null;
  const boardMembers = officers.filter((officer) => officer.role === "board_member");
  const currentSchoolYear = officers[0]?.schoolYear || null;

  if (loading) {
    return (
      <AlumniLayout title="Salay Community College">
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy border-t-transparent" />
        </div>
      </AlumniLayout>
    );
  }

  return (
    <AlumniLayout title="Salay Community College" subtitle="SaCC Alumni Association">
      <div
        className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card"
        style={{
          backgroundImage: `linear-gradient(rgba(26,18,23,0.76), rgba(91,18,36,0.7)), url(${salayBackground})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="relative z-10">
          <div className="mb-10 text-center">
            <h3 className="text-2xl font-display font-bold text-white">Organization Chart</h3>
            <p className="mt-1 text-sm text-white/75">
              SaCC Alumni Association Officers{currentSchoolYear ? ` | ${currentSchoolYear}` : ""}
            </p>
            <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gold" />
          </div>
          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-[600px] flex-col items-center">
              <OfficerCard name={getOfficer("president")?.name || "TBA"} role="President" photo={getOfficer("president")?.photo} size="lg" accent="navy" textTone="light" />
              <VConn h={7} className="bg-white/35" />
              <OfficerCard name={getOfficer("vice_president")?.name || "TBA"} role="Vice President" photo={getOfficer("vice_president")?.photo} size="md" accent="blue" textTone="light" />
              <VConn h={7} className="bg-white/35" />
              <div className="flex items-start gap-16 pt-4">
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("secretary")?.name || "TBA"} role="Secretary" photo={getOfficer("secretary")?.photo} size="md" accent="emerald" textTone="light" />
                  <VConn h={5} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_secretary")?.name || "TBA"} role="Asst. Secretary" photo={getOfficer("assistant_secretary")?.photo} size="sm" accent="teal" textTone="light" />
                </div>
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("treasurer")?.name || "TBA"} role="Treasurer" photo={getOfficer("treasurer")?.photo} size="md" accent="amber" textTone="light" />
                  <VConn h={5} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_treasurer")?.name || "TBA"} role="Asst. Treasurer" photo={getOfficer("assistant_treasurer")?.photo} size="sm" accent="orange" textTone="light" />
                </div>
                <OfficerCard name={getOfficer("auditor")?.name || "TBA"} role="Auditor" photo={getOfficer("auditor")?.photo} size="md" accent="orange" textTone="light" />
              </div>
              <div className="my-6 w-full max-w-xl border-t-2 border-dashed border-white/30" />
              <div className="flex items-start gap-10">
                <OfficerCard name={getOfficer("pio", "pro")?.name || "TBA"} role="PRO" photo={getOfficer("pio", "pro")?.photo} size="md" accent="purple" textTone="light" />
              </div>
              {boardMembers.length > 0 && (
                <>
                  <div className="my-6 w-full max-w-xl border-t-2 border-dashed border-white/30" />
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Board Members</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-6">
                      {boardMembers.map((member) => (
                        <OfficerCard
                          key={`${member.role}-${member.name}`}
                          name={member.name}
                          role={member.positionLabel || "Board Member"}
                          photo={member.photo}
                          size="sm"
                          accent="slate"
                          textTone="light"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              {officers.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/30 bg-black/20 px-6 py-4 text-sm text-white/75">
                  No officer roster has been published yet.
                </div>
              )}
              {currentSchoolYear && (
                <div className="mt-6 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white">
                  Active roster: {currentSchoolYear}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-display font-bold text-navy-dark">Announcements, Events & Surveys</h3>
          <p className="text-xs text-muted-foreground">Stay updated with the latest activities, alumni notices, and response requests from SaCC Alumni.</p>
        </div>
        <div className="flex items-center gap-1">
          <Bell className="h-4 w-4 text-navy" />
          <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-bold text-white">{announcements.length}</span>
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No events or surveys yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {announcements.map((announcement) => {
            const isSurvey = announcement.type === "survey";
            const isEvent = announcement.type === "event";
            const imageUrl = resolveAssetUrl(announcement.image_url);

            return (
              <button
                key={announcement.id}
                type="button"
                onClick={() => setSelectedAnnouncement(announcement)}
                className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {imageUrl && (
                  <img src={imageUrl} alt={announcement.title} className="h-36 w-full object-cover" />
                )}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={isSurvey ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : isEvent ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                      {isSurvey ? "Survey" : isEvent ? "Event" : "Announcement"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {announcement.date ? new Date(announcement.date).toLocaleDateString() : "Posted recently"}
                    </span>
                  </div>
                  <h4 className="mt-3 line-clamp-2 text-base font-display font-bold text-navy-dark">{announcement.title}</h4>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {announcement.description || "No description provided yet."}
                  </p>
                  <p className="mt-3 text-xs font-medium text-navy">Click to view complete details</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selectedAnnouncement)} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selectedAnnouncement && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={selectedAnnouncement.type === "survey" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : selectedAnnouncement.type === "event" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                    {selectedAnnouncement.type === "survey" ? "Survey" : selectedAnnouncement.type === "event" ? "Event" : "Announcement"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedAnnouncement.date ? new Date(selectedAnnouncement.date).toLocaleDateString() : "Posted recently"}
                  </span>
                </div>
                <DialogTitle className="text-2xl text-navy-dark">{selectedAnnouncement.title}</DialogTitle>
                <DialogDescription>Complete details for the selected post.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {resolveAssetUrl(selectedAnnouncement.image_url) && (
                  <img
                    src={resolveAssetUrl(selectedAnnouncement.image_url) || undefined}
                    alt={selectedAnnouncement.title}
                    className="h-56 w-full rounded-2xl border border-border/70 object-cover"
                  />
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedAnnouncement.date && (
                    <DetailCard
                      label="Date"
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(selectedAnnouncement.date).toLocaleDateString()}
                        </span>
                      }
                    />
                  )}
                  {selectedAnnouncement.time && (
                    <DetailCard
                      label="Time"
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="h-4 w-4" />
                          {selectedAnnouncement.time}
                        </span>
                      }
                    />
                  )}
                  {selectedAnnouncement.venue && (
                    <DetailCard
                      label="Venue"
                      value={
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {selectedAnnouncement.venue}
                        </span>
                      }
                    />
                  )}
                  {selectedAnnouncement.status && <DetailCard label="Status" value={selectedAnnouncement.status} />}
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Complete details</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {selectedAnnouncement.description || "No full content has been added."}
                  </p>
                </div>

                {selectedAnnouncement.type === "survey" && selectedAnnouncement.google_form_link && (
                  <a
                    href={selectedAnnouncement.google_form_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-navy-dark"
                    style={{ background: "var(--gradient-gold)" }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Survey
                  </a>
                )}

                {selectedAnnouncement.type === "event" && renderEventDialogSection({
                  announcement: selectedAnnouncement,
                  joined: registrations.has(selectedAnnouncement.id),
                  eventComments: comments[selectedAnnouncement.id] || [],
                  commentsVisible: showComments[selectedAnnouncement.id] ?? false,
                  commentInput: commentInputs[selectedAnnouncement.id] ?? "",
                  onJoin: () => joinEvent(selectedAnnouncement.id),
                  onToggleComments: () =>
                    setShowComments((current) => ({
                      ...current,
                      [selectedAnnouncement.id]: !current[selectedAnnouncement.id],
                    })),
                  onChangeComment: (value) =>
                    setCommentInputs((current) => ({ ...current, [selectedAnnouncement.id]: value })),
                  onSubmitComment: () => submitComment(selectedAnnouncement.id),
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AlumniLayout>
  );
}

function DetailCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function renderEventDialogSection({
  announcement,
  joined,
  eventComments,
  commentsVisible,
  commentInput,
  onJoin,
  onToggleComments,
  onChangeComment,
  onSubmitComment,
}: {
  announcement: AnnouncementData;
  joined: boolean;
  eventComments: CommentData[];
  commentsVisible: boolean;
  commentInput: string;
  onJoin: () => void;
  onToggleComments: () => void;
  onChangeComment: (value: string) => void;
  onSubmitComment: () => void;
}) {
  return (
    <div className="space-y-3">
      {joined ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <CheckCircle className="h-4 w-4" />
          You have joined this event
        </div>
      ) : (
        <button
          onClick={onJoin}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: "var(--gradient-navy)" }}
        >
          <Calendar className="h-4 w-4" />
          Join Event
        </button>
      )}

      <button
        onClick={onToggleComments}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {eventComments.length > 0
          ? `${eventComments.length} Comment${eventComments.length > 1 ? "s" : ""}`
          : "Add a Comment"}
      </button>

      {commentsVisible && (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
          {eventComments.map((c) => (
            <div key={c.id} className="border-b border-border px-3 py-2 last:border-b-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-navy-dark">{c.profiles?.name || "Alumni"}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <p className="mt-0.5 text-xs text-foreground">{c.text}</p>
            </div>
          ))}
          <div className="flex gap-2 border-t border-border bg-card p-2">
            <input
              type="text"
              placeholder="Write a comment..."
              value={commentInput}
              onChange={(e) => onChangeComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitComment()}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-navy focus:outline-none"
            />
            <button
              onClick={onSubmitComment}
              className="rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-light"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
