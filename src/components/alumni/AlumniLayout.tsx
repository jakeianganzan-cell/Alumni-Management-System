import { ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import NotificationBell from "@/components/NotificationBell";
import { resolveAssetUrl } from "@/lib/api";
import {
  Calendar,
  ChevronDown,
  FileText,
  Heart,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Trophy,
  User,
  X,
} from "lucide-react";
import ustpLogo from "@/assets/salay.png";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/alumni" },
  { icon: Trophy, label: "Achievements", path: "/alumni/achievements" },
  { icon: MessageSquareText, label: "Freedom Wall", path: "/alumni/community" },
  { icon: Calendar, label: "Announcements", path: "/alumni/announcements" },

  { icon: FileText, label: "Graduate Tracer", path: "/alumni/tracer" },
  { icon: Heart, label: "Make a Donation", path: "/alumni/donate" },
  { icon: Info, label: "About Us", path: "/alumni/about" },
];

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/alumni") {
    return currentPath === "/alumni";
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export default function AlumniLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const profilePhoto = resolveAssetUrl(profile?.photo);
  const visibleNavItems = isMobile ? NAV_ITEMS.filter((item) => item.path !== "/alumni/about") : NAV_ITEMS;
  const mobileHeaderTitle = title === "Salay Community College" ? "" : title;

  const handleLogout = () => {
    signOut();
    navigate("/");
  };

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
        <span className="portal-tag mt-2">
          {profile?.course || "Alumni"} - Batch {profile?.batch || "N/A"}
        </span>
      </div>

      <div className="px-4 pb-1 pt-4">
        <p className="portal-sidebar-section">
          Menu
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {visibleNavItems.map((item) => {
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
          {isMobile ? (
            <button
              type="button"
              onClick={() => navigate("/alumni")}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm"
              aria-label="Go to alumni dashboard"
            >
              <img src={ustpLogo} alt="SaCC" className="h-8 w-8 object-contain" />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="portal-header-button lg:hidden">
              <Menu className="h-6 w-6" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {(!isMobile || mobileHeaderTitle) && (
              <h1 className={`truncate font-bold leading-tight text-white ${isMobile ? "text-sm" : "text-base"}`}>
                {isMobile ? mobileHeaderTitle : title}
              </h1>
            )}
            {subtitle && !isMobile && <p className="text-xs text-white">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                type="button"
                onClick={() => navigate("/alumni/donate")}
                className="relative rounded-lg p-2 text-white transition-colors hover:bg-white/15"
                aria-label="Make a donation"
              >
                <Heart className="h-5 w-5 text-white" />
              </button>
            )}
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
                      <p className="truncate text-sm font-bold text-foreground">{profile?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile?.course || "Alumni"} - Batch {profile?.batch || "N/A"}
                      </p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          navigate("/alumni/account");
                          setAccountMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                      >
                        <User className="h-4 w-4 text-muted-foreground" /> My Profile
                      </button>
                      {isMobile && (
                        <button
                          onClick={() => {
                            navigate("/alumni/about");
                            setAccountMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                        >
                          <Info className="h-4 w-4 text-muted-foreground" /> About Us
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
            {NAV_ITEMS.slice(0, 5).map((tab) => {
              const active = isActivePath(location.pathname, tab.path);
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors"
                  style={{ color: active ? "hsl(0,100%,17%)" : "hsl(0,0%,55%)" }}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="max-w-full truncate text-[10px] font-semibold">{tab.label.split(" ")[0]}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
