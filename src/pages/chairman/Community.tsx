import { useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Loader2, MessageCircle, MessageSquare, Search } from "lucide-react";

interface FreedomWallPost {
  id: number;
  author: string;
  authorBatch: string;
  content: string;
  imageUrl: string | null;
  timestamp: string;
  likes: number;
  comments: number;
  isPinned: boolean;
  isFlagged: boolean;
  category: string;
  status: "published" | "hidden" | "reported" | "deleted";
}

export default function ChairmanCommunity() {
  const [posts, setPosts] = useState<FreedomWallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FreedomWallPost["status"]>("all");
  const [selected, setSelected] = useState<FreedomWallPost | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_URL}/admin/freedom-wall/posts`, { headers: getAuthHeaders() });
      const payload = await readApiResponse<FreedomWallPost[]>(response);
      setPosts(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Freedom Wall posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      const matchesSearch = !normalizedSearch || post.author.toLowerCase().includes(normalizedSearch) || post.content.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [posts, search, statusFilter]);

  return (
    <ChairmanLayout title="Freedom Wall" subtitle="Monitor alumni posts, updates, and experiences">
      <div className="flex justify-center">
        <section className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-navy-dark">Freedom Wall posts</h2>
              <Badge variant="outline">{filteredPosts.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Monitor, search, and moderate Freedom Wall posts in the same feed style alumni use.</p>
          </div>

          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts or alumni" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "published", "reported", "hidden", "deleted"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    statusFilter === status
                      ? "bg-navy text-white"
                      : "border border-slate-200 bg-white text-muted-foreground hover:border-navy"
                  }`}
                >
                  {formatStatus(status)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading Freedom Wall posts...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="text-base font-semibold text-navy-dark">No Freedom Wall posts yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">No Freedom Wall posts matched the current filters.</p>
            </div>
          ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <article key={post.id} onClick={() => setSelected(post)} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition hover:border-navy/30">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white">
                    {post.author.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-navy-dark">{post.author}</h3>
                      <Badge variant="outline">{post.category || "Discussion"}</Badge>
                      {post.isPinned && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pinned</Badge>}
                      {post.isFlagged && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Reported</Badge>}
                      <Badge className={statusClassName(post.status)}>{formatStatus(post.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {["Batch " + (post.authorBatch || "Unknown"), formatDate(post.timestamp)].filter(Boolean).join(" | ")}
                    </p>

                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{post.content}</p>

                    {post.imageUrl && (
                      <img
                        src={resolveAssetUrl(post.imageUrl) || post.imageUrl}
                        alt="Freedom Wall attachment"
                        className="mt-3 h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48"
                      />
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>{post.likes} hearts</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {post.comments} comments
                      </span>
                    </div>

                  </div>
                </div>
              </article>
            ))}
          </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Freedom Wall Post</DialogTitle>
                <DialogDescription>{selected.author} | {formatDate(selected.timestamp)} | {formatStatus(selected.status)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="whitespace-pre-line rounded-lg border border-border bg-zinc-50 p-4 text-sm leading-6">{selected.content}</p>
                {selected.imageUrl && (
                  <img src={resolveAssetUrl(selected.imageUrl) || selected.imageUrl} alt="Freedom Wall post" className="max-h-72 w-full rounded-lg border border-border object-contain" />
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ChairmanLayout>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatStatus(status: string | null | undefined) {
  return status ? status.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase()) : "Published";
}

function statusClassName(status: FreedomWallPost["status"]) {
  if (status === "published") return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (status === "reported") return "bg-rose-100 text-rose-700 hover:bg-rose-100";
  if (status === "hidden") return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  return "bg-zinc-200 text-zinc-700 hover:bg-zinc-200";
}
