import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

type DurationStatus = "Upcoming" | "Active" | "Completed" | "Archived" | string;

interface DurationBadgeProps {
  status?: DurationStatus | null;
  remainingTime?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  className?: string;
}

const statusClassName: Record<string, string> = {
  Upcoming: "border-amber-200 bg-amber-50 text-amber-800",
  Active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Completed: "border-slate-200 bg-slate-50 text-slate-700",
  Archived: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export default function DurationBadge({
  status,
  remainingTime,
  startDatetime,
  endDatetime,
  className,
}: DurationBadgeProps) {
  const normalizedStatus = status || "Active";
  const detail = remainingTime || buildFallbackDetail(normalizedStatus, startDatetime, endDatetime);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        statusClassName[normalizedStatus] || "border-slate-200 bg-slate-50 text-slate-700",
        className,
      )}
    >
      <Clock3 className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">
        {normalizedStatus}
        {detail ? ` • ${detail}` : ""}
      </span>
    </span>
  );
}

function buildFallbackDetail(status: string, startDatetime?: string | null, endDatetime?: string | null) {
  if (status === "Upcoming" && startDatetime) return `Starts ${formatDateTime(startDatetime)}`;
  if ((status === "Archived" || status === "Completed") && endDatetime) return `Ended ${formatDateTime(endDatetime)}`;
  if (endDatetime) return `Ends ${formatDateTime(endDatetime)}`;
  return "";
}

function formatDateTime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+08:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
