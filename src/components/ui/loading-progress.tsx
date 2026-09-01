import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingProgressProps {
  label?: string;
  className?: string;
  compact?: boolean;
}

export function LoadingProgress({ label = "Loading", className, compact = false }: LoadingProgressProps) {
  const progress = useEstimatedProgress();

  return (
    <div className={cn("mx-auto w-full max-w-sm", compact ? "py-3" : "py-10", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-navy" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <span className="tabular-nums text-navy-dark">{progress}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label || "Loading"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="h-full rounded-full bg-navy transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface CircularLoadingProgressProps {
  label?: string;
  className?: string;
  size?: "small" | "medium";
}

export function CircularLoadingProgress({ label = "Loading", className, size = "medium" }: CircularLoadingProgressProps) {
  const progress = useEstimatedProgress();
  const diameter = size === "small" ? 40 : 52;
  const strokeWidth = size === "small" ? 3 : 4;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);

  return (
    <div className={cn("inline-flex flex-col items-center gap-2 text-muted-foreground", className)}>
      <div
        className="relative"
        role="progressbar"
        aria-label={label || "Loading"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        style={{ width: diameter, height: diameter }}
      >
        <svg className="-rotate-90" width={diameter} height={diameter} aria-hidden="true">
          <circle cx={diameter / 2} cy={diameter / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/80" />
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-navy transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-navy-dark", size === "small" ? "text-[9px]" : "text-[11px]")}>{progress}%</span>
      </div>
      {label && <span className="text-center text-xs">{label}</span>}
    </div>
  );
}

function useEstimatedProgress() {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 95) return 95;
        if (current < 45) return Math.min(45, current + 7);
        if (current < 75) return Math.min(75, current + 4);
        return Math.min(95, current + 1);
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, []);

  return progress;
}
