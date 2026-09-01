const isDevelopment = process.env.NODE_ENV !== "production";

const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|secret|token|api[-_]?key|smtp|database_url|db_password|email|recipient)/i;
const recentProductionLogs = new Map<string, number>();
const PRODUCTION_DEDUPLICATION_WINDOW_MS = 60_000;

const getErrorCode = (error: Error): string | undefined => {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
};

const sanitize = (value: unknown, depth = 0): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: getErrorCode(value),
      ...(isDevelopment && value.stack ? { stack: value.stack } : {}),
    };
  }

  if (depth >= 3 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1),
    ]),
  );
};

const sanitizeArgs = (args: unknown[]) => args.map((value) => sanitize(value));

const shouldWriteProductionLog = (level: "warn" | "error", args: unknown[]) => {
  if (isDevelopment) return true;

  const firstText = typeof args[0] === "string" ? args[0] : "";
  const error = args.find((value) => value instanceof Error) as Error | undefined;
  const fingerprint = `${level}:${firstText}:${error?.message || ""}:${error ? getErrorCode(error) || "" : ""}`;
  const now = Date.now();
  const previous = recentProductionLogs.get(fingerprint) || 0;

  if (now - previous < PRODUCTION_DEDUPLICATION_WINDOW_MS) return false;

  recentProductionLogs.set(fingerprint, now);
  return true;
};

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDevelopment) console.debug("[DEBUG]", ...sanitizeArgs(args));
  },
  info: (...args: unknown[]) => {
    if (isDevelopment) console.info("[INFO]", ...sanitizeArgs(args));
  },
  startup: (...args: unknown[]) => {
    console.info("[STARTUP]", ...sanitizeArgs(args));
  },
  warn: (...args: unknown[]) => {
    if (shouldWriteProductionLog("warn", args)) console.warn("[WARN]", ...sanitizeArgs(args));
  },
  error: (...args: unknown[]) => {
    if (shouldWriteProductionLog("error", args)) console.error("[ERROR]", ...sanitizeArgs(args));
  },
};

