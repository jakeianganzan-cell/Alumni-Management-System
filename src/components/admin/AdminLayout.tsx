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
] as const;

function isOfficerRole(role: AppRole | null): role is OfficerRole {
  return role !== null && role !== "alumni";
}

function getMobileBottomTabs(role: AppRole | null) {
  const tabs: Array<{ icon: typeof LayoutDashboard; label: string; path: string; module: AdminModule }> = [
    { icon: LayoutDashboard, label: "Home", path: "/admin", module: "dashboard" },
    { icon: Users, label: "Alumni", path: "/admin/alumni", module: "alumni" },
    { icon: Calendar, label: "News", path: "/admin/announcements", module: "events" },
    { icon: ClipboardList, label: "Reports", path: "/admin/account?section=reports", module: "reports" },
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
  const normalizedItemPath = itemPath.split("?")[0];

  if (normalizedItemPath === "/admin") {
    return currentPath === "/admin";
  }

  return currentPath === normalizedItemPath || currentPath.startsWith(`${normalizedItemPath}/`);
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
    <div className="portal-sidebar flex h-full flex-col border-r border-white/20">
      {mobile && (
        <div className="flex justify-end px-3 pt-3">
          <button onClick={() => setSidebarOpen(false)} className="portal-header-button">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex flex-col items-center px-5 pb-5 pt-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
        <div className="portal-logo-frame">
          <img src={ustpLogo} alt="SaCC" />
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
        <p className="portal-sidebar-muted">
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
        <p className="portal-sidebar-section">
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
              className={`portal-sidebar-item ${active ? "active" : ""}`}
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
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-[19rem] max-w-[88vw] flex-col shadow-2xl sm:max-w-[82vw]">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="portal-layout-body">
        <header
          className="portal-header sticky top-0 z-40 flex flex-shrink-0 items-center gap-3 border-b border-white/15 px-3 py-2.5 shadow-[0_12px_28px_rgba(58,0,0,0.20)] sm:px-4 sm:py-3"
          style={{ color: "white" }}
        >
          <button onClick={() => setSidebarOpen(true)} className="portal-header-button lg:hidden">
            <Menu className={isMobile ? "h-5 w-5" : "h-6 w-6"} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className={`font-bold leading-tight text-white ${isMobile ? "text-sm" : "text-base"}`}>{title}</h1>
            {subtitle && !isMobile && <p className="text-xs text-white">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="portal-account-button"
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
                      <p className="text-[10px] leading-none text-white">Manage Account</p>
                      <p className="text-xs font-bold uppercase leading-tight text-white">{profile?.name?.split(" ")[0]}</p>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-white transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>

              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-[min(14rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
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
                      {isOfficerRole(role) && canAccessModule(role, "reports") && (
                        <button
                          onClick={() => {
                            navigate("/admin/account?section=reports");
                            setAccountMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                        >
                          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Reports
                        </button>
                      )}
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

        <main className={`portal-main ${isMobile ? "pb-20" : ""}`}>{children}</main>

        {isMobile && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t bg-card shadow-lg"
            style={{ borderColor: "hsl(220,20%,88%)", minHeight: "64px" }}
          >
            {mobileTabs.slice(0, 5).map((tab) => {
              const active = isActivePath(location.pathname, tab.path);
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors"
                  style={{ color: active ? "hsl(0,100%,17%)" : "hsl(0,0%,55%)" }}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="max-w-full truncate text-[10px] font-semibold">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
