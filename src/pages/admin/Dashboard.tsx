import { clientLogger } from "@/lib/logger";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Calendar, Heart, MapPin, TrendingUp, Users, Briefcase, Clock3, MonitorSmartphone } from "lucide-react";
import { API_URL, getAuthToken, getAuthHeaders, readApiResponse } from "@/lib/api";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { useIsPhone } from "@/hooks/use-mobile";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TracerRow {
  id?: string;
  user_id: string;
  employment_status: string | null;
  company: string | null;
  work_location: string | null;
  created_at: string | null;
  name?: string;
  course?: string;
  batch?: string;
  profile?: {
    name: string;
    course: string | null;
    batch: string | null;
  };
}

interface EventRow {
  id: string;
  title: string;
  date: string | null;
  venue?: string | null;
  location?: string | null;
  status: string | null;
  organizer?: string | null;
}

interface MonthlyEngagementPoint {
  month: string;
  monthKey: string;
  logins: number;
  comments: number;
  eventInterest: number;
  surveyResponses: number;
  announcementInteractions: number;
  freedomWall: number;
  total: number;
}

interface CourseContributionPoint {
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
}

interface DonationTrendPoint {
  month: string;
  monthKey: string;
  donationCount: number;
  donatedAmount: number;
}

interface RecentDonor {
  id: string;
  donorName: string;
  amount: number;
  donatedAt: string | null;
  purpose?: string | null;
  message?: string | null;
}

interface SessionStats {
  activeUsers: number;
  activeSessions: number;
}


interface DashboardResponse {
  totalAlumni?: number;
  tracerCount?: number;
  totalDonations?: number;
  tracerData?: TracerRow[];
  recentTracer?: TracerRow[];
  upcomingEvents?: EventRow[];
  monthlyEngagement?: MonthlyEngagementPoint[];
  courseContributions?: CourseContributionPoint[];
  donationTrends?: DonationTrendPoint[];
  recentDonors?: RecentDonor[];
  sessionStats?: SessionStats;
}

const formatCurrency = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null) => {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};


const chartColors = {
  primary: "hsl(var(--navy))",
  primarySoft: "hsl(var(--navy-light))",
  accent: "hsl(var(--gold-dark))",
  axis: "hsl(var(--muted-foreground))",
  axisStrong: "hsl(var(--foreground))",
  grid: "hsl(var(--border))",
  cursor: "hsl(var(--navy) / 0.08)",
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "var(--shadow-md)",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
};

const chartAxisTick = { fontSize: 11, fill: chartColors.axis };
const chartCategoryTick = { fontSize: 11, fill: chartColors.axisStrong };

const emptySessionStats: SessionStats = {
  activeUsers: 0,
  activeSessions: 0,
};

const formatCompactNumber = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function AdminDashboard() {
  const { settings } = useSystemSettings();
  const isPhone = useIsPhone();
  const [totalAlumni, setTotalAlumni] = useState(0);
  const [totalDonations, setTotalDonations] = useState(0);
  const [recentTracer, setRecentTracer] = useState<TracerRow[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([]);
  const [monthlyEngagement, setMonthlyEngagement] = useState<MonthlyEngagementPoint[]>([]);
  const [courseContributions, setCourseContributions] = useState<CourseContributionPoint[]>([]);
  const [donationTrends, setDonationTrends] = useState<DonationTrendPoint[]>([]);
  const [recentDonors, setRecentDonors] = useState<RecentDonor[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats>(emptySessionStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchDashboard();
  }, []);

  const fetchDashboard = async (silent = false) => {
    try {
      const token = getAuthToken();

      if (!token) {
        window.location.href = "/";
        return;
      }

      const res = await fetch(`${API_URL}/admin/dashboard`, {
        headers: getAuthHeaders(),
      });

      const data = await readApiResponse<DashboardResponse>(res);

      const tracerRows = data.recentTracer || data.tracerData || [];

      setTotalAlumni(data.totalAlumni || 0);
      setTotalDonations(data.totalDonations || 0);
      setRecentTracer(tracerRows.slice(0, 6));
      setUpcomingEvents((data.upcomingEvents || []).slice(0, 5));
      setMonthlyEngagement(data.monthlyEngagement || []);
      setCourseContributions(data.courseContributions || []);
      setDonationTrends(data.donationTrends || []);
      setRecentDonors((data.recentDonors || []).slice(0, 5));
      setSessionStats(data.sessionStats || emptySessionStats);
    } catch (err) {
      clientLogger.error("Dashboard error:", err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const employmentRate = useMemo(() => {
    if (recentTracer.length === 0) return 0;
    const employedCount = recentTracer.filter((item) =>
      ["Employed", "Self-Employed"].includes(item.employment_status || "")
    ).length;

    return Math.round((employedCount / recentTracer.length) * 100);
  }, [recentTracer]);

  const statusColor: Record<string, string> = {
    Employed: "bg-emerald-100 text-emerald-700",
    "Graduate Studies": "bg-blue-100 text-blue-700",
    "Self-Employed": "bg-amber-100 text-amber-700",
    Unemployed: "bg-rose-100 text-rose-700",
  };

  const eventStatusColor: Record<string, string> = {
    Upcoming: "bg-navy/10 text-navy",
    Ongoing: "bg-blue-100 text-blue-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-rose-100 text-rose-700",
  };

  const stats = [
    { label: "Active Users", value: sessionStats.activeUsers.toLocaleString(), icon: Users, color: "bg-navy text-white" },
    { label: "Active Sessions", value: sessionStats.activeSessions.toLocaleString(), icon: MonitorSmartphone, color: "bg-blue-500 text-white" },
    { label: "Total Alumni", value: totalAlumni.toLocaleString(), icon: Users, color: "bg-navy text-white" },
    { label: "Employment Rate", value: `${employmentRate}%`, icon: Briefcase, color: "bg-emerald-500 text-white" },
    { label: "Total Donations", value: formatCurrency(totalDonations), icon: Heart, color: "bg-rose-500 text-white" },
    { label: "Upcoming Events", value: upcomingEvents.length.toString(), icon: Calendar, color: "bg-gold text-navy-dark" },
  ];

  const courseChartData = useMemo(
    () =>
      courseContributions.map((item) => ({
        ...item,
        shortCourse: item.courseLabel.length > 18 ? `${item.courseLabel.slice(0, 18)}...` : item.courseLabel,
      })),
    [courseContributions]
  );

  const topCourseChartData = useMemo(() => courseChartData.slice(0, 8), [courseChartData]);

  const hasMonthlyData = monthlyEngagement.some((item) => item.total > 0);
  const hasCourseData = courseContributions.some((item) => item.contributionScore > 0);

  return (
    <AdminLayout title="Dashboard" subtitle={`${settings.institutionName} ${settings.systemName} Overview`}>
      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-card rounded-xl border border-border shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>

            <div>
              <p className="text-xl font-bold">{loading ? "…" : stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm">Recent Tracer Submissions</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">Alumni</th>
                  <th className="px-4 py-2 text-left">Course / Batch</th>
                  <th className="px-4 py-2 text-left">Employer</th>
                  <th className="px-4 py-2 text-left">Location</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>

              <tbody>
                {!loading && recentTracer.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No recent tracer submissions found.
                    </td>
                  </tr>
                )}

                {recentTracer.map((item, index) => {
                  const alumnusName = item.name || item.profile?.name || "Unknown";
                  const course = item.course || item.profile?.course || "—";
                  const batch = item.batch || item.profile?.batch || "—";

                  return (
                    <tr key={`${item.user_id}-${index}`} className="border-b">
                      <td className="px-4 py-2 font-semibold">{alumnusName}</td>
                      <td className="px-4 py-2">
                        {course} · {batch}
                      </td>
                      <td className="px-4 py-2">{item.company || "—"}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {item.work_location || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusColor[item.employment_status ?? ""] || "bg-muted text-muted-foreground"}`}>
                          {item.employment_status || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm">Upcoming Events</h3>
          </div>

          <div>
            {!loading && upcomingEvents.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No upcoming events available.</div>
            )}

            {upcomingEvents.map((event) => (
              <div key={event.id} className="p-4 border-b last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-navy-dark">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      {formatDate(event.date)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {event.venue || event.location || "TBD"}
                    </p>
                    {event.organizer && <p className="text-xs text-muted-foreground mt-1">Organizer: {event.organizer}</p>}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${eventStatusColor[event.status ?? "Upcoming"] || "bg-muted text-muted-foreground"}`}>
                    {event.status || "Upcoming"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Engagement Per Month</h3>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Loading</div>
            ) : !monthlyEngagement.length || !hasMonthlyData ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">No monthly engagement activity found yet.</div>
            ) : (
              <div className="mobile-chart h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyEngagement} margin={{ top: 8, right: isPhone ? 2 : 8, left: isPhone ? -18 : 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.7} />
                    <XAxis dataKey="month" tick={isPhone ? { ...chartAxisTick, fontSize: 10 } : chartAxisTick} axisLine={false} tickLine={false} />
                    <YAxis width={isPhone ? 34 : 60} tick={isPhone ? { ...chartAxisTick, fontSize: 10 } : chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(value) => formatCompactNumber(Number(value))} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: chartColors.cursor }}
                      formatter={(value) => [formatCompactNumber(Number(value)), "Total activity"]}
                    />
                    <Bar dataKey="total" name="Total activity" fill={chartColors.primary} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Contribution by Course</h3>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Loading</div>
            ) : !topCourseChartData.length || !hasCourseData ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">No course contribution activity found yet.</div>
            ) : (
              <div className="mobile-chart h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCourseChartData} layout="vertical" margin={{ top: 8, right: isPhone ? 4 : 16, left: isPhone ? 0 : 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.7} horizontal={false} />
                    <XAxis type="number" tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(value) => formatCompactNumber(Number(value))} />
                    <YAxis type="category" dataKey="shortCourse" width={isPhone ? 82 : 120} interval={0} tick={isPhone ? { ...chartCategoryTick, fontSize: 9 } : chartCategoryTick} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: chartColors.cursor }}
                      formatter={(value, name, item) => {
                        const payload = item?.payload as CourseContributionPoint | undefined;
                        if (name === "contributionScore" && payload) {
                          return [
                            `${formatCompactNumber(Number(value))} score`,
                            `${payload.events} events, ${payload.surveyResponses} surveys, ${payload.donations} donations`,
                          ];
                        }
                        return [formatCompactNumber(Number(value)), String(name)];
                      }}
                      labelFormatter={(label) => {
                        const match = topCourseChartData.find((item) => item.shortCourse === label);
                        return match?.courseLabel || label;
                      }}
                    />
                    <Bar dataKey="contributionScore" name="Contribution Score" fill={chartColors.accent} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Recent Donors</h3>
          </div>
          <div className="divide-y divide-border">
            {recentDonors.length > 0 ? (
              recentDonors.map((donor) => (
                <div key={donor.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-dark">{donor.donorName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{donor.purpose || donor.message || "General donation"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(donor.donatedAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                    {formatCurrency(donor.amount)}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No recent donor activity yet.
              </div>
            )}
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <h3 className="font-bold text-sm text-navy-dark">Donation Trends</h3>
          </div>
          <div className="p-4">
            {donationTrends.some((item) => item.donatedAmount > 0) ? (
              <div className="mobile-chart h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={donationTrends} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.7} />
                    <XAxis dataKey="month" tick={chartAxisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={(value) => formatCompactNumber(Number(value))} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), "Approved donations"]} />
                    <Line type="monotone" dataKey="donatedAmount" stroke={chartColors.primarySoft} strokeWidth={3} dot={{ r: 3, fill: chartColors.primarySoft, strokeWidth: 0 }} activeDot={{ r: 5, fill: chartColors.primary }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No approved donation trend data yet.</div>
            )}
          </div>
        </section>

      </div>

      
    </AdminLayout>
  );
}






