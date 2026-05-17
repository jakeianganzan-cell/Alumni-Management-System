import { Badge } from "@/components/ui/badge";
import { resolveAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/context/AnnouncementContext";
import { CalendarDays, Clock3, FileText, MapPin } from "lucide-react";
import DurationBadge from "@/components/DurationBadge";

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
  const hasImage = Boolean(imageUrl);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(announcement)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(announcement);
        }
      }}
      className={cn(
        "relative min-w-0 max-w-full cursor-pointer overflow-hidden rounded-xl border shadow-sm outline-none transition duration-200 hover:border-navy/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-navy/30 md:min-h-0 md:border-border/70 md:bg-white md:p-4 md:text-foreground",
        hasImage
          ? "min-h-[250px] border-slate-900/20 bg-slate-950 p-0 text-white"
          : "min-h-[230px] border-border/70 bg-white p-4 text-foreground",
        className,
      )}
    >
      {hasImage && (
        <>
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover md:hidden"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20 md:hidden" />
        </>
      )}

      <div className={cn(
        "relative flex h-full flex-col gap-4 md:flex-row md:items-start",
        hasImage ? "min-h-[250px] justify-end p-4 md:min-h-0 md:justify-start md:p-0" : "min-h-[198px] justify-between md:min-h-0 md:justify-start",
      )}>
        {imageUrl && (
          <div className="hidden h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/20 md:flex md:w-36">
            <img
              src={imageUrl}
              alt={announcement.title}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={getTypeBadgeClassName(announcement.type)}>{formatTypeLabel(announcement.type)}</Badge>
            <DurationBadge
              status={announcement.computed_status || announcement.duration_status}
              remainingTime={announcement.remaining_time}
              startDatetime={announcement.start_datetime}
              endDatetime={announcement.end_datetime}
            />
            <span className={cn("text-xs", hasImage ? "text-white/85 md:text-muted-foreground" : "text-muted-foreground")}>
              {formatPostedDate(announcement.created_at || announcement.date)}
            </span>
          </div>

          <h3 className={cn("line-clamp-2 font-semibold leading-tight", hasImage ? "text-lg text-white drop-shadow-sm md:text-sm md:text-navy-dark md:drop-shadow-none" : "text-sm text-navy-dark")}>{announcement.title}</h3>
          <p className={cn("mt-2 line-clamp-3 text-sm leading-6 md:mt-1 md:line-clamp-2 md:text-xs md:leading-5", hasImage ? "text-white/90 drop-shadow-sm md:text-muted-foreground md:drop-shadow-none" : "text-muted-foreground")}>
            {announcement.description || "No description provided yet."}
          </p>

          <div className={cn("mt-3 flex flex-wrap gap-1.5 text-[11px] md:mt-2.5", hasImage ? "text-white/90 md:text-muted-foreground" : "text-muted-foreground")}>
            <MetaChip overlay={hasImage} icon={<CalendarDays className="h-3.5 w-3.5" />} label={formatDisplayDate(announcement.date)} />
            {announcement.time && <MetaChip overlay={hasImage} icon={<Clock3 className="h-3.5 w-3.5" />} label={announcement.time} />}
            {announcement.venue && <MetaChip overlay={hasImage} icon={<MapPin className="h-3.5 w-3.5" />} label={announcement.venue} />}
            {announcement.audienceLabel && <MetaChip overlay={hasImage} icon={<FileText className="h-3.5 w-3.5" />} label={announcement.audienceLabel} />}
          </div>

          <span className={cn(
            "mt-4 inline-flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-bold md:hidden",
            hasImage ? "bg-white text-slate-950 shadow-sm" : "bg-navy text-white",
          )}>
            {announcement.type === "event" ? "View event" : "View details"}
          </span>
        </div>
      </div>
    </article>
  );
}

function MetaChip({ icon, label, overlay = false }: { icon: React.ReactNode; label: string; overlay?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1",
      overlay ? "border-white/25 bg-white/15 text-white backdrop-blur-sm md:border-border md:bg-muted/40 md:text-muted-foreground md:backdrop-blur-0" : "border-border bg-muted/40",
    )}>
      {icon}
      {label}
    </span>
  );
}

export function AnnouncementAttachment({ announcement }: { announcement: Announcement }) {
  const imageUrl = resolveAssetUrl(announcement.image_url);

  if (!imageUrl) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground sm:h-32">
        No attached image for this item.
      </div>
    );
  }

  return (
    <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/20 sm:h-72">
      <img
        src={imageUrl}
        alt={announcement.title}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export function AnnouncementDetailMeta({ announcement }: { announcement: Announcement }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <DetailItem label="Type" value={formatTypeLabel(announcement.type)} />
      <DetailItem label="Date posted" value={formatPostedDate(announcement.created_at || announcement.date)} />
      <DetailItem label={announcement.type === "survey" ? "Survey date" : announcement.type === "event" ? "Event date" : "Publication date"} value={formatDisplayDate(announcement.date)} />
      <DetailItem label="Status" value={formatStatusLabel(announcement.status)} />
      <DetailItem
        label="Duration"
        value={
          <DurationBadge
            status={announcement.computed_status || announcement.duration_status}
            remainingTime={announcement.remaining_time}
            startDatetime={announcement.start_datetime}
            endDatetime={announcement.end_datetime}
          />
        }
      />
      {announcement.start_datetime && <DetailItem label="Starts" value={formatDateTime(announcement.start_datetime)} />}
      {announcement.end_datetime && <DetailItem label="Ends" value={formatDateTime(announcement.end_datetime)} />}
      {announcement.audienceLabel && <DetailItem label="Audience" value={announcement.audienceLabel} />}
      {announcement.time && <DetailItem label={announcement.type === "survey" ? "Deadline time" : "Time"} value={announcement.time} />}
      {announcement.venue && <DetailItem label="Venue" value={announcement.venue} />}
      {announcement.organizer && <DetailItem label="Organizer" value={announcement.organizer} />}
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
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
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
