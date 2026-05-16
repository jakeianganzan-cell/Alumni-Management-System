import { ChangeEvent, useEffect, useMemo, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Image, Loader2, MessageCircle, MessageSquare, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";

type ReactionType = "heart";

interface FeedPost {
  id: number;
  userId: string;
  authorName: string;
  authorBatch: string | null;
  authorCourse: string | null;
  authorPhoto: string | null;
  content: string;
  imageUrl: string | null;
  category: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  reactionCounts: Record<ReactionType, number>;
  currentUserReaction: ReactionType | null;
  commentCount: number;
}

interface FeedComment {
  id: number;
  postId: number;
  userId: string;
  parentId: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorBatch: string | null;
  authorCourse: string | null;
  authorPhoto: string | null;
}

type PostFormState = {
  content: string;
  category: string;
  imageUrl: string;
};

const CATEGORIES = ["All", "Career", "Event", "Achievement", "Advice", "Personal", "Discussion"];
const POST_CATEGORIES = CATEGORIES.filter((item) => item !== "All");
const BLANK_POST_FORM: PostFormState = {
  content: "",
  category: "Discussion",
  imageUrl: "",
};

export default function Community() {
  useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [postForm, setPostForm] = useState<PostFormState>(BLANK_POST_FORM);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, FeedComment[]>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<number, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<number, boolean>>({});
  const [reactingPostId, setReactingPostId] = useState<number | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/freedom-wall/posts`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<FeedPost[]>(response);
      setPosts(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load Freedom Wall posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
    const interval = window.setInterval(() => {
      void loadPosts();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const search = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !search ||
        post.content.toLowerCase().includes(search) ||
        post.authorName.toLowerCase().includes(search) ||
        (post.authorCourse || "").toLowerCase().includes(search);
      const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [posts, searchQuery, selectedCategory]);

  const handlePostImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPostForm((current) => ({
        ...current,
        imageUrl: typeof reader.result === "string" ? reader.result : "",
      }));
    };
    reader.readAsDataURL(file);
  };

  const submitPost = async () => {
    if (!postForm.content.trim()) {
      toast.error("Post content is required.");
      return;
    }

    try {
      setSubmittingPost(true);
      const response = await fetch(`${API_URL}/freedom-wall/posts`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          content: postForm.content,
          category: postForm.category,
          imageUrl: postForm.imageUrl || null,
        }),
      });
      await readApiResponse(response);
      toast.success("Post published to the Freedom Wall.");
      setPostForm(BLANK_POST_FORM);
      setPostDialogOpen(false);
      await loadPosts();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to publish your post.");
    } finally {
      setSubmittingPost(false);
    }
  };

  const loadComments = async (postId: number) => {
    try {
      setLoadingComments((current) => ({ ...current, [postId]: true }));
      const response = await fetch(`${API_URL}/freedom-wall/posts/${postId}/comments`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<FeedComment[]>(response);
      setCommentsByPost((current) => ({ ...current, [postId]: data }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load comments.");
    } finally {
      setLoadingComments((current) => ({ ...current, [postId]: false }));
    }
  };

  const toggleComments = async (postId: number) => {
    const nextOpen = !commentsOpen[postId];
    setCommentsOpen((current) => ({ ...current, [postId]: nextOpen }));

    if (nextOpen && !commentsByPost[postId]) {
      await loadComments(postId);
    }
  };

  const submitComment = async (postId: number) => {
    const content = (commentInputs[postId] || "").trim();
    if (!content) {
      toast.error("Comment content is required.");
      return;
    }

    try {
      setSubmittingComment((current) => ({ ...current, [postId]: true }));
      const response = await fetch(`${API_URL}/freedom-wall/posts/${postId}/comments`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await readApiResponse(response);
      setCommentInputs((current) => ({ ...current, [postId]: "" }));
      await Promise.all([loadComments(postId), loadPosts()]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to add comment.");
    } finally {
      setSubmittingComment((current) => ({ ...current, [postId]: false }));
    }
  };

  const reactToPost = async (postId: number, reactionType: ReactionType) => {
    try {
      setReactingPostId(postId);
      const response = await fetch(`${API_URL}/freedom-wall/posts/${postId}/reaction`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType }),
      });
      const data = await readApiResponse<{
        currentReaction: ReactionType | null;
        reactionCounts: Record<ReactionType, number>;
      }>(response);

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                currentUserReaction: data.currentReaction,
                reactionCounts: data.reactionCounts,
              }
            : post,
        ),
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update reaction.");
    } finally {
      setReactingPostId(null);
    }
  };

  return (
    <AlumniLayout title="Freedom Wall" subtitle="Share updates and interact with alumni posts in real time">
      <div className="space-y-6">
        <div className="flex justify-center">
          <section className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-navy-dark">Freedom Wall posts</h2>
              <p className="text-sm text-muted-foreground">Search, filter, react, and comment on alumni posts in real time.</p>
            </div>

            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search posts"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-navy"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      selectedCategory === category
                        ? "bg-navy text-white"
                        : "border border-slate-200 bg-white text-muted-foreground hover:border-navy"
                    }`}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading Freedom Wall posts...</p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-navy-dark">No Freedom Wall posts yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Be the first to share something with the alumni community.
                  </p>
                  <Button className="mt-4" onClick={() => setPostDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Post
                  </Button>
                </div>
              ) : (
                <>
            {filteredPosts.map((post) => {
              const authorPhoto = resolveAssetUrl(post.authorPhoto);
              const postImage = resolveAssetUrl(post.imageUrl) || post.imageUrl;
              const postComments = commentsByPost[post.id] || [];
              const isCommentsOpen = commentsOpen[post.id] ?? false;

              return (
                <article key={post.id} onClick={() => setSelectedPost(post)} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition hover:border-navy/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white">
                      {authorPhoto ? (
                        <img src={authorPhoto} alt={post.authorName} className="h-full w-full object-cover" />
                      ) : (
                        post.authorName[0]
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy-dark">{post.authorName}</h3>
                        <Badge variant="outline">{post.category}</Badge>
                        {post.isPinned && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pinned</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[post.authorCourse, post.authorBatch ? `Batch ${post.authorBatch}` : null, formatDateTime(post.createdAt)]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>

                      <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{post.content}</p>

                      {postImage && (
                        <img
                          src={postImage}
                          alt="Freedom Wall attachment"
                          className="mt-3 h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48"
                        />
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span>{post.reactionCounts?.heart || 0} hearts</span>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); void toggleComments(post.id); }}
                          className="inline-flex items-center gap-1 transition hover:text-navy"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {post.commentCount} comments
                        </button>
                      </div>

                      <div className="mt-3 flex">
                        <button
                          type="button"
                          disabled={reactingPostId === post.id}
                          onClick={(event) => { event.stopPropagation(); void reactToPost(post.id, "heart"); }}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                            post.currentUserReaction === "heart"
                              ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                              : "border-rose-100 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                          }`}
                        >
                          <span className="text-base leading-none">{"\u2764\uFE0F"}</span>
                          Heart {post.reactionCounts?.heart || 0}
                        </button>
                      </div>

                      {isCommentsOpen && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          {loadingComments[post.id] ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading comments...
                            </div>
                          ) : postComments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No comments yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {postComments.map((comment) => {
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
                                            {[comment.authorCourse, comment.authorBatch ? `Batch ${comment.authorBatch}` : null, formatDateTime(comment.createdAt)]
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
                              value={commentInputs[post.id] || ""}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommentInputs((current) => ({ ...current, [post.id]: event.target.value }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitComment(post.id);
                                }
                              }}
                              placeholder="Write a comment..."
                              className="border-slate-300 bg-white"
                            />
                            <Button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); void submitComment(post.id); }}
                              disabled={submittingComment[post.id]}
                            >
                              {submittingComment[post.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
                </>
              )}
            </div>
          </section>
          </div>
      </div>

      <button
        type="button"
        onClick={() => setPostDialogOpen(true)}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(85,0,0,0.28)] transition hover:opacity-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-4 w-4" />
        Post
      </button>

      <Dialog open={Boolean(selectedPost)} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          {selectedPost && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-xl text-navy-dark">{selectedPost.authorName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{selectedPost.category}</Badge>
                  <span>{[selectedPost.authorCourse, selectedPost.authorBatch ? `Batch ${selectedPost.authorBatch}` : null, formatDateTime(selectedPost.createdAt)].filter(Boolean).join(" | ")}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedPost.content}</p>
                {(resolveAssetUrl(selectedPost.imageUrl) || selectedPost.imageUrl) && (
                  <img src={resolveAssetUrl(selectedPost.imageUrl) || selectedPost.imageUrl || ""} alt="Freedom Wall attachment" className="mx-auto aspect-square w-full max-w-sm rounded-xl border border-slate-200 object-cover" />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={postDialogOpen} onOpenChange={(open) => !submittingPost && setPostDialogOpen(open)}>
        <DialogContent className="max-w-2xl border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl text-navy-dark">Create Freedom Wall Post</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <Textarea
                placeholder="Share something with your alumni community..."
                value={postForm.content}
                onChange={(event) => setPostForm((current) => ({ ...current, content: event.target.value }))}
                className="min-h-[160px] border-slate-300 bg-white"
              />

              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-navy-dark">Category</span>
                  <select
                    value={postForm.category}
                    onChange={(event) => setPostForm((current) => ({ ...current, category: event.target.value }))}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy"
                  >
                    {POST_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-muted-foreground transition hover:border-navy">
                  <Image className="h-4 w-4" />
                  <span>{postForm.imageUrl ? "Change image" : "Upload image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePostImageChange} />
                </label>

                {postForm.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setPostForm((current) => ({ ...current, imageUrl: "" }))}
                    className="text-sm font-medium text-rose-600 transition hover:text-rose-700"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>

            {postForm.imageUrl && (
              <img
                src={postForm.imageUrl}
                alt="Post preview"
                className="h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48"
              />
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPostDialogOpen(false)} disabled={submittingPost}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitPost()} disabled={submittingPost || !postForm.content.trim()}>
                {submittingPost ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Publish Post
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AlumniLayout>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
