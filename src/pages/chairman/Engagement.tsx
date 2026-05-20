import { ReactNode, useEffect, useMemo, useState } from "react";
import ChairmanLayout from "@/components/chairman/ChairmanLayout";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Activity, Loader2, TrendingUp, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface NamedMetric {
  label: string;
  value: number;
}

interface MonthlyEngagementPoint {
  month: string;
  score: number;
  events: number;
  responses: number;
}

interface DepartmentMetric {
  department: string;
  label: string;
  alumni: number;
  active: number;
  engagementScore: number;
  tracerRespondents: number;
  isCurrent?: boolean;
}

interface EngagementResponse {
  course: string;
  courseLabel: string;
  summary: {
    avgEngagementScore: number;
    totalAlumni: number;
    activeAlumni: number;
    eventParticipants: number;
    tracerRespondents: number;
    employedCount: number;
    alumniWithAchievements: number;
  };
  engagementOverview: NamedMetric[];
  tracerStatus: NamedMetric[];
  achievementSummary: NamedMetric[];
  monthlyEngagement: MonthlyEngagementPoint[];
  departmentMetrics: DepartmentMetric[];
}

const MAROON = "#5a0000";
const DARK_GRAY = "#3f3f46";
const SOFT_GRAY = "#e4e4e7";

export default function ChairmanEngagement() {
  const [data, setData] = useState<EngagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const courseComparison = useMemo(() => {
    return (data?.departmentMetrics || []).map((item) => ({
      ...item,
      shortLabel: item.department,
    }));
  }, [data]);

  return (
    <ChairmanLayout
      title="Engagement"
      subtitle={data ? `Focused alumni analytics for ${data.courseLabel}` : "Focused alumni analytics"}
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
          No engagement data is available for this chairman account.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel
              title="Alumni Engagement Overview"
              description="Main alumni activity signals in the assigned department"
              icon={<Activity className="h-4 w-4" />}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.engagementOverview} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={SOFT_GRAY} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="label" type="category" width={120} tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <Tooltip content={<SimpleTooltip />} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={MAROON} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Engagement per Month"
              description="Monthly engagement score with event and tracer activity"
              icon={<TrendingUp className="h-4 w-4" />}
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.monthlyEngagement} margin={{ left: 0, right: 16 }}>
                  <defs>
                    <linearGradient id="monthlyEngagementFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={MAROON} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={MAROON} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={SOFT_GRAY} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <Tooltip content={<SimpleTooltip />} />
                  <Area type="monotone" dataKey="score" name="Score" stroke={MAROON} strokeWidth={3} fill="url(#monthlyEngagementFill)" />
                  <Line type="monotone" dataKey="events" name="Events" stroke="#71717a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="responses" name="Tracer" stroke="#991b1b" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Course/Program Engagement Comparison"
              description="Assigned program compared with other programs"
              icon={<Users className="h-4 w-4" />}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={courseComparison} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={SOFT_GRAY} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: DARK_GRAY }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ProgramTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="engagementScore" name="Engagement Score" radius={[6, 6, 0, 0]}>
                    {courseComparison.map((entry) => (
                      <Cell key={entry.department} fill={entry.isCurrent ? MAROON : "#71717a"} />
                    ))}
                  </Bar>
                  <Bar dataKey="tracerRespondents" name="Tracer Updated" fill="#a1a1aa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </div>
      )}
    </ChairmanLayout>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading engagement metrics...
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  icon,
  children,
  className = "",
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-white shadow-card ${className}`}>
      <div className="flex items-start gap-3 border-b border-border bg-zinc-50 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-white">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-navy-dark">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="h-[320px] p-4">{children}</div>
    </section>
  );
}

function SimpleTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-bold text-navy-dark">{label}</p>}
      {payload.map((item) => (
        <div key={`${item.name}-${item.value}`} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || MAROON }} />
          <span className="text-muted-foreground">{item.name || "Value"}:</span>
          <span className="font-semibold text-navy-dark">{item.value ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

function ProgramTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; payload?: DepartmentMetric }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;

  return (
    <div className="max-w-xs rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-navy-dark">{row?.label || label}</p>
      {payload.map((item) => (
        <div key={`${item.name}-${item.value}`} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || MAROON }} />
          <span className="text-muted-foreground">{item.name || "Value"}:</span>
          <span className="font-semibold text-navy-dark">{item.value ?? 0}</span>
        </div>
      ))}
      {row && <p className="mt-1 text-muted-foreground">{row.alumni} alumni | {row.active} active</p>}
    </div>
  );
}
