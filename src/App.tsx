import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SystemSettingsProvider } from "@/context/SystemSettingsContext";
import { canAccessModule, type OfficerRole } from "@/lib/rbac";
import type { AdminModule } from "@/lib/rbac";
import { queryClient, QUERY_CACHE_POLICY } from "@/lib/queryClient";
import { appQueryKeys, authenticatedQueryOptions } from "@/lib/appQueries";
import { prefetchCommonRouteModules, routeModules } from "@/lib/routePrefetch";

// Lazy-loaded page components for code splitting
const Login = lazy(routeModules.login);
const NotFound = lazy(routeModules.notFound);

// Admin pages
const AdminDashboard = lazy(routeModules.adminDashboard);
const AdminAlumni = lazy(routeModules.adminAlumni);
const AdminGraduateTracer = lazy(routeModules.adminTracer);
const AdminEngagement = lazy(routeModules.adminEngagement);
const AdminCommunity = lazy(routeModules.adminCommunity);
const AdminAchievements = lazy(routeModules.adminAchievements);
const AdminAnnouncements = lazy(routeModules.adminAnnouncements);
const AdminDonations = lazy(routeModules.adminDonations);
const AdminNotifications = lazy(routeModules.adminNotifications);
const AdminAccount = lazy(routeModules.adminAccount);
const AccessDenied = lazy(routeModules.accessDenied);

// Alumni pages
const AlumniDashboard = lazy(routeModules.alumniDashboard);
const AlumniAccount = lazy(routeModules.alumniAccount);
const AlumniTracer = lazy(routeModules.alumniTracer);
const AlumniDonate = lazy(routeModules.alumniDonate);
const AlumniAboutUs = lazy(routeModules.alumniAbout);
const AlumniCommunity = lazy(routeModules.alumniCommunity);
const AlumniAchievements = lazy(routeModules.alumniAchievements);
const AlumniAnnouncements = lazy(routeModules.alumniAnnouncements);

// Chairman pages
const ChairmanDashboard = lazy(routeModules.chairmanDashboard);
const ChairmanAlumni = lazy(routeModules.chairmanAlumni);
const ChairmanGraduateTracer = lazy(routeModules.chairmanTracer);
const ChairmanAccount = lazy(routeModules.chairmanAccount);
const ChairmanEngagement = lazy(routeModules.chairmanEngagement);
const ChairmanAnnouncements = lazy(routeModules.chairmanAnnouncements);
const ChairmanAchievements = lazy(routeModules.chairmanAchievements);
const ChairmanCommunity = lazy(routeModules.chairmanCommunity);

import { CircularLoadingProgress } from "@/components/ui/loading-progress";

const OfficerBundlesModule = lazy(routeModules.officerBundles);

function isOfficerRole(role: string | null): role is OfficerRole {
  if (!role) return false;
  return role !== "alumni";
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <CircularLoadingProgress label="Loading" />
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
  return <Suspense fallback={<div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-muted"><div className="h-full w-2/3 animate-pulse bg-navy" /></div>}>{children}</Suspense>;
}

function PostLoginPrefetch() {
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || !role) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const timer = window.setTimeout(() => {
      prefetchCommonRouteModules(role);

      void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({
        queryKey: appQueryKeys.notifications(user.id),
        path: "/user-notifications",
        policy: QUERY_CACHE_POLICY.live,
      }));

      if (role === "alumni") {
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.alumniSlideshowFirst(user.id), path: "/slideshow?limit=1", policy: QUERY_CACHE_POLICY.standard }));
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.alumniDashboard(user.id), path: "/alumni/dashboard?includeSlideshow=false", policy: QUERY_CACHE_POLICY.user }));
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.announcements(user.id), path: "/announcements", policy: QUERY_CACHE_POLICY.standard }));
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.surveys(user.id), path: "/surveys", policy: QUERY_CACHE_POLICY.standard }));
      } else if (role === "chairman") {
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.chairmanDashboard(user.id), path: "/chairman/dashboard", policy: QUERY_CACHE_POLICY.user }));
      } else {
        void queryClient.prefetchQuery(authenticatedQueryOptions<unknown>({ queryKey: appQueryKeys.adminDashboard(user.id), path: "/admin/dashboard", policy: QUERY_CACHE_POLICY.live }));
      }
    }, 750);

    return () => window.clearTimeout(timer);
  }, [loading, role, user]);

  return null;
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
      <Route path="/admin/contributions" element={<PageSuspense><AdminRoute module="donations"><AdminDonations /></AdminRoute></PageSuspense>} />
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
      <Route path="/chairman/tracer" element={<PageSuspense><ChairmanRoute><ChairmanGraduateTracer /></ChairmanRoute></PageSuspense>} />
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PostLoginPrefetch />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </SystemSettingsProvider>
);

export default App;
