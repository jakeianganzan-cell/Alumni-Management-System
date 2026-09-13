import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { useAuth } from "@/hooks/useAuth";
import { appQueryKeys, authenticatedQueryOptions } from "@/lib/appQueries";
import { QUERY_CACHE_POLICY } from "@/lib/queryClient";
import {
  Briefcase,
  GraduationCap,
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

interface ChairmanAlumniSnapshot {
  id: string;
  name: string;
  email: string;
  batch: string | null;
  employment_status: string | null;
  company: string | null;
  job_title: string | null;
  work_location: string | null;
}

interface DashboardResponse {
  course: string;
  courseLabel: string;
  summary: {
    totalAlumni: number;
    employedCount: number;
    employmentRate: number;
    tracerRespondents: number;
    activeParticipants: number;
  };
  recentAlumni: ChairmanAlumniSnapshot[];
  careerSnapshots: ChairmanAlumniSnapshot[];
}

const statusColor: Record<string, string> = {
  Employed: "bg-emerald-100 text-emerald-700",
  "Self-Employed": "bg-amber-100 text-amber-700",
  "Graduate Studies": "bg-blue-100 text-blue-700",
  Unemployed: "bg-rose-100 text-rose-700",
};

export default function ChairmanDashboard() {
  const { user } = useAuth();
  const dashboardQuery = useQuery<DashboardResponse>({
    ...authenticatedQueryOptions<DashboardResponse>({
      queryKey: appQueryKeys.chairmanDashboard(user?.id || "signed-out"),
      path: "/chairman/dashboard",
      policy: QUERY_CACHE_POLICY.user,
      refetchInterval: 2 * 60_000,
    }),
    enabled: Boolean(user),
  });
  const data = dashboardQuery.data;
  const loading = dashboardQuery.isLoading && !data;
  const error = !data && dashboardQuery.error instanceof Error
    ? dashboardQuery.error.message
    : !data && dashboardQuery.error
      ? "Failed to load chairman dashboard."
      : "";

  return (
    <ChairmanLayout
      title="Chairman Dashboard"
      subtitle={data ? `Live alumni overview for ${data.courseLabel}` : "Live alumni overview"}
    >
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
          No department data is available for this chairman account.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Alumni", value: data.summary.totalAlumni, icon: Users, color: "bg-navy text-white" },
              { label: "Employed", value: data.summary.employedCount, icon: UserCheck, color: "bg-emerald-500 text-white" },
              { label: "Employment Rate", value: `${data.summary.employmentRate}%`, icon: TrendingUp, color: "bg-gold text-navy-dark" },
              { label: "Tracer Respondents", value: data.summary.tracerRespondents, icon: GraduationCap, color: "bg-sky-600 text-white" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Live</span>
                </div>
                <p className="mt-4 text-2xl font-bold text-navy-dark">{item.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-gold">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-navy-dark">Recent Alumni Employment</h3>
                    <p className="text-[11px] text-muted-foreground">Latest alumni records in your department</p>
                  </div>
                </div>
                <Link to="/chairman/alumni" className="text-xs font-semibold text-navy hover:underline">
                  View all
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">Alumni</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">Batch</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">Employer</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-navy">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAlumni.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No alumni records found for this course yet.
                        </td>
                      </tr>
                    ) : (
                      data.recentAlumni.map((alumnus) => (
                        <tr key={alumnus.id} className="border-b border-border/60 last:border-b-0">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-navy-dark">{alumnus.name}</p>
                            <p className="text-xs text-muted-foreground">{alumnus.email}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{alumnus.batch || "-"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{alumnus.company || alumnus.job_title || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[alumnus.employment_status || ""] || "bg-muted text-muted-foreground"}`}>
                              {alumnus.employment_status || "No tracer data"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-navy-dark">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-navy-dark">Career Snapshots</h3>
                    <p className="text-[11px] text-muted-foreground">Tracer-based roles and employers</p>
                  </div>
                </div>
                <Link to="/chairman/engagement" className="text-xs font-semibold text-navy hover:underline">
                  View engagement
                </Link>
              </div>

              <div className="divide-y divide-border">
                {data.careerSnapshots.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No tracer submissions are available for this course yet.
                  </div>
                ) : (
                  data.careerSnapshots.map((item) => (
                    <div key={item.id} className="px-4 py-3">
                      <p className="text-sm font-semibold text-navy-dark">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.job_title || "Position not set"} at {item.company || "Employer not set"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.work_location || "Location not set"} | Batch {item.batch || "-"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </ChairmanLayout>
  );
}
