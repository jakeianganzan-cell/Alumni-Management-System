import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AnnouncementAttachment, AnnouncementCard, AnnouncementDetailMeta } from "@/components/AnnouncementCard";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { COURSE_OPTIONS, formatCourseLabel } from "@/lib/courseCatalog";
import type { Announcement, AnnouncementAudienceScope, AnnouncementStatus } from "@/context/AnnouncementContext";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

type AnnouncementForm = {
  title: string;
  description: string;
  audienceScope: AnnouncementAudienceScope;
  audienceValue: string;
  date: string;
  status: AnnouncementStatus;
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm = (course: string | null | undefined): AnnouncementForm => ({
  title: "",
  description: "",
  audienceScope: "course",
  audienceValue: course || "",
  date: today,
  status: "active",
});

export default function ChairmanAnnouncements() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AnnouncementStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [viewItem, setViewItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(() => emptyForm(profile?.course));

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_URL}/announcements`, { headers: getAuthHeaders() });
      const payload = await readApiResponse<Announcement[]>(response);
      setAnnouncements(payload.filter((item) => item.type === "announcement"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  const departmentAnnouncements = useMemo(() => {
    const course = (profile?.course || "").toLowerCase();
    const normalizedSearch = search.trim().toLowerCase();

    return announcements
      .filter((item) => {
        const scope = item.audienceScope || "all";
        const audience = (item.audienceValue || "").toLowerCase();
        const belongsToDepartment = scope === "all" || (scope === "course" && audience === course) || scope === "batch" || item.createdBy === profile?.id;
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        const matchesSearch = !normalizedSearch || item.title.toLowerCase().includes(normalizedSearch) || (item.description || "").toLowerCase().includes(normalizedSearch);

        return belongsToDepartment && matchesStatus && matchesSearch;
      })
      .sort((left, right) => String(right.created_at || right.date).localeCompare(String(left.created_at || left.date)));
  }, [announcements, profile?.course, profile?.id, search, statusFilter]);

  const openAdd = () => {
    setForm(emptyForm(profile?.course));
    setFormOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("Announcement title is required");
      return;
    }

    try {
      setSaving(true);
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        time: null,
        venue: null,
        organizer: profile?.name || "Department Chairman",
        type: "announcement",
        status: form.status,
        capacity: 0,
        audienceScope: form.audienceScope,
        audienceValue: form.audienceScope === "all" ? null : form.audienceValue,
        interestEnabled: false,
      };

      const response = await fetch(`${API_URL}/announcements`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readApiResponse(response);
      toast.success("Announcement posted");
      setFormOpen(false);
      await loadAnnouncements();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Failed to save announcement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChairmanLayout title="Announcements" subtitle="View department announcements for alumni">
      <div className="relative flex justify-center pb-20">
        <section className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-navy-dark">All Announcements</h2>
                <Badge variant="outline">{departmentAnnouncements.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatCourseLabel(profile?.course) || "Assigned department"} announcements and alumni notices.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search announcements" className="pl-9" />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading announcements...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : departmentAnnouncements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
              No announcements matched the current filters.
            </div>
          ) : (
            <div className="space-y-3">
              {departmentAnnouncements.map((announcement) => (
                <div key={announcement.id} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-navy/30 hover:shadow-md">
                  <AnnouncementCard
                    announcement={announcement}
                    onOpen={setViewItem}
                    className="border-0 shadow-none hover:border-transparent hover:shadow-none"
                  />
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            onClick={openAdd}
            className="fixed bottom-5 right-5 z-30 h-12 rounded-full bg-navy px-5 text-white shadow-lg hover:bg-navy-light sm:bottom-8 sm:right-8"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Announcement
          </Button>
        </section>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add announcement</DialogTitle>
              <DialogDescription>Set the target course or batch and publish a clear department update.</DialogDescription>
            </DialogHeader>

            <Field label="Announcement Title">
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
            </Field>

            <Field label="Description / Content">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target">
                <select
                  value={form.audienceScope}
                  onChange={(event) => setForm((current) => ({ ...current, audienceScope: event.target.value as AnnouncementAudienceScope, audienceValue: event.target.value === "course" ? profile?.course || "" : "" }))}
                  className="h-10 w-full rounded-md border border-input px-3 text-sm"
                >
                  <option value="course">Target Course</option>
                  <option value="batch">Target Batch</option>
                  <option value="all">All Alumni</option>
                </select>
              </Field>

              {form.audienceScope === "course" ? (
                <Field label="Course / Program">
                  <select
                    value={form.audienceValue}
                    onChange={(event) => setForm((current) => ({ ...current, audienceValue: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input px-3 text-sm"
                  >
                    {COURSE_OPTIONS.map((course) => (
                      <option key={course.code} value={course.code}>{course.label}</option>
                    ))}
                  </select>
                </Field>
              ) : form.audienceScope === "batch" ? (
                <Field label="Batch">
                  <Input value={form.audienceValue} onChange={(event) => setForm((current) => ({ ...current, audienceValue: event.target.value }))} placeholder="Example: 2024" required />
                </Field>
              ) : (
                <Field label="Audience">
                  <Input value="All alumni" disabled />
                </Field>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date Posted">
                <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AnnouncementStatus }))} className="h-10 w-full rounded-md border border-input px-3 text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-navy text-white hover:bg-navy-light">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Post Announcement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewItem)} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-2xl">
          {viewItem && (
            <>
              <DialogHeader>
                <DialogTitle>{viewItem.title}</DialogTitle>
                <DialogDescription>{viewItem.audienceLabel || formatAudience(viewItem)} | Posted {formatDate(viewItem.created_at || viewItem.date)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <AnnouncementAttachment announcement={viewItem} />
                <AnnouncementDetailMeta announcement={viewItem} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Complete details
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {viewItem.description || "No full content has been added."}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setViewItem(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ChairmanLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-navy-dark">
      <span>{label}</span>
      {children}
    </label>
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

function formatAudience(item: Announcement) {
  if ((item.audienceScope || "all") === "course") return formatCourseLabel(item.audienceValue) || "Target course";
  if (item.audienceScope === "batch") return `Batch ${item.audienceValue || "not set"}`;
  return "All Alumni";
}
