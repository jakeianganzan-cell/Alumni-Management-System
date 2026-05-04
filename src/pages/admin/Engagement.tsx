import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Star, Users, Calendar, MessageSquare, TrendingUp } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

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

export default function AdminEngagement() {
  const [eventCount, setEventCount] = useState(0);
  const [regCount, setRegCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [donationCount, setDonationCount] = useState(0);
  const [topBatches, setTopBatches] = useState<BatchEngagement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEngagement(); }, []);

  const fetchEngagement = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/engagement-metrics`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data: EngagementMetricsResponse = await res.json();
      
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const STATS = [
    { label: "Total Events", value: eventCount, icon: Calendar, color: "bg-navy text-white" },
    { label: "Event Registrations", value: regCount, icon: Users, color: "bg-blue-500 text-white" },
    { label: "Comments", value: commentCount, icon: MessageSquare, color: "bg-gold text-navy-dark" },
    { label: "Approved Donations", value: donationCount, icon: Star, color: "bg-emerald-500 text-white" },
  ];

  const maxScore = topBatches.length > 0 ? topBatches[0].score : 100;

  return (
    <AdminLayout title="Engagement Metrics" subtitle="Monitor alumni participation and interaction levels">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
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
