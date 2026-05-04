import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { FileText, BarChart2, Users, Loader2 } from "lucide-react";

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

export default function AdminReports() {
  const [generating, setGenerating] = useState<string | null>(null);

  const exportAlumni = async () => {
    setGenerating("alumni");
    try {
      const res = await fetch(`${API_URL}/profiles`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: AlumniExportRow[] = await res.json();
        const profiles = data.filter((p) => p.role === 'alumni');
        if (profiles.length > 0) {
          const headers = ["Student ID", "Name", "Email", "Course", "Batch"];
          const rows = profiles.map((p) => [p.student_id ?? "", p.name, p.email, p.course ?? "", p.batch ?? ""]);
          downloadCSV([headers, ...rows], "alumni_database.csv");
        }
      }
    } catch (err) {
      console.error(err);
    }
    setGenerating(null);
  };

  const exportTracer = async () => {
    setGenerating("tracer");
    try {
      const res = await fetch(`${API_URL}/tracer`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: TracerExportRow[] = await res.json();
        if (data && data.length > 0) {
          const headers = ["Student ID", "Name", "Course", "Batch", "Status", "Company", "Industry", "Position", "Income", "Relevance", "Time to Job"];
          const rows = data.map((r) => {
            return [r.student_id ?? "", r.name ?? "", r.course ?? "", r.batch ?? "", r.employment_status ?? "", r.company ?? "", r.industry ?? "", r.job_title ?? "", r.income ?? "", r.relevance ?? "", r.time_to_job ?? ""];
          });
          downloadCSV([headers, ...rows], "graduate_tracer.csv");
        }
      }
    } catch (err) {
      console.error(err);
    }
    setGenerating(null);
  };

  const exportDonations = async () => {
    setGenerating("donations");
    try {
      const res = await fetch(`${API_URL}/donations`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: DonationExportRow[] = await res.json();
        if (data && data.length > 0) {
          const headers = ["ID", "Donor", "Amount", "Method", "Purpose", "Status", "Date"];
          const rows = data.map((d) => [d.id, d.profile?.name ?? "", d.amount, d.method ?? "", d.purpose ?? "", d.status ?? "", d.created_at ?? ""]);
          downloadCSV([headers, ...rows], "donations.csv");
        }
      }
    } catch (err) {
      console.error(err);
    }
    setGenerating(null);
  };

  const downloadCSV = (data: Array<Array<string | number>>, filename: string) => {
    const csv = data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  const reports = [
    { key: "alumni", label: "Export Alumni Database", desc: "Full alumni records as CSV", icon: Users, action: exportAlumni },
    { key: "tracer", label: "Export Graduate Tracer", desc: "Tracer survey responses", icon: BarChart2, action: exportTracer },
    { key: "donations", label: "Export Donations", desc: "All donation records", icon: FileText, action: exportDonations },
  ];

  return (
    <AdminLayout title="Reports" subtitle="Generate and download alumni data reports">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {reports.map(r => (
          <button key={r.key} onClick={r.action} disabled={generating === r.key}
            className="bg-card rounded-xl border border-border shadow-card p-5 text-left hover:border-navy/30 hover:shadow-navy transition-all group disabled:opacity-50">
            <div className="w-10 h-10 rounded-lg bg-navy/10 text-navy group-hover:bg-navy group-hover:text-white transition-colors flex items-center justify-center mb-3">
              {generating === r.key ? <Loader2 className="w-5 h-5 animate-spin" /> : <r.icon className="w-5 h-5" />}
            </div>
            <p className="font-semibold text-navy-dark text-sm">{r.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
          </button>
        ))}
      </div>
    </AdminLayout>
  );
}
