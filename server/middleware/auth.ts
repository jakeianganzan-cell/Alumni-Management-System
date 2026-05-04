import express from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AuthenticatedRequest } from "../types/auth";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

export const authenticateToken = (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction
) => {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: jwt.VerifyErrors | null, user: string | JwtPayload | undefined) => {
        if (err) return res.sendStatus(403);
        req.user = user as AuthenticatedRequest["user"];
        next();
    });
};
