import express from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import db from "../db.ts";
import { AuthenticatedRequest } from "../types/auth";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

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

const isSessionActive = async (sessionId: string) => {
    try {
        const rows = await db.query(
            "SELECT id FROM user_sessions WHERE session_token = ? AND status = 'Active' LIMIT 1",
            [sessionId]
        );
        const result = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
        return Array.isArray(result) && result.length > 0;
    } catch {
        return true;
    }
};

const touchSession = async (sessionId: string) => {
    try {
        await db.execute(
            "UPDATE user_sessions SET last_activity = NOW() WHERE session_token = ? AND status = 'Active'",
            [sessionId]
        );
    } catch {
        // Keep request handling independent from activity timestamp writes.
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

        if (sessionId && !(await isSessionActive(String(sessionId)))) {
            return res.status(403).json({ error: "Session ended" });
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
