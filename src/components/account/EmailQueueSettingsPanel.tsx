import { type ReactNode, useEffect, useState } from "react";
import { Clock, Loader2, MailCheck, Play, RefreshCw, Save } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Priority = "low" | "normal" | "high";

type EmailQueueSettings = {
  dailyEmailLimit: number;
  batchSizePerSendCycle: number;
  sendIntervalMinutes: number;
  queueProcessingEnabled: boolean;
  reminderPriorityLevel: Priority;
  lastProcessedAt: string | null;
  lastDailyCheckAt: string | null;
};

type EmailQueueStats = {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  sentToday: number;
  remainingToday: number;
  nextScheduledAt: string | null;
};

type SettingsResponse = {
  settings: EmailQueueSettings;
  stats: EmailQueueStats;
  message?: string;
};

const DEFAULT_SETTINGS: EmailQueueSettings = {
  dailyEmailLimit: 300,
  batchSizePerSendCycle: 50,
  sendIntervalMinutes: 60,
  queueProcessingEnabled: true,
  reminderPriorityLevel: "normal",
  lastProcessedAt: null,
  lastDailyCheckAt: null,
};

const DEFAULT_STATS: EmailQueueStats = {
  pending: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  sentToday: 0,
  remainingToday: 300,
  nextScheduledAt: null,
};

const asNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Not yet";

export default function EmailQueueSettingsPanel() {
  const [settings, setSettings] = useState<EmailQueueSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<EmailQueueStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/admin/email-queue/settings`, { headers: getAuthHeaders() });
      const data = await readApiResponse<SettingsResponse>(response);
      setSettings(data.settings || DEFAULT_SETTINGS);
      setStats(data.stats || DEFAULT_STATS);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load email queue settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/email-queue/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(settings),
      });
      const data = await readApiResponse<SettingsResponse>(response);
      setSettings(data.settings || settings);
      setStats(data.stats || stats);
      setMessage(data.message || "Email queue settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save email queue settings.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (kind: "check" | "process") => {
    const processingCheck = kind === "check";
    if (processingCheck) setRunningCheck(true); else setProcessing(true);
    setError("");
    setMessage("");
    try {
      const endpoint = processingCheck ? "enqueue-tracer-reminders" : "process";
      const response = await fetch(`${API_URL}/admin/email-queue/${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<SettingsResponse & { stats?: EmailQueueStats }>(response);
      if (data.stats) setStats(data.stats);
      setMessage(data.message || (processingCheck ? "Tracer reminders queued." : "Email queue processed."));
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Email queue action failed.");
    } finally {
      if (processingCheck) setRunningCheck(false); else setProcessing(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-bold text-navy-dark">Email Settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">Control queued tracer reminder delivery and provider sending limits.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading email settings...</div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Pending Queue" value={stats.pending} />
            <Stat label="Sent Today" value={stats.sentToday} />
            <Stat label="Remaining Today" value={stats.remainingToday} />
            <Stat label="Failed" value={stats.failed} />
            <Stat label="Last Processed" value={formatDateTime(settings.lastProcessedAt)} />
            <Stat label="Next Scheduled" value={formatDateTime(stats.nextScheduledAt)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Daily Email Limit">
              <Input type="number" min={1} value={settings.dailyEmailLimit} onChange={(event) => setSettings((current) => ({ ...current, dailyEmailLimit: asNumber(event.target.value, 300) }))} />
            </Field>
            <Field label="Batch Size per Send Cycle">
              <Input type="number" min={1} value={settings.batchSizePerSendCycle} onChange={(event) => setSettings((current) => ({ ...current, batchSizePerSendCycle: asNumber(event.target.value, 50) }))} />
            </Field>
            <Field label="Send Interval (minutes)">
              <Input type="number" min={1} value={settings.sendIntervalMinutes} onChange={(event) => setSettings((current) => ({ ...current, sendIntervalMinutes: asNumber(event.target.value, 60) }))} />
            </Field>
            <Field label="Reminder Priority Level">
              <select value={settings.reminderPriorityLevel} onChange={(event) => setSettings((current) => ({ ...current, reminderPriorityLevel: event.target.value as Priority }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background p-4">
            <div>
              <p className="text-sm font-semibold text-navy-dark">Queue Processing</p>
              <p className="mt-1 text-xs text-muted-foreground">When enabled, the backend queues due tracer reminders and sends them within the configured provider limits.</p>
            </div>
            <Switch checked={settings.queueProcessingEnabled} onCheckedChange={(checked) => setSettings((current) => ({ ...current, queueProcessingEnabled: checked }))} />
          </div>

          {(message || error) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {error || message}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Settings
            </Button>
            <Button type="button" variant="outline" onClick={() => void runAction("check")} disabled={runningCheck}>
              {runningCheck ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />} Run Daily Check
            </Button>
            <Button type="button" variant="outline" onClick={() => void runAction("process")} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Process Queue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MailCheck className="h-3.5 w-3.5" />{label}</div>
      <p className="mt-2 text-lg font-bold text-navy-dark">{value}</p>
    </div>
  );
}