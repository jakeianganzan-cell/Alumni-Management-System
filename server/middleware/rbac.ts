import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";

type RoleResolver = (req: AuthenticatedRequest) => Promise<string>;
type ChairmanCourseResolver = (userId: string) => Promise<string | null>;
type PublicErrorMessageResolver = (error: unknown) => string;

export type ServerPermission =
    | "dashboard.view"
    | "settings.manage"
    | "sessions.manage"
    | "alumni.view"
    | "alumni.edit"
    | "tracer.view"
    | "engagement.view"
    | "projects.view"
    | "projects.manage"
    | "donations.view"
    | "donations.verify"
    | "donations.approve"
    | "events.view"
    | "events.manage"
    | "announcements.manage"
    | "community.moderate"
    | "achievements.moderate"
    | "surveys.manage"
    | "officers.manage"
    | "notifications.draft"
    | "notifications.send"
    | "reports.view";

const SUPER_ADMIN_ROLES = new Set(["admin"]);
const OFFICER_ROLES = new Set([
    ...SUPER_ADMIN_ROLES,
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

const ROLE_PERMISSIONS: Record<string, ReadonlySet<ServerPermission>> = {
    vice_president: new Set(["dashboard.view", "engagement.view", "tracer.view", "events.view", "alumni.view", "surveys.manage", "achievements.moderate"]),
    secretary: new Set(["dashboard.view", "notifications.send", "notifications.draft", "announcements.manage", "alumni.view", "tracer.view", "community.moderate"]),
    assistant_secretary: new Set(["dashboard.view", "notifications.draft", "alumni.view"]),
    treasurer: new Set(["dashboard.view", "donations.approve", "donations.view", "donations.verify", "reports.view"]),
    assistant_treasurer: new Set(["dashboard.view", "donations.view", "donations.verify"]),
    auditor: new Set(["dashboard.view", "donations.view", "reports.view", "engagement.view"]),
    pio: new Set(["dashboard.view", "events.manage", "events.view", "announcements.manage", "engagement.view", "notifications.draft", "reports.view", "community.moderate", "achievements.moderate", "surveys.manage"]),
    appointed: new Set(["dashboard.view"]),
    chairman: new Set(["dashboard.view", "projects.view"])
};

export const roleHasPermission = (role: string, permission: ServerPermission) =>
    SUPER_ADMIN_ROLES.has(role) || Boolean(ROLE_PERMISSIONS[role]?.has(permission));

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
            if (!req.user?.id) return res.sendStatus(401);
            const role = await getRequestRole(req);
            if (!SUPER_ADMIN_ROLES.has(role)) {
                return res.status(403).json({ error: "Admin access required" });
            }
            next();
        } catch (error: unknown) {
            res.status(500).json({ error: getPublicErrorMessage(error) });
        }
    };

    const requireOfficer = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user?.id) return res.sendStatus(401);
            const role = await getRequestRole(req);
            if (!OFFICER_ROLES.has(role)) {
                return res.status(403).json({ error: "Officer access required" });
            }
            next();
        } catch (error: unknown) {
            res.status(500).json({ error: getPublicErrorMessage(error) });
        }
    };

    const requirePermission = (permission: ServerPermission) => async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            if (!req.user?.id) return res.sendStatus(401);
            const role = await getRequestRole(req);
            if (!roleHasPermission(role, permission)) {
                return res.status(403).json({ error: "You do not have permission to perform this action." });
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
            if (!req.user?.id) return res.sendStatus(401);
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
        requireOfficer,
        requirePermission,
        requireProjectWriteAccess,
        requireProjectDirectoryAccess,
        requireChairman
    };
};
