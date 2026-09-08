import type { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../types/errors";
import { logger } from "../utils/logger";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (!(err instanceof AppError) || !err.isOperational || err.statusCode >= 500) {
    logger.error("[HTTP] Unexpected request error", err);
  }

  if (err instanceof AppError && err.isOperational && err.statusCode < 500) {
    const response: Record<string, unknown> = {
      error: err.message,
      status: err.statusCode,
    };

    if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
      response.errors = err.errors;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  if (
    (typeof err === "object" && err !== null && "type" in err && (err as { type?: string }).type === "entity.parse.failed") ||
    err.message?.includes("JSON")
  ) {
    res.status(400).json({
      error: "Invalid JSON in request body",
      status: 400,
    });
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    (("type" in err && (err as { type?: string }).type === "entity.too.large") ||
      ("status" in err && (err as { status?: number }).status === 413))
  ) {
    res.status(413).json({
      error: "Request payload too large.",
      status: 413,
    });
    return;
  }

  res.status(500).json({
    error: "Unable to complete your request. Please try again.",
    status: 500,
  });
};

export const notFoundHandler = (
  _req: Request,
  res: Response
): void => {
  res.status(404).json({
    error: "Endpoint not found",
    status: 404,
  });
};
