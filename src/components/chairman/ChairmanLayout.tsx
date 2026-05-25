import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEPARTMENT_LABELS, Department } from "@/lib/rbac";
import {
  LayoutDashboard, Users, LogOut, Menu, X, LineChart,
  ChevronDown, User, Megaphone, Award, MessageSquare
} from "lucide-react";
import ustpLogo from "@/assets/salay.png";

interface ChairmanLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/chairman" },
  { icon: Users, label: "Alumni Records", path: "/chairman/alumni" },
  { icon: LineChart, label: "Engagement", path: "/chairman/engagement" },
  { icon: Megaphone, label: "Announcements", path: "/chairman/announcements" },
  { icon: Award, label: "Achievements", path: "/chairman/achievements" },
  { icon: MessageSquare, label: "Freedom Wall", path: "/chairman/community" },
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

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="portal-sidebar flex h-full flex-col border-r border-white/20">
      {mobile && (
        <div className="flex justify-end px-3 pt-3">
          <button onClick={() => setSidebarOpen(false)} className="portal-header-button">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex flex-col items-center px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
        <div className="portal-logo-frame">
          <img src={ustpLogo} alt="SaCC" />
        </div>
        <div className="mt-2">
          <h3 className="text-white text-sm font-bold text-center">Alumni Federation</h3>
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
        <p className="portal-sidebar-muted">Welcome Back!</p>
        <p className="text-sm font-bold text-white truncate">{profile?.name}</p>
        <span className="portal-tag mt-2">
          {departmentLabel}
        </span>
      </div>

      <div className="px-4 pt-4 pb-1">
        <p className="portal-sidebar-section">
          Menu
        </p>
      </div>

      <nav className="flex-1 px-2 pb-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || (item.path !== "/chairman" && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); if (mobile) setSidebarOpen(false); }}
              className={`portal-sidebar-item ${active ? "active" : ""}`}
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
    <div className="portal-shell flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-56 flex-shrink-0 flex-col relative z-[60] shadow-xl">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-[18rem] max-w-[82vw] flex flex-col shadow-2xl">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="portal-layout-body">
        {/* Top Nav */}
        <header
          className="portal-header sticky top-0 z-40 flex flex-shrink-0 items-center gap-3 border-b border-white/15 px-3 py-2.5 shadow-[0_12px_28px_rgba(58,0,0,0.20)] sm:px-4 sm:py-3"
          style={{ color: "white" }}
        >
          <button onClick={() => setSidebarOpen(true)} className="portal-header-button lg:hidden">
            <Menu className="w-6 h-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-white">{title}</h1>
            {subtitle && <p className="hidden text-xs text-white sm:block">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {/* Manage Account dropdown */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(o => !o)}
                className="portal-account-button"
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{profile?.name?.[0]}</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-white leading-none">Manage Account</p>
                  <p className="text-sm font-bold text-white leading-tight uppercase">{profile?.name?.split(" ")[0]}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-white hidden sm:block transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
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
        <main className="portal-main">
          {children}
        </main>
      </div>
    </div>
  );
}
