import { QueryClient } from "@tanstack/react-query";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const QUERY_CACHE_POLICY = {
  live: { staleTime: 15 * SECOND, gcTime: 5 * MINUTE },
  user: { staleTime: 60 * SECOND, gcTime: 15 * MINUTE },
  standard: { staleTime: 2 * MINUTE, gcTime: 30 * MINUTE },
  reference: { staleTime: 15 * MINUTE, gcTime: 60 * MINUTE },
  sensitive: { staleTime: 0, gcTime: 2 * MINUTE },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_CACHE_POLICY.user.staleTime,
      gcTime: QUERY_CACHE_POLICY.user.gcTime,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const clearAuthenticatedQueryCache = () => {
  queryClient.removeQueries({ queryKey: ["auth"] });
};
