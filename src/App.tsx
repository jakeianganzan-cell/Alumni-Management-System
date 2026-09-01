import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { EventProvider } from "@/context/EventContext";
import { AnnouncementProvider } from "@/context/AnnouncementContext";
import { SystemSettingsProvider } from "@/context/SystemSettingsContext";
import { canAccessModule, type OfficerRole } from "@/lib/rbac";
import type { AdminModule } from "@/lib/rbac";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminAlumni = lazy(() => import("./pages/admin/Alumni"));
const AdminGraduateTracer = lazy(() => import("./pages/admin/GraduateTracer"));
const AdminEngagement = lazy(() => import("./pages/admin/Engagement"));
const AdminCommunity = lazy(() => import("./pages/admin/Community"));
const AdminAchievements = lazy(() => import("./pages/admin/Achievements"));
const AdminAnnouncements = lazy(() => import("./pages/admin/Announcements"));
const AdminDonations = lazy(() => import("./pages/admin/Donations"));
const AdminNotifications = lazy(() => import("./pages/admin/Notifications"));
const AdminAccount = lazy(() => import("./pages/admin/Account"));
const AccessDenied = lazy(() => import("./pages/admin/AccessDenied"));

// Alumni pages
const AlumniDashboard = lazy(() => import("./pages/alumni/Dashboard"));
const AlumniAccount = lazy(() => import("./pages/alumni/Account"));
const AlumniTracer = lazy(() => import("./pages/alumni/Tracer"));
const AlumniDonate = lazy(() => import("./pages/alumni/Donate"));
const AlumniAboutUs = lazy(() => import("./pages/alumni/AboutUs"));
const AlumniCommunity = lazy(() => import("./pages/alumni/Community"));
const AlumniAchievements = lazy(() => import("./pages/alumni/Achievements"));
const AlumniAnnouncements = lazy(() => import("./pages/alumni/Announcements"));

// Chairman pages
const ChairmanDashboard = lazy(() => import("./pages/chairman/Dashboard"));
const ChairmanAlumni = lazy(() => import("./pages/chairman/Alumni"));
const ChairmanAccount = lazy(() => import("./pages/chairman/Account"));
const ChairmanEngagement = lazy(() => import("./pages/chairman/Engagement"));
const ChairmanAnnouncements = lazy(() => import("./pages/chairman/Announcements"));
const ChairmanAchievements = lazy(() => import("./pages/chairman/Achievements"));
const ChairmanCommunity = lazy(() => import("./pages/chairman/Community"));

// Non-lazy component (small)
import OfficerBundlesModule from "./components/admin/OfficerBundlesModule";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  },
});

function isOfficerRole(role: string | null): role is OfficerRole {
  if (!role) return false;
  return role !== "alumni";
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-navy border-t-transparent rounded-full" />
    </div>
  );
}

function AdminRoute({ module, children }: { module: AdminModule; children: React.ReactNode }) {
  const { isAdmin, role, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!isAdmin) return <Navigate to="/" />;
  if (!isOfficerRole(role) || !canAccessModule(role, module)) return <AccessDenied />;
  return <>{children}</>;
}

function AlumniRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading, isTracerCompleted } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user || role !== "alumni") return <Navigate to="/" />;

  const isTracerPage = location.pathname === "/alumni/tracer";
  if (!isTracerCompleted && !isTracerPage) {
    return <Navigate to="/alumni/tracer" replace />;
  }

  return <>{children}</>;
}

function ChairmanRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user || role !== "chairman") return <Navigate to="/" />;
  return <>{children}</>;
}

function AuthRedirect() {
  const { user, isAdmin, role, loading, isTracerCompleted } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (user) {
    if (role === "chairman") return <Navigate to="/chairman" replace />;
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (role === "alumni") {
      return <Navigate to={isTracerCompleted ? "/alumni" : "/alumni/tracer"} replace />;
    }
  }

  return <Login />;
}

function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullScreenLoader />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PageSuspense><AuthRedirect /></PageSuspense>} />

      <Route path="/admin" element={<PageSuspense><AdminRoute module="dashboard"><AdminDashboard /></AdminRoute></PageSuspense>} />
      <Route path="/admin/alumni" element={<PageSuspense><AdminRoute module="alumni"><AdminAlumni /></AdminRoute></PageSuspense>} />
      <Route path="/admin/tracer" element={<PageSuspense><AdminRoute module="tracer"><AdminGraduateTracer /></AdminRoute></PageSuspense>} />
      <Route path="/admin/engagement" element={<PageSuspense><AdminRoute module="engagement"><AdminEngagement /></AdminRoute></PageSuspense>} />
      <Route path="/admin/projects" element={<Navigate to="/admin/engagement" replace />} />
      <Route path="/admin/jobs" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/community" element={<PageSuspense><AdminRoute module="community"><AdminCommunity /></AdminRoute></PageSuspense>} />
      <Route path="/admin/achievements" element={<PageSuspense><AdminRoute module="achievements"><AdminAchievements /></AdminRoute></PageSuspense>} />
      <Route path="/admin/announcements" element={<PageSuspense><AdminRoute module="dashboard"><AdminAnnouncements /></AdminRoute></PageSuspense>} />
      <Route path="/admin/surveys" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/donations" element={<PageSuspense><AdminRoute module="donations"><AdminDonations /></AdminRoute></PageSuspense>} />
      <Route path="/admin/events" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/reports" element={<PageSuspense><AdminRoute module="reports"><Navigate to="/admin/account?section=reports" replace /></AdminRoute></PageSuspense>} />
      <Route path="/admin/notifications" element={<PageSuspense><AdminRoute module="notifications"><AdminNotifications /></AdminRoute></PageSuspense>} />
      <Route path="/admin/officers" element={<PageSuspense><AdminRoute module="officers"><OfficerBundlesModule mode="directory" /></AdminRoute></PageSuspense>} />
      <Route path="/admin/officers/add" element={<PageSuspense><AdminRoute module="officers"><OfficerBundlesModule mode="add" /></AdminRoute></PageSuspense>} />
      <Route path="/admin/officers/bundles" element={<AdminRoute module="officers"><Navigate to="/admin/officers/add" replace /></AdminRoute>} />
      <Route path="/admin/officers/edit/:id" element={<AdminRoute module="officers"><Navigate to="/admin/officers" replace /></AdminRoute>} />
      <Route path="/admin/officers/view/:id" element={<AdminRoute module="officers"><Navigate to="/admin/officers" replace /></AdminRoute>} />
      <Route path="/admin/account" element={<PageSuspense><AdminRoute module="dashboard"><AdminAccount /></AdminRoute></PageSuspense>} />

      <Route path="/alumni" element={<PageSuspense><AlumniRoute><AlumniDashboard /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/jobs" element={<Navigate to="/alumni/announcements" replace />} />
      <Route path="/alumni/achievements" element={<PageSuspense><AlumniRoute><AlumniAchievements /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/community" element={<PageSuspense><AlumniRoute><AlumniCommunity /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/announcements" element={<PageSuspense><AlumniRoute><AlumniAnnouncements /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/announcements/:announcementId" element={<PageSuspense><AlumniRoute><AlumniAnnouncements /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/events" element={<Navigate to="/alumni/announcements" replace />} />
      <Route path="/alumni/events/:eventId" element={<PageSuspense><AlumniRoute><AlumniAnnouncements /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/account" element={<PageSuspense><AlumniRoute><AlumniAccount /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/tracers" element={<Navigate to="/alumni/tracer" replace />} />
      <Route path="/alumni/tracer" element={<PageSuspense><AlumniRoute><AlumniTracer /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/donate" element={<PageSuspense><AlumniRoute><AlumniDonate /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/about" element={<Navigate to="/alumni/about/institution" replace />} />
      <Route path="/alumni/about/institution" element={<PageSuspense><AlumniRoute><AlumniAboutUs /></AlumniRoute></PageSuspense>} />
      <Route path="/alumni/about/academics-alumni" element={<PageSuspense><AlumniRoute><AlumniAboutUs /></AlumniRoute></PageSuspense>} />

      <Route path="/chairman" element={<PageSuspense><ChairmanRoute><ChairmanDashboard /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/alumni" element={<PageSuspense><ChairmanRoute><ChairmanAlumni /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/account" element={<PageSuspense><ChairmanRoute><ChairmanAccount /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/engagement" element={<PageSuspense><ChairmanRoute><ChairmanEngagement /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/announcements" element={<PageSuspense><ChairmanRoute><ChairmanAnnouncements /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/achievements" element={<PageSuspense><ChairmanRoute><ChairmanAchievements /></ChairmanRoute></PageSuspense>} />
      <Route path="/chairman/community" element={<PageSuspense><ChairmanRoute><ChairmanCommunity /></ChairmanRoute></PageSuspense>} />

      <Route path="*" element={<PageSuspense><NotFound /></PageSuspense>} />
    </Routes>
  );
}

const App = () => (
  <SystemSettingsProvider>
    <AuthProvider>
      <AnnouncementProvider>
        <EventProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AppRoutes />
              </BrowserRouter>
            </TooltipProvider>
          </QueryClientProvider>
        </EventProvider>
      </AnnouncementProvider>
    </AuthProvider>
  </SystemSettingsProvider>
);

export default App;
