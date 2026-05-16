import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPageIntro, AdminStatCard, AdminStatsGrid } from "@/components/admin/AdminPageIntro";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Award, CalendarClock, CheckCircle2, Eye, Search, Star, Trash2, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";

type AchievementStatus = "pending" | "approved" | "rejected" | "archived";
const PAGE_SIZE = 10;

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
}

export default function AdminAchievements() {
  const [items, setItems] = useState<AchievementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<AchievementRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/achievements`, {
        headers: getAuthHeaders(),
      });

      setItems(await readApiResponse<AchievementRecord[]>(res));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load achievements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAchievements();
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((item) => item.status === tab)
      .filter((item) => {
        const query = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
        );
      });
  }, [items, searchQuery, tab]);

  const counts = useMemo(
    () => ({
      pending: items.filter((item) => item.status === "pending").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      featured: items.filter((item) => item.status === "approved" && item.featured).length,
    }),
    [items],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [currentPage, filtered, totalPages]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const featuredItem = filtered[0] ?? items.find((item) => item.status === tab) ?? null;

  const updateAchievement = async (item: AchievementRecord, changes: Partial<AchievementRecord>) => {
    try {
      const res = await fetch(`${API_URL}/achievements/${item.id}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: changes.title ?? item.title,
          description: changes.description ?? item.description,
          date: changes.date ?? item.date,
          category: changes.category ?? item.category,
          organization: changes.organization ?? item.organization,
          proofImage: changes.proofImage ?? item.proofImage,
          status: changes.status ?? item.status,
          featured: changes.featured ?? item.featured,
          rejectionReason: changes.rejectionReason ?? item.rejectionReason,
        }),
      });

      await readApiResponse(res);

      await loadAchievements();
    } catch (error) {
      console.error(error);
      toast.error("Could not update achievement");
    }
  };

  const approve = async (item: AchievementRecord) => {
    await updateAchievement(item, { status: "approved", featured: true, rejectionReason: null });
    toast.success("Achievement approved");
  };

  const reject = async (item: AchievementRecord) => {
    if (!rejectionReason.trim()) {
      toast.error("Add a reason before rejecting");
      return;
    }

    await updateAchievement(item, { status: "rejected", featured: false, rejectionReason });
    setRejectionReason("");
    setSelected(null);
    toast.success("Achievement rejected");
  };

  const toggleFeatured = async (item: AchievementRecord) => {
    await updateAchievement(item, { featured: !item.featured });
    toast.success(item.featured ? "Removed from featured" : "Marked as featured");
  };

  const removeAchievement = async (item: AchievementRecord) => {
    if (!window.confirm("Delete this achievement?")) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/achievements/${item.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      await readApiResponse(res);

      toast.success("Achievement deleted");
      await loadAchievements();
    } catch (error) {
      console.error(error);
      toast.error("Could not delete achievement");
    }
  };

  return (
    <AdminLayout title="Achievements" subtitle="Review, approve, reject, and curate alumni milestones">
      <div className="space-y-6">
        <AdminPageIntro
          eyebrow="Achievement Review"
          title="Achievement submissions"
        />

        <AdminStatsGrid>
          <AdminStatCard label="Pending" value={counts.pending} description="Waiting for review" icon={<Trophy className="h-4 w-4" />} toneClassName="bg-amber-100 text-amber-700" />
          <AdminStatCard label="Approved" value={counts.approved} description="Ready to showcase" icon={<CheckCircle2 className="h-4 w-4" />} toneClassName="bg-emerald-100 text-emerald-700" />
          <AdminStatCard label="Rejected" value={counts.rejected} description="Need correction" icon={<XCircle className="h-4 w-4" />} toneClassName="bg-rose-100 text-rose-700" />
          <AdminStatCard label="Featured" value={counts.featured} description="Visible on approved records" icon={<Star className="h-4 w-4" />} toneClassName="bg-violet-100 text-violet-700" />
        </AdminStatsGrid>

        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Focus submission</p>
                <h2 className="mt-1 text-base font-semibold text-navy-dark">
                  {featuredItem ? featuredItem.title : "No submission selected"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {featuredItem
                    ? `${featuredItem.name} | ${featuredItem.organization || "No organization"}`
                    : "Choose a tab or wait for new submissions to appear."}
                </p>
              </div>
              {featuredItem && <StatusBadge status={featuredItem.status} />}
            </div>

            {featuredItem ? (
              <div className="mt-4 space-y-4">
                {featuredItem.proofImage && (
                  <img
                    src={resolveAssetUrl(featuredItem.proofImage) || featuredItem.proofImage}
                    alt={featuredItem.title}
                    className="h-44 w-full rounded-2xl border border-border object-cover"
                  />
                )}
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <InlineInfo icon={<Award className="h-3.5 w-3.5" />} label={featuredItem.category} />
                  <InlineInfo icon={<CalendarClock className="h-3.5 w-3.5" />} label={new Date(featuredItem.date).toLocaleDateString()} />
                  <InlineInfo icon={<Trophy className="h-3.5 w-3.5" />} label={featuredItem.batch || "Batch not set"} />
                  <InlineInfo icon={<Eye className="h-3.5 w-3.5" />} label={featuredItem.course || "Course not set"} />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {featuredItem.description || "No description provided."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelected(featuredItem)}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:border-navy/40 hover:text-navy"
                    type="button"
                  >
                    View details
                  </button>
                  {featuredItem.status === "pending" && (
                    <>
                      <button onClick={() => approve(featuredItem)} className="rounded-xl bg-navy px-3 py-2 text-sm font-medium text-white transition hover:bg-navy-light" type="button">
                        Approve
                      </button>
                      <button
                        onClick={() => setSelected(featuredItem)}
                        className="rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:border-rose-300 hover:text-rose-700"
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No achievements available in this view.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex rounded-xl border border-border bg-background p-1">
                {(["pending", "approved", "rejected"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      tab === item ? "bg-navy text-white" : "text-muted-foreground hover:text-navy-dark"
                    }`}
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search alumni, title, or category"
                  className={searchInputClassName}
                />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/35">
                    <tr>
                      <th className={tableHeadClassName}>Alumni</th>
                      <th className={tableHeadClassName}>Achievement</th>
                      <th className={tableHeadClassName}>Category</th>
                      <th className={tableHeadClassName}>Date</th>
                      <th className={tableHeadClassName}>Featured</th>
                      <th className={tableHeadClassName}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          Loading achievements...
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No records in this tab.
                        </td>
                      </tr>
                    ) : (
                      paginated.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3.5" data-label="Alumni">
                            <p className="text-sm font-semibold text-navy-dark">{item.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.batch || "No batch"} | {item.course || "No course"}
                            </p>
                          </td>
                          <td className="px-4 py-3.5" data-label="Achievement">
                            <p className="text-sm font-semibold text-navy-dark">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{item.organization || "No organization"}</p>
                          </td>
                          <td className={tableCellClassName} data-label="Category">{item.category}</td>
                          <td className={tableCellClassName} data-label="Date">{new Date(item.date).toLocaleDateString()}</td>
                          <td className="px-4 py-3.5" data-label="Featured">
                            <button
                              onClick={() => toggleFeatured(item)}
                              disabled={item.status !== "approved"}
                              className={`rounded-lg border border-transparent p-1.5 transition ${
                                item.status !== "approved"
                                  ? "cursor-not-allowed opacity-40"
                                  : "hover:border-border hover:bg-muted"
                              } ${item.featured ? "text-gold" : "text-muted-foreground"}`}
                              type="button"
                            >
                              <Star className={`h-4 w-4 ${item.featured ? "fill-current" : ""}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3.5" data-label="Actions">
                            <div className="flex flex-wrap items-center gap-1">
                              <IconButton label="View" onClick={() => setSelected(item)} icon={<Eye className="h-3.5 w-3.5" />} />
                              {item.status === "pending" && (
                                <>
                                  <IconButton label="Approve" onClick={() => approve(item)} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} />
                                  <IconButton label="Reject" onClick={() => setSelected(item)} icon={<XCircle className="h-3.5 w-3.5 text-rose-600" />} />
                                </>
                              )}
                              <IconButton label="Delete" onClick={() => removeAchievement(item)} icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />} />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </section>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-navy-dark">{selected.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selected.name} | {selected.organization || "No organization"}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted" type="button">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>

              {selected.proofImage && (
                <img
                  src={resolveAssetUrl(selected.proofImage) || selected.proofImage}
                  alt={selected.title}
                  className="mt-4 h-60 w-full rounded-xl border border-border object-cover"
                />
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ReadOnly label="Category" value={selected.category} />
                <ReadOnly label="Date" value={new Date(selected.date).toLocaleDateString()} />
                <ReadOnly label="Batch" value={selected.batch || "Not set"} />
                <ReadOnly label="Course" value={selected.course || "Not set"} />
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Description</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{selected.description || "No description provided."}</p>
              </div>

              {selected.status === "pending" && (
                <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-navy-dark">Reject reason</p>
                  <textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                    placeholder="Tell the alumni what needs to be corrected."
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button onClick={() => approve(selected)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700" type="button">
                      Approve
                    </button>
                    <button onClick={() => reject(selected)} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700" type="button">
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {start}-{end} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-lg border border-border px-3 py-2 font-medium transition hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="rounded-lg border border-border px-3 py-2 font-medium text-navy-dark">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-border px-3 py-2 font-medium transition hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AchievementStatus }) {
  const tone =
    status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "pending"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{status}</span>;
}

function InlineInfo({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/25 px-3 py-2">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function IconButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} className="rounded-lg border border-transparent p-1.5 transition hover:border-border hover:bg-muted" type="button">
      {icon}
    </button>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

const searchInputClassName = "w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-navy";
const tableHeadClassName = "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
const tableCellClassName = "px-4 py-3.5 text-sm text-muted-foreground";
