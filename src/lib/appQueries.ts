import { queryOptions, type QueryKey } from "@tanstack/react-query";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse } from "@/lib/api";
import { QUERY_CACHE_POLICY } from "@/lib/queryClient";

export const appQueryKeys = {
  notifications: (userId: string) => ["auth", userId, "notifications"] as const,
  alumniDashboard: (userId: string) => ["auth", userId, "alumni-dashboard"] as const,
  alumniSlideshowFirst: (userId: string) => ["auth", userId, "alumni-slideshow", "first"] as const,
  alumniSlideshowRemaining: (userId: string) => ["auth", userId, "alumni-slideshow", "remaining"] as const,
  announcements: (userId: string) => ["auth", userId, "announcements"] as const,
  announcementInterests: (userId: string, announcementId?: string) => ["auth", userId, "admin-announcement-interests", announcementId] as const,
  announcementComments: (userId: string, announcementId?: string) => ["auth", userId, "admin-announcement-comments", announcementId] as const,
  surveys: (userId: string) => ["auth", userId, "surveys"] as const,
  achievements: (userId: string) => ["auth", userId, "achievements"] as const,
  communityPosts: (userId: string) => ["auth", userId, "community-posts"] as const,
  donationSettings: () => ["donation-settings"] as const,
  donationHistory: (userId: string) => ["auth", userId, "donation-history"] as const,
  adminDashboard: (userId: string) => ["auth", userId, "admin-dashboard"] as const,
  chairmanDashboard: (userId: string) => ["auth", userId, "chairman-dashboard"] as const,
  chairmanAlumni: (userId: string) => ["auth", userId, "chairman-alumni"] as const,
  chairmanEngagement: (userId: string) => ["auth", userId, "chairman-engagement"] as const,
  adminFreedomWall: (userId: string) => ["auth", userId, "admin-freedom-wall"] as const,
  adminEngagement: (userId: string) => ["auth", userId, "admin-engagement"] as const,
  adminTracer: (userId: string, filters: string) => ["auth", userId, "admin-tracer", filters] as const,
  adminTracerAnalytics: (userId: string) => ["auth", userId, "admin-tracer-analytics"] as const,
  adminDonations: (userId: string) => ["auth", userId, "admin-donations"] as const,
  adminDonationSummary: (userId: string) => ["auth", userId, "admin-donation-summary"] as const,
  adminContributionSubmissions: (userId: string) => ["auth", userId, "admin-contribution-submissions"] as const,
  adminMailLogs: (userId: string) => ["auth", userId, "admin-mail-logs"] as const,
  adminMailFilters: (userId: string) => ["auth", userId, "admin-mail-filters"] as const,
  adminMailRecipients: (userId: string, filters: string) => ["auth", userId, "admin-mail-recipients", filters] as const,
  adminProfilesRoot: (userId: string) => ["auth", userId, "admin-profiles"] as const,
  adminProfiles: (userId: string, filters: string) => ["auth", userId, "admin-profiles", filters] as const,
  graduationBatches: (userId: string) => ["auth", userId, "graduation-batches"] as const,
  adminSlideshow: (userId: string) => ["auth", userId, "admin-slideshow"] as const,
  accountSettings: (userId: string) => ["auth", userId, "account-settings"] as const,
  aboutPage: () => ["about-page"] as const,
  adminAbout: (userId: string, contentType: string) => ["auth", userId, "admin-about", contentType] as const,
  adminSessions: (userId: string) => ["auth", userId, "admin-sessions"] as const,
  emailQueueSettings: (userId: string) => ["auth", userId, "email-queue-settings"] as const,
};

export const fetchAuthenticatedJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetchApi(`${API_URL}${path}`, { headers: getAuthHeaders(), signal });
  return readApiResponse<T>(response);
};

export const authenticatedQueryOptions = <T>({
  queryKey,
  path,
  policy = QUERY_CACHE_POLICY.user,
  refetchInterval,
}: {
  queryKey: QueryKey;
  path: string;
  policy?: { staleTime: number; gcTime: number };
  refetchInterval?: number | false;
}) => queryOptions<T>({
  queryKey,
  queryFn: ({ signal }) => fetchAuthenticatedJson<T>(path, signal),
  staleTime: policy.staleTime,
  gcTime: policy.gcTime,
  refetchInterval,
  refetchIntervalInBackground: false,
});
