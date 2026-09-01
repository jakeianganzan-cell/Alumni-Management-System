import db from "../db.ts";
import type { DbParam, QueryRow } from "../types/db";

export const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : "Unknown error";
};

export const getErrorCode = (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error) {
        return String(error.code || "");
    }

    return "";
};

export const parseRows = <T extends QueryRow = QueryRow>(result: T[] | T[][] | unknown) => {
    if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
    }

    return Array.isArray(result) ? result : [];
};

export const getSingleRow = async <T extends QueryRow = QueryRow>(sql: string, params: DbParam[] = []) => {
    const rows = parseRows<T>(await db.query<T>(sql, params));
    return rows[0] || null;
};

export const normalizeRoleValue = (value: unknown) => String(value || "").trim().toLowerCase();
