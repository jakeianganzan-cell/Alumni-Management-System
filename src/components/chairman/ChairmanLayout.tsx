import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEPARTMENT_LABELS, Department } from "@/lib/rbac";
import {
  LayoutDashboard, Users, LogOut, Menu, X, LineChart,
  ChevronDown, User
} from "lucide-react";
import ustpLogo from "@/assets/salay.png";

interface ChairmanLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/chairman" },
  { icon: Users, label: "My Alumni", path: "/chairman/alumni" },
  { icon: LineChart, label: "Engagement", path: "/chairman/engagement" },
] as const;

export default function ChairmanLayout({ children, title, subtitle }: ChairmanLayoutProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const handleLogout = () => { signOut(); navigate("/"); };

  const department = profile?.course && profile.course in DEPARTMENT_LABELS
    ? (profile.course as Department)
    : null;
  const departmentLabel = department ? DEPARTMENT_LABELS[department] : "Department";

  // Get color based on department
  const getDepartmentColor = () => {
    switch (department) {
      case "BTLED": return "bg-emerald-600";
      case "BECED": return "bg-sky-600";
      case "BS ENTREP": return "bg-amber-500";
      case "BSM": return "bg-rose-600";
      default: return "bg-navy";
    }
  };

  const deptColor = getDepartmentColor();

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full" style={{ background: "hsl(228,55%,14%)" }}>
      {mobile && (
        <div className="flex justify-end px-3 pt-3">
          <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex flex-col items-center px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <img src={ustpLogo} alt="USTP Alumni Federation"
          className="w-32 h-auto object-contain" />
        <div className="mt-2">
          <h3 className="text-white text-sm font-bold text-center">Alumni Federation</h3>
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Welcome Back!</p>
        <p className="text-sm font-bold text-white truncate">{profile?.name}</p>
        <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${deptColor}`}>
          {departmentLabel}
        </span>
      </div>

      <div className="px-4 pt-4 pb-1">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
          Menu
        </p>
      </div>

      <nav className="flex-1 px-2 pb-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); if (mobile) setSidebarOpen(false); }}
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? deptColor : "transparent",
                color: active ? "white" : "rgba(255,255,255,0.65)",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "hsl(258, 65%, 55%)"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; } }}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(220,20%,95%)" }}>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-56 flex-shrink-0 flex-col relative z-[60] shadow-xl">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-60 flex flex-col shadow-2xl">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header
          className="sticky top-0 z-40 px-5 py-3 flex items-center gap-4 flex-shrink-0"
          style={{ background: "hsl(258, 65%, 55%)", color: "white" }}
        >
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-white/80 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-lg leading-tight text-white">{title}</h1>
            {subtitle && <p className="text-white/70 text-xs">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {/* Manage Account dropdown */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(o => !o)}
                className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{profile?.name?.[0]}</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-white/60 leading-none">Manage Account</p>
                  <p className="text-sm font-bold text-white leading-tight uppercase">{profile?.name?.split(" ")[0]}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/60 hidden sm:block transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Dropdown */}
              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-xl border border-border shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-muted/40 border-b border-border">
                      <p className="text-sm font-bold text-navy-dark truncate">{profile?.name}</p>
                      <p className="text-xs text-muted-foreground">{departmentLabel}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          navigate("/chairman/account");
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        My Profile
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-medium"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
