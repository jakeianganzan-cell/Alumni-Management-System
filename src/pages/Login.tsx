import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getRememberedIdentifier, getRememberMePreference, setRememberedIdentifier } from "@/lib/api";
import ustpLogo from "@/assets/salay.png";
import salayBackground from "@/assets/salay-background.png";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, role, isAdmin, isTracerCompleted } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setIdentifier(getRememberedIdentifier());
  }, []);

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

    const { error } = await signIn(identifier, password, rememberMe);

    if (error) {
      setError(error);
      setLoading(false);
      return;
    }

    setRememberedIdentifier(identifier, rememberMe);
    navigate("/");
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${salayBackground})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(33,33,33,0.78),rgba(112,24,47,0.78),rgba(69,69,69,0.74))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-4">
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,246,247,0.97))] shadow-[0_26px_70px_rgba(36,16,22,0.26)]">
            <div className="relative overflow-hidden border-b border-slate-200/90 px-6 pb-4 pt-5 sm:px-7">
              <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(135deg,rgba(92,18,38,0.98),rgba(58,58,58,0.95))]" />
              <div className="absolute -right-10 top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute left-8 top-16 h-16 w-16 rounded-full bg-white/10 blur-xl" />

              <div className="relative z-10 text-center text-white">
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                  <Sparkles className="h-4 w-4 text-white/80" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                    SaCC Alumni Portal
                  </span>
                </div>

                <img src={ustpLogo} alt="SaCC" className="mx-auto mt-2 h-auto w-28 object-contain sm:w-32" />
              </div>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <div className="mb-4 text-center">
                <h1 className="mx-auto max-w-[18rem] text-lg font-extrabold leading-snug text-black sm:max-w-xs sm:text-[1.45rem]">
                  Alumni Engagement and Contribution Analysis
                </h1>
              </div>

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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,hsl(345_65%_28%),hsl(345_52%_36%))] px-8 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_rgba(91,18,36,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {loading ? "Signing in..." : "Log In"}
                </button>
              </form>

              <p className="mt-4 border-t border-slate-200 pt-3 text-center text-xs font-medium text-slate-600">Use your alumni ID or email.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
