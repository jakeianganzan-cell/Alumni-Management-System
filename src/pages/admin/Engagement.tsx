import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Star, Users, Calendar, MessageSquare, TrendingUp } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";

interface BatchEngagement {
  batch: string;
  events: number;
  donations: number;
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
  donationCount?: number;
  profiles?: EngagementProfile[];
  regs?: EngagementRecord[];
  comments?: EngagementRecord[];
  donations?: EngagementRecord[];
}

interface CourseComparisonPoint {
  course: string;
  courseLabel: string;
  alumniCount: number;
  donations: number;
  donatedAmount: number;
  events: number;
  surveyResponses: number;
  achievements: number;
  freedomWall: number;
  comments: number;
  contributionScore: number;
  activeCount: number;
  engagementRate: number;
  donationParticipationRate: number;
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
  donorLikelihood: number;
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

export default function AdminEngagement() {
  const [eventCount, setEventCount] = useState(0);
  const [regCount, setRegCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [donationCount, setDonationCount] = useState(0);
  const [topBatches, setTopBatches] = useState<BatchEngagement[]>([]);
  const [courseComparisons, setCourseComparisons] = useState<CourseComparisonPoint[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [topAlumni, setTopAlumni] = useState<AlumniPredictionPoint[]>([]);
  const [predictionCounts, setPredictionCounts] = useState<PredictionCountPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEngagement(); }, []);

  const fetchEngagement = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/engagement-metrics`, {
        headers: getAuthHeaders()
      });
      const data = await readApiResponse<EngagementMetricsResponse>(res);
      
      setEventCount(data.eventCount ?? 0);
      setRegCount(data.regCount ?? 0);
      setCommentCount(data.commentCount ?? 0);
      setDonationCount(data.donationCount ?? 0);

      const userBatchMap = new Map<string, string>();
      data.profiles?.forEach((profile) => {
        if (profile.batch) userBatchMap.set(profile.id, profile.batch);
      });

      const batchMap = new Map<string, { events: number; donations: number; comments: number; members: Set<string> }>();

      const addToBatch = (userId: string, type: "events" | "donations" | "comments") => {
        const batch = userBatchMap.get(userId);
        if (!batch) return;
        const entry = batchMap.get(batch) ?? { events: 0, donations: 0, comments: 0, members: new Set<string>() };
        entry[type]++;
        entry.members.add(userId);
        batchMap.set(batch, entry);
      };

      data.regs?.forEach((registration) => addToBatch(registration.user_id, "events"));
      data.comments?.forEach((comment) => addToBatch(comment.user_id, "comments"));
      data.donations?.forEach((donation) => addToBatch(donation.user_id, "donations"));

      const sorted = Array.from(batchMap.entries())
        .map(([batch, s]) => ({
          batch,
          events: s.events,
          donations: s.donations,
          comments: s.comments,
          score: s.events * 10 + s.donations * 15 + s.comments * 5,
          memberCount: s.members.size,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      setTopBatches(sorted);

      const analyticsRes = await fetch(`${API_URL}/admin/dashboard`, {
        headers: getAuthHeaders()
      });
      const analyticsData = await readApiResponse<DashboardAnalyticsResponse>(analyticsRes);

      setCourseComparisons(analyticsData.courseComparisons || []);
      setHeatmap(analyticsData.heatmap || []);
      setTopAlumni(analyticsData.topAlumni || []);
      setPredictionCounts(analyticsData.predictionCounts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const STATS = [
    { label: "Total Events", value: eventCount, icon: Calendar, color: "bg-navy text-white" },
    { label: "Attended Events", value: regCount, icon: Users, color: "bg-blue-500 text-white" },
    { label: "Comments", value: commentCount, icon: MessageSquare, color: "bg-gold text-navy-dark" },
    { label: "Approved Donations", value: donationCount, icon: Star, color: "bg-emerald-500 text-white" },
  ];

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
    <AdminLayout title="Engagement Metrics" subtitle="Monitor alumni participation and interaction levels">
      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={i} className="bg-card rounded-xl border border-border shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color}`}><s.icon className="w-4 h-4" /></div>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xl font-display font-bold text-navy-dark leading-none">{loading ? "…" : s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Engagement Prediction</h3>
            <p className="text-[11px] text-muted-foreground">Predicted alumni categories from logins, surveys, donations, events, comments, and reactions.</p>
          </div>
          <div className="space-y-3 p-4">
            {predictionCounts.length === 0 ? (
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
            <p className="text-[11px] text-muted-foreground">Darker cells indicate higher alumni activity by day and time block.</p>
          </div>
          <div className="overflow-x-auto p-4">
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
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Course Comparison</h3>
            <p className="text-[11px] text-muted-foreground">Engagement, donation, event, survey, and employment rates by program.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {["Course", "Engagement", "Events", "Surveys", "Donors", "Employment"].map((header) => (
                    <th key={header} className="px-4 py-2 text-left font-semibold uppercase tracking-wide text-navy">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No course comparison data yet.</td></tr>
                ) : comparisonRows.map((course) => (
                  <tr key={course.course} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-navy-dark">{course.courseLabel}</td>
                    <td className="px-4 py-3">{course.engagementRate}%</td>
                    <td className="px-4 py-3">{course.eventParticipationRate}%</td>
                    <td className="px-4 py-3">{course.surveyParticipationRate}%</td>
                    <td className="px-4 py-3">{course.donationParticipationRate}%</td>
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
            <p className="text-[11px] text-muted-foreground">Ranked by combined activity score and predicted participation likelihood.</p>
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
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{alumni.donorLikelihood}% donor</span>
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
                {["Rank", "Batch", "Score", "Active Members", "Events Joined", "Donations", "Comments"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-navy uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && topBatches.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No engagement data yet.</td></tr>
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
                  <td className="px-4 py-3 text-muted-foreground">{b.donations}</td>
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
