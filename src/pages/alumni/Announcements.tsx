import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Reply, Send, UserCircle } from "lucide-react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { AnnouncementAttachment, AnnouncementCard, AnnouncementDetailMeta, formatTypeLabel } from "@/components/AnnouncementCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement } from "@/context/AnnouncementContext";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { toast } from "sonner";
import DurationBadge from "@/components/DurationBadge";

type AlumniAnnouncementForm = {
  title: string;
  description: string;
  date: string;
  organizer: string;
  image_url: string;
};

type AnnouncementReply = {
  id: number;
  commentId: number;
  userId: string;
  content: string;
  status: string;
  createdAt: string;
  authorName: string;
  authorEmail?: string | null;
  authorPhoto?: string | null;
};

type AnnouncementComment = {
  id: number;
  announcementId: number;
  userId: string;
  content: string;
  status: string;
  createdAt: string;
  authorName: string;
  authorEmail?: string | null;
  authorPhoto?: string | null;
  replies: AnnouncementReply[];
};

type AnnouncementInterest = {
  status: "interested" | "not_interested";
  isInterested: boolean;
  interestedAt?: string | null;
  updatedAt?: string | null;
};

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

type AnnouncementTab = "announcements" | "events" | "surveys";

const BLANK_FORM: AlumniAnnouncementForm = {
  title: "",
  description: "",
  date: "",
  organizer: "",
  image_url: "",
};

export default function AlumniAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [surveys, setSurveys] = useState<SurveyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyData | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<number, string | string[]>>({});
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AlumniAnnouncementForm>(BLANK_FORM);
  const [comments, setComments] = useState<Record<string, AnnouncementComment[]>>({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [interestStatus, setInterestStatus] = useState<Record<string, AnnouncementInterest | null>>({});
  const [submittingInterest, setSubmittingInterest] = useState(false);
  const [activeTab, setActiveTab] = useState<AnnouncementTab>("announcements");

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/announcements`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Announcement[]>(response);
      setAnnouncements(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  const loadSurveys = async () => {
    try {
      const response = await fetch(`${API_URL}/surveys`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<SurveyData[]>(response);
      setSurveys(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load surveys");
    }
  };

  useEffect(() => {
    void loadAnnouncements();
    void loadSurveys();
  }, []);

  useEffect(() => {
    if (!selectedAnnouncement) return;

    void loadComments(selectedAnnouncement.id);
    if (canShowInterestButton(selectedAnnouncement)) {
      void loadInterestStatus(selectedAnnouncement.id);
    }
  }, [selectedAnnouncement?.id, selectedAnnouncement?.type]);

  const publicAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => (announcement.approvalStatus || "approved") === "approved");
  }, [announcements]);

  const announcementItems = useMemo(
    () => publicAnnouncements.filter((announcement) => announcement.type === "announcement"),
    [publicAnnouncements],
  );

  const eventItems = useMemo(
    () => publicAnnouncements.filter((announcement) => announcement.type === "event"),
    [publicAnnouncements],
  );

  const surveyItems = useMemo(
    () => surveys.filter((survey) => survey.questions.length > 0),
    [surveys],
  );

  const tabItems = useMemo(
    () => [
      {
        id: "announcements" as const,
        label: "All Announcements",
        count: announcementItems.length,
      },
      {
        id: "events" as const,
        label: "All Events",
        count: eventItems.length,
      },
      {
        id: "surveys" as const,
        label: "All Surveys",
        count: surveyItems.length,
      },
    ],
    [announcementItems.length, eventItems.length, surveyItems.length],
  );

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, image_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const submitAnnouncement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/announcements`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          type: "announcement",
          status: "active",
          time: "",
          venue: "",
          google_form_link: "",
        }),
      });
      await readApiResponse(response);
      toast.success("Announcement submitted for admin approval");
      setForm(BLANK_FORM);
      setFormOpen(false);
      await loadAnnouncements();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to submit announcement");
    } finally {
      setSubmitting(false);
    }
  };

  const loadComments = async (announcementId: string) => {
    try {
      setLoadingComments(true);
      const response = await fetch(`${API_URL}/announcements/${announcementId}/comments`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AnnouncementComment[]>(response);
      setComments((current) => ({ ...current, [announcementId]: data }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load comments");
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!selectedAnnouncement || !commentInput.trim()) return;

    try {
      setSubmittingComment(true);
      const response = await fetch(`${API_URL}/announcements/${selectedAnnouncement.id}/comments`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      await readApiResponse(response);
      setCommentInput("");
      await loadComments(selectedAnnouncement.id);
      toast.success("Comment posted");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const submitReply = async (commentId: number) => {
    if (!selectedAnnouncement || !replyInputs[commentId]?.trim()) return;

    try {
      setSubmittingComment(true);
      const response = await fetch(`${API_URL}/announcements/${selectedAnnouncement.id}/comments/${commentId}/replies`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyInputs[commentId].trim() }),
      });
      await readApiResponse(response);
      setReplyInputs((current) => ({ ...current, [commentId]: "" }));
      setReplyingTo(null);
      await loadComments(selectedAnnouncement.id);
      toast.success("Reply posted");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to post reply");
    } finally {
      setSubmittingComment(false);
    }
  };

  const loadInterestStatus = async (announcementId: string) => {
    try {
      const response = await fetch(`${API_URL}/announcements/${announcementId}/interest-status`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<{ interest: AnnouncementInterest | null }>(response);
      setInterestStatus((current) => ({ ...current, [announcementId]: data.interest }));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleInterest = async (announcementId: string) => {
    try {
      setSubmittingInterest(true);
      const current = interestStatus[announcementId];
      const response = await fetch(`${API_URL}/announcements/${announcementId}/interest`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ interested: !current?.isInterested }),
      });
      await readApiResponse(response);
      await loadInterestStatus(announcementId);
      toast.success(current?.isInterested ? "Marked as Not Interested" : "Marked as Interested");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update interest");
    } finally {
      setSubmittingInterest(false);
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

    if (missingRequired) {
      toast.error("Please answer all required questions.");
      return;
    }

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
      toast.success("Survey response submitted");
      setSelectedSurvey(null);
      await loadSurveys();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to submit survey");
    } finally {
      setSubmittingSurvey(false);
    }
  };

  return (
    <AlumniLayout title="Announcements" subtitle="Browse published updates and submit alumni announcements for admin approval">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-12 items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-navy text-white shadow-sm"
                    : "bg-slate-50 text-navy-dark hover:bg-slate-100"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.id ? "bg-white/20 text-white" : "bg-white text-muted-foreground"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <p>Loading announcements...</p>
          </div>
        ) : (
          <>
            {activeTab === "announcements" && (
              <AnnouncementSection
                title="All Announcements"
                description="Official updates and alumni notices."
                count={announcementItems.length}
                emptyText="No announcements available."
                items={announcementItems}
                onOpen={setSelectedAnnouncement}
              />
            )}

            {activeTab === "events" && (
              <AnnouncementSection
                title="All Events"
                description="Alumni activities, gatherings, and event schedules."
                count={eventItems.length}
                emptyText="No events available."
                items={eventItems}
                onOpen={setSelectedAnnouncement}
              />
            )}

            {activeTab === "surveys" && (
              <SurveySection
                title="All Surveys"
                description="Answer available alumni surveys directly inside the system."
                count={surveyItems.length}
                emptyText="No surveys available."
                items={surveyItems}
                onOpen={openSurvey}
              />
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(85,0,0,0.28)] transition hover:opacity-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-4 w-4" />
        Announcement
      </button>

      <Dialog open={Boolean(selectedAnnouncement)} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          {selectedAnnouncement && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getTypeBadgeClassName(selectedAnnouncement.type)}>
                    {formatTypeLabel(selectedAnnouncement.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedAnnouncement.date ? new Date(selectedAnnouncement.date).toLocaleDateString() : "Posted recently"}
                  </span>
                </div>
                <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{selectedAnnouncement.title}</DialogTitle>
                <DialogDescription>Complete details for the selected post.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <AnnouncementAttachment announcement={selectedAnnouncement} />

                <AnnouncementDetailMeta announcement={selectedAnnouncement} />

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Complete details
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {selectedAnnouncement.description || "No full content has been added."}
                  </p>
                </div>

                {canShowInterestButton(selectedAnnouncement) && (
                  <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-950">Interest Tracking</p>
                        <p className="text-xs text-amber-900/75">
                          {interestStatus[selectedAnnouncement.id]?.isInterested
                            ? "You are marked Interested. This is not attendance or confirmed participation."
                            : "Click Interested to let the admin know you want updates or are interested in this item."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void toggleInterest(selectedAnnouncement.id)}
                        disabled={submittingInterest || Boolean(selectedAnnouncement.is_expired)}
                        className={interestStatus[selectedAnnouncement.id]?.isInterested ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "bg-navy hover:bg-navy/90"}
                        variant={interestStatus[selectedAnnouncement.id]?.isInterested ? "outline" : "default"}
                      >
                        {submittingInterest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {interestStatus[selectedAnnouncement.id]?.isInterested ? "Not Interested" : "Interested"}
                      </Button>
                    </div>
                  </section>
                )}

                <AnnouncementCommentThread
                  comments={comments[selectedAnnouncement.id] || []}
                  loading={loadingComments}
                  commentInput={commentInput}
                  replyInputs={replyInputs}
                  replyingTo={replyingTo}
                  submitting={submittingComment}
                  onCommentInput={setCommentInput}
                  onSubmitComment={submitComment}
                  onReplyingTo={setReplyingTo}
                  onReplyInput={(commentId, value) => setReplyInputs((current) => ({ ...current, [commentId]: value }))}
                  onSubmitReply={submitReply}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(open) => !submitting && setFormOpen(open)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">Submit Alumni Announcement</DialogTitle>
            <DialogDescription>Your announcement will stay in Pending Approval until an admin reviews and publishes it.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submitAnnouncement} className="space-y-5">
            <Field label="Title">
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required className="border-slate-300 bg-white" />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Announcement Date">
                <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required className="border-slate-300 bg-white" />
              </Field>
              <Field label="Organizer / Batch Group">
                <Input value={form.organizer} onChange={(event) => setForm((current) => ({ ...current, organizer: event.target.value }))} className="border-slate-300 bg-white" placeholder="Optional" />
              </Field>
            </div>

            <Field label="Full announcement">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={6} className="border-slate-300 bg-white" required />
            </Field>

            <Field label="Optional image">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-muted-foreground transition hover:border-navy">
                <Plus className="h-4 w-4" />
                <span>{form.image_url ? "Image selected" : "Upload image"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
              {form.image_url && (
                <div className="mt-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={form.image_url} alt="Announcement preview" className="h-full w-full object-contain" />
                </div>
              )}
            </Field>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedSurvey)} onOpenChange={(open) => !open && setSelectedSurvey(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          {selectedSurvey && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Survey</Badge>
                  <DurationBadge status={selectedSurvey.computed_status || selectedSurvey.duration_status} remainingTime={selectedSurvey.remaining_time} startDatetime={selectedSurvey.start_datetime} endDatetime={selectedSurvey.end_datetime} />
                  {selectedSurvey.userAnswers.length > 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Answered</Badge>}
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
                  <Button type="button" variant="outline" onClick={() => setSelectedSurvey(null)}>
                    Close
                  </Button>
                  {!selectedSurvey.is_expired && (
                    <Button
                      type="button"
                      onClick={() => void submitSurvey()}
                      disabled={submittingSurvey || (selectedSurvey.userAnswers.length > 0 && !selectedSurvey.allowMultipleResponses)}
                    >
                      {submittingSurvey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {selectedSurvey.userAnswers.length > 0 && !selectedSurvey.allowMultipleResponses ? "Already Answered" : "Submit Answer"}
                    </Button>
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

function AnnouncementSection({
  title,
  description,
  count,
  emptyText,
  items,
  onOpen,
}: {
  title: string;
  description: string;
  count: number;
  emptyText: string;
  items: Announcement[];
  onOpen: (announcement: Announcement) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-dark">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{count}</Badge>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onOpen={onOpen}
              className="min-h-[250px] min-w-0 max-w-none md:min-h-[160px]"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SurveySection({
  title,
  description,
  count,
  emptyText,
  items,
  onOpen,
}: {
  title: string;
  description: string;
  count: number;
  emptyText: string;
  items: SurveyData[];
  onOpen: (survey: SurveyData) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-dark">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{count}</Badge>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((survey) => (
            <button
              key={survey.id}
              type="button"
              onClick={() => onOpen(survey)}
              className="min-h-[190px] w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy/30 hover:shadow-md md:min-h-[160px]"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Survey</Badge>
                <DurationBadge status={survey.computed_status || survey.duration_status} remainingTime={survey.remaining_time} startDatetime={survey.start_datetime} endDatetime={survey.end_datetime} />
                {survey.userAnswers.length > 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Answered</Badge>}
              </div>
              <h4 className="line-clamp-2 text-base font-semibold leading-tight text-navy-dark md:text-sm">{survey.title}</h4>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground md:mt-1 md:line-clamp-2 md:text-xs md:leading-5">{survey.description || "No description provided."}</p>
              <p className="mt-3 text-xs font-semibold text-muted-foreground md:mt-2">
                {survey.questions.length} question{survey.questions.length === 1 ? "" : "s"} | {survey.responseCount} response{survey.responseCount === 1 ? "" : "s"}
              </p>
              <span className="mt-4 inline-flex rounded-full bg-navy px-3.5 py-2 text-xs font-bold text-white md:hidden">
                Open survey
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-navy-dark">
        {question.questionText}
        {question.isRequired ? " *" : ""}
      </p>
      <div className="mt-3">
        {(question.questionType === "short_text" || question.questionType === "long_text") && (
          <Textarea
            value={textValue}
            disabled={disabled}
            rows={question.questionType === "long_text" ? 4 : 2}
            placeholder={question.placeholder || ""}
            onChange={(event) => onChange(question, event.target.value)}
            className="border-slate-300 bg-white"
          />
        )}

        {question.questionType === "rating" && (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: (question.maxRating || 5) - (question.minRating || 1) + 1 }, (_, index) => (question.minRating || 1) + index).map((rating) => (
              <button
                key={rating}
                type="button"
                disabled={disabled}
                onClick={() => onChange(question, String(rating))}
                className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold ${textValue === String(rating) ? "border-navy bg-navy text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
              >
                {rating}
              </button>
            ))}
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

        {question.questionType === "single_choice" && (
          <div className="space-y-2">
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="radio" disabled={disabled} checked={textValue === option} onChange={() => onChange(question, option)} />
                {option}
              </label>
            ))}
          </div>
        )}

        {question.questionType === "multiple_choice" && (
          <div className="space-y-2">
            {question.options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option);
              return (
                <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" disabled={disabled} checked={selected} onChange={(event) => onChange(question, option, event.target.checked)} />
                  {option}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AnnouncementCommentThread({
  comments,
  loading,
  commentInput,
  replyInputs,
  replyingTo,
  submitting,
  onCommentInput,
  onSubmitComment,
  onReplyingTo,
  onReplyInput,
  onSubmitReply,
}: {
  comments: AnnouncementComment[];
  loading: boolean;
  commentInput: string;
  replyInputs: Record<number, string>;
  replyingTo: number | null;
  submitting: boolean;
  onCommentInput: (value: string) => void;
  onSubmitComment: () => void;
  onReplyingTo: (commentId: number | null) => void;
  onReplyInput: (commentId: number, value: string) => void;
  onSubmitReply: (commentId: number) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-dark">Comments</h3>
          <p className="text-sm text-muted-foreground">Ask questions and reply to existing comments.</p>
        </div>
        <Badge variant="outline">{comments.length}</Badge>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
            No comments yet.
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <CommentAuthor
                name={comment.authorName}
                email={comment.authorEmail}
                photo={comment.authorPhoto}
                date={comment.createdAt}
              />
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{comment.content}</p>
              <button
                type="button"
                onClick={() => onReplyingTo(replyingTo === comment.id ? null : comment.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-navy"
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>

              {comment.replies.length > 0 && (
                <div className="mt-3 space-y-3 border-l-2 border-slate-200 pl-3">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="rounded-xl bg-white p-3">
                      <CommentAuthor
                        name={reply.authorName}
                        email={reply.authorEmail}
                        photo={reply.authorPhoto}
                        date={reply.createdAt}
                      />
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {replyingTo === comment.id && (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={replyInputs[comment.id] || ""}
                    onChange={(event) => onReplyInput(comment.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSubmitReply(comment.id);
                      }
                    }}
                    placeholder="Write a reply..."
                    className="border-slate-300 bg-white"
                  />
                  <Button
                    type="button"
                    onClick={() => onSubmitReply(comment.id)}
                    disabled={submitting || !replyInputs[comment.id]?.trim()}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Textarea
          value={commentInput}
          onChange={(event) => onCommentInput(event.target.value)}
          rows={2}
          placeholder="Write a comment..."
          className="border-slate-300 bg-white"
        />
        <Button
          type="button"
          onClick={onSubmitComment}
          disabled={submitting || !commentInput.trim()}
          className="self-end"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}

function CommentAuthor({ name, email, photo, date }: { name: string; email?: string | null; photo?: string | null; date: string }) {
  const photoUrl = resolveAssetUrl(photo);
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-xs font-semibold text-white">
        {photoUrl ? <img src={photoUrl} alt={name} className="h-full w-full object-cover" /> : <UserCircle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-navy-dark">{name}</p>
          <span className="text-xs text-muted-foreground">{new Date(date).toLocaleString()}</span>
        </div>
        {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-navy-dark">{label}</span>
      {children}
    </label>
  );
}

function getTypeBadgeClassName(type: Announcement["type"]) {
  if (type === "event") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (type === "survey") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

function canShowInterestButton(announcement: Announcement) {
  return announcement.type === "event" || Boolean(announcement.interestEnabled);
}
