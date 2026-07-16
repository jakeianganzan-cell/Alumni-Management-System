import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Laptop, Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { API_URL, clearAuthToken, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface SessionRow {
  id: number;
  userId: string;
  fullName: string;
  email: string | null;
  role: string;
  roleLabel: string;
  ipAddress: string | null;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  loginTime: string | null;
  logoutTime: string | null;
  lastActivity: string | null;
  status: "Active" | "Ended" | string;
  isCurrent?: boolean;
}

interface ActivityRow {
  id: number;
  fullName: string;
  action: string;
  description: string;
  roleLabel: string;
  deviceUsed: string | null;
  browserUsed: string | null;
  ipAddress: string | null;
  createdAt: string | null;
}

interface SessionsResponse {
  sessions: SessionRow[];
  activities: ActivityRow[];
}

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function SessionMonitoringPanel() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const activeSessions = useMemo(() => sessions.filter((item) => item.status === "Active"), [sessions]);
  const deviceHistory = useMemo(() => {
    const seen = new Set<string>();
    return sessions.filter((item) => {
      const key = `${item.userId}-${item.deviceType}-${item.browser}-${item.operatingSystem}-${item.ipAddress}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sessions]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/sessions`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<SessionsResponse>(response);
      setSessions(data.sessions || []);
      setActivities(data.activities || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const terminateSession = async (sessionId: number) => {
    setBusyAction(String(sessionId));
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/sessions/${sessionId}/terminate`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      await readApiResponse<{ success: boolean }>(response);
      setMessage("Session terminated.");
      await loadSessions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to terminate session.");
    } finally {
      setBusyAction(null);
    }
  };

  const terminateAll = async () => {
    if (!window.confirm("Force logout all active sessions? This includes your current session.")) return;
    setBusyAction("all");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/sessions/terminate-all`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      await readApiResponse<{ success: boolean; terminated: number }>(response);
      clearAuthToken();
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to terminate sessions.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-navy-dark">Session Monitoring</h3>
            <p className="mt-1 text-sm text-muted-foreground">Monitor active logins, devices, and role-based session history.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadSessions()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button type="button" variant="destructive" onClick={() => void terminateAll()} disabled={busyAction === "all" || activeSessions.length === 0}>
              {busyAction === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              Force Logout All
            </Button>
          </div>
        </div>

        {message && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <section className="rounded-3xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h4 className="font-bold text-navy-dark">Active Sessions</h4>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{activeSessions.length} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Device</th>
                  <th className="px-4 py-3 text-left">IP Address</th>
                  <th className="px-4 py-3 text-left">Last Activity</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading sessions...</td></tr>
                ) : activeSessions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No active sessions found.</td></tr>
                ) : activeSessions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-dark">{item.fullName}</p>
                      <p className="text-xs text-muted-foreground">{item.email}</p>
                    </td>
                    <td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{item.roleLabel}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{item.deviceType} / {item.browser} / {item.operatingSystem}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.ipAddress || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.lastActivity)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => void terminateSession(item.id)} disabled={busyAction === String(item.id)}>
                        {busyAction === String(item.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-bold text-navy-dark">Recent Login Activities</h4>
          </div>
          <div className="max-h-[460px] divide-y divide-border overflow-y-auto">
            {activities.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No login history found.</div>
            ) : activities.slice(0, 25).map((activity) => (
              <div key={activity.id} className="px-5 py-3">
                <p className="text-sm font-medium text-navy-dark">{activity.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(activity.createdAt)} • {activity.ipAddress || "No IP"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Laptop className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-bold text-navy-dark">Device History</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {deviceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device history found.</p>
          ) : deviceHistory.slice(0, 18).map((item) => (
            <div key={`${item.id}-${item.ipAddress}`} className="rounded-2xl border border-border bg-background p-4">
              <p className="font-semibold text-navy-dark">{item.fullName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.deviceType} / {item.browser} / {item.operatingSystem}</p>
              <p className="mt-2 text-xs text-muted-foreground">IP: {item.ipAddress || "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last: {formatDateTime(item.lastActivity)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

