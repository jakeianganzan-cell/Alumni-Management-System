import type { AppRole } from "@/hooks/useAuth";

export const routeModules = {
  login: () => import("@/pages/Login"),
  notFound: () => import("@/pages/NotFound"),
  adminDashboard: () => import("@/pages/admin/Dashboard"),
  adminAlumni: () => import("@/pages/admin/Alumni"),
  adminTracer: () => import("@/pages/admin/GraduateTracer"),
  adminEngagement: () => import("@/pages/admin/Engagement"),
  adminCommunity: () => import("@/pages/admin/Community"),
  adminAchievements: () => import("@/pages/admin/Achievements"),
  adminAnnouncements: () => import("@/pages/admin/Announcements"),
  adminDonations: () => import("@/pages/admin/Donations"),
  adminNotifications: () => import("@/pages/admin/Notifications"),
  adminAccount: () => import("@/pages/admin/Account"),
  accessDenied: () => import("@/pages/admin/AccessDenied"),
  officerBundles: () => import("@/components/admin/OfficerBundlesModule"),
  alumniDashboard: () => import("@/pages/alumni/Dashboard"),
  alumniAccount: () => import("@/pages/alumni/Account"),
  alumniTracer: () => import("@/pages/alumni/Tracer"),
  alumniDonate: () => import("@/pages/alumni/Donate"),
  alumniAbout: () => import("@/pages/alumni/AboutUs"),
  alumniCommunity: () => import("@/pages/alumni/Community"),
  alumniAchievements: () => import("@/pages/alumni/Achievements"),
  alumniAnnouncements: () => import("@/pages/alumni/Announcements"),
  chairmanDashboard: () => import("@/pages/chairman/Dashboard"),
  chairmanAlumni: () => import("@/pages/chairman/Alumni"),
  chairmanTracer: () => import("@/pages/chairman/GraduateTracer"),
  chairmanAccount: () => import("@/pages/chairman/Account"),
  chairmanEngagement: () => import("@/pages/chairman/Engagement"),
  chairmanAnnouncements: () => import("@/pages/chairman/Announcements"),
  chairmanAchievements: () => import("@/pages/chairman/Achievements"),
  chairmanCommunity: () => import("@/pages/chairman/Community"),
} as const;

const commonModulesByRole: Partial<Record<AppRole, Array<() => Promise<unknown>>>> = {
  alumni: [routeModules.alumniDashboard, routeModules.alumniAnnouncements, routeModules.alumniAchievements, routeModules.alumniCommunity, routeModules.alumniDonate],
  chairman: [routeModules.chairmanDashboard, routeModules.chairmanAlumni, routeModules.chairmanTracer, routeModules.chairmanAnnouncements],
  admin: [routeModules.adminDashboard, routeModules.adminAlumni, routeModules.adminAnnouncements, routeModules.adminDonations],
  vice_president: [routeModules.adminDashboard, routeModules.adminAlumni, routeModules.adminAnnouncements],
  secretary: [routeModules.adminDashboard, routeModules.adminAlumni, routeModules.adminAnnouncements],
  assistant_secretary: [routeModules.adminDashboard, routeModules.adminAlumni, routeModules.adminAnnouncements],
  treasurer: [routeModules.adminDashboard, routeModules.adminDonations],
  assistant_treasurer: [routeModules.adminDashboard, routeModules.adminDonations],
  auditor: [routeModules.adminDashboard, routeModules.adminDonations],
  pio: [routeModules.adminDashboard, routeModules.adminAnnouncements, routeModules.adminAchievements, routeModules.adminCommunity],
  appointed: [routeModules.adminDashboard],
};

export const prefetchCommonRouteModules = (role: AppRole) => {
  commonModulesByRole[role]?.forEach((loadModule) => {
    void loadModule().catch(() => undefined);
  });
};
