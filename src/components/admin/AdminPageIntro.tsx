import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function AdminPageIntro({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70 shadow-sm", className)}>
      <CardContent className="flex min-w-0 flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-navy-dark sm:text-xl">{title}</h2>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-shrink-0">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function AdminStatsGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function AdminStatCard({
  label,
  value,
  description,
  icon,
  toneClassName = "bg-muted text-muted-foreground",
}: {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  toneClassName?: string;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {icon && (
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClassName)}>
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold text-navy-dark sm:text-2xl">{value}</p>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
