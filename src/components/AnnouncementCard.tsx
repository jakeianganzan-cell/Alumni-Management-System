import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/context/AnnouncementContext";
import { CalendarDays, Clock3, ExternalLink, FileText, MapPin } from "lucide-react";

export function AnnouncementCard({
  announcement,
  onOpen,
  className,
}: {
  announcement: Announcement;
  onOpen: (announcement: Announcement) => void;
  className?: string;
}) {
  const imageUrl = resolveAssetUrl(announcement.image_url);

  return (
    <article
      className={cn(
        "flex h-full min-w-[310px] max-w-[360px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={announcement.title}
          className="h-40 w-full border-b border-border/60 object-cover"
        />
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Badge className={getTypeBadgeClassName(announcement.type)}>{formatTypeLabel(announcement.type)}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatPostedDate(announcement.created_at || announcement.date)}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-tight text-navy-dark">{announcement.title}</h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {announcement.description || "No description provided yet."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <MetaChip icon={<CalendarDays className="h-3.5 w-3.5" />} label={formatDisplayDate(announcement.date)} />
          {announcement.time && <MetaChip icon={<Clock3 className="h-3.5 w-3.5" />} label={announcement.time} />}
          {announcement.venue && <MetaChip icon={<MapPin className="h-3.5 w-3.5" />} label={announcement.venue} />}
          {announcement.audienceLabel && <MetaChip icon={<FileText className="h-3.5 w-3.5" />} label={announcement.audienceLabel} />}
        </div>

        <div className="mt-5 flex gap-2">
          <Button className="flex-1 rounded-xl" type="button" onClick={() => onOpen(announcement)}>
            View Details
          </Button>
          {announcement.type === "survey" && announcement.google_form_link && (
            <Button variant="outline" size="icon" asChild className="rounded-xl">
              <a href={announcement.google_form_link} target="_blank" rel="noreferrer" aria-label="Open survey">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1.5">
      {icon}
      {label}
    </span>
  );
}

export function AnnouncementAttachment({ announcement }: { announcement: Announcement }) {
  const imageUrl = resolveAssetUrl(announcement.image_url);

  if (!imageUrl) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        No attached image for this item.
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={announcement.title}
      className="h-64 w-full rounded-2xl border border-border/70 object-cover"
    />
  );
}

export function AnnouncementDetailMeta({ announcement }: { announcement: Announcement }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DetailItem label="Type" value={formatTypeLabel(announcement.type)} />
      <DetailItem label="Date posted" value={formatPostedDate(announcement.created_at || announcement.date)} />
      <DetailItem label={announcement.type === "survey" ? "Survey date" : announcement.type === "event" ? "Event date" : "Publication date"} value={formatDisplayDate(announcement.date)} />
      <DetailItem label="Status" value={formatStatusLabel(announcement.status)} />
      {announcement.audienceLabel && <DetailItem label="Audience" value={announcement.audienceLabel} />}
      {announcement.time && <DetailItem label={announcement.type === "survey" ? "Deadline time" : "Time"} value={announcement.time} />}
      {announcement.venue && <DetailItem label="Venue" value={announcement.venue} />}
      {announcement.organizer && <DetailItem label="Organizer" value={announcement.organizer} />}
      {announcement.type === "survey" && announcement.google_form_link && (
        <DetailItem
          label="Survey action"
          value={
            <a
              href={announcement.google_form_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-navy underline underline-offset-4"
            >
              Open survey form
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          }
        />
      )}
      {announcement.image_url && (
        <DetailItem
          label="Attachment"
          value={
            <span className="inline-flex items-center gap-1 text-foreground">
              <FileText className="h-3.5 w-3.5" />
              Image attached
            </span>
          }
        />
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function formatTypeLabel(type: Announcement["type"]) {
  if (type === "event") return "Event";
  if (type === "survey") return "Survey";
  return "Announcement";
}

export function formatStatusLabel(status: string | undefined) {
  return String(status || "active")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTypeBadgeClassName(type: Announcement["type"]) {
  if (type === "event") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (type === "survey") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
}

function formatDisplayDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatPostedDate(value: string) {
  return `Posted ${new Date(value).toLocaleDateString()}`;
}
