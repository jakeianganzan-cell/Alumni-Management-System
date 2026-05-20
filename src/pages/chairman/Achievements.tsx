import { useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { formatCourseLabel } from "@/lib/courseCatalog";
import { MessageCircle, Search } from "lucide-react";

type AchievementStatus = "pending" | "approved" | "rejected" | "archived";

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
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  reactionCounts?: { heart?: number };
}

export default function ChairmanAchievements() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AchievementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AchievementStatus>("all");
  const [selected, setSelected] = useState<AchievementRecord | null>(null);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_URL}/achievements`, { headers: getAuthHeaders() });
      const payload = await readApiResponse<AchievementRecord[]>(response);
      setItems(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load achievements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAchievements();
  }, []);

  const departmentItems = useMemo(() => {
    const course = (profile?.course || "").toLowerCase();
    const normalizedSearch = search.trim().toLowerCase();

    return items
      .filter((item) => {
        const matchesCourse = !course || (item.course || "").toLowerCase() === course;
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        const matchesSearch = !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch) || item.title.toLowerCase().includes(normalizedSearch);
        return matchesCourse && matchesStatus && matchesSearch;
      })
      .sort((left, right) => String(right.date || right.createdAt).localeCompare(String(left.date || left.createdAt)));
  }, [items, profile?.course, search, statusFilter]);

  const achievementCount = departmentItems.length;

  return (
    <ChairmanLayout title="Achievements" subtitle="Review alumni achievements in your department">
      <div className="flex justify-center">
        <section className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-navy-dark">Alumni achievements</h2>
              <Badge variant="outline">{achievementCount}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCourseLabel(profile?.course) || "Assigned department"} milestones in the same feed style alumni use.
            </p>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alumni or achievement" className="pl-9" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-md border border-input px-3 py-2 text-sm">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading achievements...</div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : departmentItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
              No achievements matched the current filters.
            </div>
          ) : (
          <div className="space-y-4">
            {departmentItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition hover:border-navy/30">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white">
                    {item.name[0] || "A"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy-dark">{item.name}</h3>
                        <Badge className={statusClassName(item.status)}>{formatStatus(item.status)}</Badge>
                        <Badge variant="outline">{item.category || "Achievement"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[formatCourseLabel(item.course), item.batch ? `Batch ${item.batch}` : null, item.organization, formatDate(item.date)]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                    </div>

                    <button type="button" onClick={() => setSelected(item)} className="mt-3 block w-full text-left">
                      <p className="text-sm font-semibold leading-6 text-foreground">{item.title}</p>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {item.description || "No description provided."}
                      </p>
                      {item.proofImage && (
                        <img
                          src={resolveAssetUrl(item.proofImage) || item.proofImage}
                          alt={item.title}
                          className="mt-3 h-40 w-40 rounded-xl border border-slate-200 object-cover sm:h-48 sm:w-48"
                        />
                      )}
                    </button>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>{item.reactionCounts?.heart || 0} hearts</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {item.commentCount || 0} comments
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
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>{selected.name} | {formatCourseLabel(selected.course)} | {formatDate(selected.date)}</DialogDescription>
              </DialogHeader>
              {selected.proofImage && (
                <img src={resolveAssetUrl(selected.proofImage) || selected.proofImage} alt={selected.title} className="max-h-[320px] w-full rounded-lg border border-border object-contain" />
              )}
              <div className="rounded-lg border border-border bg-zinc-50 p-4 text-sm leading-6 text-foreground">
                {selected.description || "No description provided."}
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

function normalizeDate(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeDate(value);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatStatus(status: string | null | undefined) {
  return status ? status.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase()) : "Pending";
}

function statusClassName(status: AchievementStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (status === "rejected") return "bg-rose-100 text-rose-700 hover:bg-rose-100";
  if (status === "archived") return "bg-zinc-200 text-zinc-700 hover:bg-zinc-200";
  return "bg-amber-100 text-amber-700 hover:bg-amber-100";
}
