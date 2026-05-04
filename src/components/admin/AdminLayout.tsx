import { ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { canAccessModule, type OfficerRole } from "@/lib/rbac";
import type { AdminModule } from "@/lib/rbac";
import { useIsMobile } from "@/hooks/use-mobile";
import NotificationBell from "@/components/NotificationBell";
import { resolveAssetUrl } from "@/lib/api";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ClipboardList,
  FileText,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Shield,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import ustpLogo from "@/assets/salay.png";

const ALL_NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin", module: "dashboard" },
  { icon: Users, label: "Alumni Records", path: "/admin/alumni", module: "alumni" },
  { icon: FileText, label: "Graduate Tracer", path: "/admin/tracer", module: "tracer" },
  { icon: BarChart3, label: "Engagement", path: "/admin/engagement", module: "engagement" },
  { icon: Trophy, label: "Achievements", path: "/admin/achievements", module: "achievements" },
  { icon: MessageSquareText, label: "Freedom Wall", path: "/admin/community", module: "community" },
  { icon: Calendar, label: "Announcements", path: "/admin/announcements", module: "events" },
  { icon: Heart, label: "Donations", path: "/admin/donations", module: "donations" },
  { icon: Mail, label: "Mailing", path: "/admin/notifications", module: "notifications" },
  { icon: ClipboardList, label: "Reports", path: "/admin/reports", module: "reports" },
] as const;

function isOfficerRole(role: AppRole | null): role is OfficerRole {
  return role !== null && role !== "alumni";
}

function getMobileBottomTabs(role: AppRole | null) {
  const tabs: Array<{ icon: typeof LayoutDashboard; label: string; path: string; module: AdminModule }> = [
    { icon: LayoutDashboard, label: "Home", path: "/admin", module: "dashboard" },
    { icon: Users, label: "Alumni", path: "/admin/alumni", module: "alumni" },
    { icon: Calendar, label: "News", path: "/admin/announcements", module: "events" },
    { icon: ClipboardList, label: "More", path: "/admin/reports", module: "reports" },
  ];
  if (!isOfficerRole(role)) return [];
  return tabs.filter((tab) => canAccessNavItem(role, tab.module, tab.path));
}

function canAccessNavItem(role: OfficerRole, module: AdminModule, path: string) {
  if (path === "/admin/announcements") {
    return canAccessModule(role, "events") || canAccessModule(role, "surveys");
  }

  return canAccessModule(role, module);
}

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  president: "President",
  vice_president: "Vice President",
  secretary: "Secretary",
  assistant_secretary: "Asst. Secretary",
  treasurer: "Treasurer",
  assistant_treasurer: "Asst. Treasurer",
  auditor: "Auditor",
  pio: "PIO",
  appointed: "Appointed",
};

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/admin") {
    return currentPath === "/admin";
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export default function AdminLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const profilePhoto = resolveAssetUrl(profile?.photo);

  const handleLogout = () => {
    signOut();
    navigate("/");
  };

  const navItems = isOfficerRole(role)
    ? ALL_NAV_ITEMS.filter((item) => canAccessNavItem(role, item.module, item.path))
    : [];
  const mobileTabs = getMobileBottomTabs(role);
  const roleLabel = role ? ROLE_LABELS[role] ?? role : "";

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className="portal-sidebar flex h-full flex-col border-r border-white/10"
    >
      {mobile && (
        <div className="flex justify-end px-3 pt-3">
          <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex flex-col items-center px-5 pb-5 pt-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <img src={ustpLogo} alt="SaCC" className="h-auto w-32 object-contain" />
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.45)" }}>
          Welcome Back!
        </p>
        <p className="truncate text-sm font-bold text-white">{profile?.name}</p>
        {roleLabel && (
          <span className="portal-tag mt-2">
            {roleLabel}
          </span>
        )}
      </div>

      <div className="px-4 pb-1 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          Control Center
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {navItems.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                if (mobile) setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-all duration-200"
              style={{
                background: active ? "linear-gradient(135deg, hsl(345 65% 30%), hsl(345 55% 38%))" : "transparent",
                color: active ? "white" : "rgba(255,255,255,0.65)",
              }}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="portal-shell flex h-screen overflow-hidden">
      {!isMobile && <div className="hidden w-64 flex-shrink-0 flex-col shadow-xl lg:flex"><Sidebar /></div>}

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-64 flex-col shadow-2xl">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="portal-header flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3 shadow-[0_14px_34px_rgba(91,18,36,0.18)]"
          style={{ color: "white" }}
        >
          <button onClick={() => setSidebarOpen(true)} className="text-white/80 hover:text-white lg:hidden">
            <Menu className={isMobile ? "h-5 w-5" : "h-6 w-6"} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className={`font-bold leading-tight text-white ${isMobile ? "text-sm" : "text-lg"}`}>{title}</h1>
            {subtitle && !isMobile && <p className="text-xs text-white/70">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
              >
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white/20">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt={profile?.name || "Profile"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">{profile?.name?.[0] || "A"}</span>
                  )}
                </div>
                {!isMobile && (
                  <>
                    <div>
                      <p className="text-[10px] leading-none text-white/60">Manage Account</p>
                      <p className="text-xs font-bold uppercase leading-tight text-white">{profile?.name?.split(" ")[0]}</p>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-white/60 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>

              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                    <div className="border-b border-border bg-muted/40 px-4 py-3">
                      <p className="truncate text-sm font-bold text-navy-dark">{profile?.name}</p>
                      {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          navigate("/admin/account");
                          setAccountMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                      >
                        <User className="h-4 w-4 text-muted-foreground" /> My Profile
                      </button>
                      {isOfficerRole(role) && canAccessModule(role, "officers") && (
                        <button
                          onClick={() => {
                            navigate("/admin/officers");
                            setAccountMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                        >
                          <Shield className="h-4 w-4 text-muted-foreground" /> Officers
                        </button>
                      )}
                      <div className="my-1 border-t border-border" />
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" /> Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto p-4 ${isMobile ? "pb-20" : "lg:p-6"}`}>{children}</main>

        {isMobile && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-card shadow-lg"
            style={{ borderColor: "hsl(220,20%,88%)", height: "60px" }}
          >
            {mobileTabs.slice(0, 5).map((tab) => {
              const active = isActivePath(location.pathname, tab.path);
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 transition-colors"
                  style={{ color: active ? "hsl(345,65%,30%)" : "hsl(0,0%,55%)" }}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
