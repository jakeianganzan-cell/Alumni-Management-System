import { useState } from "react";
import { BarChart2, FileText, FileSpreadsheet, Loader2, Printer, Users } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { downloadBrandedCsv, downloadBrandedExcel, openPrintableReport, type ReportColumn } from "@/lib/reportExport";

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

type ExportFormat = "csv" | "excel" | "pdf";

interface FlatReportRow {
  [key: string]: string | number;
}

const downloadCSV = (data: Array<Array<string | number>>, filename: string) => {
  const csv = data.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function ReportExportsPanel() {
  const { profile, user } = useAuth();
  const [generating, setGenerating] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const preparedBy = profile?.name || user?.email || "System Administrator";

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

    downloadBrandedCsv(reportOptions);
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

  // Graduate Tracer export is intentionally unchanged because it uses the approved tracer export layout.
  const exportTracer = async () => {
    setGenerating("tracer");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/tracer`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<TracerExportRow[]>(res);
      const headers = [
        "Student ID",
        "Name",
        "Course",
        "Batch",
        "Status",
        "Company",
        "Industry",
        "Position",
        "Income",
        "Relevance",
        "Time to Job",
      ];
      const rows = data.map((record) => [
        record.student_id ?? "",
        record.name ?? "",
        record.course ?? "",
        record.batch ?? "",
        record.employment_status ?? "",
        record.company ?? "",
        record.industry ?? "",
        record.job_title ?? "",
        record.income ?? "",
        record.relevance ?? "",
        record.time_to_job ?? "",
      ]);
      downloadCSV([headers, ...rows], "graduate_tracer.csv");
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
    { key: "alumni", label: "Alumni Database", desc: "Registered alumni records with IDs, course, and batch.", icon: Users, action: exportAlumni, formats: ["csv", "excel", "pdf"] as ExportFormat[] },
    { key: "tracer", label: "Graduate Tracer", desc: "Tracer response summary for employment and course outcomes.", icon: BarChart2, action: exportTracer, formats: ["csv"] as const },
    { key: "donations", label: "Donations", desc: "Donation transaction list with donor, amount, method, and status.", icon: FileText, action: exportDonations, formats: ["csv", "excel", "pdf"] as ExportFormat[] },
  ];

  return (
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
                    if (report.key === "tracer") {
                      void exportTracer();
                      return;
                    }
                    void (report.action as (format: ExportFormat) => Promise<void>)(format);
                  }}
                  disabled={generating !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-navy transition hover:border-navy hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {format === "excel" ? <FileSpreadsheet className="h-3.5 w-3.5" /> : format === "pdf" ? <Printer className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {format === "excel" ? "Excel" : format.toUpperCase()}
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
  );
}
