import { type FormEvent, useEffect, useState } from "react";
import { Inbox, Loader2, MessageSquare, Reply, Send } from "lucide-react";
import { toast } from "sonner";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PROBLEM_CATEGORIES = ["Account", "Event", "Donation", "Document Request", "Technical Issue", "General Concern"] as const;

interface ProblemReport {
  id: number;
  subject: string;
  category: string;
  message: string;
  status: string;
  admin_reply?: string | null;
  replied_at?: string | null;
  created_at?: string | null;
}

const formatReportDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function ReportProblemPanel() {
  const [reports, setReports] = useState<ProblemReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    category: "General Concern",
    message: "",
  });

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const response = await fetchApi(`${API_URL}/concerns/me`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<ProblemReport[]>(response);
      setReports(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load your reports.");
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.subject.trim() || !form.category.trim() || !form.message.trim()) {
      toast.error("Subject, category, and problem details are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchApi(`${API_URL}/concerns`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await readApiResponse<{ message: string; concern: ProblemReport }>(response);
      setReports((current) => [data.concern, ...current]);
      setForm({ subject: "", category: "General Concern", message: "" });
      toast.success("Problem report submitted successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit problem report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Report a Problem</p>
          <h3 className="font-display text-2xl font-bold text-navy-dark">Send a Problem Report</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send account, event, donation, document, technical, or general concerns to the admin team.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadReports()} disabled={loadingReports}>
          {loadingReports ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={submitReport} className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="problem-subject">
              Subject
            </label>
            <Input
              id="problem-subject"
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Enter problem subject"
              className="mt-1"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="problem-category">
              Category
            </label>
            <select
              id="problem-category"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-navy focus:ring-2 focus:ring-ring"
              required
            >
              {PROBLEM_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="problem-message">
              Message / Problem Details
            </label>
            <Textarea
              id="problem-message"
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Write the details of the problem"
              rows={6}
              className="mt-1"
              required
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Sending" : "Submit Report"}
          </Button>
        </form>

        <div className="rounded-2xl border border-border bg-background p-4">
          <div>
            <p className="text-sm font-bold text-foreground">My Problem Reports</p>
            <p className="text-xs text-muted-foreground">Admin replies and status updates appear here.</p>
          </div>

          <div className="mt-4 space-y-3">
            {loadingReports ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold text-foreground">No reports submitted yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Use the form to report a problem to the admin team.</p>
              </div>
            ) : (
              reports.map((report) => (
                <div key={report.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{report.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {report.category} - {formatReportDate(report.created_at)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-navy/10 px-3 py-1 text-[11px] font-semibold uppercase text-navy">
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{report.message}</p>
                  {report.admin_reply ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        <Reply className="h-3.5 w-3.5" />
                        Admin Reply
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{report.admin_reply}</p>
                      <p className="mt-2 text-xs text-emerald-700">{formatReportDate(report.replied_at)}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs font-medium text-muted-foreground">No admin reply yet.</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
