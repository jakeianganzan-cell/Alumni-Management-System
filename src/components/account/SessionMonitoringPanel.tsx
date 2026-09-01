import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Laptop, Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { API_URL, clearAuthToken, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  isOnline?: boolean;
  isCurrent?: boolean;
}

interface AccountSessionRow extends SessionRow {
  activeSessionCount: number;
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
  stats?: {
    onlineUsers: number;
    onlineSessions: number;
    loggedInToday: number;
    loginsToday: number;
    activeSessions: number;
  };
}

const EMPTY_STATS = { onlineUsers: 0, onlineSessions: 0, loggedInToday: 0, loginsToday: 0, activeSessions: 0 };

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const formatRelativeActivity = (value: string | null) => {
  if (!value) return "Offline";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Offline";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

export default function SessionMonitoringPanel() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState(EMPTY_STATS);
  const [accountToTerminate, setAccountToTerminate] = useState<AccountSessionRow | null>(null);
  const [terminateAllOpen, setTerminateAllOpen] = useState(false);

  const activeAccounts = useMemo(() => {
    const grouped = new Map<string, AccountSessionRow>();
    sessions.filter((item) => item.status === "Active").forEach((item) => {
      const key = item.userId || `session-${item.id}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...item, activeSessionCount: 1 });
        return;
      }

      const existingTime = existing.lastActivity ? new Date(existing.lastActivity).getTime() : 0;
      const itemTime = item.lastActivity ? new Date(item.lastActivity).getTime() : 0;
      const preferred = item.isOnline && !existing.isOnline
        ? item
        : existing.isOnline && !item.isOnline
          ? existing
          : itemTime > existingTime ? item : existing;

      grouped.set(key, {
        ...preferred,
        isOnline: Boolean(existing.isOnline || item.isOnline),
        isCurrent: Boolean(existing.isCurrent || item.isCurrent),
        lastActivity: itemTime > existingTime ? item.lastActivity : existing.lastActivity,
        activeSessionCount: existing.activeSessionCount + 1,
      });
    });

    return Array.from(grouped.values()).sort((left, right) => {
      const onlineOrder = Number(Boolean(right.isOnline)) - Number(Boolean(left.isOnline));
      if (onlineOrder !== 0) return onlineOrder;
      return new Date(right.lastActivity || 0).getTime() - new Date(left.lastActivity || 0).getTime();
    });
  }, [sessions]);
  const deviceHistory = useMemo(() => {
    const seen = new Set<string>();
    return sessions.filter((item) => {
      const key = `${item.userId}-${item.deviceType}-${item.browser}-${item.operatingSystem}-${item.ipAddress}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sessions]);

  const loadSessions = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setMessage("");
    }
    try {
      const response = await fetch(`${API_URL}/admin/sessions`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<SessionsResponse>(response);
      setSessions(data.sessions || []);
      setActivities(data.activities || []);
      setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
    } catch (error) {
      if (showLoading) setMessage(error instanceof Error ? error.message : "Failed to load sessions.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    const timer = window.setInterval(() => void loadSessions(false), 30_000);
    return () => window.clearInterval(timer);
  }, [loadSessions]);

  const terminateAccount = async (account: AccountSessionRow) => {
    const actionKey = `user-${account.userId}`;
    setBusyAction(actionKey);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/sessions/user/${encodeURIComponent(account.userId)}/terminate`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<{ success: boolean; terminated: number }>(response);
      setAccountToTerminate(null);
      if (account.isCurrent) {
        clearAuthToken();
        window.location.assign("/");
        return;
      }
      setMessage(`${data.terminated} active session${data.terminated === 1 ? "" : "s"} terminated for ${account.fullName}.`);
      await loadSessions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to terminate account sessions.");
    } finally {
      setBusyAction(null);
    }
  };

  const terminateAll = async () => {
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
    <>
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-navy-dark">Session Monitoring</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Online means the signed-in browser checked in within the last 3 minutes.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{stats.onlineUsers} online now</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{stats.loggedInToday} logged in today</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{stats.loginsToday} login sessions today</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadSessions()} disabled={loading}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => setTerminateAllOpen(true)} disabled={busyAction === "all" || stats.activeSessions === 0}>
              {busyAction === "all" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />}
              Force Logout All
            </Button>
          </div>
        </div>

        {message && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</div>}
      </div>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <section className="rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
            <h4 className="text-sm font-bold text-navy-dark">Active Accounts</h4>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{stats.onlineUsers} online</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-xs">
              <thead className="bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Device</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading sessions...</td></tr>
                ) : activeAccounts.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No active accounts found.</td></tr>
                ) : activeAccounts.map((item) => (
                  <tr key={item.userId || item.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-navy-dark">{item.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.email}</p>
                    </td>
                    <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{item.roleLabel}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{item.deviceType} / {item.browser}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-2 text-[10px] font-medium ${item.isOnline ? "text-emerald-700" : "text-muted-foreground"}`}>
                        <span className={`h-2 w-2 rounded-full ${item.isOnline ? "bg-emerald-500 ring-2 ring-emerald-100" : "bg-muted-foreground/50"}`} />
                        {item.isOnline ? "Online" : formatRelativeActivity(item.lastActivity)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7" title="Force logout this account" onClick={() => setAccountToTerminate(item)} disabled={busyAction === `user-${item.userId}`}>
                        {busyAction === `user-${item.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-sm font-bold text-navy-dark">Recent Login Activities</h4>
          </div>
          <div className="max-h-[390px] divide-y divide-border overflow-y-auto">
            {activities.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">No login history found.</div>
            ) : activities.slice(0, 25).map((activity) => (
              <div key={activity.id} className="px-3 py-2">
                <p className="text-xs font-medium text-navy-dark">{activity.description}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(activity.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-sm font-bold text-navy-dark">Device History</h4>
        </div>
        <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
          {deviceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device history found.</p>
          ) : deviceHistory.slice(0, 18).map((item) => (
            <div key={`${item.id}-${item.ipAddress}`} className="rounded-lg border border-border/70 bg-background p-3">
              <p className="text-xs font-semibold text-navy-dark">{item.fullName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.deviceType} / {item.browser} / {item.operatingSystem}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
    <ConfirmDialog
      open={Boolean(accountToTerminate)}
      onOpenChange={(open) => !open && setAccountToTerminate(null)}
      onConfirm={() => accountToTerminate && terminateAccount(accountToTerminate)}
      title="Force logout this account?"
      description={`${accountToTerminate?.fullName || "This account"} will be signed out on every active device.${accountToTerminate?.isCurrent ? " This includes your current session." : ""}`}
      confirmLabel="Force logout"
      busy={Boolean(accountToTerminate && busyAction === `user-${accountToTerminate.userId}`)}
    />
    <ConfirmDialog
      open={terminateAllOpen}
      onOpenChange={setTerminateAllOpen}
      onConfirm={terminateAll}
      title="Force logout all accounts?"
      description="Every active account, including your current session, will be signed out. You will need to log in again."
      confirmLabel="Force logout all"
      busy={busyAction === "all"}
    />
    </>
  );
}

