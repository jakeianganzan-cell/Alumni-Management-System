import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, MessageSquareWarning, Send, Sparkles, UserCheck, X } from "lucide-react";
import { AppRole, RoleSelectionState, useAuth } from "@/hooks/useAuth";
import { API_URL, fetchApi, getRememberedIdentifier, getRememberMePreference, readApiResponse, resolveAssetUrl, setRememberedIdentifier } from "@/lib/api";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import ustpLogo from "@/assets/salay.png";
import salayBackground from "@/assets/salay-background.png";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, selectRole, role, isAdmin, isTracerCompleted } = useAuth();
  const { settings } = useSystemSettings();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeBackground, setActiveBackground] = useState(0);
  const [roleSelection, setRoleSelection] = useState<RoleSelectionState | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);
  const [showProblemReport, setShowProblemReport] = useState(false);
  const [problemSubmitting, setProblemSubmitting] = useState(false);
  const [problemMessage, setProblemMessage] = useState("");
  const [problemError, setProblemError] = useState("");
  const [problemForm, setProblemForm] = useState({
    reporterName: "",
    reporterEmail: "",
    subject: "Login issue",
    message: "",
  });
  const roleLabels: Partial<Record<AppRole, string>> = {
    alumni: "Alumni",
    president: "Administrator",
    vice_president: "Staff",
    secretary: "Staff",
    assistant_secretary: "Staff",
    treasurer: "Staff",
    assistant_treasurer: "Staff",
    auditor: "Staff",
    pio: "Staff",
    appointed: "Staff",
    chairman: "Chairman",
  };

  const formatRoleLabel = (value: AppRole) => roleLabels[value] || value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const loginLogo = resolveAssetUrl(settings.loginLogoPath || settings.logoPath) || ustpLogo;
  const loginBackgrounds = settings.loginSlideshowEnabled && settings.loginBackgrounds.length > 0
    ? settings.loginBackgrounds
    : [settings.loginBackgroundPath].filter(Boolean);
  const currentBackground = resolveAssetUrl(loginBackgrounds[activeBackground] || "") || salayBackground;

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setIdentifier(getRememberedIdentifier());
  }, []);

  useEffect(() => {
    setActiveBackground(0);
  }, [settings.loginBackgroundPath, settings.loginBackgrounds, settings.loginSlideshowEnabled]);

  useEffect(() => {
    if (!settings.loginSlideshowEnabled || loginBackgrounds.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveBackground((current) => (current + 1) % loginBackgrounds.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [loginBackgrounds.length, settings.loginSlideshowEnabled]);

  useEffect(() => {
    if (role === "chairman") {
      navigate("/chairman", { replace: true });
      return;
    }

    if (isAdmin) {
      navigate("/admin", { replace: true });
      return;
    }

    if (role === "alumni") {
      navigate(isTracerCompleted ? "/alumni" : "/alumni/tracer", { replace: true });
    }
  }, [role, isAdmin, isTracerCompleted, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error, roleSelection: nextRoleSelection } = await signIn(identifier, password, rememberMe);

    if (error) {
      setError(error === "Invalid credentials" ? "Wrong password" : error);
      setLoading(false);
      return;
    }

    setRememberedIdentifier(identifier, rememberMe);

    if (nextRoleSelection) {
      setRoleSelection(nextRoleSelection);
      setSelectedRole(nextRoleSelection.roles[0] || null);
      setLoading(false);
      return;
    }

    navigate("/");
    setLoading(false);
  };

  const handleRoleSelect = async (nextRole: AppRole) => {
    if (!roleSelection) return;
    setError("");
    setSelectedRole(nextRole);
    setLoading(true);

    const { error: roleError } = await selectRole(roleSelection.loginToken, nextRole, rememberMe);

    if (roleError) {
      setError(roleError);
      setLoading(false);
      return;
    }

    navigate("/");
    setLoading(false);
  };

  const resetRoleSelection = () => {
    setRoleSelection(null);
    setSelectedRole(null);
    setPassword("");
    setError("");
  };

  const submitProblemReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const subject = problemForm.subject.trim();
    const message = problemForm.message.trim();

    if (!subject || !message) {
      setProblemError("Subject and problem details are required.");
      return;
    }

    setProblemSubmitting(true);
    setProblemError("");
    setProblemMessage("");

    try {
      const response = await fetchApi(`${API_URL}/concerns/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...problemForm,
          subject,
          message,
          category: "Login Issue",
          identifier,
        }),
      });
      const data = await readApiResponse<{ message: string }>(response);
      setProblemMessage(data.message || "Problem report submitted successfully.");
      setProblemForm({ reporterName: "", reporterEmail: "", subject: "Login issue", message: "" });
    } catch (reportError) {
      setProblemError(reportError instanceof Error ? reportError.message : "Failed to submit problem report.");
    } finally {
      setProblemSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${currentBackground})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(24,24,24,0.82),rgba(85,0,0,0.80),rgba(48,48,48,0.78))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />

      <button
        type="button"
        title="Report a Problem"
        aria-label="Report a Problem"
        onClick={() => {
          setShowProblemReport(true);
          setProblemError("");
          setProblemMessage("");
        }}
        className="fixed right-4 top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/95 text-navy shadow-[0_14px_34px_rgba(0,0,0,0.28)] transition hover:bg-white hover:text-navy-dark focus:outline-none focus:ring-2 focus:ring-white/80"
      >
        <MessageSquareWarning className="h-5 w-5" />
      </button>

      {showProblemReport && (
        <div className="fixed inset-0 z-40">
          <button type="button" aria-label="Close report form" className="absolute inset-0 bg-black/45" onClick={() => setShowProblemReport(false)} />
          <form onSubmit={submitProblemReport} className="absolute right-4 top-16 w-[min(92vw,24rem)] rounded-2xl border border-white/70 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy">Report a Problem</p>
                <h2 className="mt-1 text-base font-bold text-navy-dark">Login Issue</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowProblemReport(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</label>
                <input value={problemForm.reporterName} onChange={(event) => setProblemForm((current) => ({ ...current, reporterName: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                <input type="email" value={problemForm.reporterEmail} onChange={(event) => setProblemForm((current) => ({ ...current, reporterEmail: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</label>
                <input value={problemForm.subject} onChange={(event) => setProblemForm((current) => ({ ...current, subject: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Problem Details</label>
                <textarea value={problemForm.message} onChange={(event) => setProblemForm((current) => ({ ...current, message: event.target.value }))} rows={4} className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15" required />
              </div>

              {(problemError || problemMessage) && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${problemError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {problemError || problemMessage}
                </div>
              )}

              <button type="submit" disabled={problemSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60">
                {problemSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {problemSubmitting ? "Sending" : "Submit Report"}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-4">
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-[30px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,246,247,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.36)] ring-1 ring-white/50">
            <div className="relative overflow-hidden border-b border-slate-200/90 px-6 pb-4 pt-5 sm:px-7">
              <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(135deg,rgba(85,0,0,0.98),rgba(42,42,42,0.95))]" />
              <div className="absolute -right-10 top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute left-8 top-16 h-16 w-16 rounded-full bg-white/10 blur-xl" />

              <div className="relative z-10 text-center text-white">
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                  <Sparkles className="h-4 w-4 text-white/80" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                    {settings.systemShortName}
                  </span>
                </div>

                <img src={loginLogo} alt={settings.institutionName || settings.systemName} className="mx-auto mt-2 h-auto w-28 object-contain sm:w-32" />
              </div>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <div className="mb-4 text-center">
                <h1 className="mx-auto max-w-[18rem] text-lg font-extrabold leading-snug text-black sm:max-w-xs sm:text-[1.45rem]">
                  {settings.welcomeMessage}
                </h1>
                {settings.loginSubtitle && (
                  <p className="mx-auto mt-2 max-w-sm text-xs font-medium leading-5 text-slate-600">
                    {settings.loginSubtitle}
                  </p>
                )}
              </div>

              {roleSelection ? (
                <div className="mx-auto max-w-md space-y-3.5">
                  <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select Role</p>
                    <p className="mt-1 text-sm font-bold text-navy-dark">{roleSelection.profile?.name || roleSelection.user.email}</p>
                  </div>

                  <div className="grid gap-2">
                    {roleSelection.roles.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => void handleRoleSelect(item)}
                        disabled={loading}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          selectedRole === item
                            ? "border-navy bg-navy text-white shadow-card"
                            : "border-slate-200 bg-white text-navy-dark hover:border-navy/40 hover:bg-slate-50"
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <UserCheck className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-sm font-bold">{formatRoleLabel(item)}</span>
                        </span>
                        {loading && selectedRole === item ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>

                  {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

                  <button
                    type="button"
                    onClick={resetRoleSelection}
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-navy-dark transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Use different account
                  </button>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="mx-auto max-w-md space-y-3.5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-navy-dark">Email or Alumni ID</label>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-navy-dark">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 shadow-sm transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                        required
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-navy"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-navy-dark">Remember me</p>
                      <p className="text-xs leading-4 text-slate-600">Keep this account signed in on this device.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy"
                    />
                  </div>

                  {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,hsl(0_100%_17%),hsl(0_82%_24%))] px-8 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_rgba(85,0,0,0.26)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {loading ? "Signing in..." : "Log In"}
                  </button>
                </form>
              )}

              <p className="mt-4 border-t border-slate-200 pt-3 text-center text-xs font-medium text-slate-600">Use your alumni ID or email.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




