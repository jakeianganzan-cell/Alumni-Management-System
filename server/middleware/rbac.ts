import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";

type RoleResolver = (req: AuthenticatedRequest) => Promise<string>;
type ChairmanCourseResolver = (userId: string) => Promise<string | null>;
type PublicErrorMessageResolver = (error: unknown) => string;

const ADMIN_ROLES = new Set([
    "president",
    "admin",
    "chairman",
    "vice_president",
    "secretary",
    "assistant_secretary",
    "treasurer",
    "assistant_treasurer",
    "auditor",
    "pio",
    "appointed"
]);

export const createRbacMiddleware = ({
    getRequestRole,
    getChairmanCourseForUser,
    getPublicErrorMessage
}: {
    getRequestRole: RoleResolver;
    getChairmanCourseForUser: ChairmanCourseResolver;
    getPublicErrorMessage: PublicErrorMessageResolver;
}) => {
    const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user?.id) {
                return res.sendStatus(401);
            }

            const role = await getRequestRole(req);

            if (!ADMIN_ROLES.has(role)) {
                return res.status(403).json({ error: "Admin access required" });
            }

            next();
        } catch (error: unknown) {
            res.status(500).json({ error: getPublicErrorMessage(error) });
        }
    };

    const requireProjectWriteAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const role = await getRequestRole(req);
        if (role === "chairman") {
            return res.status(403).json({ error: "Chairman accounts have read-only access to alumni project summaries and reports." });
        }
        next();
    };

    const requireProjectDirectoryAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const role = await getRequestRole(req);
        if (role === "chairman") {
            return res.status(403).json({ error: "Chairman accounts can view project summaries and reports only." });
        }
        next();
    };

    const requireChairman = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user?.id) {
                return res.sendStatus(401);
            }

            const role = await getRequestRole(req);

            if (role !== "chairman") {
                return res.status(403).json({ error: "Chairman access required" });
            }

            const course = await getChairmanCourseForUser(req.user.id);

            if (!course) {
                return res.status(400).json({ error: "Chairman account must be assigned to a supported course." });
            }

            next();
        } catch (error: unknown) {
            res.status(500).json({ error: getPublicErrorMessage(error) });
        }
    };

    return {
        requireAdmin,
        requireProjectWriteAccess,
        requireProjectDirectoryAccess,
        requireChairman
    };
};
