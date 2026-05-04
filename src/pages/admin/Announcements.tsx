import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPageIntro, AdminStatCard, AdminStatsGrid } from "@/components/admin/AdminPageIntro";
import type { Announcement, AnnouncementApprovalStatus, AnnouncementAudienceScope, AnnouncementStatus, AnnouncementType } from "@/context/AnnouncementContext";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type AnnouncementForm = {
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  type: AnnouncementType;
  google_form_link: string;
  organizer: string;
  image_url: string;
  status: AnnouncementStatus;
  audienceScope: AnnouncementAudienceScope;
  audienceValue: string;
};

const BLANK_FORM: AnnouncementForm = {
  title: "",
  description: "",
  date: "",
  time: "",
  venue: "",
  type: "announcement",
  google_form_link: "",
  organizer: "",
  image_url: "",
  status: "active",
  audienceScope: "all",
  audienceValue: "",
};

const EVENT_TYPE_OPTIONS = ["Donation", "Meeting", "Alumni", "Other"] as const;

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnnouncementForm>(BLANK_FORM);
  const [approvalFilter, setApprovalFilter] = useState<"all" | AnnouncementApprovalStatus>("all");
  const [search, setSearch] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/announcements`, {
        headers: getAuthHeaders(),
      });
      return readApiResponse<Announcement[]>(response);
    },
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: AnnouncementForm) => {
      const response = await fetch(`${API_URL}/announcements`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return readApiResponse(response);
    },
    onSuccess: () => {
      toast.success("Announcement created");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      closeForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create announcement");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: AnnouncementForm & { id: string }) => {
      const response = await fetch(`${API_URL}/announcements/${payload.id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return readApiResponse(response);
    },
    onSuccess: () => {
      toast.success("Announcement updated");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      closeForm();
      setDetailOpen(false);
      setSelectedAnnouncement(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update announcement");
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, approvalStatus, reason }: { id: string; approvalStatus: "approved" | "rejected"; reason?: string }) => {
      const response = await fetch(`${API_URL}/announcements/${id}/approval`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus, rejectionReason: reason }),
      });
      return readApiResponse(response);
    },
    onSuccess: (_, variables) => {
      toast.success(variables.approvalStatus === "approved" ? "Announcement approved and published" : "Announcement rejected");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to review announcement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_URL}/announcements/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      return readApiResponse(response);
    },
    onSuccess: () => {
      toast.success("Announcement deleted");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setDetailOpen(false);
      setSelectedAnnouncement(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete announcement");
    },
  });

  const counts = useMemo(
    () => ({
      total: announcements.length,
      pending: announcements.filter((item) => item.approvalStatus === "pending_approval").length,
      published: announcements.filter((item) => (item.approvalStatus || "approved") === "approved").length,
      rejected: announcements.filter((item) => item.approvalStatus === "rejected").length,
    }),
    [announcements],
  );

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => {
      const matchesFilter = approvalFilter === "all" || (announcement.approvalStatus || "approved") === approvalFilter;
      const matchesSearch =
        !search ||
        announcement.title.toLowerCase().includes(search.toLowerCase()) ||
        (announcement.createdByName || "").toLowerCase().includes(search.toLowerCase()) ||
        (announcement.description || "").toLowerCase().includes(search.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [announcements, approvalFilter, search]);

  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditId(null);
    setFormData(BLANK_FORM);
    setFormOpen(true);
  };

  const openDetail = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setRejectionReason(announcement.rejectionReason || "");
    setDetailOpen(true);
  };

  const openEdit = (announcement: Announcement) => {
    setEditId(announcement.id);
    setFormData({
      title: announcement.title,
      description: announcement.description || "",
      date: announcement.date ? String(announcement.date).slice(0, 10) : "",
      time: announcement.time || "",
      venue: announcement.venue || "",
      type: announcement.type,
      google_form_link: announcement.google_form_link || "",
      organizer: announcement.organizer || "",
      image_url: announcement.image_url || "",
      status: announcement.status,
      audienceScope: announcement.audienceScope || "all",
      audienceValue: announcement.audienceValue || "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setFormData(BLANK_FORM);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this content item?")) return;
    deleteMutation.mutate(id);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((current) => ({ ...current, image_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const handleTypeChange = (value: AnnouncementType) => {
    setFormData((current) => ({
      ...current,
      type: value,
      status: getDefaultStatus(value),
      venue: value === "event" ? current.venue : "",
      time: value === "announcement" ? "" : current.time,
      google_form_link: value === "survey" ? current.google_form_link : "",
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = normalizeFormPayload(formData);

    if (editId) {
      updateMutation.mutate({ ...payload, id: editId });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <AdminLayout title="Announcements" subtitle="Review alumni submissions, publish content, and keep the public feed clean">
      <div className="space-y-6">
        <AdminPageIntro
          eyebrow="Content Management"
          title="Announcements and approval queue"
          description="Create official posts, review alumni-submitted announcements before publishing them, and keep public content consistent."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add content
            </Button>
          }
        />

        <AdminStatsGrid>
          <AdminStatCard label="Total Items" value={counts.total} description="All submitted content" icon={<FileText className="h-4 w-4" />} toneClassName="bg-slate-100 text-slate-700" />
          <AdminStatCard label="Pending Approval" value={counts.pending} description="Needs admin review" icon={<ClipboardList className="h-4 w-4" />} toneClassName="bg-amber-100 text-amber-700" />
          <AdminStatCard label="Published" value={counts.published} description="Visible to all users" icon={<CheckCircle2 className="h-4 w-4" />} toneClassName="bg-emerald-100 text-emerald-700" />
          <AdminStatCard label="Rejected" value={counts.rejected} description="Sent back by admin" icon={<XCircle className="h-4 w-4" />} toneClassName="bg-rose-100 text-rose-700" />
        </AdminStatsGrid>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Review Queue</p>
              <h2 className="mt-1 text-xl font-semibold text-navy-dark">Submitted announcements</h2>
              <p className="mt-2 text-sm text-muted-foreground">Admins can review details, approve publication, or reject with feedback.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or submitter" className="w-52 border-slate-300 bg-white pl-9" />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                {[
                  { key: "all", label: "All" },
                  { key: "pending_approval", label: "Pending" },
                  { key: "approved", label: "Published" },
                  { key: "rejected", label: "Rejected" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setApprovalFilter(item.key as typeof approvalFilter)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      approvalFilter === item.key ? "bg-navy text-white" : "text-muted-foreground hover:text-navy-dark",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <p>Loading content...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <Card className="border-dashed border-slate-200 bg-white shadow-sm">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No announcements matched the current search or approval filter.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredAnnouncements.map((announcement) => (
              <button
                key={announcement.id}
                type="button"
                onClick={() => openDetail(announcement)}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {announcement.image_url && (
                  <img src={resolveAssetUrl(announcement.image_url) || announcement.image_url} alt={announcement.title} className="h-44 w-full object-cover" />
                )}
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getTypeBadgeClassName(announcement.type)}>{formatTypeLabel(announcement.type)}</Badge>
                    <Badge className={getApprovalBadgeClassName(announcement.approvalStatus || "approved")}>{formatApprovalLabel(announcement.approvalStatus || "approved")}</Badge>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-tight text-navy-dark">{announcement.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{announcement.description || "No description provided yet."}</p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <p>Submitted by: {announcement.createdByName || "System Admin"}</p>
                    <p>Audience: {announcement.audienceLabel || "All alumni"}</p>
                    <p>Posted date: {announcement.date ? new Date(announcement.date).toLocaleDateString() : "Not set"}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
            {selectedAnnouncement && (
              <>
                <DialogHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getTypeBadgeClassName(selectedAnnouncement.type)}>{formatTypeLabel(selectedAnnouncement.type)}</Badge>
                    <Badge className={getApprovalBadgeClassName(selectedAnnouncement.approvalStatus || "approved")}>
                      {formatApprovalLabel(selectedAnnouncement.approvalStatus || "approved")}
                    </Badge>
                  </div>
                  <DialogTitle className="text-2xl text-navy-dark">{selectedAnnouncement.title}</DialogTitle>
                  <DialogDescription>Review the full submission details before approving or rejecting public visibility.</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {selectedAnnouncement.image_url ? (
                    <img src={resolveAssetUrl(selectedAnnouncement.image_url) || selectedAnnouncement.image_url} alt={selectedAnnouncement.title} className="h-64 w-full rounded-3xl border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-muted-foreground">
                      No image attached.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetaCard label="Submitted By" value={selectedAnnouncement.createdByName || "System Admin"} />
                    <MetaCard label="Date" value={selectedAnnouncement.date ? new Date(selectedAnnouncement.date).toLocaleDateString() : "Not set"} />
                    <MetaCard label="Status" value={selectedAnnouncement.status.replace(/\b\w/g, (char) => char.toUpperCase())} />
                    <MetaCard label="Audience" value={selectedAnnouncement.audienceLabel || "All alumni"} />
                    <MetaCard label="Time" value={selectedAnnouncement.time || "Not set"} />
                    <MetaCard label="Venue" value={selectedAnnouncement.venue || "Not set"} />
                    <MetaCard label={selectedAnnouncement.type === "event" ? "Event Type" : selectedAnnouncement.type === "survey" ? "Survey Owner" : "Organizer"} value={selectedAnnouncement.organizer || "Not set"} />
                  </div>

                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Full content</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedAnnouncement.description || "No content provided."}</p>
                  </section>

                  {selectedAnnouncement.type === "survey" && selectedAnnouncement.google_form_link && (
                    <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-900">Survey Link</h3>
                      <a href={selectedAnnouncement.google_form_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-900 underline underline-offset-4">
                        Open survey form
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </section>
                  )}

                  {(selectedAnnouncement.approvalStatus || "approved") !== "approved" && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-5">
                      <Label htmlFor="announcement-rejection" className="text-sm font-semibold text-navy-dark">
                        Rejection reason
                      </Label>
                      <Textarea
                        id="announcement-rejection"
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        rows={4}
                        className="mt-3 border-slate-300 bg-white"
                        placeholder="Explain what needs to be corrected before this post can be published."
                      />
                    </section>
                  )}

                  {selectedAnnouncement.rejectionReason && (
                    <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                      <p className="font-semibold">Current rejection note</p>
                      <p className="mt-2 whitespace-pre-wrap leading-7">{selectedAnnouncement.rejectionReason}</p>
                    </section>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    {(selectedAnnouncement.approvalStatus || "approved") !== "approved" && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() =>
                            approvalMutation.mutate({
                              id: selectedAnnouncement.id,
                              approvalStatus: "rejected",
                              reason: rejectionReason,
                            })
                          }
                          disabled={approvalMutation.isPending}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() =>
                            approvalMutation.mutate({
                              id: selectedAnnouncement.id,
                              approvalStatus: "approved",
                            })
                          }
                          disabled={approvalMutation.isPending}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Approve and Publish
                        </Button>
                      </>
                    )}
                    <Button type="button" variant="outline" onClick={() => openEdit(selectedAnnouncement)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button type="button" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => handleDelete(selectedAnnouncement.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl text-navy-dark">{editId ? "Edit content" : "Create official content"}</DialogTitle>
              <DialogDescription>Admin-created content publishes immediately after saving.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Title">
                  <Input value={formData.title} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>

                <Field label="Type">
                  <select value={formData.type} onChange={(event) => handleTypeChange(event.target.value as AnnouncementType)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy">
                    <option value="announcement">Announcement</option>
                    <option value="event">Event</option>
                    <option value="survey">Survey</option>
                  </select>
                </Field>
              </div>

              <Field label={formData.type === "survey" ? "Survey instructions" : "Full content"}>
                <Textarea value={formData.description} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} rows={6} className="border-slate-300 bg-white" />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Date">
                  <Input type="date" value={formData.date} onChange={(event) => setFormData((current) => ({ ...current, date: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>

                {formData.type === "event" ? (
                  <Field label="Event Type">
                    <select
                      value={formData.organizer}
                      onChange={(event) => setFormData((current) => ({ ...current, organizer: event.target.value }))}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy"
                    >
                      <option value="">Select event type</option>
                      {getEventTypeOptions(formData.organizer).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Lifecycle Status">
                    <select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value as AnnouncementStatus }))} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy">
                      {getStatusOptions(formData.type).map((status) => (
                        <option key={status} value={status}>
                          {formatLifecycleStatus(status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Audience">
                  <select
                    value={formData.audienceScope}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        audienceScope: event.target.value as AnnouncementAudienceScope,
                        audienceValue: event.target.value === "all" ? "" : current.audienceValue,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy"
                  >
                    <option value="all">All alumni</option>
                    <option value="course">Specific course</option>
                    <option value="batch">Specific batch</option>
                  </select>
                </Field>

                <Field label={formData.audienceScope === "course" ? "Course target" : formData.audienceScope === "batch" ? "Batch target" : "Audience value"}>
                  <Input
                    value={formData.audienceValue}
                    onChange={(event) => setFormData((current) => ({ ...current, audienceValue: event.target.value }))}
                    className="border-slate-300 bg-white"
                    placeholder={formData.audienceScope === "course" ? "Example: BTLED" : formData.audienceScope === "batch" ? "Example: 2026" : "Not required for all alumni"}
                    disabled={formData.audienceScope === "all"}
                    required={formData.audienceScope !== "all"}
                  />
                </Field>
              </div>

              {formData.type !== "announcement" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={formData.type === "survey" ? "Deadline time" : "Event time"}>
                    <Input type="time" value={formData.time} onChange={(event) => setFormData((current) => ({ ...current, time: event.target.value }))} className="border-slate-300 bg-white" />
                  </Field>
                  {formData.type === "survey" && (
                    <Field label="Survey owner">
                      <Input value={formData.organizer} onChange={(event) => setFormData((current) => ({ ...current, organizer: event.target.value }))} className="border-slate-300 bg-white" />
                    </Field>
                  )}
                </div>
              )}

              {formData.type === "event" && (
                <Field label="Venue">
                  <Input value={formData.venue} onChange={(event) => setFormData((current) => ({ ...current, venue: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
              )}

              {formData.type === "survey" && (
                <Field label="Survey link">
                  <Input type="url" value={formData.google_form_link} onChange={(event) => setFormData((current) => ({ ...current, google_form_link: event.target.value }))} className="border-slate-300 bg-white" placeholder="https://forms.gle/..." />
                </Field>
              )}

              <Field label="Image attachment">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-muted-foreground transition hover:border-navy">
                  <Plus className="h-4 w-4" />
                  <span>{formData.image_url ? "Image selected" : "Upload an image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
                {formData.image_url && <img src={formData.image_url} alt="Preview" className="mt-3 h-44 w-full rounded-2xl border border-slate-200 object-cover" />}
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editId ? (
                    "Save changes"
                  ) : (
                    "Create item"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
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

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}

function getDefaultStatus(type: AnnouncementType): AnnouncementStatus {
  if (type === "event") return "upcoming";
  return "active";
}

function getStatusOptions(type: AnnouncementType): AnnouncementStatus[] {
  if (type === "event") return ["upcoming", "ongoing", "completed", "cancelled"];
  if (type === "survey") return ["active", "inactive", "completed", "cancelled"];
  return ["active", "inactive"];
}

function getEventTypeOptions(currentValue: string) {
  const options = [...EVENT_TYPE_OPTIONS];
  const normalizedCurrent = currentValue.trim();

  if (normalizedCurrent && !options.includes(normalizedCurrent as (typeof EVENT_TYPE_OPTIONS)[number])) {
    options.push(normalizedCurrent as (typeof EVENT_TYPE_OPTIONS)[number]);
  }

  return options;
}

function normalizeFormPayload(formData: AnnouncementForm): AnnouncementForm {
  if (formData.type === "announcement") {
    return {
      ...formData,
      time: "",
      venue: "",
      google_form_link: "",
      audienceValue: formData.audienceScope === "all" ? "" : formData.audienceValue.trim(),
    };
  }

  if (formData.type === "survey") {
    return {
      ...formData,
      venue: "",
      audienceValue: formData.audienceScope === "all" ? "" : formData.audienceValue.trim(),
    };
  }

  return {
    ...formData,
    audienceValue: formData.audienceScope === "all" ? "" : formData.audienceValue.trim(),
  };
}

function formatLifecycleStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTypeLabel(type: AnnouncementType) {
  if (type === "event") return "Event";
  if (type === "survey") return "Survey";
  return "Announcement";
}

function formatApprovalLabel(status: AnnouncementApprovalStatus) {
  if (status === "pending_approval") return "Pending Approval";
  if (status === "rejected") return "Rejected";
  return "Approved / Published";
}

function getTypeBadgeClassName(type: AnnouncementType) {
  if (type === "event") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (type === "survey") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

function getApprovalBadgeClassName(status: AnnouncementApprovalStatus) {
  if (status === "pending_approval") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (status === "rejected") return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
