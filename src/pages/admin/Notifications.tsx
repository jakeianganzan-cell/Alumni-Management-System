import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  Send, Mail, Users, Clock, CheckCircle, XCircle,
  Eye, Edit3, Loader2, FileText,
} from "lucide-react";

type ComposeTab = "compose" | "history";
type RecipientType = "all" | "batch" | "course" | "reminder";
type NotifStatus = "sent" | "scheduled" | "failed" | "draft";

interface Notification {
  id: string;
  subject: string;
  message: string;
  type: string | null;
  status: string | null;
  recipients: string | null;
  recipient_count: number | null;
  sent_at: string | null;
  scheduled_at: string | null;
  open_rate: number | null;
}

interface ProfileFilterRow {
  id: string;
  batch: string | null;
  course: string | null;
  role?: string | null;
}

interface TracerRecipientRow {
  user_id: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  sent: { label: "Sent", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700", icon: Clock },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: XCircle },
  draft: { label: "Draft", color: "bg-amber-100 text-amber-700", icon: Edit3 },
};

const EMAIL_TEMPLATES = [
  {
    name: "Welcome New Alumni",
    subject: "Welcome to SaCC Alumni Community!",
    message: `Dear Alumni,\n\nWelcome to the Salay Community College Alumni Association! We're thrilled to have you as part of our growing community.\n\nAs a registered alumni, you can:\n• Stay connected with fellow graduates\n• Participate in events and reunions\n• Access exclusive alumni resources\n• Contribute to the growth of SaCC\n\nWe look forward to your active participation!\n\nBest regards,\nSaCC Alumni Association`,
  },
  {
    name: "Event Invitation",
    subject: "You're Invited! Upcoming SaCC Alumni Event",
    message: `Dear Alumni,\n\nWe are excited to invite you to our upcoming alumni event!\n\n📅 Date: [Date]\n📍 Venue: [Venue]\n🕐 Time: [Time]\n\nThis is a wonderful opportunity to reconnect with fellow alumni, network, and celebrate our shared experiences at Salay Community College.\n\nPlease confirm your attendance by replying to this email.\n\nWe hope to see you there!\n\nBest regards,\nSaCC Alumni Association`,
  },
  {
    name: "Donation Appeal",
    subject: "Support SaCC – Your Contribution Matters",
    message: `Dear Alumni,\n\nSalay Community College has been a cornerstone of education in our community, and your support can make a lasting impact.\n\nYour generous donation will help:\n• Fund scholarships for deserving students\n• Improve campus facilities\n• Support academic programs\n• Strengthen alumni engagement initiatives\n\nEvery contribution, big or small, brings us closer to our goals. You can donate through the alumni portal or via GCash.\n\nThank you for giving back to the institution that shaped your future.\n\nWith gratitude,\nSaCC Alumni Association`,
  },
  {
    name: "Tracer Survey Reminder",
    subject: "Reminder: Please Complete Your Graduate Tracer Survey",
    message: `Dear Alumni,\n\nWe noticed you haven't yet completed the Graduate Tracer Survey. Your response is crucial in helping us:\n\n• Improve our academic programs\n• Understand employment trends\n• Enhance career services for future graduates\n• Maintain accreditation standards\n\nThe survey only takes 5-10 minutes to complete. Please log in to your alumni portal and navigate to the Tracer section.\n\nYour input truly matters. Thank you for your cooperation!\n\nBest regards,\nSaCC Alumni Association`,
  },
  {
    name: "General Announcement",
    subject: "Important Announcement from SaCC Alumni Association",
    message: `Dear Alumni,\n\n[Your announcement here]\n\nFor more details, please visit the alumni portal or contact us directly.\n\nBest regards,\nSaCC Alumni Association`,
  },
];

export default function AdminNotifications() {
  const [tab, setTab] = useState<ComposeTab>("history");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("all");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const [batches, setBatches] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);

  useEffect(() => {
    fetchNotifications();
    fetchFilters();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/notifications`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data ?? []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchFilters = async () => {
    try {
      const res = await fetch(`${API_URL}/profiles`, { headers: getAuthHeaders() });
      if (res.ok) {
        const profiles: ProfileFilterRow[] = await res.json();
        setBatches([...new Set(profiles.map((p) => p.batch).filter((value): value is string => Boolean(value)))].sort());
        setCourses([...new Set(profiles.map((p) => p.course).filter((value): value is string => Boolean(value)))].sort());
      }
    } catch (e) { console.error(e); }
  };

  const filtered = notifications.filter(n => {
    const matchSearch = n.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || n.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getRecipientLabel = () => {
    if (recipientType === "all") return "All Alumni";
    if (recipientType === "batch") return `Batch ${selectedBatch}`;
    if (recipientType === "course") return `Course: ${selectedCourse}`;
    if (recipientType === "reminder") return "Tracer Non-Respondents";
    return "All Alumni";
  };

  const getRecipientCount = async () => {
    try {
      const res = await fetch(`${API_URL}/profiles`, { headers: getAuthHeaders() });
      if (!res.ok) return 0;
      const profiles: ProfileFilterRow[] = await res.json();
      if (recipientType === "all") {
        return profiles.filter((p) => p.role === "alumni").length;
      }
      if (recipientType === "batch") {
        return profiles.filter((p) => p.batch === selectedBatch).length;
      }
      if (recipientType === "course") {
        return profiles.filter((p) => p.course === selectedCourse).length;
      }
      if (recipientType === "reminder") {
        const rT = await fetch(`${API_URL}/tracer`, { headers: getAuthHeaders() });
        if (!rT.ok) return 0;
        const tracer: TracerRecipientRow[] = await rT.json();
        const tracerIds = new Set(tracer.map((t) => t.user_id));
        return profiles.filter((p) => p.role === "alumni" && !tracerIds.has(p.id)).length;
      }
    } catch (e) { console.error(e); }
    return 0;
  };

  const handleSend = async () => {
    if (!subject || !message) return;
    if (recipientType === "batch" && !selectedBatch) return;
    if (recipientType === "course" && !selectedCourse) return;
    setSending(true);

    const recipientCount = await getRecipientCount();
    await fetch(`${API_URL}/notifications/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        subject,
        message,
        recipientsLabel: getRecipientLabel(),
        recipientCount
      })
    });

    setSending(false);
    setSendSuccess(true);
    setSubject("");
    setMessage("");
    setRecipientType("all");
    setSelectedBatch("");
    setSelectedCourse("");
    fetchNotifications();
    setTimeout(() => { setSendSuccess(false); setTab("history"); }, 2000);
  };

  const applyTemplate = (tpl: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(tpl.subject);
    setMessage(tpl.message);
  };

  const stats = {
    sent: notifications.filter(n => n.status === "sent").length,
    scheduled: notifications.filter(n => n.status === "scheduled").length,
    failed: notifications.filter(n => n.status === "failed").length,
    total: notifications.length,
  };

  return (
    <AdminLayout title="Mailing" subtitle="Send emails to alumni">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Sent", value: stats.sent, icon: CheckCircle, color: "bg-emerald-100 text-emerald-700" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: "bg-blue-100 text-blue-700" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "bg-red-100 text-red-700" },
          { label: "Total Mails", value: stats.total, icon: Mail, color: "bg-purple-100 text-purple-700" },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color}`}><s.icon className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold text-navy-dark">{loading ? "…" : s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex border-b border-border">
          {[
            { key: "history", label: "History", icon: Mail },
            { key: "compose", label: "Compose", icon: Send },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as ComposeTab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? "border-navy text-navy bg-navy/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {tab === "history" && (
          <div className="p-4 lg:p-5">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mails…"
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20">
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="scheduled">Scheduled</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="space-y-2">
              {loading && <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>}
              {!loading && filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No mails found.</div>}
              {filtered.map(n => {
                const sc = statusConfig[n.status ?? "draft"] ?? statusConfig.draft;
                return (
                  <div key={n.id} className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-navy/10">
                        <Mail className="w-4 h-4 text-navy" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate flex-1 text-navy-dark">{n.subject}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" /> {n.recipients ?? "—"} · {(n.recipient_count ?? 0).toLocaleString()}</span>
                          {n.sent_at && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {new Date(n.sent_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setSelectedNotif(n)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "compose" && (
          <div className="p-4 lg:p-6">
            {sendSuccess && (
              <div className="p-4 mb-5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-emerald-700 text-sm font-semibold">Email sent successfully!</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-navy">Send To</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: "all", label: "All Alumni", icon: Users },
                      { key: "batch", label: "By Batch", icon: FileText },
                      { key: "course", label: "By Course", icon: FileText },
                      { key: "reminder", label: "Tracer Reminder", icon: Clock },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => setRecipientType(opt.key as RecipientType)}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border-2 text-xs font-medium transition-all ${recipientType === opt.key
                          ? "border-navy bg-navy/5 text-navy"
                          : "border-border hover:border-navy/30 text-muted-foreground"}`}>
                        <opt.icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {recipientType === "batch" && (
                  <div>
                    <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-navy">Select Batch</label>
                    <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20">
                      <option value="">Choose a batch…</option>
                      {batches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                )}

                {recipientType === "course" && (
                  <div>
                    <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-navy">Select Course</label>
                    <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20">
                      <option value="">Choose a course…</option>
                      {courses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {recipientType === "reminder" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    <strong>Tracer Reminder:</strong> This will target all alumni who have not yet submitted their Graduate Tracer Survey response.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-navy">Subject</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter email subject…"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-navy">Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={10}
                    placeholder="Write your email message…"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none" />
                </div>

                <button onClick={handleSend}
                  disabled={!subject || !message || sending || (recipientType === "batch" && !selectedBatch) || (recipientType === "course" && !selectedCourse)}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors bg-navy hover:bg-navy-light">
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Email</>}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-3 uppercase tracking-wider text-navy">Email Templates</label>
                <div className="space-y-2">
                  {EMAIL_TEMPLATES.map((tpl, i) => (
                    <button key={i} onClick={() => applyTemplate(tpl)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-navy/30 hover:bg-navy/5 transition-all group">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-navy" />
                        <p className="text-sm font-semibold text-navy-dark group-hover:text-navy">{tpl.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{tpl.subject}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedNotif(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-base text-navy-dark">{selectedNotif.subject}</h3>
              <button onClick={() => setSelectedNotif(null)} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 mb-4">
              <p className="text-sm text-foreground whitespace-pre-line">{selectedNotif.message}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Recipients</span><span className="font-medium">{selectedNotif.recipients}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Count</span><span className="font-medium">{(selectedNotif.recipient_count ?? 0).toLocaleString()}</span></div>
              {selectedNotif.sent_at && <div className="flex justify-between"><span className="text-muted-foreground">Sent</span><span className="font-medium">{new Date(selectedNotif.sent_at).toLocaleString()}</span></div>}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
