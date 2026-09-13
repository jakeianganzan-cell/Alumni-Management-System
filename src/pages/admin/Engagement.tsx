import { useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { appQueryKeys, authenticatedQueryOptions } from "@/lib/appQueries";
import { QUERY_CACHE_POLICY } from "@/lib/queryClient";

interface BatchEngagement {
  batch: string;
  events: number;
  comments: number;
  score: number;
  memberCount: number;
}

interface EngagementProfile {
  id: string;
  batch: string | null;
}

interface EngagementRecord {
  user_id: string;
}

interface EngagementMetricsResponse {
  eventCount?: number;
  regCount?: number;
  commentCount?: number;
  profiles?: EngagementProfile[];
  regs?: EngagementRecord[];
  comments?: EngagementRecord[];
}

interface CourseComparisonPoint {
  course: string;
  courseLabel: string;
  alumniCount: number;
  events: number;
  surveyResponses: number;
  achievements: number;
  freedomWall: number;
  comments: number;
  contributionScore: number;
  activeCount: number;
  engagementRate: number;
  eventParticipationRate: number;
  surveyParticipationRate: number;
  employmentRate: number;
}

interface HeatmapPoint {
  dayIndex: number;
  dayLabel: string;
  hour: number;
  activityCount: number;
}

interface AlumniPredictionPoint {
  alumniId: string;
  name: string;
  courseLabel: string;
  batch: string;
  score: number;
  prediction: string;
  eventParticipationLikelihood: number;
  daysSinceLastActivity: number | null;
}

interface PredictionCountPoint {
  category: string;
  count: number;
  percentage: number;
}

interface DashboardAnalyticsResponse {
  courseComparisons?: CourseComparisonPoint[];
  heatmap?: HeatmapPoint[];
  topAlumni?: AlumniPredictionPoint[];
  predictionCounts?: PredictionCountPoint[];
}

export function buildTopBatches(data?: EngagementMetricsResponse): BatchEngagement[] {
  const userBatchMap = new Map<string, string>();
  data?.profiles?.forEach((profile) => {
    if (profile.batch) userBatchMap.set(profile.id, profile.batch);
  });

  const batchMap = new Map<string, { events: number; comments: number; members: Set<string> }>();
  const addToBatch = (userId: string, type: "events" | "comments") => {
    const batch = userBatchMap.get(userId);
    if (!batch) return;
    const entry = batchMap.get(batch) ?? { events: 0, comments: 0, members: new Set<string>() };
    entry[type]++;
    entry.members.add(userId);
    batchMap.set(batch, entry);
  };

  data?.regs?.forEach((registration) => addToBatch(registration.user_id, "events"));
  data?.comments?.forEach((comment) => addToBatch(comment.user_id, "comments"));

  return Array.from(batchMap.entries())
    .map(([batch, totals]) => ({
      batch,
      events: totals.events,
      comments: totals.comments,
      score: totals.events * 10 + totals.comments * 5,
      memberCount: totals.members.size,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

export default function AdminEngagement() {
  const { user } = useAuth();
  const metricsQuery = useQuery({
    ...authenticatedQueryOptions<EngagementMetricsResponse>({
      queryKey: appQueryKeys.adminEngagement(user?.id || "anonymous"),
      path: "/admin/engagement-metrics",
      policy: QUERY_CACHE_POLICY.user,
    }),
    enabled: Boolean(user?.id),
  });
  const dashboardQuery = useQuery({
    ...authenticatedQueryOptions<DashboardAnalyticsResponse>({
      queryKey: appQueryKeys.adminDashboard(user?.id || "anonymous"),
      path: "/admin/dashboard",
      policy: QUERY_CACHE_POLICY.live,
    }),
    enabled: Boolean(user?.id),
  });
  const topBatches = useMemo(() => buildTopBatches(metricsQuery.data), [metricsQuery.data]);
  const courseComparisons = dashboardQuery.data?.courseComparisons ?? [];
  const heatmap = dashboardQuery.data?.heatmap ?? [];
  const topAlumni = dashboardQuery.data?.topAlumni ?? [];
  const predictionCounts = dashboardQuery.data?.predictionCounts ?? [];
  const loading = (metricsQuery.isLoading && !metricsQuery.data) || (dashboardQuery.isLoading && !dashboardQuery.data);

  const maxScore = topBatches.length > 0 ? topBatches[0].score : 100;
  const heatmapMax = Math.max(...heatmap.map((item) => item.activityCount), 1);
  const heatmapDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heatmapHours = [0, 3, 6, 9, 12, 15, 18, 21];
  const heatmapValue = (dayIndex: number, hour: number) =>
    heatmap
      .filter((item) => item.dayIndex === dayIndex && item.hour >= hour && item.hour < hour + 3)
      .reduce((sum, item) => sum + item.activityCount, 0);
  const predictionTotal = predictionCounts.reduce((sum, item) => sum + item.count, 0);
  const comparisonRows = courseComparisons.slice(0, 6);

  return (
    <AdminLayout title="Engagement Metrics">
      <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Engagement Prediction</h3>
          </div>
          <div className="space-y-3 p-4">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading</div>
            ) : predictionCounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">No prediction data yet.</div>
            ) : (
              predictionCounts.map((item) => (
                <div key={item.category}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-navy-dark">{item.category}</span>
                    <span className="text-muted-foreground">{item.count} alumni | {item.percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${item.category.includes("Risk") ? "bg-rose-500" : item.category.includes("Highly") ? "bg-emerald-500" : item.category.includes("Moderately") ? "bg-blue-500" : "bg-amber-500"}`}
                      style={{ width: `${predictionTotal ? item.percentage : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Engagement Heatmaps</h3>
          </div>
          <div className="overflow-x-auto p-4">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Loading</div>
            ) : (
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[56px_repeat(8,minmax(42px,1fr))] gap-1 text-[10px] text-muted-foreground">
                <div />
                {heatmapHours.map((hour) => <div key={hour} className="text-center">{String(hour).padStart(2, "0")}:00</div>)}
                {heatmapDays.map((day, dayIndex) => (
                  <div key={day} className="contents">
                    <div className="py-2 font-semibold text-navy-dark">{day}</div>
                    {heatmapHours.map((hour) => {
                      const value = heatmapValue(dayIndex, hour);
                      const opacity = value ? Math.min(0.95, Math.max(0.18, value / heatmapMax)) : 0.05;
                      return (
                        <div
                          key={`${day}-${hour}`}
                          title={`${day} ${String(hour).padStart(2, "0")}:00 - ${value} activities`}
                          className="h-8 rounded-md border border-white"
                          style={{ backgroundColor: `rgba(128, 0, 0, ${opacity})` }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Course Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {["Course", "Engagement", "Events", "Surveys", "Employment"].map((header) => (
                    <th key={header} className="px-4 py-2 text-left font-semibold uppercase tracking-wide text-navy">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No course comparison data yet.</td></tr>
                ) : comparisonRows.map((course) => (
                  <tr key={course.course} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-navy-dark">{course.courseLabel}</td>
                    <td className="px-4 py-3">{course.engagementRate}%</td>
                    <td className="px-4 py-3">{course.eventParticipationRate}%</td>
                    <td className="px-4 py-3">{course.surveyParticipationRate}%</td>
                    <td className="px-4 py-3">{course.employmentRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Most Active Alumni</h3>
          </div>
          <div className="divide-y divide-border">
            {topAlumni.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No alumni activity ranking yet.</div>
            ) : topAlumni.slice(0, 6).map((alumni) => (
              <div key={alumni.alumniId} className="grid gap-2 p-4 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-dark">{alumni.name}</p>
                  <p className="text-xs text-muted-foreground">{alumni.courseLabel} | Batch {alumni.batch}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs md:justify-end">
                  <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">{alumni.prediction}</span>
                  <span className="rounded-full bg-navy/10 px-2.5 py-1 font-semibold text-navy">{alumni.eventParticipationLikelihood}% event</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top Engaged Batches */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-navy flex items-center justify-center"><Star className="w-3.5 h-3.5 text-gold" /></div>
          <h3 className="font-display font-bold text-navy-dark text-sm">Top Engaged Batches</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Rank", "Batch", "Score", "Active Members", "Events Joined", "Comments"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-navy uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && topBatches.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No engagement data yet.</td></tr>
              )}
              {topBatches.map((b, i) => (
                <tr key={b.batch} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-gold text-navy-dark" : i === 1 ? "bg-muted text-navy" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-navy-dark">Batch {b.batch}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden w-20">
                        <div className="h-full bg-navy rounded-full" style={{ width: `${maxScore > 0 ? (b.score / maxScore) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-navy">{b.score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.memberCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.events}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
