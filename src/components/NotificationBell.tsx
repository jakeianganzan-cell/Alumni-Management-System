import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatApplicationDateTime } from "@/lib/applicationTime";
import { useAuth, type AppRole } from "@/hooks/useAuth";

const NOTIFICATION_REFRESH_INTERVAL_MS = 15_000;

const CHAIRMAN_NOTIFICATION_LINKS: Record<string, string> = {
  "/admin/alumni": "/chairman/alumni",
  "/admin/announcements": "/chairman/announcements",
  "/admin/achievements": "/chairman/achievements",
  "/admin/tracer": "/chairman/tracer",
  "/alumni/announcements": "/chairman/announcements",
  "/alumni/achievements": "/chairman/achievements",
  "/alumni/community": "/chairman/community",
};

const resolveNotificationLink = (linkUrl: string | null | undefined, role: AppRole | null) => {
  if (!linkUrl || role !== "chairman") return linkUrl;
  const path = linkUrl.split("?", 1)[0];
  if (CHAIRMAN_NOTIFICATION_LINKS[path]) return CHAIRMAN_NOTIFICATION_LINKS[path];
  return path.startsWith("/admin/") || path.startsWith("/alumni/") ? null : linkUrl;
};

interface UserNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface UserNotificationResponse {
  notifications: UserNotification[];
  unreadCount: number;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<UserNotificationResponse>({
    queryKey: ["user-notifications"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/user-notifications`, {
        headers: getAuthHeaders(),
      });

      return readApiResponse<UserNotificationResponse>(res);
    },
    refetchInterval: NOTIFICATION_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
  });

  const readMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`${API_URL}/user-notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      await readApiResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/user-notifications/read-all`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      await readApiResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const openNotification = async (notification: UserNotification) => {
    if (!notification.isRead) {
      await readMutation.mutateAsync(notification.id);
    }

    const destination = resolveNotificationLink(notification.linkUrl, role);
    if (destination) {
      navigate(destination);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="portal-header-button relative" type="button" aria-label="Open notifications">
          <Bell className="h-5 w-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-0.75rem))] p-0 max-[640px]:w-[min(300px,calc(100vw-0.75rem))] max-[640px]:max-h-[62dvh]" align="end">
        <div className="border-b border-border px-3 py-2 max-[640px]:px-2.5 max-[640px]:py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold leading-tight text-foreground max-[640px]:text-[11px]">Notifications</p>
              <p className="text-[10px] leading-tight text-muted-foreground max-[640px]:text-[9px]">
                {unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-[10px] max-[640px]:h-6 max-[640px]:text-[9px]"
              onClick={() => readAllMutation.mutate()}
              disabled={unreadCount === 0 || readAllMutation.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all
            </Button>
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto overscroll-contain max-[640px]:max-h-[calc(62dvh-48px)]">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground max-[640px]:px-2.5 max-[640px]:py-5 max-[640px]:text-[10px]">
              No notifications yet.
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => openNotification(notification)}
                className={`min-h-9 w-full border-b border-border px-3 py-2 text-left transition hover:bg-muted/40 max-[640px]:px-2.5 max-[640px]:py-1.5 ${
                  notification.isRead ? "bg-background" : "bg-rose-50/40"
                }`}
                type="button"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs font-semibold leading-4 text-foreground max-[640px]:text-[11px] max-[640px]:leading-[14px]">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground max-[640px]:text-[10px] max-[640px]:leading-[14px]">{notification.message}</p>
                    <p className="mt-1 text-[9px] uppercase leading-3 tracking-[0.08em] text-muted-foreground max-[640px]:text-[8px]">
                      {notification.category} | {formatApplicationDateTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
