import { ChangeEvent, useEffect, useMemo, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
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
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [comments, setComments] = useState<Record<number, AchievementComment[]>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<number, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<AchievementRecord | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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
      setLoadingComments((current) => ({ ...current, [achievementId]: true }));
      const response = await fetch(`${API_URL}/achievements/${achievementId}/comments`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AchievementComment[]>(response);
      setComments((current) => ({ ...current, [achievementId]: data }));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load achievement comments");
    } finally {
      setLoadingComments((current) => ({ ...current, [achievementId]: false }));
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

  const toggleComments = async (achievementId: number) => {
    const willOpen = !commentsOpen[achievementId];
    setCommentsOpen((current) => ({ ...current, [achievementId]: willOpen }));
    if (willOpen && !comments[achievementId]) {
      await loadComments(achievementId);
    }
  };

  const submitFeedComment = async (achievementId: number) => {
    const content = commentInputs[achievementId]?.trim();
    if (!content) return;

    try {
      setSubmittingComment((current) => ({ ...current, [achievementId]: true }));
      const response = await fetch(`${API_URL}/achievements/${achievementId}/comments`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ content }),
      });
      await readApiResponse(response);
      setCommentInputs((current) => ({ ...current, [achievementId]: "" }));
      await Promise.all([loadComments(achievementId), loadAchievements()]);
    } catch (error) {
      console.error(error);
      toast.error("Could not add comment");
    } finally {
      setSubmittingComment((current) => ({ ...current, [achievementId]: false }));
    }
  };

  const openAchievementForm = () => {
    setShowForm(true);
  };

  return (
    <AlumniLayout title="Achievements" subtitle="Celebrate alumni milestones with real reactions and live discussion">
      <div className="space-y-6">
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              if (!saving) {
                setShowForm(false);
              }
            }}
          >
          <section
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
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
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-muted-foreground transition hover:border-navy">
                  <FileImage className="h-5 w-5" />
                  <span>{form.proofImage ? "Image ready" : "Choose image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onProofChange} />
                </label>
                {form.proofImage && <img src={form.proofImage} alt="Proof preview" className="mt-3 h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48" />}
              </Field>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
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
          </div>
        )}

        <div className="flex justify-center">
          <section className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-navy-dark">Approved achievements</h2>
              <p className="text-sm text-muted-foreground">React, comment, and open any achievement to follow the discussion in real time.</p>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading achievements...</div>
              ) : approvedAchievements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                  No approved achievements yet.
                </div>
              ) : (
                approvedAchievements.map((achievement) => {
                  const proofImageUrl = resolveAssetUrl(achievement.proofImage) || achievement.proofImage;
                  const achievementComments = comments[achievement.id] || [];
                  const isCommentsOpen = commentsOpen[achievement.id] ?? false;

                  return (
                    <article key={achievement.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition hover:border-navy/30">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white">
                          {achievement.name[0] || "A"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-navy-dark">{achievement.name}</h3>
                            <Badge variant="outline">{achievement.category}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[achievement.course, achievement.batch ? `Batch ${achievement.batch}` : null, achievement.organization, formatDate(achievement.date)]
                              .filter(Boolean)
                              .join(" | ")}
                          </p>

                          <button type="button" onClick={() => setSelected(achievement)} className="mt-3 block w-full text-left">
                            <p className="text-sm font-semibold leading-6 text-foreground">{achievement.title}</p>
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                              {achievement.description || "No description provided."}
                            </p>

                            {proofImageUrl && (
                              <img
                                src={proofImageUrl}
                                alt={achievement.title}
                                className="mt-3 h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48"
                              />
                            )}
                          </button>

                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span>{achievement.reactionCounts.heart} hearts</span>
                            <button
                              type="button"
                              onClick={() => void toggleComments(achievement.id)}
                              className="inline-flex items-center gap-1 transition hover:text-navy"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              {achievement.commentCount} comments
                            </button>
                          </div>

                          <div className="mt-3 flex">
                            <button
                              type="button"
                              onClick={() => void reactToAchievement(achievement.id, "heart")}
                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                achievement.currentUserReaction === "heart"
                                  ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                                  : "border-rose-100 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                              }`}
                              disabled={reactingTo === achievement.id}
                            >
                              <span className="text-base leading-none">{"\u2764\uFE0F"}</span>
                              Heart {achievement.reactionCounts.heart}
                            </button>
                          </div>

                          {isCommentsOpen && (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                              {loadingComments[achievement.id] ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading comments...
                                </div>
                              ) : achievementComments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No comments yet.</p>
                              ) : (
                                <div className="space-y-3">
                                  {achievementComments.map((comment) => {
                                    const commentPhoto = resolveAssetUrl(comment.authorPhoto);
                                    return (
                                      <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-start gap-3">
                                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-xs font-semibold text-white">
                                            {commentPhoto ? (
                                              <img src={commentPhoto} alt={comment.authorName} className="h-full w-full object-cover" />
                                            ) : (
                                              comment.authorName[0]
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-sm font-semibold text-navy-dark">{comment.authorName}</p>
                                              <span className="text-xs text-muted-foreground">
                                                {[comment.authorCourse, comment.authorBatch ? `Batch ${comment.authorBatch}` : null, new Date(comment.createdAt).toLocaleString()]
                                                  .filter(Boolean)
                                                  .join(" | ")}
                                              </span>
                                            </div>
                                            <p className="mt-1 text-sm leading-6 text-foreground">{comment.content}</p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="mt-4 flex gap-2">
                                <Input
                                  value={commentInputs[achievement.id] || ""}
                                  onChange={(event) =>
                                    setCommentInputs((current) => ({ ...current, [achievement.id]: event.target.value }))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void submitFeedComment(achievement.id);
                                    }
                                  }}
                                  placeholder="Write a comment..."
                                  className="border-slate-300 bg-white"
                                />
                                <Button
                                  type="button"
                                  onClick={() => void submitFeedComment(achievement.id)}
                                  disabled={submittingComment[achievement.id] || !commentInputs[achievement.id]?.trim()}
                                >
                                  {submittingComment[achievement.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={openAchievementForm}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(85,0,0,0.28)] transition hover:opacity-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-4 w-4" />
        Achievement
      </button>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white">
                  {selected.name[0] || "A"}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-navy-dark">{selected.name}</h2>
                    <Badge variant="outline">{selected.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[selected.course, selected.batch ? `Batch ${selected.batch}` : null, selected.organization, formatDate(selected.date)]
                      .filter(Boolean)
                      .join(" | ")}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted-foreground transition hover:bg-slate-100">
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <p className="text-base font-semibold leading-6 text-foreground">{selected.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">{selected.description || "No description provided."}</p>
            </div>

            {selected.proofImage && (
              <img src={resolveAssetUrl(selected.proofImage) || selected.proofImage} alt={selected.title} className="mx-auto mt-4 aspect-square w-full max-w-sm rounded-xl border border-slate-200 object-cover" />
            )}

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
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

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-navy-dark">Comments</h3>
                  <p className="text-sm text-muted-foreground">New comments refresh automatically while this panel is open.</p>
                </div>
                <Badge variant="outline">{comments[selected.id]?.length || 0}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                {(comments[selected.id] || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                    No comments yet.
                  </div>
                ) : (
                  (comments[selected.id] || []).map((comment) => {
                    const commentPhoto = resolveAssetUrl(comment.authorPhoto);
                    return (
                    <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-xs font-semibold text-white">
                          {commentPhoto ? (
                            <img src={commentPhoto} alt={comment.authorName} className="h-full w-full object-cover" />
                          ) : (
                            comment.authorName[0] || "A"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-navy-dark">{comment.authorName}</p>
                            <span className="text-xs text-muted-foreground">
                              {[comment.authorCourse, comment.authorBatch ? `Batch ${comment.authorBatch}` : null, new Date(comment.createdAt).toLocaleString()]
                                .filter(Boolean)
                                .join(" | ")}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-foreground">{comment.content}</p>
                        </div>
                      </div>
                    </div>
                    );
                  })
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
