import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { EventProvider } from "@/context/EventContext";
import { AnnouncementProvider } from "@/context/AnnouncementContext";
import { canAccessModule, type OfficerRole } from "@/lib/rbac";
import type { AdminModule } from "@/lib/rbac";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminAlumni from "./pages/admin/Alumni";
import AdminGraduateTracer from "./pages/admin/GraduateTracer";
import AdminEngagement from "./pages/admin/Engagement";
import AdminCommunity from "./pages/admin/Community";
import AdminAchievements from "./pages/admin/Achievements";
import AdminAnnouncements from "./pages/admin/Announcements";
import AlumniAnnouncements from "./pages/alumni/Announcements";
import AdminDonations from "./pages/admin/Donations";
import AdminNotifications from "./pages/admin/Notifications";
import AdminOfficers from "./pages/admin/Officers";
import AdminAccount from "./pages/admin/Account";
import AccessDenied from "./pages/admin/AccessDenied";
import AlumniDashboard from "./pages/alumni/Dashboard";
import AlumniAccount from "./pages/alumni/Account";
import AlumniTracer from "./pages/alumni/Tracer";
import AlumniDonate from "./pages/alumni/Donate";
import AlumniAboutUs from "./pages/alumni/AboutUs";
import AlumniCommunity from "./pages/alumni/Community";
import AlumniAchievements from "./pages/alumni/Achievements";
import ChairmanDashboard from "./pages/chairman/Dashboard";
import ChairmanAlumni from "./pages/chairman/Alumni";
import ChairmanAccount from "./pages/chairman/Account";
import ChairmanEngagement from "./pages/chairman/Engagement";
import ChairmanAnnouncements from "./pages/chairman/Announcements";
import ChairmanAchievements from "./pages/chairman/Achievements";
import ChairmanCommunity from "./pages/chairman/Community";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function isOfficerRole(role: string | null): role is OfficerRole {
  if (!role) return false;
  return role !== "alumni";
}

function FullScreenLoader() {
  return <div className="flex h-screen items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-navy border-t-transparent rounded-full" /></div>;
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AuthRedirect />} />

      <Route path="/admin" element={<AdminRoute module="dashboard"><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/alumni" element={<AdminRoute module="alumni"><AdminAlumni /></AdminRoute>} />
      <Route path="/admin/tracer" element={<AdminRoute module="tracer"><AdminGraduateTracer /></AdminRoute>} />
      <Route path="/admin/engagement" element={<AdminRoute module="engagement"><AdminEngagement /></AdminRoute>} />
      <Route path="/admin/jobs" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/community" element={<AdminRoute module="community"><AdminCommunity /></AdminRoute>} />
      <Route path="/admin/achievements" element={<AdminRoute module="achievements"><AdminAchievements /></AdminRoute>} />
      <Route path="/admin/announcements" element={<AdminRoute module="dashboard"><AdminAnnouncements /></AdminRoute>} />
      <Route path="/admin/surveys" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/donations" element={<AdminRoute module="donations"><AdminDonations /></AdminRoute>} />
      <Route path="/admin/events" element={<Navigate to="/admin/announcements" replace />} />
      <Route path="/admin/reports" element={<AdminRoute module="reports"><Navigate to="/admin/account?section=reports" replace /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute module="notifications"><AdminNotifications /></AdminRoute>} />
      <Route path="/admin/officers" element={<AdminRoute module="officers"><AdminOfficers /></AdminRoute>} />
      <Route path="/admin/account" element={<AdminRoute module="dashboard"><AdminAccount /></AdminRoute>} />

      <Route path="/alumni" element={<AlumniRoute><AlumniDashboard /></AlumniRoute>} />
      <Route path="/alumni/jobs" element={<Navigate to="/alumni/announcements" replace />} />
      <Route path="/alumni/achievements" element={<AlumniRoute><AlumniAchievements /></AlumniRoute>} />
      <Route path="/alumni/community" element={<AlumniRoute><AlumniCommunity /></AlumniRoute>} />
      <Route path="/alumni/announcements" element={<AlumniRoute><AlumniAnnouncements /></AlumniRoute>} />
      <Route path="/alumni/announcements/:announcementId" element={<AlumniRoute><AlumniAnnouncements /></AlumniRoute>} />
      <Route path="/alumni/events" element={<Navigate to="/alumni/announcements" replace />} />
      <Route path="/alumni/events/:eventId" element={<AlumniRoute><AlumniAnnouncements /></AlumniRoute>} />
      <Route path="/alumni/account" element={<AlumniRoute><AlumniAccount /></AlumniRoute>} />
      <Route path="/alumni/tracers" element={<Navigate to="/alumni/tracer" replace />} />
      <Route path="/alumni/tracer" element={<AlumniRoute><AlumniTracer /></AlumniRoute>} />
      <Route path="/alumni/donate" element={<AlumniRoute><AlumniDonate /></AlumniRoute>} />
      <Route path="/alumni/about" element={<AlumniRoute><AlumniAboutUs /></AlumniRoute>} />

      <Route path="/chairman" element={<ChairmanRoute><ChairmanDashboard /></ChairmanRoute>} />
      <Route path="/chairman/alumni" element={<ChairmanRoute><ChairmanAlumni /></ChairmanRoute>} />
      <Route path="/chairman/account" element={<ChairmanRoute><ChairmanAccount /></ChairmanRoute>} />
      <Route path="/chairman/engagement" element={<ChairmanRoute><ChairmanEngagement /></ChairmanRoute>} />
      <Route path="/chairman/announcements" element={<ChairmanRoute><ChairmanAnnouncements /></ChairmanRoute>} />
      <Route path="/chairman/achievements" element={<ChairmanRoute><ChairmanAchievements /></ChairmanRoute>} />
      <Route path="/chairman/community" element={<ChairmanRoute><ChairmanCommunity /></ChairmanRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
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
);

export default App;
