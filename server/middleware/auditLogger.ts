import type { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2";
import db from "../db.ts";
import type { AuthenticatedRequest } from "../types/auth";
import { logger } from "../utils/logger";

interface AuditLogEntry {
  action: string;
  target_type: string;
  target_id?: string | number;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_PATHS = /^\/(api\/)?(auth|login|register|password|reset)/i;
const EXCLUDED_PATHS = /^\/(api\/)?(health|metrics|docs|swagger)/i;

const getActionFromMethod = (method: string, path: string): string => {
  const resource = path.replace(/^\/api\//, "").split("/")[0] || "unknown";
  switch (method.toUpperCase()) {
    case "POST": return `create.${resource}`;
    case "PUT":
    case "PATCH": return `update.${resource}`;
    case "DELETE": return `delete.${resource}`;
    default: return `read.${resource}`;
  }
};

const getTargetFromPath = (path: string): { target_type: string; target_id?: string } => {
  const segments = path.replace(/^\/api\//, "").split("/").filter(Boolean);
  if (segments.length >= 2) {
    return {
      target_type: segments[0],
      target_id: segments[1],
    };
  }
  return {
    target_type: segments[0] || "unknown",
  };
};

export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const originalEnd = res.end;
  const startTime = Date.now();

  if (EXCLUDED_PATHS.test(req.path)) {
    next();
    return;
  }

  res.end = function (...args: Parameters<typeof originalEnd>): ReturnType<typeof originalEnd> {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (req.method !== "GET" || statusCode >= 400) {
      const user = (req as AuthenticatedRequest).user;
      const action = getActionFromMethod(req.method, req.path);
      const { target_type, target_id } = getTargetFromPath(req.path);

      const logEntry: AuditLogEntry = {
        action,
        target_type,
        target_id,
        metadata: {
          method: req.method,
          path: req.path,
          status: statusCode,
          duration_ms: duration,
          ip: req.ip || req.socket.remoteAddress,
          user_agent: req.headers["user-agent"],
          ...(statusCode >= 400 ? { error: res.statusMessage } : {}),
        },
      };

      db.execute(
        `INSERT INTO activity_logs 
         (user_id, session_token, action, description, role_used, metadata_json, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          user?.id || null,
          user?.sessionId || null,
          logEntry.action,
          `${req.method} ${req.path} returned ${statusCode} for ${logEntry.target_type}${logEntry.target_id ? `/${logEntry.target_id}` : ""}`,
          user?.role || null,
          JSON.stringify(logEntry.metadata),
          req.ip || req.socket.remoteAddress || null,
        ]
      ).catch((err) => {
        logger.error("[AUDIT] Failed to log activity:", err instanceof Error ? err.message : String(err));
      });
    }

    return originalEnd.apply(res, args);
  } as typeof originalEnd;

  next();
};
