import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, FileText, Inbox, Loader2, Megaphone, MessageSquare, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PostType = "announcement" | "achievement" | "freedom_wall";
type PostFilter = "all" | PostType;

interface MyPost {
  id: string;
  type: PostType;
  typeLabel: string;
  title: string;
  preview: string;
  status?: string | null;
  datePosted?: string | null;
  updatedAt?: string | null;
  details: Record<string, unknown>;
}

interface EditForm {
  title: string;
  description: string;
  date: string;
  organizer: string;
  category: string;
  organization: string;
  content: string;
  imageUrl: string;
  proofImage: string;
}

const INITIAL_VISIBLE_COUNT = 5;
const POST_CATEGORIES = ["Career", "Event", "Achievement", "Advice", "Personal", "Discussion"];
const ACHIEVEMENT_CATEGORIES = [
  "Career Excellence",
  "Entrepreneurship",
  "Innovation",
  "Academic Excellence",
  "Professional Achievement",
  "Community Service",
];

const filters: Array<{ key: PostFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "achievement", label: "Achievements" },
  { key: "freedom_wall", label: "Freedom Wall" },
];

const typeIcons: Record<PostType, typeof FileText> = {
  announcement: Megaphone,
  achievement: Trophy,
  freedom_wall: MessageSquare,
};

const endpointType: Record<PostType, string> = {
  announcement: "announcements",
  achievement: "achievements",
  freedom_wall: "freedom-wall",
};

const formatDate = (value?: string | null) => {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatStatus = (value?: string | null) =>
  String(value || "No status")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const truncate = (value: string, length = 92) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length - 3)}...`;
};

const toDateInputValue = (value: unknown) => {
  const text = String(value || "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const toForm = (post: MyPost): EditForm => ({
  title: String(post.details.title || post.title || ""),
  description: String(post.details.description || post.preview || ""),
  date: toDateInputValue(post.details.date),
  organizer: String(post.details.organizer || ""),
  category: String(post.details.category || "Discussion"),
  organization: String(post.details.organization || ""),
  content: String(post.details.content || post.preview || ""),
  imageUrl: String(post.details.imageUrl || ""),
  proofImage: String(post.details.proofImage || ""),
});

export default function MyPostsPanel() {
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PostFilter>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [editingPost, setEditingPost] = useState<MyPost | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const response = await fetchApi(`${API_URL}/account/my-posts`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<MyPost[]>(response);
      setPosts(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load your posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [activeFilter]);

  const filteredPosts = useMemo(() => {
    return activeFilter === "all" ? posts : posts.filter((post) => post.type === activeFilter);
  }, [activeFilter, posts]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);

  const openEdit = (post: MyPost) => {
    setEditingPost(post);
    setEditForm(toForm(post));
  };

  const closeEdit = () => {
    if (saving) return;
    setEditingPost(null);
    setEditForm(null);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPost || !editForm) return;

    const payload =
      editingPost.type === "announcement"
        ? {
            title: editForm.title,
            description: editForm.description,
            date: editForm.date,
            organizer: editForm.organizer,
            imageUrl: editForm.imageUrl,
          }
        : editingPost.type === "achievement"
          ? {
              title: editForm.title,
              description: editForm.description,
              date: editForm.date,
              category: editForm.category,
              organization: editForm.organization,
              proofImage: editForm.proofImage,
            }
          : {
              content: editForm.content,
              category: editForm.category,
              imageUrl: editForm.imageUrl,
            };

    setSaving(true);
    try {
      const response = await fetchApi(`${API_URL}/account/my-posts/${endpointType[editingPost.type]}/${editingPost.id}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse<{ message?: string }>(response);
      toast.success(data.message || "Post updated successfully.");
      setEditingPost(null);
      setEditForm(null);
      await loadPosts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update post.");
    } finally {
      setSaving(false);
    }
  };

  const removePost = async (post: MyPost) => {
    const confirmed = window.confirm("Remove this post from your list?");
    if (!confirmed) return;

    setRemovingId(`${post.type}-${post.id}`);
    try {
      const response = await fetchApi(`${API_URL}/account/my-posts/${endpointType[post.type]}/${post.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<{ message?: string }>(response);
      setPosts((current) => current.filter((item) => !(item.type === post.type && item.id === post.id)));
      toast.success(data.message || "Post removed successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove post.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">My Posts</p>
          <h3 className="font-display text-lg font-bold text-navy-dark">Posts I Created</h3>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadPosts()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              activeFilter === filter.key
                ? "border-navy bg-navy text-white"
                : "border-border bg-background text-muted-foreground hover:border-navy/40 hover:text-navy"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Loading your posts...
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold text-foreground">You haven't posted anything yet.</p>
          </div>
        ) : (
          visiblePosts.map((post) => {
            const Icon = typeIcons[post.type];
            const rowKey = `${post.type}-${post.id}`;
            return (
              <div key={rowKey} className="grid gap-3 rounded-2xl border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/10 px-2.5 py-1 text-[11px] font-semibold text-navy">
                      <Icon className="h-3.5 w-3.5" />
                      {post.typeLabel}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                      {formatStatus(post.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(post.datePosted)}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-navy-dark">{post.title}</p>
                  {post.preview && <p className="mt-1 text-xs leading-5 text-muted-foreground">{truncate(post.preview)}</p>}
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(post)} className="gap-1.5">
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void removePost(post)} disabled={removingId === rowKey} className="gap-1.5 text-rose-700 hover:text-rose-800">
                    {removingId === rowKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!loading && filteredPosts.length > visibleCount && (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_COUNT)}>
            Show more
          </Button>
        </div>
      )}

      <Dialog open={Boolean(editingPost && editForm)} onOpenChange={(open) => (!open ? closeEdit() : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit {editingPost?.typeLabel}</DialogTitle>
            <DialogDescription>Update only the details you want to change.</DialogDescription>
          </DialogHeader>

          {editingPost && editForm && (
            <form onSubmit={saveEdit} className="space-y-4">
              {editingPost.type === "freedom_wall" ? (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-content">Content</label>
                    <Textarea id="post-content" value={editForm.content} onChange={(event) => setEditForm((current) => current ? { ...current, content: event.target.value } : current)} rows={5} className="mt-1" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-category">Category</label>
                    <select id="post-category" value={editForm.category} onChange={(event) => setEditForm((current) => current ? { ...current, category: event.target.value } : current)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {POST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-title">Title</label>
                    <Input id="post-title" value={editForm.title} onChange={(event) => setEditForm((current) => current ? { ...current, title: event.target.value } : current)} className="mt-1" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-date">Date</label>
                    <Input id="post-date" type="date" value={editForm.date} onChange={(event) => setEditForm((current) => current ? { ...current, date: event.target.value } : current)} className="mt-1" required />
                  </div>
                  {editingPost.type === "achievement" && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="achievement-category">Category</label>
                      <select id="achievement-category" value={editForm.category} onChange={(event) => setEditForm((current) => current ? { ...current, category: event.target.value } : current)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                        <option value="">Select category</option>
                        {ACHIEVEMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-description">Details</label>
                    <Textarea id="post-description" value={editForm.description} onChange={(event) => setEditForm((current) => current ? { ...current, description: event.target.value } : current)} rows={4} className="mt-1" />
                  </div>
                  {editingPost.type === "announcement" ? (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-organizer">Organizer</label>
                      <Input id="post-organizer" value={editForm.organizer} onChange={(event) => setEditForm((current) => current ? { ...current, organizer: event.target.value } : current)} className="mt-1" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="post-organization">Organization</label>
                      <Input id="post-organization" value={editForm.organization} onChange={(event) => setEditForm((current) => current ? { ...current, organization: event.target.value } : current)} className="mt-1" />
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeEdit} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
