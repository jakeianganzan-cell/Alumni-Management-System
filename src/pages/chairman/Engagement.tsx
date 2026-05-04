import { useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Star, TrendingUp, UserCheck, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MonthlyEngagementPoint {
  month: string;
  score: number;
  events: number;
  responses: number;
}

interface BatchMetric {
  batch: string;
  score: number;
  participants: number;
  events: number;
  tracer: number;
  employed: number;
}

interface DepartmentMetric {
  department: string;
  label: string;
  alumni: number;
  active: number;
  engagementScore: number;
  tracerRespondents: number;
}

interface EngagementResponse {
  course: string;
  courseLabel: string;
  summary: {
    avgEngagementScore: number;
    eventParticipants: number;
    tracerRespondents: number;
    employedCount: number;
  };
  monthlyEngagement: MonthlyEngagementPoint[];
  topBatches: BatchMetric[];
  departmentMetrics: DepartmentMetric[];
}

const ALL_BATCHES = "All Batches";

export default function ChairmanEngagement() {
  const [data, setData] = useState<EngagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(ALL_BATCHES);

  useEffect(() => {
    const loadEngagement = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/chairman/engagement`, {
          headers: getAuthHeaders(),
        });

        const payload = await readApiResponse<EngagementResponse>(response);
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load chairman engagement metrics.");
      } finally {
        setLoading(false);
      }
    };

    void loadEngagement();
  }, []);

  const filteredBatches = useMemo(() => {
    if (!data) return [];
    if (selectedBatch === ALL_BATCHES) return data.topBatches;
    return data.topBatches.filter((item) => item.batch === selectedBatch);
  }, [data, selectedBatch]);

  const exportCsv = () => {
    if (!data) return;

    const headers = ["Batch", "Engagement Score", "Participants", "Events", "Tracer Submitted", "Employed"];
    const rows = filteredBatches.map((item) => [
      item.batch,
      item.score,
      item.participants,
      item.events,
      item.tracer,
      item.employed,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.course}_engagement.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ChairmanLayout
      title="Engagement Metrics"
      subtitle={data ? `Live engagement metrics for ${data.courseLabel}` : "Live engagement metrics"}
    >
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading engagement metrics...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
          No engagement data is available for this chairman account.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Department Scope</p>
              <h2 className="mt-1 text-xl font-bold text-navy-dark">{data.courseLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Metrics are computed from live tracer submissions and alumni activity records.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={selectedBatch}
                onChange={(event) => setSelectedBatch(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none"
              >
                {[ALL_BATCHES, ...data.topBatches.map((item) => item.batch)].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Avg Engagement Score", value: data.summary.avgEngagementScore, icon: Star, color: "bg-navy text-white" },
              { label: "Event Participants", value: data.summary.eventParticipants, icon: Users, color: "bg-blue-500 text-white" },
              { label: "Tracer Respondents", value: data.summary.tracerRespondents, icon: TrendingUp, color: "bg-gold text-navy-dark" },
              { label: "Employed Alumni", value: data.summary.employedCount, icon: UserCheck, color: "bg-emerald-500 text-white" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <p className="mt-4 text-2xl font-bold text-navy-dark">{item.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="border-b border-border bg-muted/30 px-5 py-3.5">
                <h3 className="text-sm font-bold text-navy-dark">Monthly Engagement Score</h3>
                <p className="text-[11px] text-muted-foreground">Weighted score from tracer submissions and event registrations</p>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.monthlyEngagement}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="hsl(225 72% 20%)" strokeWidth={3} dot={{ fill: "hsl(48 100% 48%)", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="border-b border-border bg-muted/30 px-5 py-3.5">
                <h3 className="text-sm font-bold text-navy-dark">Events vs Tracer Responses</h3>
                <p className="text-[11px] text-muted-foreground">Monthly activity captured from the live database</p>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.monthlyEngagement}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="events" name="Event Registrations" fill="hsl(225 72% 20%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="responses" name="Tracer Responses" fill="hsl(48 100% 48%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="border-b border-border bg-muted/30 px-5 py-3.5">
              <h3 className="text-sm font-bold text-navy-dark">Top Engaged Batches</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Batch", "Engagement Score", "Participants", "Events", "Tracer Submitted", "Employed"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No batch metrics matched the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((item) => (
                      <tr key={item.batch} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 font-semibold text-navy-dark">{item.batch}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-navy" style={{ width: `${item.score}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-navy">{item.score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.participants}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.events}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.tracer}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.employed}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="border-b border-border bg-muted/30 px-5 py-3.5">
              <h3 className="text-sm font-bold text-navy-dark">Department Metrics</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Department", "Total Alumni", "Active Alumni", "Engagement Score", "Tracer Respondents"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.departmentMetrics.map((metric) => (
                    <tr key={metric.department} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-navy-dark">{metric.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{metric.alumni}</td>
                      <td className="px-4 py-3 text-muted-foreground">{metric.active}</td>
                      <td className="px-4 py-3 text-muted-foreground">{metric.engagementScore}</td>
                      <td className="px-4 py-3 text-muted-foreground">{metric.tracerRespondents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </ChairmanLayout>
  );
}
