import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Calendar, GraduationCap, Heart, MapPin, TrendingUp, Users, Briefcase, Clock3 } from "lucide-react";
import { API_URL, getAuthToken, getAuthHeaders } from "@/lib/api";

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

interface DonationRow {
  id: string;
  amount: number;
  method: string;
  status: string | null;
  created_at: string | null;
  user_id: string;
  purpose?: string | null;
  name?: string;
  profile?: {
    name: string;
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

interface DashboardResponse {
  totalAlumni?: number;
  tracerCount?: number;
  totalDonations?: number;
  tracerData?: TracerRow[];
  recentTracer?: TracerRow[];
  pendingDonations?: DonationRow[];
  upcomingEvents?: EventRow[];
}

const formatCurrency = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null) => {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export default function AdminDashboard() {
  const [totalAlumni, setTotalAlumni] = useState(0);
  const [tracerCount, setTracerCount] = useState(0);
  const [totalDonations, setTotalDonations] = useState(0);
  const [recentTracer, setRecentTracer] = useState<TracerRow[]>([]);
  const [pendingDonations, setPendingDonations] = useState<DonationRow[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token = getAuthToken();

      if (!token) {
        window.location.href = "/";
        return;
      }

      const res = await fetch(`${API_URL}/admin/dashboard`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch dashboard");
      }

      const data: DashboardResponse = await res.json();

      const tracerRows = data.recentTracer || data.tracerData || [];

      setTotalAlumni(data.totalAlumni || 0);
      setTracerCount(data.tracerCount || tracerRows.length || 0);
      setTotalDonations(data.totalDonations || 0);
      setRecentTracer(tracerRows.slice(0, 6));
      setPendingDonations((data.pendingDonations || []).slice(0, 6));
      setUpcomingEvents((data.upcomingEvents || []).slice(0, 5));
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
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

  const donationStatusColor: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-700",
    Approved: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-rose-100 text-rose-700",
  };

  const eventStatusColor: Record<string, string> = {
    Upcoming: "bg-navy/10 text-navy",
    Ongoing: "bg-blue-100 text-blue-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-rose-100 text-rose-700",
  };

  const stats = [
    { label: "Total Alumni", value: totalAlumni.toLocaleString(), icon: Users, color: "bg-navy text-white" },
    { label: "Employment Rate", value: `${employmentRate}%`, icon: Briefcase, color: "bg-emerald-500 text-white" },
    { label: "Tracer Responses", value: tracerCount.toLocaleString(), icon: GraduationCap, color: "bg-blue-500 text-white" },
    { label: "Total Donations", value: formatCurrency(totalDonations), icon: Heart, color: "bg-rose-500 text-white" },
    { label: "Upcoming Events", value: upcomingEvents.length.toString(), icon: Calendar, color: "bg-gold text-navy-dark" },
  ];

  return (
    <AdminLayout title="Dashboard" subtitle="SaCC Alumni Management System Overview">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
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

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/30">
          <h3 className="font-bold text-sm">Pending Donations</h3>
        </div>

        <div className="divide-y divide-border">
          {!loading && pendingDonations.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No pending donations found.</div>
          )}

          {pendingDonations.map((donation) => (
            <div key={donation.id} className="p-4 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div>
                <p className="font-semibold text-navy-dark">{donation.name || donation.profile?.name || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">{formatDate(donation.created_at)}</p>
              </div>
              <div className="text-muted-foreground">{formatCurrency(donation.amount)}</div>
              <div className="text-muted-foreground">{donation.method || "—"}</div>
              <div className="flex items-center justify-start md:justify-end">
                <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${donationStatusColor[donation.status ?? "Pending"] || "bg-muted text-muted-foreground"}`}>
                  {donation.status || "Pending"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
