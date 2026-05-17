import { useEffect, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Calendar, Bell, Clock3, MapPin, MessageCircle, Send, CheckCircle, UserCheck, XCircle, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import salayBackground from "@/assets/salay-background.png";
import DurationBadge from "@/components/DurationBadge";
import HomepageSlideshow from "@/components/HomepageSlideshow";

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
  start_datetime?: string | null;
  end_datetime?: string | null;
  computed_status?: string | null;
  duration_status?: string | null;
  remaining_time?: string | null;
  is_expired?: boolean | null;
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
  surveys?: SurveyData[];
  registrations?: string[];
  officers?: { name: string; role: string; positionLabel?: string; photo?: string | null; schoolYear?: string | null }[];
  comments?: DashboardCommentResponse[];
  slideshow?: SlideData[];
}

type EventRsvpStatus = "Going" | "Interested" | "Not Going";
type EventAttendanceStatus = "Pending" | "Attended" | "Absent";

interface EventRsvpState {
  id?: string | number;
  event_id?: string | number;
  alumni_id?: string;
  response_status: EventRsvpStatus;
  attendance_status: EventAttendanceStatus;
  checked_in_at?: string | null;
  engagement_awarded?: number | boolean;
}

type DashboardOfficer = {
  name: string;
  role: string;
  positionLabel?: string;
  photo?: string | null;
  schoolYear?: string | null;
};

interface SlideData {
  id: number;
  title: string;
  caption: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  imageUrl: string | null;
  linkUrl?: string;
  isHighlighted: boolean;
}

interface SurveyQuestion {
  id: number;
  questionText: string;
  questionType: "short_text" | "long_text" | "single_choice" | "multiple_choice" | "rating" | "yes_no";
  isRequired: boolean;
  options: string[];
  minRating?: number | null;
  maxRating?: number | null;
  placeholder?: string | null;
}

interface SurveyData {
  id: number;
  title: string;
  description: string | null;
  status: string;
  computed_status?: string | null;
  duration_status?: string | null;
  remaining_time?: string | null;
  is_expired?: boolean | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  responseCount: number;
  allowMultipleResponses?: boolean;
  questions: SurveyQuestion[];
  userAnswers: Array<{ questionId: number; answerText?: string | null; answerValue?: string | null; answerJson?: string[] | null; ratingValue?: number | null }>;
}

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
    sm: { avatar: "h-12 w-12 md:h-16 md:w-16", text: "text-base md:text-lg", name: "text-[10px] md:text-xs", badge: "text-[9px] px-1.5 md:text-[10px] md:px-2" },
    md: { avatar: "h-14 w-14 md:h-20 md:w-20", text: "text-lg md:text-xl", name: "text-[10px] md:text-xs", badge: "text-[9px] px-1.5 md:text-[10px] md:px-2" },
    lg: { avatar: "h-20 w-20 md:h-28 md:w-28", text: "text-2xl md:text-3xl", name: "text-xs md:text-sm", badge: "text-[10px] px-2 md:text-xs md:px-3" },
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
        <p className={`max-w-[74px] font-bold leading-tight md:max-w-[100px] ${s.name} ${nameTextClassName}`}>{name}</p>
        <span className={`font-semibold py-0.5 rounded-full mt-0.5 inline-block text-white ${bg} ${s.badge}`}>{role}</span>
      </div>
    </div>
  );
}

function VConn({ h = 6, mdH, className = "bg-border" }: { h?: number; mdH?: number; className?: string }) {
  return (
    <div
      className={`mx-auto h-[var(--conn-h)] w-0.5 md:h-[var(--conn-md-h)] ${className}`}
      style={
        {
          "--conn-h": `${h * 4}px`,
          "--conn-md-h": `${(mdH ?? h) * 4}px`,
        } as React.CSSProperties
      }
    />
  );
}

export default function AlumniDashboard() {
  const { user, profile } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [surveys, setSurveys] = useState<SurveyData[]>([]);
  const [slideshow, setSlideshow] = useState<SlideData[]>([]);
  const [comments, setComments] = useState<Record<string, CommentData[]>>({});
  const [registrations, setRegistrations] = useState<Set<string>>(new Set());
  const [eventRsvps, setEventRsvps] = useState<Record<string, EventRsvpState | null>>({});
  const [rsvpChoiceOpen, setRsvpChoiceOpen] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementData | null>(null);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyData | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<number, string | string[]>>({});
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
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
        setSurveys(data.surveys || []);
        setSlideshow(data.slideshow || []);
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

  const loadEventRsvpStatus = async (eventId: string) => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/rsvp-status`, {
        headers: getAuthHeaders(),
      });
      const payload = await readApiResponse<{ rsvp: EventRsvpState | null }>(response);
      setEventRsvps((current) => ({ ...current, [eventId]: payload.rsvp }));
      if (payload.rsvp) {
        setRegistrations((prev) => new Set(prev).add(eventId));
      }
    } catch (err) {
      console.error("Failed to load RSVP status", err);
    }
  };

  const openAnnouncement = (announcement: AnnouncementData) => {
    setSelectedAnnouncement(announcement);
    if (announcement.type === "event") {
      void loadEventRsvpStatus(announcement.id);
    }
  };

  const saveEventRsvp = async (eventId: string, responseStatus: EventRsvpStatus) => {
    if (!user) return;
    const existing = eventRsvps[eventId];
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/rsvp`, {
        method: existing ? "PUT" : "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ responseStatus }),
      });
      const payload = await readApiResponse<{ rsvp: EventRsvpState }>(response);
      setEventRsvps((current) => ({ ...current, [eventId]: payload.rsvp }));
      setRegistrations((prev) => new Set(prev).add(eventId));
      setRsvpChoiceOpen((current) => ({ ...current, [eventId]: false }));
    } catch (err) {
      console.error("Failed to save RSVP", err);
    }
  };

  const cancelEventRsvp = async (eventId: string) => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/rsvp`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await readApiResponse(response);
      setEventRsvps((current) => ({ ...current, [eventId]: null }));
      setRegistrations((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    } catch (err) {
      console.error("Failed to cancel RSVP", err);
    }
  };

  const checkInEvent = async (eventId: string) => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/check-in`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const payload = await readApiResponse<{ rsvp: EventRsvpState }>(response);
      setEventRsvps((current) => ({ ...current, [eventId]: payload.rsvp }));
    } catch (err) {
      console.error("Failed to check in", err);
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

  const openSurvey = (survey: SurveyData) => {
    const initialAnswers: Record<number, string | string[]> = {};
    survey.userAnswers.forEach((answer) => {
      if (answer.answerJson) {
        initialAnswers[answer.questionId] = answer.answerJson;
      } else {
        initialAnswers[answer.questionId] = String(answer.answerValue || answer.answerText || answer.ratingValue || "");
      }
    });
    setSurveyAnswers(initialAnswers);
    setSelectedSurvey(survey);
  };

  const updateSurveyAnswer = (question: SurveyQuestion, value: string, checked?: boolean) => {
    setSurveyAnswers((current) => {
      if (question.questionType !== "multiple_choice") {
        return { ...current, [question.id]: value };
      }

      const existing = Array.isArray(current[question.id]) ? (current[question.id] as string[]) : [];
      const next = checked ? Array.from(new Set([...existing, value])) : existing.filter((item) => item !== value);
      return { ...current, [question.id]: next };
    });
  };

  const submitSurvey = async () => {
    if (!selectedSurvey) return;
    if (selectedSurvey.userAnswers.length > 0 && !selectedSurvey.allowMultipleResponses) return;
    const missingRequired = selectedSurvey.questions.some((question) => {
      if (!question.isRequired) return false;
      const value = surveyAnswers[question.id];
      return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
    if (missingRequired) return;

    try {
      setSubmittingSurvey(true);
      const response = await fetch(`${API_URL}/surveys/${selectedSurvey.id}/responses`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: selectedSurvey.questions.map((question) => {
            const value = surveyAnswers[question.id];
            if (question.questionType === "multiple_choice") {
              return { questionId: question.id, answerJson: Array.isArray(value) ? value : [] };
            }
            if (question.questionType === "rating") {
              return { questionId: question.id, ratingValue: Number(value || 0), answerValue: String(value || "") };
            }
            return {
              questionId: question.id,
              answerText: question.questionType === "short_text" || question.questionType === "long_text" ? String(value || "") : null,
              answerValue: question.questionType === "short_text" || question.questionType === "long_text" ? null : String(value || ""),
            };
          }),
        }),
      });
      await readApiResponse(response);
      setSelectedSurvey(null);
    } catch (err) {
      console.error("Failed to submit survey", err);
    } finally {
      setSubmittingSurvey(false);
    }
  };

  const getOfficer = (...roles: string[]) =>
    officers.find((officer) => roles.map((role) => role.toLowerCase()).includes(officer.role)) || null;
  const boardMembers = officers.filter((officer) => officer.role === "board_member");
  const currentSchoolYear = officers[0]?.schoolYear || null;
  const allAnnouncements = announcements.filter((item) => item.type !== "event" && item.type !== "survey");
  const allEvents = announcements.filter((item) => item.type === "event");
  const answerableSurveys = surveys.filter((survey) => survey.questions.length > 0);

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
      <HomepageSlideshow slides={slideshow} className="mb-8" />

      <div
        className="hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(22,22,22,0.76), rgba(85,0,0,0.7)), url(${salayBackground})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="relative z-10">
          <div className="mb-6 text-center md:mb-10">
            <h3 className="font-display text-xl font-bold text-white md:text-2xl">Organization Chart</h3>
            <p className="mt-1 text-sm text-white/75">
              SaCC Alumni Association Officers{currentSchoolYear ? ` | ${currentSchoolYear}` : ""}
            </p>
            <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gold" />
          </div>
          <div className="overflow-hidden pb-2 md:overflow-x-auto md:pb-4">
            <div className="flex w-full min-w-0 flex-col items-center md:min-w-[600px]">
              <OfficerCard name={getOfficer("president")?.name || "TBA"} role="President" photo={getOfficer("president")?.photo} size="lg" accent="navy" textTone="light" />
              <VConn h={4} mdH={7} className="bg-white/35" />
              <OfficerCard name={getOfficer("vice_president")?.name || "TBA"} role="Vice President" photo={getOfficer("vice_president")?.photo} size="md" accent="blue" textTone="light" />
              <VConn h={4} mdH={7} className="bg-white/35" />
              <div className="grid w-full grid-cols-3 items-start gap-2 pt-3 md:flex md:w-auto md:gap-16 md:pt-4">
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("secretary")?.name || "TBA"} role="Secretary" photo={getOfficer("secretary")?.photo} size="md" accent="emerald" textTone="light" />
                  <VConn h={3} mdH={5} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_secretary")?.name || "TBA"} role="Asst. Secretary" photo={getOfficer("assistant_secretary")?.photo} size="sm" accent="teal" textTone="light" />
                </div>
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("treasurer")?.name || "TBA"} role="Treasurer" photo={getOfficer("treasurer")?.photo} size="md" accent="amber" textTone="light" />
                  <VConn h={3} mdH={5} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_treasurer")?.name || "TBA"} role="Asst. Treasurer" photo={getOfficer("assistant_treasurer")?.photo} size="sm" accent="orange" textTone="light" />
                </div>
                <OfficerCard name={getOfficer("auditor")?.name || "TBA"} role="Auditor" photo={getOfficer("auditor")?.photo} size="md" accent="orange" textTone="light" />
              </div>
              <div className="my-4 w-full max-w-xl border-t-2 border-dashed border-white/30 md:my-6" />
              <div className="flex items-start gap-10">
                <OfficerCard name={getOfficer("pio", "pro")?.name || "TBA"} role="PRO" photo={getOfficer("pio", "pro")?.photo} size="md" accent="purple" textTone="light" />
              </div>
              {boardMembers.length > 0 && (
                <>
                  <div className="my-4 w-full max-w-xl border-t-2 border-dashed border-white/30 md:my-6" />
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Board Members</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3 md:gap-6">
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

      <div className="space-y-6">
        <DashboardContentSection
          title="All Announcements"
          description="Official notices and alumni updates."
          count={allAnnouncements.length}
          emptyText="No announcements are available."
        >
          {allAnnouncements.map((announcement) => (
            <ContentCard key={announcement.id} item={announcement} onOpen={openAnnouncement} />
          ))}
        </DashboardContentSection>

        <DashboardContentSection
          title="All Events"
          description="Events remain visible after completion until they move to archive."
          count={allEvents.length}
          emptyText="No events are available."
        >
          {allEvents.map((event) => (
            <ContentCard key={event.id} item={event} onOpen={openAnnouncement} />
          ))}
        </DashboardContentSection>

        <DashboardContentSection
          title="All Surveys"
          description="Answer platform surveys directly inside the system."
          count={answerableSurveys.length}
          emptyText="No surveys are available."
        >
          {answerableSurveys.map((survey) => (
            <button
              key={survey.id}
              type="button"
              onClick={() => openSurvey(survey)}
              className="relative rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy/30 hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-blue-800 sm:hidden">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide">Survey</span>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Survey</Badge>
                <DurationBadge status={survey.computed_status || survey.duration_status} remainingTime={survey.remaining_time} startDatetime={survey.start_datetime} endDatetime={survey.end_datetime} />
                {survey.userAnswers.length > 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Answered</Badge>}
              </div>
              <h4 className="line-clamp-2 text-sm font-semibold text-navy-dark">{survey.title}</h4>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{survey.description || "No description provided."}</p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                {survey.questions.length} question{survey.questions.length === 1 ? "" : "s"} | {survey.responseCount} response{survey.responseCount === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </DashboardContentSection>

      </div>

      <div className="mb-4 hidden items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-display font-bold text-navy-dark">Announcements, Events & Surveys</h3>
          <p className="text-xs text-muted-foreground">Stay updated with the latest activities, alumni notices, and response requests from SaCC Alumni.</p>
        </div>
        <div className="flex items-center gap-1">
          <Bell className="h-4 w-4 text-navy" />
          <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-bold text-white">{announcements.length}</span>
        </div>
      </div>

      <div className="hidden">
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
                onClick={() => openAnnouncement(announcement)}
                className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {imageUrl && (
                  <img src={imageUrl} alt={announcement.title} className="h-36 w-full object-contain" />
                )}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={isSurvey ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : isEvent ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                      {isSurvey ? "Survey" : isEvent ? "Event" : "Announcement"}
                    </Badge>
                    <DurationBadge status={announcement.computed_status || announcement.duration_status} remainingTime={announcement.remaining_time} startDatetime={announcement.start_datetime} endDatetime={announcement.end_datetime} />
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
      </div>

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
                <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{selectedAnnouncement.title}</DialogTitle>
                <DialogDescription>Complete details for the selected post.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {resolveAssetUrl(selectedAnnouncement.image_url) && (
                  <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-slate-50 sm:h-72">
                    <img
                      src={resolveAssetUrl(selectedAnnouncement.image_url) || undefined}
                      alt={selectedAnnouncement.title}
                      className="h-full w-full object-contain"
                    />
                  </div>
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
                  <DetailCard
                    label="Duration"
                    value={
                      <DurationBadge
                        status={selectedAnnouncement.computed_status || selectedAnnouncement.duration_status}
                        remainingTime={selectedAnnouncement.remaining_time}
                        startDatetime={selectedAnnouncement.start_datetime}
                        endDatetime={selectedAnnouncement.end_datetime}
                      />
                    }
                  />
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Complete details</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {selectedAnnouncement.description || "No full content has been added."}
                  </p>
                </div>

                {selectedAnnouncement.type === "survey" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
                    Survey responses are now collected through the internal survey cards on the dashboard.
                  </div>
                )}
                {selectedAnnouncement.type === "survey" && selectedAnnouncement.is_expired && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                    This survey is archived and no longer accepts answers.
                  </div>
                )}

                {selectedAnnouncement.type === "event" && renderEventDialogSection({
                  announcement: selectedAnnouncement,
                  rsvp: eventRsvps[selectedAnnouncement.id] || null,
                  joined: Boolean(eventRsvps[selectedAnnouncement.id]) || registrations.has(selectedAnnouncement.id),
                  choiceOpen: Boolean(rsvpChoiceOpen[selectedAnnouncement.id]),
                  eventComments: comments[selectedAnnouncement.id] || [],
                  commentsVisible: showComments[selectedAnnouncement.id] ?? false,
                  commentInput: commentInputs[selectedAnnouncement.id] ?? "",
                  onShowChoices: () => setRsvpChoiceOpen((current) => ({ ...current, [selectedAnnouncement.id]: true })),
                  onSaveRsvp: (responseStatus) => saveEventRsvp(selectedAnnouncement.id, responseStatus),
                  onCancelRsvp: () => cancelEventRsvp(selectedAnnouncement.id),
                  onCheckIn: () => checkInEvent(selectedAnnouncement.id),
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

      <Dialog open={Boolean(selectedSurvey)} onOpenChange={(open) => !open && setSelectedSurvey(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selectedSurvey && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Survey</Badge>
                  <DurationBadge status={selectedSurvey.computed_status || selectedSurvey.duration_status} remainingTime={selectedSurvey.remaining_time} startDatetime={selectedSurvey.start_datetime} endDatetime={selectedSurvey.end_datetime} />
                </div>
                <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{selectedSurvey.title}</DialogTitle>
                <DialogDescription>{selectedSurvey.description || "Answer the survey questions below."}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {selectedSurvey.questions.map((question) => (
                  <SurveyQuestionField
                    key={question.id}
                    question={question}
                    value={surveyAnswers[question.id]}
                    disabled={Boolean(selectedSurvey.is_expired)}
                    onChange={updateSurveyAnswer}
                  />
                ))}
                {selectedSurvey.is_expired && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                    This survey is completed and no longer accepts answers.
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setSelectedSurvey(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    Close
                  </button>
                  {!selectedSurvey.is_expired && (
                    <button
                      type="button"
                      onClick={() => void submitSurvey()}
                      disabled={submittingSurvey || (selectedSurvey.userAnswers.length > 0 && !selectedSurvey.allowMultipleResponses)}
                      className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {selectedSurvey.userAnswers.length > 0 && !selectedSurvey.allowMultipleResponses ? "Already Answered" : "Submit Answer"}
                    </button>
                  )}
                </div>
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

function DashboardContentSection({
  title,
  description,
  count,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-dark">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{count}</Badge>
      </div>
      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function ContentCard({ item, onOpen }: { item: AnnouncementData; onOpen: (item: AnnouncementData) => void }) {
  const imageUrl = resolveAssetUrl(item.image_url);
  const isEvent = item.type === "event";
  const isSurvey = item.type === "survey";
  const hasImage = Boolean(imageUrl);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={
        hasImage
          ? "relative min-h-[220px] overflow-hidden rounded-xl border border-slate-900/20 bg-slate-950 p-0 text-left shadow-sm transition hover:border-navy/30 hover:shadow-md sm:min-h-0 sm:border-slate-200 sm:bg-white sm:p-4"
          : "rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy/30 hover:shadow-md"
      }
    >
      {hasImage && (
        <>
          <img src={imageUrl || undefined} alt="" className="absolute inset-0 h-full w-full object-cover sm:hidden" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/20 sm:hidden" />
        </>
      )}
      <div className={hasImage ? "relative flex min-h-[220px] flex-col justify-end p-4 sm:min-h-0 sm:flex sm:flex-col sm:justify-start sm:gap-4 sm:p-0 md:flex-row md:items-start" : "flex flex-col gap-4 md:flex-row md:items-start"}>
        {imageUrl && (
          <div className="hidden h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:flex md:w-36">
            <img src={imageUrl} alt={item.title} className="h-full w-full object-contain" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={isSurvey ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : isEvent ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
              {isSurvey ? "Survey" : isEvent ? "Event" : "Announcement"}
            </Badge>
            <DurationBadge status={item.computed_status || item.duration_status} remainingTime={item.remaining_time} startDatetime={item.start_datetime} endDatetime={item.end_datetime} />
          </div>
          <h4 className={hasImage ? "line-clamp-2 text-base font-semibold text-white drop-shadow-sm sm:text-sm sm:text-navy-dark sm:drop-shadow-none" : "line-clamp-2 text-sm font-semibold text-navy-dark"}>{item.title}</h4>
          <p className={hasImage ? "mt-2 line-clamp-3 text-xs leading-5 text-white/90 drop-shadow-sm sm:mt-1 sm:line-clamp-2 sm:text-muted-foreground sm:drop-shadow-none" : "mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"}>{item.description || "No description provided."}</p>
          <p className={hasImage ? "mt-3 text-xs font-semibold text-white/85 sm:mt-2 sm:text-muted-foreground" : "mt-2 text-xs font-semibold text-muted-foreground"}>
            {isEvent ? "Open event details" : "Open full details"}
          </p>
        </div>
      </div>
    </button>
  );
}

function SurveyQuestionField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: SurveyQuestion;
  value?: string | string[];
  disabled?: boolean;
  onChange: (question: SurveyQuestion, value: string, checked?: boolean) => void;
}) {
  const textValue = Array.isArray(value) ? "" : String(value || "");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-navy-dark">
        {question.questionText}
        {question.isRequired ? " *" : ""}
      </p>
      <div className="mt-3">
        {(question.questionType === "short_text" || question.questionType === "long_text") && (
          <textarea
            value={textValue}
            disabled={disabled}
            rows={question.questionType === "long_text" ? 4 : 2}
            placeholder={question.placeholder || ""}
            onChange={(event) => onChange(question, event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy"
          />
        )}
        {question.questionType === "single_choice" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <input type="radio" disabled={disabled} checked={textValue === option} onChange={() => onChange(question, option)} />
                {option}
              </label>
            ))}
          </div>
        )}
        {question.questionType === "multiple_choice" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option);
              return (
                <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <input type="checkbox" disabled={disabled} checked={selected} onChange={(event) => onChange(question, option, event.target.checked)} />
                  {option}
                </label>
              );
            })}
          </div>
        )}
        {question.questionType === "yes_no" && (
          <div className="flex flex-wrap gap-2">
            {["Yes", "No"].map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => onChange(question, option)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold ${textValue === option ? "border-navy bg-navy text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {question.questionType === "rating" && (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: Number(question.maxRating || 5) - Number(question.minRating || 1) + 1 }, (_, index) => Number(question.minRating || 1) + index).map((rating) => (
              <button
                key={rating}
                type="button"
                disabled={disabled}
                onClick={() => onChange(question, String(rating))}
                className={`h-10 w-10 rounded-xl border text-sm font-semibold ${textValue === String(rating) ? "border-navy bg-navy text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
              >
                {rating}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderEventDialogSection({
  announcement,
  joined,
  rsvp,
  choiceOpen,
  eventComments,
  commentsVisible,
  commentInput,
  onShowChoices,
  onSaveRsvp,
  onCancelRsvp,
  onCheckIn,
  onToggleComments,
  onChangeComment,
  onSubmitComment,
}: {
  announcement: AnnouncementData;
  joined: boolean;
  rsvp: EventRsvpState | null;
  choiceOpen: boolean;
  eventComments: CommentData[];
  commentsVisible: boolean;
  commentInput: string;
  onShowChoices: () => void;
  onSaveRsvp: (responseStatus: EventRsvpStatus) => void;
  onCancelRsvp: () => void;
  onCheckIn: () => void;
  onToggleComments: () => void;
  onChangeComment: (value: string) => void;
  onSubmitComment: () => void;
}) {
  const status = announcement.computed_status || announcement.duration_status;
  const rsvpClosed = Boolean(announcement.is_expired) || status === "Archived" || status === "Completed";
  const canCheckIn = rsvp?.response_status === "Going" && status === "Active" && rsvp.attendance_status !== "Attended";

  return (
    <div className="space-y-3">
      {rsvp ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            RSVP: {rsvp.response_status}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-emerald-700">
              Attendance: {rsvp.attendance_status}
            </span>
          </div>
          {!rsvpClosed && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onShowChoices}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-emerald-100"
              >
                Update RSVP
              </button>
              <button
                type="button"
                onClick={onCancelRsvp}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel RSVP
              </button>
              {canCheckIn && (
                <button
                  type="button"
                  onClick={onCheckIn}
                  className="inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-light"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Check In
                </button>
              )}
            </div>
          )}
        </div>
      ) : rsvpClosed ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-700">
          RSVP is closed for this event.
        </div>
      ) : choiceOpen ? (
        <RsvpChoices onSaveRsvp={onSaveRsvp} />
      ) : (
        <button
          onClick={() => onSaveRsvp("Interested")}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: "var(--gradient-navy)" }}
        >
          <Calendar className="h-4 w-4" />
          Interested
        </button>
      )}

      {choiceOpen && joined && !rsvpClosed && <RsvpChoices onSaveRsvp={onSaveRsvp} />}

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

function RsvpChoices({ onSaveRsvp }: { onSaveRsvp: (responseStatus: EventRsvpStatus) => void }) {
  const choices: EventRsvpStatus[] = ["Going", "Interested", "Not Going"];
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onSaveRsvp(choice)}
          className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-navy-dark transition hover:border-navy hover:bg-navy hover:text-white"
        >
          {choice}
        </button>
      ))}
    </div>
  );
}
