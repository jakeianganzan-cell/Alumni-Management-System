import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { API_URL, ApiError, fetchApi, getAuthHeaders, readApiResponse } from "@/lib/api";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Loader2,
  Mail,
  Search,
  Send,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";

type ComposeTab = "compose" | "history";
type EmailStatus = "sent" | "failed" | "pending";
type EmailPurpose =
  | "graduate_tracer_reminder"
  | "event_invitation"
  | "important_announcement"
  | "document_request"
  | "account_verification_reminder";

interface AlumniRecipient {
  id: string;
  name: string;
  email: string;
  student_id?: string | null;
  course?: string | null;
  batch?: string | null;
  reminder_reason?: string | null;
  reminder_reasons?: string[];
  tracer_last_updated?: string | null;
}

interface EmailLog {
  id: string;
  alumni_id: string;
  alumni_name?: string | null;
  student_id?: string | null;
  recipient_email: string;
  email_purpose: EmailPurpose;
  subject: string;
  message: string;
  status: EmailStatus;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}

interface MailingFilterOptions {
  courses: string[];
  batches: string[];
  reasons: Array<{ value: string; label: string }>;
}

interface MailingSendFailure {
  id: string;
  name?: string | null;
  email: string;
  error?: string | null;
  logId?: string;
}

interface MailingSendResult {
  message?: string;
  sentCount?: number;
  failedCount?: number;
  failures?: MailingSendFailure[];
}

const PURPOSE_LABELS: Record<EmailPurpose, string> = {
  graduate_tracer_reminder: "Graduate Tracer Reminder",
  event_invitation: "Event Invitation",
  important_announcement: "Important Announcement",
  document_request: "Document Request",
  account_verification_reminder: "Account Verification Reminder",
};

const MISSING_INFO_PLACEHOLDER = "[Missing information will be filled automatically for each selected alumnus]";

const FOLLOW_UP_REQUIREMENTS_BLOCK =
  `\n\nOur records show that your alumni profile still needs attention:\n\n${MISSING_INFO_PLACEHOLDER}\n\nPlease log in to the alumni portal and complete or update the missing details.`;

const EMAIL_TEMPLATES: Record<EmailPurpose, { subject: string; message: string }> = {
  graduate_tracer_reminder: {
    subject: "Reminder: Please Complete Your Graduate Tracer Survey",
    message:
      `Dear Alumni,\n\nPlease complete your Graduate Tracer Survey in the alumni portal. Your response helps the school monitor graduate outcomes, improve academic programs, and support future alumni services.${FOLLOW_UP_REQUIREMENTS_BLOCK}\n\nThank you for your cooperation.\n\nBest regards,\nSaCC Alumni Association`,
  },
  event_invitation: {
    subject: "Invitation: Upcoming Alumni Event",
    message:
      "Dear Alumni,\n\nYou are invited to join our upcoming alumni event.\n\nDate: [Date]\nTime: [Time]\nVenue: [Venue]\n\nPlease check the alumni portal or reply to this email for confirmation and event details.\n\nBest regards,\nSaCC Alumni Association",
  },
  important_announcement: {
    subject: "Important Announcement from SaCC Alumni Association",
    message:
      "Dear Alumni,\n\n[Write the important announcement here.]\n\nPlease review the details and contact the alumni office if you have questions.\n\nBest regards,\nSaCC Alumni Association",
  },
  document_request: {
    subject: "Document Request from Alumni Office",
    message:
      `Dear Alumni,\n\nThe alumni office is requesting the following document or information:\n\n[Document or information needed]${FOLLOW_UP_REQUIREMENTS_BLOCK}\n\nPlease submit it through the alumni portal or coordinate with the office as soon as possible.\n\nBest regards,\nSaCC Alumni Association`,
  },
  account_verification_reminder: {
    subject: "Reminder: Verify Your Alumni Portal Account",
    message:
      `Dear Alumni,\n\nPlease verify and update your alumni portal account information. Keeping your account current helps the school contact you for tracer, event, and alumni records updates.${FOLLOW_UP_REQUIREMENTS_BLOCK}\n\nBest regards,\nSaCC Alumni Association`,
  },
};

const statusConfig: Record<EmailStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  sent: { label: "Sent", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: XCircle },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
};

const MAX_SELECTED_ALUMNI = 10;

const formatDate = (value?: string | null) => {
  if (!value) return "Not sent";
  return new Date(value).toLocaleString();
};

const getMailingSendErrorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as { error?: unknown; failures?: MailingSendFailure[]; failedCount?: unknown };
    const baseMessage = typeof payload.error === "string" && payload.error.trim() ? payload.error.trim() : error.message;
    const firstFailure = Array.isArray(payload.failures)
      ? payload.failures.find((failure) => String(failure.error || "").trim())
      : null;

    if (firstFailure?.error) {
      const failedCount = typeof payload.failedCount === "number" && payload.failedCount > 1
        ? ` (${payload.failedCount} failed)`
        : "";
      return `${baseMessage} ${firstFailure.error}${failedCount}`;
    }

    return baseMessage;
  }

  return error instanceof Error ? error.message : "Email was not sent.";
};

export default function AdminNotifications() {
  const [tab, setTab] = useState<ComposeTab>("compose");
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
  const [logToDelete, setLogToDelete] = useState<EmailLog | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  const [alumniSearch, setAlumniSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState<AlumniRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedAlumni, setSelectedAlumni] = useState<AlumniRecipient[]>([]);
  const [filterOptions, setFilterOptions] = useState<MailingFilterOptions>({ courses: [], batches: [], reasons: [] });
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedReason, setSelectedReason] = useState("");

  const [purpose, setPurpose] = useState<EmailPurpose>("graduate_tracer_reminder");
  const [subject, setSubject] = useState(EMAIL_TEMPLATES.graduate_tracer_reminder.subject);
  const [message, setMessage] = useState(EMAIL_TEMPLATES.graduate_tracer_reminder.message);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetchApi(`${API_URL}/admin/mailing/logs`, { headers: getAuthHeaders() });
      const data = await readApiResponse<EmailLog[]>(res);
      setLogs(data ?? []);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to load email logs.");
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const res = await fetchApi(`${API_URL}/admin/mailing/filters`, { headers: getAuthHeaders() });
      const data = await readApiResponse<MailingFilterOptions>(res);
      setFilterOptions(data ?? { courses: [], batches: [], reasons: [] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to load recipient filters.");
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingRecipients(true);
      try {
        const params = new URLSearchParams();
        if (alumniSearch.trim()) params.set("search", alumniSearch.trim());
        if (selectedCourse) params.set("course", selectedCourse);
        if (selectedBatch) params.set("batch", selectedBatch);
        if (selectedReason) params.set("reason", selectedReason);
        const res = await fetchApi(`${API_URL}/admin/mailing/alumni?${params.toString()}`, {
          headers: getAuthHeaders(),
        });
        const data = await readApiResponse<AlumniRecipient[]>(res);
        if (!cancelled) setRecipientResults(data ?? []);
      } catch (error) {
        if (!cancelled) setSendError(error instanceof Error ? error.message : "Unable to search alumni.");
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [alumniSearch, selectedBatch, selectedCourse, selectedReason]);

  const stats = useMemo(
    () => ({
      sent: logs.filter((log) => log.status === "sent").length,
      failed: logs.filter((log) => log.status === "failed").length,
      total: logs.length,
      recent: logs.filter((log) => {
        const created = new Date(log.created_at).getTime();
        return Number.isFinite(created) && Date.now() - created <= 24 * 60 * 60 * 1000;
      }).length,
    }),
    [logs]
  );

  const applyTemplate = (nextPurpose: EmailPurpose) => {
    setPurpose(nextPurpose);
    setSubject(EMAIL_TEMPLATES[nextPurpose].subject);
    setMessage(EMAIL_TEMPLATES[nextPurpose].message);
  };

  const selectedAlumniIds = useMemo(() => new Set(selectedAlumni.map((alumnus) => alumnus.id)), [selectedAlumni]);

  const selectAlumnus = (alumnus: AlumniRecipient) => {
    setSendError("");
    setSendSuccess("");

    setSelectedAlumni((current) => {
      if (current.some((item) => item.id === alumnus.id)) {
        return current.filter((item) => item.id !== alumnus.id);
      }

      if (current.length >= MAX_SELECTED_ALUMNI) {
        setSendError(`You can select a maximum of ${MAX_SELECTED_ALUMNI} alumni at once.`);
        return current;
      }

      return [...current, alumnus];
    });
  };

  const removeAlumnus = (alumniId: string) => {
    setSelectedAlumni((current) => current.filter((alumnus) => alumnus.id !== alumniId));
  };

  const getReasonText = (alumnus: AlumniRecipient) => {
    const reasons = alumnus.reminder_reasons?.filter(Boolean);
    return reasons && reasons.length > 0 ? reasons.join(", ") : alumnus.reminder_reason || "Follow-up Required";
  };

  const validateBeforePreview = () => {
    setSendError("");
    setSendSuccess("");

    if (selectedAlumni.length === 0) {
      setSendError("Select at least one alumnus before sending email.");
      return false;
    }

    if (selectedAlumni.length > MAX_SELECTED_ALUMNI) {
      setSendError(`You can send email to a maximum of ${MAX_SELECTED_ALUMNI} selected alumni at once.`);
      return false;
    }

    if (!subject.trim() || !message.trim()) {
      setSendError("Subject and message are required.");
      return false;
    }

    setConfirming(true);
    return true;
  };

  const sendEmail = async () => {
    if (selectedAlumni.length === 0) return;

    setSending(true);
    setSendError("");
    setSendSuccess("");

    try {
      const res = await fetchApi(`${API_URL}/admin/mailing/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          alumniIds: selectedAlumni.map((alumnus) => alumnus.id),
          purpose,
          subject: subject.trim(),
          message: message.trim(),
          confirmed: true,
        }),
      });
      const result = await readApiResponse<MailingSendResult>(res);
      setSendSuccess(result?.message || `Email sent to ${selectedAlumni.length} selected alumni.`);
      setConfirming(false);
      setSelectedAlumni([]);
      setAlumniSearch("");
      applyTemplate(purpose);
      await fetchLogs();
      setTab("history");
    } catch (error) {
      setSendError(getMailingSendErrorMessage(error));
      await fetchLogs();
    } finally {
      setSending(false);
    }
  };

  const confirmDeleteLog = async () => {
    if (!logToDelete) return;

    setDeletingLogId(logToDelete.id);
    setSendError("");
    setSendSuccess("");

    try {
      const response = await fetchApi(`${API_URL}/admin/mailing/logs/${encodeURIComponent(logToDelete.id)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await readApiResponse<{ success: boolean }>(response);
      if (selectedLog?.id === logToDelete.id) {
        setSelectedLog(null);
      }
      setLogToDelete(null);
      setSendSuccess("Email log deleted.");
      await fetchLogs();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to delete email log.");
    } finally {
      setDeletingLogId(null);
    }
  };

  return (
    <AdminLayout title="Mailing" subtitle="Send targeted emails to selected alumni only">
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sent", value: stats.sent, icon: CheckCircle, color: "bg-emerald-100 text-emerald-700" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "bg-red-100 text-red-700" },
          { label: "Last 24 Hours", value: stats.recent, icon: Clock, color: "bg-amber-100 text-amber-700" },
          { label: "Total Logs", value: stats.total, icon: Mail, color: "bg-slate-100 text-slate-700" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-navy-dark">{loadingLogs ? "..." : item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex border-b border-border">
          {[
            { key: "compose", label: "Compose", icon: Send },
            { key: "history", label: "Email Logs", icon: Mail },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key as ComposeTab)}
              className={`flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-semibold transition-colors ${
                tab === item.key
                  ? "border-navy bg-navy/5 text-navy"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {tab === "compose" && (
          <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
            <div className="space-y-5">
              {sendSuccess && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  <CheckCircle className="h-5 w-5" />
                  {sendSuccess}
                </div>
              )}
              {sendError && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  <AlertCircle className="h-5 w-5" />
                  {sendError}
                </div>
              )}

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy">Selected Alumni</label>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {selectedAlumni.length}/{MAX_SELECTED_ALUMNI} selected
                  </span>
                </div>

                {selectedAlumni.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-navy/20 bg-navy/5 p-3">
                    {selectedAlumni.map((alumnus) => (
                      <div key={alumnus.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-navy-dark">{alumnus.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{alumnus.email}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[alumnus.student_id, alumnus.course, alumnus.batch].filter(Boolean).join(" | ") || "Alumni"}
                          </p>
                          <p className="truncate text-xs font-semibold text-amber-700">{getReasonText(alumnus)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAlumnus(alumnus.id)}
                          className="flex-shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-border">
                  <div className="grid grid-cols-1 gap-2 border-b border-border p-3 sm:grid-cols-3">
                    <select
                      value={selectedCourse}
                      onChange={(event) => setSelectedCourse(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                    >
                      <option value="">All courses</option>
                      {filterOptions.courses.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedBatch}
                      onChange={(event) => setSelectedBatch(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                    >
                      <option value="">All batches</option>
                      {filterOptions.batches.map((batch) => (
                        <option key={batch} value={batch}>
                          {batch}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedReason}
                      onChange={(event) => setSelectedReason(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                    >
                      <option value="">All reminder reasons</option>
                      {filterOptions.reasons.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={alumniSearch}
                      onChange={(event) => setAlumniSearch(event.target.value)}
                      placeholder="Search within alumni who need follow-up"
                      className="w-full bg-transparent py-2 text-sm outline-none"
                    />
                    {loadingRecipients && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {recipientResults.length === 0 && (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">No follow-up recipients match the filters.</p>
                    )}
                    {recipientResults.map((alumnus) => {
                      const isSelected = selectedAlumniIds.has(alumnus.id);

                      return (
                        <button
                          key={alumnus.id}
                          type="button"
                          onClick={() => selectAlumnus(alumnus)}
                          className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left ${
                            isSelected ? "bg-navy/10" : "hover:bg-muted/60"
                          }`}
                        >
                          {isSelected ? <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" /> : <UserCheck className="mt-0.5 h-4 w-4 text-navy" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-navy-dark">{alumnus.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{alumnus.email}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[alumnus.student_id, alumnus.course, alumnus.batch].filter(Boolean).join(" | ")}
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-amber-700">
                              {getReasonText(alumnus)}
                            </span>
                          </span>
                          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            {isSelected ? "Selected" : "Select"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-navy">Email Purpose</label>
                  <select
                    value={purpose}
                    onChange={(event) => applyTemplate(event.target.value as EmailPurpose)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                  >
                    {(Object.keys(PURPOSE_LABELS) as EmailPurpose[]).map((key) => (
                      <option key={key} value={key}>
                        {PURPOSE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-navy">Subject</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={255}
                    placeholder="Email subject"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                  />
                </div>
              </section>

              <section>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-navy">Message</label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={11}
                  placeholder="Write the email message"
                  className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-navy/20"
                />
              </section>

              <button
                type="button"
                onClick={validateBeforePreview}
                disabled={selectedAlumni.length === 0 || selectedAlumni.length > MAX_SELECTED_ALUMNI || !subject.trim() || !message.trim() || sending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Preview and Confirm
              </button>
            </div>

            <aside className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy">Templates</p>
              {(Object.keys(PURPOSE_LABELS) as EmailPurpose[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    purpose === key ? "border-navy bg-navy/5" : "border-border hover:border-navy/30 hover:bg-muted/40"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-navy" />
                    <p className="text-sm font-semibold text-navy-dark">{PURPOSE_LABELS[key]}</p>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{EMAIL_TEMPLATES[key].subject}</p>
                </button>
              ))}
            </aside>
          </div>
        )}

        {tab === "history" && (
          <div className="p-4 lg:p-5">
            {sendSuccess && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                <CheckCircle className="h-5 w-5" />
                {sendSuccess}
              </div>
            )}
            {sendError && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                <AlertCircle className="h-5 w-5" />
                {sendError}
              </div>
            )}
            {loadingLogs && <div className="py-12 text-center text-sm text-muted-foreground">Loading email logs...</div>}
            {!loadingLogs && logs.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No email logs found.</div>}
            <div className="space-y-2">
              {logs.map((log) => {
                const status = statusConfig[log.status] ?? statusConfig.pending;
                return (
                  <div key={log.id} className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-navy/10">
                        <Mail className="h-4 w-4 text-navy" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-dark">{log.subject}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>{status.label}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {log.alumni_name || "Selected alumnus"} | {log.recipient_email} | {PURPOSE_LABELS[log.email_purpose] || log.email_purpose}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{log.message}</p>
                        {log.status === "failed" && log.error_message && (
                          <p className="mt-2 text-xs font-semibold text-red-700">{log.error_message}</p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">{formatDate(log.sent_at || log.created_at)}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="View email log"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogToDelete(log)}
                          disabled={deletingLogId === log.id}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Delete email log"
                        >
                          {deletingLogId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {confirming && selectedAlumni.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-navy">Confirm Email</p>
                <h3 className="text-lg font-bold text-navy-dark">{subject}</h3>
              </div>
              <button type="button" onClick={() => setConfirming(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-border p-4">
              {selectedAlumni.map((alumnus) => (
                <div key={alumnus.id} className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-sm font-semibold text-navy-dark">{alumnus.name}</p>
                  <p className="text-sm text-muted-foreground">{alumnus.email}</p>
                  <p className="text-xs font-semibold text-amber-700">{getReasonText(alumnus)}</p>
                </div>
              ))}
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-navy">{PURPOSE_LABELS[purpose]}</p>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4">
              <p className="whitespace-pre-line text-sm text-foreground">{message}</p>
            </div>

            {sendError && <p className="mt-4 text-sm font-semibold text-red-700">{sendError}</p>}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={sending}
                className="flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-light disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {selectedAlumni.length} Selected Alumni
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-navy">{PURPOSE_LABELS[selectedLog.email_purpose]}</p>
                <h3 className="text-lg font-bold text-navy-dark">{selectedLog.subject}</h3>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Recipient</p>
                <p className="text-sm font-semibold text-navy-dark">{selectedLog.alumni_name || "Selected alumnus"}</p>
                <p className="text-xs text-muted-foreground">{selectedLog.recipient_email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold text-navy-dark">{statusConfig[selectedLog.status]?.label || selectedLog.status}</p>
                <p className="text-xs text-muted-foreground">{formatDate(selectedLog.sent_at || selectedLog.created_at)}</p>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4">
              <p className="whitespace-pre-line text-sm text-foreground">{selectedLog.message}</p>
            </div>
            {selectedLog.error_message && <p className="mt-4 text-sm font-semibold text-red-700">{selectedLog.error_message}</p>}
          </div>
        </div>
      )}

      {logToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deletingLogId && setLogToDelete(null)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Delete Email Log</p>
                <h3 className="text-lg font-bold text-navy-dark">Are you sure you want to delete this email log?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {logToDelete.subject} | {logToDelete.recipient_email}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setLogToDelete(null)}
                disabled={Boolean(deletingLogId)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteLog()}
                disabled={Boolean(deletingLogId)}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingLogId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Log
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
