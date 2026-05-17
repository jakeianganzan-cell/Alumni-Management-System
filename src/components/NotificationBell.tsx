import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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
    refetchInterval: 30000,
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

    if (notification.linkUrl) {
      navigate(notification.linkUrl);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-lg p-2 text-white transition-colors hover:bg-white/15" type="button">
          <Bell className="h-5 w-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-1.5rem))] p-0 max-[640px]:max-h-[52dvh] max-[640px]:w-[min(17rem,62vw)]" align="end">
        <div className="border-b border-border px-4 py-3 max-[640px]:px-3 max-[640px]:py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs max-[640px]:h-7 max-[640px]:px-1.5"
              onClick={() => readAllMutation.mutate()}
              disabled={unreadCount === 0 || readAllMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all
            </Button>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto max-[640px]:max-h-[calc(52dvh-58px)]">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground max-[640px]:px-3 max-[640px]:py-6 max-[640px]:text-xs">
              No notifications yet.
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => openNotification(notification)}
                className={`w-full border-b border-border px-4 py-3 text-left transition hover:bg-muted/40 max-[640px]:px-3 max-[640px]:py-2.5 ${
                  notification.isRead ? "bg-background" : "bg-rose-50/40"
                }`}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold text-foreground max-[640px]:text-xs">{notification.title}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground max-[640px]:leading-4">{notification.message}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground max-[640px]:text-[10px]">
                      {notification.category} | {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notification.isRead && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-rose-500" />}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
