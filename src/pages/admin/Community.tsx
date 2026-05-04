import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPageIntro, AdminStatCard, AdminStatsGrid } from "@/components/admin/AdminPageIntro";
import { AlertTriangle, MessageCircle, MessageSquare, Pin, Search, Trash2 } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { toast } from "sonner";

interface Post {
  id: number;
  author: string;
  authorBatch: string;
  content: string;
  timestamp: string;
  likes: number;
  comments: number;
  isPinned: boolean;
  isFlagged: boolean;
  category: string;
  status: string;
}

export default function AdminCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFlagged, setShowFlagged] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/admin/freedom-wall/posts`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Post[]>(response);
      setPosts(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load Freedom Wall posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch =
        post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.author.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFlag = showFlagged ? post.isFlagged : true;
      return matchesSearch && matchesFlag;
    });
  }, [posts, searchQuery, showFlagged]);

  const focusPost = filteredPosts[0] ?? posts[0] ?? null;

  const deletePost = async (id: number) => {
    if (confirm("Are you sure you want to delete this post?")) {
      try {
        const response = await fetch(`${API_URL}/admin/freedom-wall/posts/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        await readApiResponse(response);
        toast.success("Post marked as deleted");
        await loadPosts();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Could not delete post");
      }
    }
  };

  const togglePin = async (post: Post) => {
    try {
      const response = await fetch(`${API_URL}/admin/freedom-wall/posts/${post.id}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isPinned: !post.isPinned }),
      });
      await readApiResponse(response);
      await loadPosts();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not update pin state");
    }
  };

  const unflagPost = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/admin/freedom-wall/posts/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "published" }),
      });
      await readApiResponse(response);
      toast.success("Flag cleared");
      await loadPosts();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not clear flag");
    }
  };

  const stats = [
    { label: "Posts", value: posts.length, note: "Visible records", icon: <MessageSquare className="h-4 w-4 text-blue-700" />, tone: "bg-blue-100" },
    { label: "Comments", value: posts.reduce((total, post) => total + post.comments, 0), note: "Total discussion volume", icon: <MessageCircle className="h-4 w-4 text-violet-700" />, tone: "bg-violet-100" },
    { label: "Pinned", value: posts.filter((post) => post.isPinned).length, note: "Highlighted wall posts", icon: <Pin className="h-4 w-4 text-amber-700" />, tone: "bg-amber-100" },
    { label: "Flagged", value: posts.filter((post) => post.isFlagged).length, note: "Need moderation attention", icon: <AlertTriangle className="h-4 w-4 text-rose-700" />, tone: "bg-rose-100" },
  ];

  return (
    <AdminLayout title="Freedom Wall" subtitle="Moderate alumni posts with a clearer and more polished review layout">
      <div className="space-y-6">
        <AdminPageIntro
          eyebrow="Community Moderation"
          title="Freedom Wall posts"
          description="Search community posts, review flagged content, and manage pinned discussions from a simpler moderation view."
        />

        <AdminStatsGrid>
          {stats.map((item) => (
            <AdminStatCard
              key={item.label}
              label={item.label}
              value={item.value}
              description={item.note}
              icon={item.icon}
              toneClassName={item.tone}
            />
          ))}
        </AdminStatsGrid>

        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Focus post</p>
                <h2 className="mt-1 text-base font-semibold text-navy-dark">
                  {focusPost ? focusPost.author : "No post selected"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {focusPost ? `Batch ${focusPost.authorBatch} | ${focusPost.category}` : "No community posts are loaded right now."}
                </p>
              </div>
              {focusPost && (
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={getPostStatusTone(focusPost.status)} label={formatPostStatus(focusPost.status)} />
                  {focusPost.isPinned && <StatusPill tone="bg-amber-100 text-amber-700" label="Pinned" />}
                  {focusPost.isFlagged && <StatusPill tone="bg-rose-100 text-rose-700" label="Flagged" />}
                </div>
              )}
            </div>

            {focusPost ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-border bg-muted/15 p-4">
                  <p className="text-sm leading-6 text-foreground">{focusPost.content}</p>
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <InlineInfo label={`${focusPost.likes} likes`} />
                  <InlineInfo label={`${focusPost.comments} comments`} />
                  <InlineInfo label={focusPost.timestamp} />
                  <InlineInfo label={focusPost.category} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void togglePin(focusPost)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      focusPost.isPinned
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "border border-border hover:border-navy/40 hover:text-navy"
                    }`}
                    type="button"
                  >
                    {focusPost.isPinned ? "Unpin post" : "Pin post"}
                  </button>
                  {focusPost.isFlagged && (
                    <button onClick={() => void unflagPost(focusPost.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700" type="button">
                      Clear flag
                    </button>
                  )}
                  <button onClick={() => void deletePost(focusPost.id)} className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-200 hover:bg-rose-50" type="button">
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No Freedom Wall posts found.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search posts"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={searchInputClassName}
                />
              </div>
              <button
                onClick={() => setShowFlagged((current) => !current)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  showFlagged
                    ? "border border-rose-200 bg-rose-100 text-rose-700"
                    : "border border-border bg-white text-muted-foreground hover:border-navy"
                }`}
                type="button"
              >
                {showFlagged ? "Showing flagged only" : "Show flagged only"}
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-muted/35">
                    <tr>
                      <th className={tableHeadClassName}>Author</th>
                      <th className={tableHeadClassName}>Content</th>
                      <th className={tableHeadClassName}>Category</th>
                      <th className={tableHeadClassName}>Engagement</th>
                      <th className={tableHeadClassName}>Status</th>
                      <th className={tableHeadClassName}>Time</th>
                      <th className={tableHeadClassName}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center">
                          <p className="text-sm text-muted-foreground">Loading Freedom Wall posts...</p>
                        </td>
                      </tr>
                    ) : filteredPosts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center">
                          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">No Freedom Wall posts found.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredPosts.map((post) => (
                        <tr key={post.id}>
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-semibold text-navy-dark">{post.author}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Batch {post.authorBatch}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="max-w-md truncate text-sm text-muted-foreground">{post.content}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                              {post.category}
                            </span>
                          </td>
                          <td className={tableCellClassName}>
                            {post.likes} likes | {post.comments} comments
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-2">
                              <StatusPill tone={getPostStatusTone(post.status)} label={formatPostStatus(post.status)} />
                              {post.isPinned && <StatusPill tone="bg-amber-100 text-amber-700" label="Pinned" />}
                              {post.isFlagged && <StatusPill tone="bg-rose-100 text-rose-700" label="Flagged" />}
                            </div>
                          </td>
                          <td className={tableCellClassName}>{post.timestamp}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1">
                              <IconButton
                                label={post.isPinned ? "Unpin" : "Pin"}
                                onClick={() => void togglePin(post)}
                                icon={<Pin className={`h-3.5 w-3.5 ${post.isPinned ? "text-amber-700" : ""}`} />}
                              />
                              {post.isFlagged && (
                                <IconButton
                                  label="Clear flag"
                                  onClick={() => void unflagPost(post.id)}
                                  icon={<AlertTriangle className="h-3.5 w-3.5 text-emerald-600" />}
                                />
                              )}
                              <IconButton
                                label="Delete"
                                onClick={() => void deletePost(post.id)}
                                icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function StatusPill({ tone, label }: { tone: string; label: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{label}</span>;
}

function formatPostStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPostStatusTone(status: string) {
  if (status === "reported") return "bg-rose-100 text-rose-700";
  if (status === "hidden") return "bg-slate-100 text-slate-700";
  if (status === "deleted") return "bg-zinc-200 text-zinc-700";
  return "bg-emerald-100 text-emerald-700";
}

function InlineInfo({ label }: { label: string }) {
  return <div className="rounded-xl border border-border bg-muted/25 px-3 py-2">{label}</div>;
}

function IconButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} className="rounded-lg border border-transparent p-1.5 transition hover:border-border hover:bg-muted" type="button">
      {icon}
    </button>
  );
}

const searchInputClassName = "w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-navy";
const tableHeadClassName = "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
const tableCellClassName = "px-4 py-3.5 text-sm text-muted-foreground";
