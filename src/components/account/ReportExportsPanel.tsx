import { useEffect, useState } from "react";
import { BarChart2, FileText, FileSpreadsheet, Inbox, Loader2, MessageSquare, Printer, Reply, Users } from "lucide-react";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { downloadBrandedExcel, openPrintableReport, type ReportColumn } from "@/lib/reportExport";

interface AlumniExportRow {
  role?: string | null;
  student_id?: string | null;
  name: string;
  email: string;
  course?: string | null;
  batch?: string | null;
}

interface TracerExportRow {
  student_id?: string | null;
  name?: string | null;
  course?: string | null;
  batch?: string | null;
  employment_status?: string | null;
  company?: string | null;
  industry?: string | null;
  job_title?: string | null;
  income?: string | null;
  relevance?: string | null;
  time_to_job?: string | null;
}

interface DonationExportRow {
  id: number;
  amount: number;
  method?: string | null;
  purpose?: string | null;
  status?: string | null;
  created_at?: string | null;
  profile?: {
    name?: string | null;
  } | null;
}

type ExportFormat = "excel" | "pdf";
type ConcernStatus = "Pending" | "Read" | "Replied" | "Resolved";

interface FlatReportRow {
  [key: string]: string | number;
}

interface AdminConcern {
  id: number;
  alumni_id: string;
  alumni_name?: string | null;
  alumni_email?: string | null;
  subject: string;
  category: string;
  message: string;
  status: ConcernStatus;
  admin_reply?: string | null;
  replied_at?: string | null;
  created_at?: string | null;
}

const CONCERN_STATUSES: ConcernStatus[] = ["Pending", "Read", "Replied", "Resolved"];

const formatConcernDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function ReportExportsPanel() {
  const { profile, user } = useAuth();
  const [generating, setGenerating] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [concerns, setConcerns] = useState<AdminConcern[]>([]);
  const [concernMessage, setConcernMessage] = useState("");
  const [loadingConcerns, setLoadingConcerns] = useState(true);
  const [savingConcernId, setSavingConcernId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const preparedBy = profile?.name || user?.email || "System Administrator";

  const loadConcerns = async () => {
    setLoadingConcerns(true);
    setConcernMessage("");
    try {
      const res = await fetchApi(`${API_URL}/admin/concerns`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AdminConcern[]>(res);
      setConcerns(data);
      setReplyDrafts(
        data.reduce<Record<number, string>>((drafts, concern) => {
          drafts[concern.id] = concern.admin_reply || "";
          return drafts;
        }, {}),
      );
    } catch (error) {
      setConcernMessage(error instanceof Error ? error.message : "Failed to load alumni concerns.");
    } finally {
      setLoadingConcerns(false);
    }
  };

  useEffect(() => {
    void loadConcerns();
  }, []);

  const replaceConcern = (updatedConcern: AdminConcern) => {
    setConcerns((current) => current.map((concern) => (concern.id === updatedConcern.id ? updatedConcern : concern)));
    setReplyDrafts((current) => ({ ...current, [updatedConcern.id]: updatedConcern.admin_reply || "" }));
  };

  const updateConcernStatus = async (concernId: number, status: ConcernStatus) => {
    setSavingConcernId(concernId);
    setConcernMessage("");
    try {
      const res = await fetchApi(`${API_URL}/admin/concerns/${concernId}/status`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await readApiResponse<{ message: string; concern: AdminConcern }>(res);
      replaceConcern(data.concern);
      setConcernMessage(data.message || "Concern status updated successfully.");
    } catch (error) {
      setConcernMessage(error instanceof Error ? error.message : "Failed to update concern status.");
    } finally {
      setSavingConcernId(null);
    }
  };

  const saveConcernReply = async (concernId: number) => {
    const reply = (replyDrafts[concernId] || "").trim();
    if (!reply) {
      setConcernMessage("Admin reply is required.");
      return;
    }

    setSavingConcernId(concernId);
    setConcernMessage("");
    try {
      const res = await fetchApi(`${API_URL}/admin/concerns/${concernId}/reply`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_reply: reply, status: "Replied" }),
      });
      const data = await readApiResponse<{ message: string; concern: AdminConcern }>(res);
      replaceConcern(data.concern);
      setConcernMessage(data.message || "Reply saved successfully.");
    } catch (error) {
      setConcernMessage(error instanceof Error ? error.message : "Failed to save admin reply.");
    } finally {
      setSavingConcernId(null);
    }
  };

  const runExport = async <T extends FlatReportRow>(
    format: ExportFormat,
    options: {
      title: string;
      filename: string;
      columns: Array<ReportColumn<T>>;
      rows: T[];
      summary?: Array<{ label: string; value: string | number }>;
    },
  ) => {
    const reportOptions = { ...options, preparedBy };

    if (format === "excel") {
      await downloadBrandedExcel(reportOptions);
      return;
    }

    if (format === "pdf") {
      openPrintableReport(reportOptions);
      return;
    }

  };

  const exportAlumni = async (format: ExportFormat) => {
    setGenerating(`alumni-${format}`);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/profiles`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<AlumniExportRow[]>(res);
      const profiles = data.filter((profile) => profile.role === "alumni");
      const columns: Array<ReportColumn<FlatReportRow>> = [
        { key: "studentId", label: "Student ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "course", label: "Course" },
        { key: "batch", label: "Batch" },
      ];
      const rows = profiles.map((profile) => ({
        studentId: profile.student_id ?? "",
        name: profile.name,
        email: profile.email,
        course: profile.course ?? "",
        batch: profile.batch ?? "",
      }));
      await runExport(format, {
        title: "Alumni Database Report",
        filename: "alumni_database",
        columns,
        rows,
        summary: [
          { label: "Total Alumni", value: profiles.length },
          { label: "Courses", value: new Set(profiles.map((item) => item.course).filter(Boolean)).size },
          { label: "Batches", value: new Set(profiles.map((item) => item.batch).filter(Boolean)).size },
        ],
      });
      setMessage(`Alumni database export prepared with ${profiles.length} record${profiles.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to export alumni records.");
    } finally {
      setGenerating(null);
    }
  };

  const exportTracer = async (format: ExportFormat) => {
    setGenerating(`tracer-${format}`);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/tracer`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<TracerExportRow[]>(res);
      const columns: Array<ReportColumn<FlatReportRow>> = [
        { key: "studentId", label: "Student ID" },
        { key: "name", label: "Name" },
        { key: "course", label: "Course" },
        { key: "batch", label: "Batch" },
        { key: "status", label: "Status" },
        { key: "company", label: "Company" },
        { key: "industry", label: "Industry" },
        { key: "position", label: "Position" },
        { key: "income", label: "Income" },
        { key: "relevance", label: "Relevance" },
        { key: "timeToJob", label: "Time to Job" },
      ];
      const rows = data.map((record) => ({
        studentId: record.student_id ?? "",
        name: record.name ?? "",
        course: record.course ?? "",
        batch: record.batch ?? "",
        status: record.employment_status ?? "",
        company: record.company ?? "",
        industry: record.industry ?? "",
        position: record.job_title ?? "",
        income: record.income ?? "",
        relevance: record.relevance ?? "",
        timeToJob: record.time_to_job ?? "",
      }));
      await runExport(format, {
        title: "Graduate Tracer Report",
        filename: "graduate_tracer",
        columns,
        rows,
        summary: [
          { label: "Tracer Responses", value: data.length },
          { label: "Employed", value: data.filter((record) => record.employment_status === "Employed").length },
          { label: "Courses", value: new Set(data.map((record) => record.course).filter(Boolean)).size },
        ],
      });
      setMessage(`Graduate tracer export prepared with ${data.length} response${data.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to export tracer records.");
    } finally {
      setGenerating(null);
    }
  };

  const exportDonations = async (format: ExportFormat) => {
    setGenerating(`donations-${format}`);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/donations`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<DonationExportRow[]>(res);
      const columns: Array<ReportColumn<FlatReportRow>> = [
        { key: "id", label: "ID" },
        { key: "donor", label: "Donor" },
        { key: "amount", label: "Amount" },
        { key: "method", label: "Method" },
        { key: "purpose", label: "Purpose" },
        { key: "status", label: "Status" },
        { key: "date", label: "Date" },
      ];
      const rows = data.map((donation) => ({
        id: donation.id,
        donor: donation.profile?.name ?? "",
        amount: donation.amount,
        method: donation.method ?? "",
        purpose: donation.purpose ?? "",
        status: donation.status ?? "",
        date: donation.created_at ?? "",
      }));
      const totalAmount = data.reduce((total, donation) => total + Number(donation.amount || 0), 0);
      await runExport(format, {
        title: "Donation Report",
        filename: "donations",
        columns,
        rows,
        summary: [
          { label: "Total Records", value: data.length },
          { label: "Total Amount", value: `PHP ${totalAmount.toLocaleString()}` },
          { label: "Approved", value: data.filter((donation) => donation.status === "Approved").length },
          { label: "Pending Review", value: data.filter((donation) => donation.status === "Pending Review").length },
        ],
      });
      setMessage(`Donation export prepared with ${data.length} record${data.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to export donation records.");
    } finally {
      setGenerating(null);
    }
  };

  const reports = [
    { key: "alumni", label: "Alumni Database", desc: "Registered alumni records with IDs, course, and batch.", icon: Users, action: exportAlumni, formats: ["excel", "pdf"] as ExportFormat[] },
    { key: "tracer", label: "Graduate Tracer", desc: "Tracer response summary for employment and course outcomes.", icon: BarChart2, action: exportTracer, formats: ["excel", "pdf"] as ExportFormat[] },
    { key: "donations", label: "Donations", desc: "Donation transaction list with donor, amount, method, and status.", icon: FileText, action: exportDonations, formats: ["excel", "pdf"] as ExportFormat[] },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Data Exports</p>
        <h3 className="font-display text-2xl font-bold text-navy-dark">Export Center</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Download the main system data files from your account area.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {reports.map((report) => (
          <div
            key={report.key}
            className="rounded-2xl border border-border bg-background p-5 text-left shadow-sm transition-all hover:border-navy/40 hover:shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy/10 text-navy">
                {generating?.startsWith(report.key) ? <Loader2 className="h-5 w-5 animate-spin" /> : <report.icon className="h-5 w-5" />}
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Export
              </span>
            </div>
            <p className="mt-4 text-sm font-bold text-navy-dark">{report.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{report.desc}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {report.formats.map((format) => (
                <button
                  key={`${report.key}-${format}`}
                  type="button"
                  onClick={() => {
                    void (report.action as (format: ExportFormat) => Promise<void>)(format);
                  }}
                  disabled={generating !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-navy transition hover:border-navy hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {format === "excel" ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
                  {format === "excel" ? "Excel" : "PDF"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Alumni Concerns / Messages</p>
            <h3 className="font-display text-2xl font-bold text-navy-dark">Concern Inbox</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Review alumni concerns, send admin replies, and update their handling status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadConcerns()}
            disabled={loadingConcerns}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-navy transition hover:border-navy hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingConcerns ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {concernMessage && (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {concernMessage}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {loadingConcerns ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Loading alumni concerns...
            </div>
          ) : concerns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-bold text-navy-dark">No alumni concerns yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Submitted concerns from the Alumni About Us page will appear here.</p>
            </div>
          ) : (
            concerns.map((concern) => (
              <div key={concern.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-navy-dark">{concern.subject}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {concern.alumni_name || "Alumni"} - {concern.alumni_email || "No email"} - {formatConcernDate(concern.created_at)}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-navy/10 px-3 py-1 text-[11px] font-semibold uppercase text-navy">
                        {concern.category}
                      </span>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{concern.message}</p>

                    {concern.admin_reply && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                          <Reply className="h-3.5 w-3.5" />
                          Current Admin Reply
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{concern.admin_reply}</p>
                        <p className="mt-2 text-xs text-emerald-700">{formatConcernDate(concern.replied_at)}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`concern-status-${concern.id}`}>
                        Status
                      </label>
                      <select
                        id={`concern-status-${concern.id}`}
                        value={concern.status}
                        onChange={(event) => void updateConcernStatus(concern.id, event.target.value as ConcernStatus)}
                        disabled={savingConcernId === concern.id}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-navy focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {CONCERN_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`concern-reply-${concern.id}`}>
                        Admin Reply
                      </label>
                      <textarea
                        id={`concern-reply-${concern.id}`}
                        value={replyDrafts[concern.id] || ""}
                        onChange={(event) => setReplyDrafts((current) => ({ ...current, [concern.id]: event.target.value }))}
                        rows={4}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-navy focus:ring-2 focus:ring-ring"
                        placeholder="Write admin reply"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void saveConcernReply(concern.id)}
                      disabled={savingConcernId === concern.id}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingConcernId === concern.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Reply className="h-4 w-4" />}
                      Save Reply
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
