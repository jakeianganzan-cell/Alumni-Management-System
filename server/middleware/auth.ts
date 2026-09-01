import express from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import db from "../db.ts";
import { AuthenticatedRequest } from "../types/auth";

import { config } from "../config";
import { logger } from "../utils/logger";
import { getSessionAccessDecision, type SessionValidationResult } from "../utils/sessionPolicy";

const JWT_SECRET = config.jwtSecret;

const getToken = (req: AuthenticatedRequest) => req.headers["authorization"]?.split(" ")[1];

const endExpiredSession = async (token: string) => {
    try {
        const decoded = jwt.decode(token) as JwtPayload | null;
        const sessionId = decoded?.sessionId || decoded?.sid;
        if (!sessionId) return;

        await db.execute(
            "UPDATE user_sessions SET status = 'Ended', logout_time = COALESCE(logout_time, NOW()), last_activity = NOW() WHERE session_token = ? AND status = 'Active'",
            [String(sessionId)]
        );
    } catch {
        // The auth response should not expose session bookkeeping failures.
    }
};

const isSessionActive = async (sessionId: string): Promise<SessionValidationResult> => {
    try {
        const rows = await db.query(
            "SELECT id FROM user_sessions WHERE session_token = ? AND status = 'Active' LIMIT 1",
            [sessionId]
        );
        const result = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
        return Array.isArray(result) && result.length > 0 ? "active" : "inactive";
    } catch (error) {
        logger.warn("[Auth] Session validation unavailable", error);
        return "unavailable";
    }
};

const configuredSessionTouchInterval = Number(process.env.SESSION_TOUCH_INTERVAL_MS);
const SESSION_TOUCH_INTERVAL_MS = Number.isFinite(configuredSessionTouchInterval) && configuredSessionTouchInterval >= 10_000
    ? configuredSessionTouchInterval
    : 60_000;
const lastSessionTouchAt = new Map<string, number>();

const touchSession = async (sessionId: string) => {
    const now = Date.now();
    const lastTouchedAt = lastSessionTouchAt.get(sessionId) || 0;
    if (now - lastTouchedAt < SESSION_TOUCH_INTERVAL_MS) return;
    if (lastSessionTouchAt.size >= 10_000) lastSessionTouchAt.clear();
    lastSessionTouchAt.set(sessionId, now);

    try {
        await db.execute(
            "UPDATE user_sessions SET last_activity = NOW() WHERE session_token = ? AND status = 'Active'",
            [sessionId]
        );
    } catch (error) {
        logger.warn("[Auth] Session activity update failed", error);
    }
};

export const authenticateToken = (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction
) => {
    const token = getToken(req);

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err: jwt.VerifyErrors | null, user: string | JwtPayload | undefined) => {
        if (err) {
            if (err.name === "TokenExpiredError") {
                await endExpiredSession(token);
            }
            return res.sendStatus(403);
        }

        const payload = user as JwtPayload;
        const sessionId = payload.sessionId || payload.sid;

        if (sessionId) {
            const decision = getSessionAccessDecision(await isSessionActive(String(sessionId)));
            if (!decision.allowed) {
                return decision.status === 403
                    ? res.status(403).json({ error: "Session ended" })
                    : res.status(503).json({ error: "Authentication service temporarily unavailable" });
            }
        }

        req.user = {
            id: String(payload.id || ""),
            email: String(payload.email || ""),
            role: payload.role ? String(payload.role) : undefined,
            sessionId: sessionId ? String(sessionId) : undefined,
        };

        if (req.user.sessionId) {
            void touchSession(req.user.sessionId);
        }

        next();
    });
};
