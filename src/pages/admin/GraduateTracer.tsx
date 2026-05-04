import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Download, Eye, FileSpreadsheet, FileText, Filter, Loader2, RefreshCw, Search } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";

interface TracerPayload {
  fullName?: string;
  email?: string;
  presentOccupation?: string;
  industry?: string;
  workLocation?: string;
  presentlyEmployed?: string;
  presentEmploymentStatus?: string;
  usefulCompetencies?: string[];
  educationalAttainments?: Array<{ degreeSpecialization?: string; yearGraduated?: string }>;
}

interface TracerRow {
  id: string | number;
  user_id: string;
  employment_status: string | null;
  job_title: string | null;
  company: string | null;
  industry: string | null;
  work_location: string | null;
  income: string | null;
  relevance: string | null;
  time_to_job: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  submission_status: string | null;
  allow_resubmission: number | boolean | null;
  ched_payload?: TracerPayload | null;
  name?: string | null;
  course?: string | null;
  batch?: string | null;
  student_id?: string | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AnalyticsPayload {
  totals: {
    totalAlumni: number;
    totalResponded: number;
    completionRate: number;
    employmentRate: number;
    unemploymentRate: number;
    selfEmploymentRate: number;
    averageWaitingMonths: number;
  };
  charts: {
    employmentStatus: Array<{ label: string; value: number }>;
    salaryBrackets: Array<{ label: string; value: number }>;
    workLocation: Array<{ label: string; value: number }>;
    curriculumRelevance: Array<{ label: string; value: number }>;
    usefulCompetencies: Array<{ label: string; value: number }>;
    graduationYear: Array<{ label: string; value: number }>;
  };
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  reopened: "bg-amber-100 text-amber-700",
};

const employmentColors: Record<string, string> = {
  Employed: "bg-emerald-100 text-emerald-700",
  "Not Employed": "bg-rose-100 text-rose-700",
  "Never Employed": "bg-slate-100 text-slate-700",
  "Self-employed": "bg-violet-100 text-violet-700",
};

function blobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function openBlobPreview(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const previewWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");

  if (!previewWindow) {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

export default function AdminGraduateTracer() {
  const [rows, setRows] = useState<TracerRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("All Courses");
  const [batch, setBatch] = useState("All Batches");
  const [employmentStatus, setEmploymentStatus] = useState("All Status");
  const [dateSubmitted, setDateSubmitted] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchRows = useCallback(async (page = pagination.page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
      });

      if (search.trim()) params.set("search", search.trim());
      if (course !== "All Courses") params.set("course", course);
      if (batch !== "All Batches") params.set("batch", batch);
      if (employmentStatus !== "All Status") params.set("employmentStatus", employmentStatus);
      if (dateSubmitted) params.set("dateSubmitted", dateSubmitted);

      const response = await fetch(`${API_URL}/tracer/admin/records?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = await readApiResponse<{ rows: TracerRow[]; pagination: PaginationMeta }>(response);
      setRows(payload.rows ?? []);
      setPagination(payload.pagination ?? { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) {
      console.error(error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [batch, course, dateSubmitted, employmentStatus, pagination.page, pagination.pageSize, search]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const response = await fetch(`${API_URL}/tracer/admin/analytics`, { headers: getAuthHeaders() });
      const payload = await readApiResponse<AnalyticsPayload>(response);
      setAnalytics(payload);
    } catch (error) {
      console.error(error);
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows(1);
  }, [fetchRows]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const courses = useMemo(() => ["All Courses", ...Array.from(new Set(rows.map((row) => row.course).filter(Boolean)))], [rows]);
  const batches = useMemo(() => ["All Batches", ...Array.from(new Set(rows.map((row) => row.batch).filter(Boolean)))], [rows]);
  const statuses = useMemo(() => ["All Status", ...Array.from(new Set(rows.map((row) => row.employment_status).filter(Boolean)))], [rows]);

  const runFileDownload = async (url: string, fileName: string, key: string) => {
    try {
      setDownloading(key);
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) {
        await readApiResponse(response);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        const html = await response.text();
        const preview = window.open("", "_blank", "noopener,noreferrer");
        if (preview) {
          preview.document.open();
          preview.document.write(html);
          preview.document.close();
          preview.focus();
          preview.print();
        }
        return;
      }

      const blob = await response.blob();
      blobDownload(blob, fileName);
    } catch (error) {
      console.error(error);
    } finally {
      setDownloading(null);
    }
  };

  const runPdfPreview = async (url: string, key: string) => {
    try {
      setDownloading(key);
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) {
        await readApiResponse(response);
      }

      const blob = await response.blob();
      openBlobPreview(blob);
    } catch (error) {
      console.error(error);
    } finally {
      setDownloading(null);
    }
  };

  const topEmployment = analytics?.charts.employmentStatus.slice(0, 4) ?? [];
  const topCompetencies = analytics?.charts.usefulCompetencies.slice(0, 5) ?? [];
  const actionMessage = downloading
    ? downloading.startsWith("preview-")
      ? "Opening the tracer preview. Please wait..."
      : "Preparing your file download. Please wait..."
    : loading
        ? "Loading tracer submissions..."
        : null;

  return (
    <AdminLayout
      title="Graduate Tracer Management"
      subtitle="Review alumni tracer submissions, preview accomplished CHED copies, download finished forms, and export tracer analytics."
    >
      <div className="grid gap-3 lg:grid-cols-4">
        {[
          { label: "Total Alumni", value: analytics?.totals.totalAlumni, sub: "Eligible alumni accounts" },
          { label: "Responded", value: analytics?.totals.totalResponded, sub: "Completed tracer forms" },
          { label: "Completion Rate", value: analytics ? `${analytics.totals.completionRate}%` : undefined, sub: "Tracer response coverage" },
          { label: "Employment Rate", value: analytics ? `${analytics.totals.employmentRate}%` : undefined, sub: "Respondents currently employed" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy-dark">{loadingAnalytics ? "..." : stat.value ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-navy-dark">Tracer Analytics Snapshot</p>
              <p className="text-xs text-muted-foreground">Live counts from completed tracer submissions</p>
            </div>
            <button
              onClick={() => void fetchAnalytics()}
              disabled={loadingAnalytics}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAnalytics ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 inline h-3.5 w-3.5" />}
              {loadingAnalytics ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Employment Status</p>
              <div className="mt-3 space-y-2 text-sm">
                {topEmployment.length === 0 ? <p className="text-muted-foreground">No data yet.</p> : null}
                {topEmployment.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-semibold text-navy-dark">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Top Useful Competencies</p>
              <div className="mt-3 space-y-2 text-sm">
                {topCompetencies.length === 0 ? <p className="text-muted-foreground">No data yet.</p> : null}
                {topCompetencies.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-semibold text-navy-dark">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Unemployment Rate</p>
              <p className="mt-2 text-2xl font-bold text-navy-dark">{analytics ? `${analytics.totals.unemploymentRate}%` : "..."}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Self-employed Rate</p>
              <p className="mt-2 text-2xl font-bold text-navy-dark">{analytics ? `${analytics.totals.selfEmploymentRate}%` : "..."}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Avg. First-job Wait</p>
              <p className="mt-2 text-2xl font-bold text-navy-dark">{analytics ? `${analytics.totals.averageWaitingMonths} mo` : "..."}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm font-semibold text-navy-dark">Report Exports</p>
          <p className="mt-1 text-xs text-muted-foreground">Download tracer analytics for defense presentations, institutional review, and CHED-ready reporting.</p>
          <div className="mt-4 grid gap-2">
            <button
              onClick={() => void runFileDownload(`${API_URL}/tracer/admin/reports/export?format=csv`, `graduate-tracer-report.csv`, "report-csv")}
              disabled={downloading !== null}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-sm font-medium text-slate-700">{downloading === "report-csv" ? "Preparing CSV export..." : "CSV Summary Export"}</span>
              {downloading === "report-csv" ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <Download className="h-4 w-4 text-slate-500" />}
            </button>
            <button
              onClick={() => void runFileDownload(`${API_URL}/tracer/admin/reports/export?format=excel`, `graduate-tracer-report.xls`, "report-excel")}
              disabled={downloading !== null}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-sm font-medium text-slate-700">{downloading === "report-excel" ? "Preparing Excel export..." : "Excel Workbook Export"}</span>
              {downloading === "report-excel" ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <FileSpreadsheet className="h-4 w-4 text-slate-500" />}
            </button>
            <button
              onClick={() => void runFileDownload(`${API_URL}/tracer/admin/reports/export?format=pdf`, `graduate-tracer-report.html`, "report-pdf")}
              disabled={downloading !== null}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-sm font-medium text-slate-700">{downloading === "report-pdf" ? "Preparing printable report..." : "Printable PDF Report"}</span>
              {downloading === "report-pdf" ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <FileText className="h-4 w-4 text-slate-500" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card shadow-card">
        <div className="border-b border-border p-4">
          {actionMessage ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
              <span>{actionMessage}</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search alumni name, ID, course, or batch"
                  className="w-64 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <Filter className="h-4 w-4 self-center text-muted-foreground" />
              <select value={course} onChange={(event) => setCourse(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {courses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select value={batch} onChange={(event) => setBatch(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {batches.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {statuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input type="date" value={dateSubmitted} onChange={(event) => setDateSubmitted(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button
                onClick={() => void fetchRows(1)}
                disabled={loading}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Applying..." : "Apply"}
              </button>
            </div>
            <button
              onClick={() => void runFileDownload(`${API_URL}/tracer/admin/export/all?format=pdf`, "graduate-tracer-forms.zip", "bulk-pdf")}
              disabled={downloading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-navy hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading === "bulk-pdf" ? "Preparing all PDFs..." : "Download All PDFs"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-4 py-3 font-semibold text-navy">Alumni</th>
                <th className="px-4 py-3 font-semibold text-navy">Program</th>
                <th className="px-4 py-3 font-semibold text-navy">Employment</th>
                <th className="px-4 py-3 font-semibold text-navy">Submission</th>
                <th className="px-4 py-3 font-semibold text-navy">Status</th>
                <th className="px-4 py-3 font-semibold text-navy">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading tracer submissions...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No tracer records matched the selected filters.</td>
                </tr>
              ) : (
                rows.map((row) => {
                  const payload = row.ched_payload || {};
                  const displayEmployment = row.employment_status || payload.presentEmploymentStatus || payload.presentlyEmployed || "Unspecified";
                  const formStatus = row.submission_status || "completed";
                  return (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy-dark">{row.name || payload.fullName || "Unknown Alumni"}</p>
                        <p className="text-xs text-muted-foreground">{row.student_id || "No alumni ID"} • {payload.email || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p>{row.course || payload.educationalAttainments?.[0]?.degreeSpecialization || "-"}</p>
                        <p className="text-xs text-muted-foreground">Batch {row.batch || payload.educationalAttainments?.[0]?.yearGraduated || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${employmentColors[displayEmployment] || "bg-slate-100 text-slate-700"}`}>
                          {displayEmployment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[formStatus] || "bg-slate-100 text-slate-700"}`}>
                          {formStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void runPdfPreview(`${API_URL}/admin/tracer/${row.id}/pdf/preview`, `preview-${row.id}`)}
                            disabled={downloading !== null}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            title="Preview PDF"
                          >
                            {downloading === `preview-${row.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => void runFileDownload(`${API_URL}/admin/tracer/${row.id}/pdf`, `${row.name || "tracer"}.pdf`, `pdf-${row.id}`)}
                            disabled={downloading !== null}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {downloading === `pdf-${row.id}` ? "Preparing PDF..." : "Download PDF"}
                          </button>
                          <button
                            onClick={() => void runFileDownload(`${API_URL}/tracer/admin/export/${row.user_id}?format=docx`, `${row.name || "tracer"}.docx`, `docx-${row.user_id}`)}
                            disabled={downloading !== null}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {downloading === `docx-${row.user_id}` ? "Preparing DOCX..." : "DOCX"}
                          </button>
                          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                            Editable
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Showing page {pagination.page} of {pagination.totalPages} • {pagination.total} total records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void fetchRows(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Previous
            </button>
            <button
              onClick={() => void fetchRows(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
