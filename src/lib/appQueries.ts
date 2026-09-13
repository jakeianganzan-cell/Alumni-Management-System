import { queryOptions, type QueryKey } from "@tanstack/react-query";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
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
};

export const fetchAuthenticatedJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, { headers: getAuthHeaders() });
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
  queryFn: () => fetchAuthenticatedJson<T>(path),
  staleTime: policy.staleTime,
  gcTime: policy.gcTime,
  refetchInterval,
  refetchIntervalInBackground: false,
});
