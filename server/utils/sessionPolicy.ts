export type SessionValidationResult = "active" | "inactive" | "unavailable";

export const getSessionAccessDecision = (result: SessionValidationResult) => {
  if (result === "active") return { allowed: true, status: 200 } as const;
  if (result === "inactive") return { allowed: false, status: 403 } as const;
  return { allowed: false, status: 503 } as const;
};

