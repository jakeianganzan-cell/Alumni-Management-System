import { useMemo, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Archive,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPageIntro } from "@/components/admin/AdminPageIntro";
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
import DurationBadge from "@/components/DurationBadge";
import SurveyStudio from "@/components/admin/SurveyStudio";

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
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  interestEnabled: boolean;
};

type ContentWorkspace = "announcement" | "event" | "survey";

interface AnnouncementReply {
  id: number;
  commentId: number;
  content: string;
  status: string;
  createdAt: string;
  authorName: string;
  authorEmail?: string | null;
}

interface AnnouncementComment {
  id: number;
  content: string;
  status: string;
  createdAt: string;
  authorName: string;
  authorEmail?: string | null;
  replies: AnnouncementReply[];
}

interface AdminInterestAlumni {
  alumniId: string;
  name?: string | null;
  email?: string | null;
  studentId?: string | null;
  course?: string | null;
  batch?: string | null;
  isInterested: boolean;
  interestStatus: string;
  interestedAt?: string | null;
  updatedAt?: string | null;
}

interface AdminInterestSummary {
  totalAlumni: number;
  interestedCount: number;
  notInterestedCount: number;
  interestPercentage: number;
  alumni: AdminInterestAlumni[];
}

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
  start_date: "",
  start_time: "08:00",
  end_date: "",
  end_time: "23:59",
  interestEnabled: false,
};

const EVENT_TYPE_OPTIONS = ["Donation", "Meeting", "Alumni", "Other"] as const;

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnnouncementForm>(BLANK_FORM);
  const [activeWorkspace, setActiveWorkspace] = useState<ContentWorkspace>("announcement");
  const [approvalFilter, setApprovalFilter] = useState<"all" | AnnouncementApprovalStatus>("all");
  const [durationFilter, setDurationFilter] = useState<"all" | "Upcoming" | "Active" | "Archived">("all");
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

  const { data: interestSummary, isLoading: interestsLoading } = useQuery<AdminInterestSummary>({
    queryKey: ["admin-announcement-interests", selectedAnnouncement?.id],
    enabled: detailOpen && Boolean(selectedAnnouncement) && (selectedAnnouncement?.type === "event" || Boolean(selectedAnnouncement?.interestEnabled)),
    queryFn: async () => {
      if (!selectedAnnouncement) {
        return { totalAlumni: 0, interestedCount: 0, notInterestedCount: 0, interestPercentage: 0, alumni: [] };
      }
      const response = await fetch(`${API_URL}/admin/announcements/${selectedAnnouncement.id}/interests`, {
        headers: getAuthHeaders(),
      });
      return readApiResponse<AdminInterestSummary>(response);
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

  const { data: announcementComments = [], isFetching: commentsLoading } = useQuery<AnnouncementComment[]>({
    queryKey: ["admin-announcement-comments", selectedAnnouncement?.id],
    enabled: Boolean(detailOpen && selectedAnnouncement?.id),
    queryFn: async () => {
      const response = await fetch(`${API_URL}/announcements/${selectedAnnouncement!.id}/comments`, {
        headers: getAuthHeaders(),
      });
      return readApiResponse<AnnouncementComment[]>(response);
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

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const target = announcements.find((item) => item.id === id);
      const response = await fetch(target?.type === "event" ? `${API_URL}/admin/events/${id}/archive` : `${API_URL}/announcements/${id}/archive`, {
        method: target?.type === "event" ? "POST" : "PATCH",
        headers: getAuthHeaders(),
      });
      return readApiResponse(response);
    },
    onSuccess: () => {
      toast.success("Item archived");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setDetailOpen(false);
      setSelectedAnnouncement(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to archive item");
    },
  });

  const moderateCommentMutation = useMutation({
    mutationFn: async ({ target, id, status }: { target: "comment" | "reply"; id: number; status: "visible" | "hidden" }) => {
      const response = await fetch(`${API_URL}/admin/${target === "comment" ? "announcement-comments" : "announcement-comment-replies"}/${id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return readApiResponse(response);
    },
    onSuccess: () => {
      toast.success("Comment moderation updated");
      queryClient.invalidateQueries({ queryKey: ["admin-announcement-comments", selectedAnnouncement?.id] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to moderate comment");
    },
  });

  const contentWorkspaces = useMemo(
    () => [
      {
        key: "announcement" as const,
        label: "Announcements",
        description: "Official notices and alumni submissions.",
        count: announcements.filter((item) => item.type === "announcement").length,
      },
      {
        key: "event" as const,
        label: "Events",
        description: "Activities and alumni interest tracking.",
        count: announcements.filter((item) => item.type === "event").length,
      },
      {
        key: "survey" as const,
        label: "Surveys",
        description: "All surveys and survey creation.",
        count: 0,
      },
    ],
    [announcements],
  );

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => {
      if (activeWorkspace === "survey" || announcement.type !== activeWorkspace) return false;
      const matchesFilter = approvalFilter === "all" || (announcement.approvalStatus || "approved") === approvalFilter;
      const matchesDuration = durationFilter === "all" || (announcement.computed_status || announcement.duration_status) === durationFilter;
      const matchesSearch =
        !search ||
        announcement.title.toLowerCase().includes(search.toLowerCase()) ||
        (announcement.createdByName || "").toLowerCase().includes(search.toLowerCase()) ||
        (announcement.description || "").toLowerCase().includes(search.toLowerCase());

      return matchesFilter && matchesDuration && matchesSearch;
    });
  }, [activeWorkspace, announcements, approvalFilter, durationFilter, search]);

  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    if (activeWorkspace === "survey") return;
    setEditId(null);
    setFormData({
      ...BLANK_FORM,
      type: activeWorkspace,
      status: getDefaultStatus(activeWorkspace),
      interestEnabled: activeWorkspace === "event",
    });
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
      start_date: announcement.start_date || (announcement.start_datetime ? String(announcement.start_datetime).slice(0, 10) : announcement.date ? String(announcement.date).slice(0, 10) : ""),
      start_time: announcement.start_time || (announcement.start_datetime ? String(announcement.start_datetime).slice(11, 16) : announcement.time || "08:00"),
      end_date: announcement.end_date || (announcement.end_datetime ? String(announcement.end_datetime).slice(0, 10) : announcement.date ? String(announcement.date).slice(0, 10) : ""),
      end_time: announcement.end_time || (announcement.end_datetime ? String(announcement.end_datetime).slice(11, 16) : "23:59"),
      interestEnabled: announcement.type === "event" || Boolean(announcement.interestEnabled),
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
      interestEnabled: value === "event" ? true : current.interestEnabled,
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

  const handleRowKeyDown = (event: KeyboardEvent<HTMLElement>, announcement: Announcement) => {
    if (event.currentTarget !== event.target) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(announcement);
    }
  };

  return (
    <AdminLayout title="Announcements" subtitle="Review alumni submissions, publish content, and keep the public feed clean">
      <div className="space-y-6">
        <AdminPageIntro
          eyebrow="Content Management"
          title="Content workspace"
          action={
            activeWorkspace === "survey" ? null : (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {activeWorkspace === "event" ? "Add event" : "Add announcement"}
              </Button>
            )
          }
        />

        <div className="grid gap-3 md:grid-cols-3">
          {contentWorkspaces.map((workspace) => {
            const active = activeWorkspace === workspace.key;
            return (
              <button
                key={workspace.key}
                type="button"
                onClick={() => setActiveWorkspace(workspace.key)}
                className={cn(
                  "rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                  active ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-navy-dark",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-sm font-semibold", active ? "text-white" : "text-navy-dark")}>{workspace.label}</p>
                    <p className={cn("mt-1 text-xs leading-5", active ? "text-white/75" : "text-muted-foreground")}>{workspace.description}</p>
                  </div>
                  {workspace.key !== "survey" && (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700")}>
                      {workspace.count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {activeWorkspace === "survey" ? (
          <SurveyStudio />
        ) : (
          <>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {activeWorkspace === "event" ? "Event Workspace" : "Announcement Workspace"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-navy-dark">
                    {activeWorkspace === "event" ? "All events" : "All announcements"}
                  </h2>
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
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    {(["all", "Upcoming", "Active", "Archived"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setDurationFilter(item)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                          durationFilter === item ? "bg-navy text-white" : "text-muted-foreground hover:text-navy-dark",
                        )}
                      >
                        {item === "all" ? "All Time" : item}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-navy-dark">{activeWorkspace === "event" ? "All events" : "All announcements"}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activeWorkspace === "event"
                      ? "Review upcoming, active, ended, and archived event posts."
                      : "Review published, pending, rejected, and archived announcement posts."}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{filteredAnnouncements.length}</span>
              </div>

              <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading content...
                  </div>
                ) : filteredAnnouncements.length === 0 ? (
                  <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-muted-foreground">
                    No {activeWorkspace === "event" ? "events" : "announcements"} matched the current search or filters.
                  </div>
                ) : (
                  filteredAnnouncements.map((announcement) => (
                    <article
                      key={announcement.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(announcement)}
                      onKeyDown={(event) => handleRowKeyDown(event, announcement)}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-navy/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy/20"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start">
                        {announcement.image_url && (
                          <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 md:w-36">
                            <img src={resolveAssetUrl(announcement.image_url) || announcement.image_url} alt={announcement.title} className="h-full w-full object-contain" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge className={getTypeBadgeClassName(announcement.type)}>{formatTypeLabel(announcement.type)}</Badge>
                            <Badge className={getApprovalBadgeClassName(announcement.approvalStatus || "approved")}>{formatApprovalLabel(announcement.approvalStatus || "approved")}</Badge>
                            <DurationBadge status={announcement.computed_status || announcement.duration_status} remainingTime={announcement.remaining_time} startDatetime={announcement.start_datetime} endDatetime={announcement.end_datetime} />
                          </div>
                          <h3 className="line-clamp-2 text-sm font-semibold text-navy-dark">{announcement.title}</h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{announcement.description || "No description provided yet."}</p>
                          <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            {getContentStats(announcement)} | {announcement.audienceLabel || "All alumni"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Starts {formatDateTime(announcement.start_datetime)} | Ends {formatDateTime(announcement.end_datetime)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openDetail(announcement); }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEdit(announcement); }}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(announcement.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
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
                  <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{selectedAnnouncement.title}</DialogTitle>
                  <DialogDescription>Review the full submission details before approving or rejecting public visibility.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {selectedAnnouncement.image_url ? (
                    <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-72">
                      <img src={resolveAssetUrl(selectedAnnouncement.image_url) || selectedAnnouncement.image_url} alt={selectedAnnouncement.title} className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-muted-foreground sm:h-44">
                      No image attached.
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <MetaCard label="Submitted By" value={selectedAnnouncement.createdByName || "System Admin"} />
                    <MetaCard label="Date" value={selectedAnnouncement.date ? new Date(selectedAnnouncement.date).toLocaleDateString() : "Not set"} />
                    <MetaCard label="Status" value={selectedAnnouncement.status.replace(/\b\w/g, (char) => char.toUpperCase())} />
                    <MetaCard label="Duration Status" value={selectedAnnouncement.computed_status || selectedAnnouncement.duration_status || "Active"} />
                    <MetaCard label="Time Remaining" value={selectedAnnouncement.remaining_time || "Not set"} />
                    <MetaCard label="Starts" value={selectedAnnouncement.start_datetime ? new Date(String(selectedAnnouncement.start_datetime).replace(" ", "T")).toLocaleString() : "Not set"} />
                    <MetaCard label="Ends" value={selectedAnnouncement.end_datetime ? new Date(String(selectedAnnouncement.end_datetime).replace(" ", "T")).toLocaleString() : "Not set"} />
                    <MetaCard label="Audience" value={selectedAnnouncement.audienceLabel || "All alumni"} />
                    <MetaCard label="Time" value={selectedAnnouncement.time || "Not set"} />
                    <MetaCard label="Venue" value={selectedAnnouncement.venue || "Not set"} />
                    <MetaCard label={selectedAnnouncement.type === "event" ? "Event Type" : selectedAnnouncement.type === "survey" ? "Survey Owner" : "Organizer"} value={selectedAnnouncement.organizer || "Not set"} />
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Full content</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedAnnouncement.description || "No content provided."}</p>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Comments</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Hide or restore inappropriate comments and replies.</p>
                      </div>
                      <Badge variant="outline">{announcementComments.length}</Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      {commentsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading comments...</div>
                      ) : announcementComments.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">No comments yet.</div>
                      ) : (
                        announcementComments.map((comment) => (
                          <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-navy-dark">{comment.authorName}</p>
                                <p className="text-xs text-muted-foreground">{[comment.authorEmail, new Date(comment.createdAt).toLocaleString()].filter(Boolean).join(" | ")}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={moderateCommentMutation.isPending}
                                onClick={() => moderateCommentMutation.mutate({ target: "comment", id: comment.id, status: comment.status === "hidden" ? "visible" : "hidden" })}
                              >
                                {comment.status === "hidden" ? "Restore" : "Hide"}
                              </Button>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{comment.content}</p>
                            {comment.replies.length > 0 && (
                              <div className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
                                {comment.replies.map((reply) => (
                                  <div key={reply.id} className="rounded-xl bg-white p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-navy-dark">{reply.authorName}</p>
                                        <p className="text-xs text-muted-foreground">{[reply.authorEmail, new Date(reply.createdAt).toLocaleString()].filter(Boolean).join(" | ")}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={moderateCommentMutation.isPending}
                                        onClick={() => moderateCommentMutation.mutate({ target: "reply", id: reply.id, status: reply.status === "hidden" ? "visible" : "hidden" })}
                                      >
                                        {reply.status === "hidden" ? "Restore" : "Hide"}
                                      </Button>
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{reply.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {selectedAnnouncement.type === "survey" && selectedAnnouncement.google_form_link && (
                    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-900">Survey Link</h3>
                      <a href={selectedAnnouncement.google_form_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-900 underline underline-offset-4">
                        Open survey form
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </section>
                  )}

                  {(selectedAnnouncement.type === "event" || selectedAnnouncement.interestEnabled) && (
                    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-900">Interest Monitoring</h3>
                          <p className="mt-1 text-xs text-amber-900/75">Interest is only a feedback signal. It is not attendance, RSVP, approval, or confirmed participation.</p>
                        </div>
                        <UserCheck className="h-5 w-5 text-amber-800" />
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <MiniCount label="Total Alumni" value={interestSummary?.totalAlumni || 0} />
                        <MiniCount label="Interested" value={interestSummary?.interestedCount || 0} />
                        <MiniCount label="Not Interested" value={interestSummary?.notInterestedCount || 0} />
                      </div>

                      <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-navy-dark">Interest Percentage</p>
                          <p className="text-lg font-bold text-navy-dark">{(interestSummary?.interestPercentage || 0).toFixed(1)}%</p>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-navy transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, interestSummary?.interestPercentage || 0))}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Example: {interestSummary?.interestedCount || 0} of {interestSummary?.totalAlumni || 0} alumni clicked Interested.
                        </p>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-white">
                        {interestsLoading ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading interest records...</div>
                        ) : !interestSummary?.alumni.length ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">No alumni records found.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left text-sm">
                              <thead className="bg-amber-100/70 text-xs uppercase tracking-[0.12em] text-amber-900">
                                <tr>
                                  <th className="px-4 py-3">Alumni</th>
                                  <th className="px-4 py-3">Course / Batch</th>
                                  <th className="px-4 py-3">Interest</th>
                                  <th className="px-4 py-3">Updated</th>
                                </tr>
                              </thead>
                              <tbody>
                                {interestSummary.alumni.map((alumni) => (
                                  <tr key={alumni.alumniId} className="border-t border-amber-100">
                                    <td className="px-4 py-3" data-label="Alumni">
                                      <p className="font-semibold text-navy-dark">{alumni.name || "Unknown alumni"}</p>
                                      <p className="text-xs text-muted-foreground">{alumni.email || alumni.studentId || alumni.alumniId}</p>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground" data-label="Course / Batch">{[alumni.course, alumni.batch].filter(Boolean).join(" / ") || "Not set"}</td>
                                    <td className="px-4 py-3" data-label="Interest"><StatusPill label={alumni.isInterested ? "Interested" : "Not Interested"} /></td>
                                    <td className="px-4 py-3 text-muted-foreground" data-label="Updated">{alumni.updatedAt ? new Date(String(alumni.updatedAt).replace(" ", "T")).toLocaleString() : "No response"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {(selectedAnnouncement.approvalStatus || "approved") !== "approved" && (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
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
                    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
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
                      {(selectedAnnouncement.computed_status || selectedAnnouncement.duration_status) === "Archived" ? <RotateCcw className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
                      {(selectedAnnouncement.computed_status || selectedAnnouncement.duration_status) === "Archived" ? "Reopen with new end time" : "Edit"}
                    </Button>
                    {(selectedAnnouncement.computed_status || selectedAnnouncement.duration_status) !== "Archived" && (
                      <Button type="button" variant="outline" className="border-zinc-200 text-zinc-700 hover:bg-zinc-50" onClick={() => archiveMutation.mutate(selectedAnnouncement.id)}>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </Button>
                    )}
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
              <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">
                {editId ? "Edit content" : formData.type === "event" ? "Create event" : "Create announcement"}
              </DialogTitle>
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
                  </select>
                </Field>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={formData.type === "event" || formData.interestEnabled}
                  disabled={formData.type === "event"}
                  onChange={(event) => setFormData((current) => ({ ...current, interestEnabled: event.target.checked }))}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-navy-dark">Enable Interested button</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    Events always collect interest. For announcements, enable this only when alumni feedback is needed.
                  </span>
                </span>
              </label>

              <Field label={formData.type === "survey" ? "Survey instructions" : "Full content"}>
                <Textarea value={formData.description} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} rows={6} className="border-slate-300 bg-white" />
              </Field>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Start date">
                  <Input type="date" value={formData.start_date} onChange={(event) => setFormData((current) => ({ ...current, start_date: event.target.value, date: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
                <Field label="Start time">
                  <Input type="time" value={formData.start_time} onChange={(event) => setFormData((current) => ({ ...current, start_time: event.target.value, time: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
                <Field label="End date">
                  <Input type="date" value={formData.end_date} onChange={(event) => setFormData((current) => ({ ...current, end_date: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
                <Field label="End time">
                  <Input type="time" value={formData.end_time} onChange={(event) => setFormData((current) => ({ ...current, end_time: event.target.value }))} required className="border-slate-300 bg-white" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Third-party survey links are disabled. Use Survey Builder above to create internal questions and collect responses.
                </div>
              )}

              <Field label="Image attachment">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-muted-foreground transition hover:border-navy">
                  <Plus className="h-4 w-4" />
                  <span>{formData.image_url ? "Image selected" : "Upload an image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
                {formData.image_url && (
                  <div className="mt-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={formData.image_url} alt="Preview" className="h-full w-full object-contain" />
                  </div>
                )}
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
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white px-3 py-2">
      <p className="text-base font-bold text-navy-dark">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  const tone = label === "Attended" || label === "Going" || label === "Interested"
    ? "bg-emerald-100 text-emerald-800"
    : label === "Absent" || label === "Not Going" || label === "Not Interested"
      ? "bg-rose-100 text-rose-800"
      : "bg-amber-100 text-amber-800";
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>;
}

function getContentStats(announcement: Announcement) {
  const views = announcement.views || 0;
  const comments = announcement.comment_count || 0;

  if (announcement.type === "event") {
    const interested = announcement.interestCount ?? announcement.registration_count ?? 0;
    return `${interested} interested | ${views} views | ${comments} comments`;
  }

  if (announcement.interestEnabled) {
    return `${announcement.interestCount || 0} interested | ${views} views | ${comments} comments`;
  }

  return `${views} views | ${comments} comments`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "Not set";

  return parsed.toLocaleString();
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
  const base = {
    ...formData,
    date: formData.start_date || formData.date,
    time: formData.start_time || formData.time,
  };

  if (formData.type === "announcement") {
    return {
      ...base,
      venue: "",
      google_form_link: "",
      audienceValue: formData.audienceScope === "all" ? "" : formData.audienceValue.trim(),
    };
  }

  if (formData.type === "survey") {
    return {
      ...base,
      venue: "",
      audienceValue: formData.audienceScope === "all" ? "" : formData.audienceValue.trim(),
    };
  }

  return {
    ...base,
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
