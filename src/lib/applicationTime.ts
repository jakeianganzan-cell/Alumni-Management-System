export const APPLICATION_TIME_ZONE = "Asia/Manila";
export const APPLICATION_UTC_OFFSET = "+08:00";

const MYSQL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/;

export function parseApplicationDateTime(value: string | Date | null | undefined) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value || "").trim();
  if (!text) return null;

  const mysqlDateTime = text.match(MYSQL_DATE_TIME_PATTERN);
  const normalized = mysqlDateTime
    ? `${mysqlDateTime[1]}T${mysqlDateTime[2]}${APPLICATION_UTC_OFFSET}`
    : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatApplicationDateTime(
  value: string | Date | null | undefined,
  fallback = "Not yet",
) {
  const date = parseApplicationDateTime(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: APPLICATION_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}
