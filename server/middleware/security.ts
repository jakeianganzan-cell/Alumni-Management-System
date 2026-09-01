import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const positiveIntegerEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "media-src": ["'self'", "data:", "blob:", "https:"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": ["'self'", "http:", "https:"],
      "frame-src": ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// Authentication and import endpoints use stricter route-specific limits below.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: positiveIntegerEnv("API_RATE_LIMIT_MAX", 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again later.",
    status: 429,
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: positiveIntegerEnv("AUTH_RATE_LIMIT_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again after 15 minutes.",
    status: 429,
  },
});

export const importRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: positiveIntegerEnv("IMPORT_RATE_LIMIT_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many import attempts. Please try again later.",
    status: 429,
  },
});

export const requestSizeLimiter = (
  maxSize: string = "10mb"
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const maxBytes = parseMaxSize(maxSize);

    if (contentLength > maxBytes) {
      res.status(413).json({
        error: `Request payload too large. Maximum size: ${maxSize}`,
        status: 413,
      });
      return;
    }

    next();
  };
};

const parseMaxSize = (size: string): number => {
  const match = size.match(/^(\d+)\s*(b|kb|mb|gb)$/i);
  if (!match) return 10 * 1024 * 1024;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "gb": return value * 1024 * 1024 * 1024;
    case "mb": return value * 1024 * 1024;
    case "kb": return value * 1024;
    default: return value;
  }
};

