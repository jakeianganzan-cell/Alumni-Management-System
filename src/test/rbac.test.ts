import { describe, expect, it } from "vitest";
import { canAccessModule, hasPermission, type AdminModule } from "@/lib/rbac";

describe("frontend role access", () => {
  it("keeps the System Administrator as a super-admin for every module", () => {
    const modules: AdminModule[] = [
      "dashboard", "alumni", "tracer", "engagement", "community", "achievements",
      "surveys", "donations", "events", "notifications", "reports", "officers", "projects",
    ];

    expect(modules.every((module) => canAccessModule("admin", module))).toBe(true);
    expect(hasPermission("admin", "settings.manage")).toBe(true);
  });

  it("does not expand limited staff permissions", () => {
    expect(canAccessModule("appointed", "dashboard")).toBe(true);
    expect(canAccessModule("appointed", "alumni")).toBe(false);
    expect(hasPermission("appointed", "settings.manage")).toBe(false);
  });

  it("allows chairmen to open graduate tracer records", () => {
    expect(canAccessModule("chairman", "tracer")).toBe(true);
    expect(hasPermission("chairman", "tracer.view")).toBe(true);
  });

  it("keeps Department Chairman access role-specific", () => {
    expect(canAccessModule("chairman", "alumni")).toBe(true);
    expect(canAccessModule("chairman", "engagement")).toBe(true);
    expect(canAccessModule("chairman", "projects")).toBe(false);
    expect(hasPermission("chairman", "projects.manage")).toBe(false);
    expect(hasPermission("chairman", "settings.manage")).toBe(false);
  });
});
