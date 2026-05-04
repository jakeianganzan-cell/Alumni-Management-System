import type { ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock3, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type ExpandableAnnouncementCardProps = {
  announcement: {
    id: string | number;
    title: string;
    description?: string | null;
    date?: string | null;
    time?: string | null;
    venue?: string | null;
    type?: string | null;
    image_url?: string | null;
    created_at?: string | null;
    organizer?: string | null;
    status?: string | null;
    google_form_link?: string | null;
    audienceLabel?: string | null;
  };
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  children?: ReactNode;
};

export function ExpandableAnnouncementCard({
  announcement,
  expanded,
  onToggle,
  className,
  children,
}: ExpandableAnnouncementCardProps) {
  const imageUrl = resolveAssetUrl(announcement.image_url);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={announcement.title}
            className="h-20 w-20 flex-shrink-0 rounded-xl border border-border/70 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-muted/40">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getTypeBadgeClassName(announcement.type)}>{formatTypeLabel(announcement.type)}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {formatPostedDate(announcement.created_at || announcement.date)}
                </span>
              </div>
              <h3 className="mt-2 line-clamp-2 text-base font-semibold text-navy-dark">{announcement.title}</h3>
            </div>
            <ChevronDown
              className={cn(
                "mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {announcement.description || "No description provided yet."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {announcement.date && (
              <MetaChip icon={<CalendarDays className="h-3.5 w-3.5" />} label={formatDisplayDate(announcement.date)} />
            )}
            {announcement.time && (
              <MetaChip icon={<Clock3 className="h-3.5 w-3.5" />} label={announcement.time} />
            )}
            {announcement.venue && (
              <MetaChip icon={<MapPin className="h-3.5 w-3.5" />} label={announcement.venue} />
            )}
            {announcement.audienceLabel && (
              <MetaChip icon={<ExternalLink className="h-3.5 w-3.5" />} label={announcement.audienceLabel} />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/70 bg-muted/10 p-4">
          <div className="space-y-4">
            {imageUrl && (
              <img
                src={imageUrl}
                alt={announcement.title}
                className="h-44 w-full rounded-xl border border-border/70 object-cover"
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Type" value={formatTypeLabel(announcement.type)} />
              <DetailItem label="Posted" value={formatPostedDate(announcement.created_at || announcement.date)} />
              {announcement.date && <DetailItem label="Date" value={formatDisplayDate(announcement.date)} />}
              {announcement.time && <DetailItem label="Time" value={announcement.time} />}
              {announcement.venue && <DetailItem label="Venue" value={announcement.venue} />}
              {announcement.organizer && <DetailItem label="Organizer" value={announcement.organizer} />}
              {announcement.status && <DetailItem label="Status" value={formatStatusLabel(announcement.status)} />}
              {announcement.audienceLabel && <DetailItem label="Audience" value={announcement.audienceLabel} />}
              {announcement.google_form_link && (
                <DetailItem
                  label="Survey link"
                  value={
                    <a
                      href={announcement.google_form_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-navy underline underline-offset-4"
                    >
                      Open survey
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  }
                />
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Complete details
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {announcement.description || "No full content has been added."}
              </p>
            </div>

            {children}
          </div>
        </div>
      )}
    </article>
  );
}

function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1.5">
      {icon}
      {label}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function getTypeBadgeClassName(type: string | null | undefined) {
  if (type === "event") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (type === "survey") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

export function formatTypeLabel(type: string | null | undefined) {
  if (type === "event") return "Event";
  if (type === "survey") return "Survey";
  return "Announcement";
}

function formatStatusLabel(status: string) {
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString();
}

function formatPostedDate(value: string | null | undefined) {
  if (!value) return "Posted recently";
  return `Posted ${new Date(value).toLocaleDateString()}`;
}
