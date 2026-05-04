import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Megaphone, Plus, Send } from "lucide-react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { AnnouncementAttachment, AnnouncementCard, AnnouncementDetailMeta, formatTypeLabel } from "@/components/AnnouncementCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement, AnnouncementApprovalStatus } from "@/context/AnnouncementContext";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { toast } from "sonner";

type AlumniAnnouncementForm = {
  title: string;
  description: string;
  date: string;
  organizer: string;
  image_url: string;
};

const BLANK_FORM: AlumniAnnouncementForm = {
  title: "",
  description: "",
  date: "",
  organizer: "",
  image_url: "",
};

export default function AlumniAnnouncements() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [form, setForm] = useState<AlumniAnnouncementForm>(BLANK_FORM);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/announcements`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Announcement[]>(response);
      setAnnouncements(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnnouncements();
    const interval = window.setInterval(() => {
      void loadAnnouncements();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  const mySubmissions = useMemo(() => {
    return announcements.filter((announcement) => announcement.createdBy === profile?.id);
  }, [announcements, profile?.id]);

  const publicAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => (announcement.approvalStatus || "approved") === "approved");
  }, [announcements]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, image_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const submitAnnouncement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/announcements`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          type: "announcement",
          status: "active",
          time: "",
          venue: "",
          google_form_link: "",
        }),
      });
      await readApiResponse(response);
      toast.success("Announcement submitted for admin approval");
      setForm(BLANK_FORM);
      setFormOpen(false);
      await loadAnnouncements();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to submit announcement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlumniLayout title="Announcements" subtitle="Browse published updates and submit alumni announcements for admin approval">
      <div className="space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Alumni Bulletin</p>
              <h2 className="mt-1 text-xl font-semibold text-navy-dark">Announcements and community updates</h2>
              <p className="mt-2 text-sm text-muted-foreground">Published posts appear for everyone. Alumni-created posts go through admin approval before they become public.</p>
            </div>
          </CardContent>
        </Card>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSubmissionsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy-dark">My submissions</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {mySubmissions.length === 0 ? "No announcement submissions" : `${mySubmissions.length} announcement submission${mySubmissions.length === 1 ? "" : "s"}`}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="outline">{mySubmissions.length}</Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${submissionsOpen ? "rotate-180" : ""}`} />
            </span>
          </button>

          {submissionsOpen && (
            <div className="border-t border-slate-200 px-5 py-4">
              {mySubmissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have not submitted any announcements yet.</p>
              ) : (
                <div className="space-y-3">
                  {mySubmissions.map((announcement) => (
                    <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-navy-dark">{announcement.title}</p>
                            <Badge className={getApprovalBadgeClassName(announcement.approvalStatus || "approved")}>
                              {formatApprovalLabel(announcement.approvalStatus || "approved")}
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{announcement.description || "No description provided."}</p>
                          <p className="mt-2 text-xs text-muted-foreground">Audience: {announcement.audienceLabel || "All alumni"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{announcement.date ? new Date(announcement.date).toLocaleDateString() : "No date set"}</p>
                      </div>
                      {announcement.rejectionReason && (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                          <p className="font-semibold">Admin feedback</p>
                          <p className="mt-1 whitespace-pre-wrap">{announcement.rejectionReason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mb-2 h-8 w-8 animate-spin" />
            <p>Loading announcements...</p>
          </div>
        ) : publicAnnouncements.length === 0 ? (
          <Card className="border-dashed border-slate-200 bg-white shadow-sm">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No published announcements are available right now.</CardContent>
          </Card>
        ) : (
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-navy-dark">Published feed</h3>
                <p className="text-sm text-muted-foreground">Click any card to view the full details and follow survey links when available.</p>
              </div>
              <Badge variant="outline">{publicAnnouncements.length} published</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {publicAnnouncements.map((announcement) => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  onOpen={setSelectedAnnouncement}
                  className="min-w-0 max-w-none"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(91,18,36,0.28)] transition hover:opacity-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-4 w-4" />
        Announcement
      </button>

      <Dialog open={Boolean(selectedAnnouncement)} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          {selectedAnnouncement && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getTypeBadgeClassName(selectedAnnouncement.type)}>
                    {formatTypeLabel(selectedAnnouncement.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedAnnouncement.date ? new Date(selectedAnnouncement.date).toLocaleDateString() : "Posted recently"}
                  </span>
                </div>
                <DialogTitle className="text-2xl text-navy-dark">{selectedAnnouncement.title}</DialogTitle>
                <DialogDescription>Complete details for the selected post.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <AnnouncementAttachment announcement={selectedAnnouncement} />

                <AnnouncementDetailMeta announcement={selectedAnnouncement} />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Complete details
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {selectedAnnouncement.description || "No full content has been added."}
                  </p>
                </div>

                {selectedAnnouncement.type === "survey" && selectedAnnouncement.google_form_link && (
                  <a
                    href={selectedAnnouncement.google_form_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Survey Form
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(open) => !submitting && setFormOpen(open)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy-dark">Submit Alumni Announcement</DialogTitle>
            <DialogDescription>Your announcement will stay in Pending Approval until an admin reviews and publishes it.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submitAnnouncement} className="space-y-5">
            <Field label="Title">
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required className="border-slate-300 bg-white" />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Announcement Date">
                <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required className="border-slate-300 bg-white" />
              </Field>
              <Field label="Organizer / Batch Group">
                <Input value={form.organizer} onChange={(event) => setForm((current) => ({ ...current, organizer: event.target.value }))} className="border-slate-300 bg-white" placeholder="Optional" />
              </Field>
            </div>

            <Field label="Full announcement">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={6} className="border-slate-300 bg-white" required />
            </Field>

            <Field label="Optional image">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-muted-foreground transition hover:border-navy">
                <Plus className="h-4 w-4" />
                <span>{form.image_url ? "Image selected" : "Upload image"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
              {form.image_url && <img src={form.image_url} alt="Announcement preview" className="mt-3 h-44 w-full rounded-2xl border border-slate-200 object-cover" />}
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AlumniLayout>
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

function formatApprovalLabel(status: AnnouncementApprovalStatus) {
  if (status === "pending_approval") return "Pending Approval";
  if (status === "rejected") return "Rejected";
  return "Approved / Published";
}

function getApprovalBadgeClassName(status: AnnouncementApprovalStatus) {
  if (status === "pending_approval") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (status === "rejected") return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

function getTypeBadgeClassName(type: Announcement["type"]) {
  if (type === "event") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (type === "survey") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}
