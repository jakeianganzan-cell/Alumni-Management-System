import { useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Download, Loader2, Search } from "lucide-react";

interface ChairmanAlumniRecord {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  batch: string | null;
  employment_status: string | null;
  company: string | null;
  job_title: string | null;
  work_location: string | null;
  engagement: "High" | "Medium" | "Low";
}

interface ChairmanAlumniResponse {
  course: string;
  courseLabel: string;
  alumni: ChairmanAlumniRecord[];
}

const statusColors: Record<string, string> = {
  Employed: "bg-emerald-100 text-emerald-700",
  "Self-Employed": "bg-amber-100 text-amber-700",
  "Graduate Studies": "bg-blue-100 text-blue-700",
  Unemployed: "bg-rose-100 text-rose-700",
};

const engagementColors: Record<ChairmanAlumniRecord["engagement"], string> = {
  High: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-rose-100 text-rose-700",
};

const ALL_BATCHES = "All Batches";

const toCsvCell = (value: string) => {
  const escaped = value.replace(/"/g, "\"\"");
  return /[",\n]/.test(value) ? `"${escaped}"` : value;
};

export default function ChairmanAlumni() {
  const [data, setData] = useState<ChairmanAlumniResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState(ALL_BATCHES);
  const [sortKey, setSortKey] = useState<keyof ChairmanAlumniRecord>("name");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    const loadAlumni = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/chairman/alumni`, {
          headers: getAuthHeaders(),
        });

        const payload = await readApiResponse<ChairmanAlumniResponse>(response);
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load department alumni.");
      } finally {
        setLoading(false);
      }
    };

    void loadAlumni();
  }, []);

  const batches = useMemo(() => {
    const options = new Set<string>([ALL_BATCHES]);
    data?.alumni.forEach((item) => {
      if (item.batch) options.add(item.batch);
    });
    return Array.from(options);
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data?.alumni || [];

    return rows
      .filter((item) => {
        const matchesBatch = batch === ALL_BATCHES || item.batch === batch;
        const normalizedSearch = search.trim().toLowerCase();

        if (!normalizedSearch) {
          return matchesBatch;
        }

        return (
          matchesBatch &&
          (
            item.name.toLowerCase().includes(normalizedSearch) ||
            (item.student_id || "").toLowerCase().includes(normalizedSearch) ||
            item.email.toLowerCase().includes(normalizedSearch) ||
            (item.company || "").toLowerCase().includes(normalizedSearch)
          )
        );
      })
      .sort((left, right) => {
        const leftValue = String(left[sortKey] ?? "");
        const rightValue = String(right[sortKey] ?? "");
        return sortAsc ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });
  }, [batch, data, search, sortAsc, sortKey]);

  const toggleSort = (key: keyof ChairmanAlumniRecord) => {
    if (sortKey === key) {
      setSortAsc((current) => !current);
      return;
    }

    setSortKey(key);
    setSortAsc(true);
  };

  const exportCsv = () => {
    const headers = ["Alumni ID", "Name", "Batch", "Email", "Employment Status", "Company", "Job Title", "Location", "Engagement"];
    const rows = filtered.map((item) => [
      item.student_id || "",
      item.name,
      item.batch || "",
      item.email,
      item.employment_status || "",
      item.company || "",
      item.job_title || "",
      item.work_location || "",
      item.engagement,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => toCsvCell(String(value))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data?.course || "chairman"}_alumni.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ChairmanLayout
      title="Department Alumni"
      subtitle={data ? `MySQL-backed alumni records for ${data.courseLabel}` : "MySQL-backed alumni records"}
    >
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading department alumni...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
          No department alumni data is available.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Alumni", value: data.alumni.length },
              { label: "Employed", value: data.alumni.filter((item) => item.employment_status === "Employed").length },
              { label: "High Engagement", value: data.alumni.filter((item) => item.engagement === "High").length },
              { label: "Tracer Submitted", value: data.alumni.filter((item) => item.employment_status || item.company || item.job_title).length },
            ].map((item, index) => (
              <div key={item.label} className={`rounded-xl border p-4 shadow-card ${index === 0 ? "border-navy bg-navy" : "border-border bg-card"}`}>
                <p className={`text-2xl font-bold ${index === 0 ? "text-white" : "text-navy-dark"}`}>{item.value}</p>
                <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.14em] ${index === 0 ? "text-white/70" : "text-muted-foreground"}`}>{item.label}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, ID, email, or company"
                    className="w-64 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-navy focus:outline-none"
                  />
                </div>
                <select
                  value={batch}
                  onChange={(event) => setBatch(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none"
                >
                  {batches.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-navy hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {([
                      ["student_id", "Alumni ID"],
                      ["name", "Name"],
                      ["batch", "Batch"],
                      ["email", "Email"],
                      ["employment_status", "Status"],
                      ["company", "Company"],
                      ["job_title", "Job Title"],
                      ["work_location", "Location"],
                      ["engagement", "Engagement"],
                    ] as [keyof ChairmanAlumniRecord, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No alumni matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.student_id || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-navy-dark">{item.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.batch || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.email}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[item.employment_status || ""] || "bg-muted text-muted-foreground"}`}>
                            {item.employment_status || "No tracer data"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.company || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.job_title || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.work_location || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${engagementColors[item.engagement]}`}>
                            {item.engagement}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ChairmanLayout>
  );
}
