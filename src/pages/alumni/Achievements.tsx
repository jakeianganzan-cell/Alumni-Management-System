import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  CheckCircle2,
  Clock3,
  FileImage,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type AchievementStatus = "pending" | "approved" | "rejected" | "archived";
type ReactionType = "heart";

interface ReactionCounts {
  heart: number;
}

interface AchievementRecord {
  id: number;
  alumniId: string;
  name: string;
  batch: string | null;
  course: string | null;
  title: string;
  description: string | null;
  date: string;
  category: string;
  organization: string | null;
  proofImage: string | null;
  featured: boolean;
  status: AchievementStatus;
  rejectionReason: string | null;
  createdAt: string;
  reactionCounts: ReactionCounts;
  currentUserReaction: ReactionType | null;
  commentCount: number;
}

interface AchievementComment {
  id: number;
  achievementId: number;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorBatch: string | null;
  authorCourse: string | null;
  authorPhoto: string | null;
}

interface FormState {
  title: string;
  category: string;
  organization: string;
  date: string;
  description: string;
  proofImage: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  category: "",
  organization: "",
  date: "",
  description: "",
  proofImage: "",
};

const CATEGORIES = [
  "Career Excellence",
  "Entrepreneurship",
  "Innovation",
  "Academic Excellence",
  "Professional Achievement",
  "Community Service",
];


const EMPTY_REACTIONS: ReactionCounts = {
  heart: 0,
};

export default function AlumniAchievements() {
  const { profile } = useAuth();
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [comments, setComments] = useState<Record<number, AchievementComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<AchievementRecord | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const formRef = useRef<HTMLElement | null>(null);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/achievements`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AchievementRecord[]>(response);
      const normalized = data.map((achievement) => ({
        ...achievement,
        reactionCounts: achievement.reactionCounts || EMPTY_REACTIONS,
        currentUserReaction: achievement.currentUserReaction || null,
        commentCount: achievement.commentCount || 0,
      }));
      setAchievements(normalized);
      setSelected((current) => (current ? normalized.find((achievement) => achievement.id === current.id) || current : current));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load achievements");
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (achievementId: number) => {
    try {
      const response = await fetch(`${API_URL}/achievements/${achievementId}/comments`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AchievementComment[]>(response);
      setComments((current) => ({ ...current, [achievementId]: data }));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load achievement comments");
    }
  };

  useEffect(() => {
    void loadAchievements();
    const interval = window.setInterval(() => {
      void loadAchievements();
    }, 8000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selected) return;

    void loadComments(selected.id);
    const interval = window.setInterval(() => {
      void loadComments(selected.id);
      void loadAchievements();
    }, 6000);

    return () => window.clearInterval(interval);
  }, [selected?.id]);

  const approvedAchievements = useMemo(
    () => achievements.filter((achievement) => achievement.status === "approved"),
    [achievements],
  );

  const mySubmissions = useMemo(() => {
    return achievements.filter((achievement) => achievement.alumniId === profile?.id);
  }, [achievements, profile?.id]);

  const stats = [
    { label: "Approved", value: approvedAchievements.length },
    { label: "My submissions", value: mySubmissions.length },
    { label: "Pending review", value: mySubmissions.filter((achievement) => achievement.status === "pending").length },
  ];

  const submitAchievement = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/achievements`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      await readApiResponse(response);
      toast.success("Achievement submitted for review");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadAchievements();
    } catch (error) {
      console.error(error);
      toast.error("Could not submit achievement");
    } finally {
      setSaving(false);
    }
  };

  const onProofChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, proofImage: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const reactToAchievement = async (achievementId: number, reactionType: ReactionType) => {
    try {
      setReactingTo(achievementId);
      const response = await fetch(`${API_URL}/achievements/${achievementId}/reaction`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reactionType }),
      });
      const payload = await readApiResponse<{ currentReaction: ReactionType | null; reactionCounts: ReactionCounts }>(response);
      setAchievements((current) =>
        current.map((achievement) =>
          achievement.id === achievementId
            ? {
                ...achievement,
                currentUserReaction: payload.currentReaction,
                reactionCounts: payload.reactionCounts,
              }
            : achievement,
        ),
      );
      setSelected((current) =>
        current && current.id === achievementId
          ? {
              ...current,
              currentUserReaction: payload.currentReaction,
              reactionCounts: payload.reactionCounts,
            }
          : current,
      );
    } catch (error) {
      console.error(error);
      toast.error("Could not update reaction");
    } finally {
      setReactingTo(null);
    }
  };

  const submitComment = async () => {
    if (!selected || !commentInput.trim()) return;

    try {
      setSendingComment(true);
      const response = await fetch(`${API_URL}/achievements/${selected.id}/comments`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      await readApiResponse(response);
      setCommentInput("");
      await Promise.all([loadComments(selected.id), loadAchievements()]);
    } catch (error) {
      console.error(error);
      toast.error("Could not add comment");
    } finally {
      setSendingComment(false);
    }
  };

  const openAchievementForm = () => {
    setShowForm(true);
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <AlumniLayout title="Achievements" subtitle="Celebrate alumni milestones with real reactions and live discussion">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Achievement Center</p>
              <h2 className="text-xl font-semibold text-navy-dark">Verified alumni milestones and community recognition</h2>
              <p className="text-sm text-muted-foreground">Submit your accomplishments, react with emojis, and join the conversation around approved achievements.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-navy-dark">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {showForm && (
          <section ref={formRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-navy-dark">Submit achievement</h2>
              <p className="text-sm text-muted-foreground">Use clear details and one proof image so the admin team can review it quickly.</p>
            </div>

            <form onSubmit={submitAchievement} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Title" required>
                  <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
                <Field label="Category" required>
                  <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} required className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy">
                    <option value="">Select category</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Organization">
                  <Input value={form.organization} onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
                <Field label="Date" required>
                  <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
              </div>

              <Field label="Description">
                <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} className="border-slate-300 bg-white" />
              </Field>

              <Field label="Proof image">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-muted-foreground transition hover:border-navy">
                  <FileImage className="h-5 w-5" />
                  <span>{form.proofImage ? "Image ready" : "Choose image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onProofChange} />
                </label>
                {form.proofImage && <img src={form.proofImage} alt="Proof preview" className="mt-3 h-40 w-full rounded-2xl border border-slate-200 object-cover" />}
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Submit
                    </>
                  )}
                </Button>
              </div>
            </form>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-navy-dark">Approved achievements</h2>
              <p className="text-sm text-muted-foreground">React, comment, and open any achievement to follow the discussion in real time.</p>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading achievements...</div>
              ) : approvedAchievements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
                  No approved achievements yet.
                </div>
              ) : (
                approvedAchievements.map((achievement) => (
                  <article key={achievement.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <button type="button" onClick={() => setSelected(achievement)} className="w-full text-left">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-navy-dark">{achievement.title}</h3>
                            <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-navy-dark">{achievement.category}</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {achievement.name} | {achievement.organization || "No organization"}
                          </p>
                        </div>
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(achievement.date)}
                        </p>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{achievement.description || "No description provided."}</p>
                    </button>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void reactToAchievement(achievement.id, "heart")}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          achievement.currentUserReaction === "heart"
                            ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                            : "border-rose-100 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                        }`}
                        disabled={reactingTo === achievement.id}
                      >
                        <span className="text-base leading-none">{"\u2764\uFE0F"}</span>
                        {achievement.reactionCounts.heart}
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {achievement.commentCount} comment{achievement.commentCount === 1 ? "" : "s"}
                      </span>
                      <button type="button" onClick={() => setSelected(achievement)} className="font-medium text-navy">
                        Open discussion
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-navy-dark">My submissions</h2>
              <p className="text-sm text-muted-foreground">Track approval status and any rejection feedback here.</p>
            </div>

            <div className="space-y-3">
              {mySubmissions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
                  No submissions yet.
                </div>
              ) : (
                mySubmissions.map((achievement) => (
                  <div key={achievement.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-navy-dark">{achievement.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{achievement.category}</p>
                      </div>
                      <StatusBadge status={achievement.status} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{achievement.description || "No description provided."}</p>
                    {achievement.rejectionReason && (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Reason: {achievement.rejectionReason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={openAchievementForm}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(91,18,36,0.28)] transition hover:opacity-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-4 w-4" />
        Achievement
      </button>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-navy-dark">{selected.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.name} | {selected.organization || "No organization"}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted-foreground transition hover:bg-slate-100">
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {selected.proofImage && (
              <img src={resolveAssetUrl(selected.proofImage) || selected.proofImage} alt={selected.title} className="mt-4 h-64 w-full rounded-3xl border border-slate-200 object-cover" />
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetaCard label="Category" value={selected.category} />
              <MetaCard label="Date" value={formatDate(selected.date)} />
              <MetaCard label="Batch" value={selected.batch || "Not set"} />
              <MetaCard label="Course" value={selected.course || "Not set"} />
            </div>

            <section className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Description</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{selected.description || "No description provided."}</p>
            </section>

            <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void reactToAchievement(selected.id, "heart")}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selected.currentUserReaction === "heart"
                      ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                      : "border-rose-100 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                  }`}
                  disabled={reactingTo === selected.id}
                >
                  <span className="text-base leading-none">{"\u2764\uFE0F"}</span>
                  Heart {selected.reactionCounts.heart}
                </button>
              </div>
            </section>

            <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-navy-dark">Comments</h3>
                  <p className="text-sm text-muted-foreground">New comments refresh automatically while this panel is open.</p>
                </div>
                <Badge variant="outline">{comments[selected.id]?.length || 0}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                {(comments[selected.id] || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-muted-foreground">
                    No comments yet.
                  </div>
                ) : (
                  (comments[selected.id] || []).map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-navy-dark">{comment.authorName}</p>
                          <p className="text-xs text-muted-foreground">
                            {comment.authorCourse || "Alumni"} {comment.authorBatch ? `| Batch ${comment.authorBatch}` : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</p>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-foreground">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Textarea value={commentInput} onChange={(event) => setCommentInput(event.target.value)} rows={3} className="border-slate-300 bg-white" placeholder="Write a comment..." />
                <Button type="button" onClick={() => void submitComment()} disabled={sendingComment || !commentInput.trim()} className="self-end">
                  {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </section>
          </div>
        </div>
      )}
    </AlumniLayout>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-navy-dark">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: AchievementStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approved
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <XCircle className="h-3.5 w-3.5" />
        Rejected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <Clock3 className="h-3.5 w-3.5" />
      Pending
    </span>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
