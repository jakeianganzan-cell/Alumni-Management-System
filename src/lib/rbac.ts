import type { CourseCode } from "@/lib/courseCatalog";
import { COURSE_LABELS } from "@/lib/courseCatalog";

export type OfficerRole =
  | "president"
  | "vice_president"
  | "secretary"
  | "assistant_secretary"
  | "treasurer"
  | "assistant_treasurer"
  | "auditor"
  | "pio"
  | "appointed"
  | "chairman";

export type Department = CourseCode;

export const DEPARTMENT_LABELS: Record<Department, string> = COURSE_LABELS;

export type AdminModule =
  | "dashboard"
  | "alumni"
  | "tracer"
  | "engagement"
  | "community"
  | "achievements"
  | "surveys"
  | "donations"
  | "events"
  | "notifications"
  | "reports"
  | "officers";

export type Permission =
  | "donations.approve"
  | "donations.reject"
  | "donations.view"
  | "donations.verify"
  | "notifications.send"
  | "notifications.draft"
  | "officers.manage"
  | "alumni.edit"
  | "alumni.view"
  | "tracer.view"
  | "events.manage"
  | "events.view"
  | "reports.view"
  | "engagement.view"
  | "community.moderate"
  | "achievements.moderate"
  | "surveys.manage"
  | "settings.manage";

export interface RoleDefinition {
  label: string;
  color: string;
  textColor: string;
  modules: AdminModule[];
  permissions: Permission[];
  description: string;
}

export const ROLE_DEFINITIONS: Record<OfficerRole, RoleDefinition> = {
  president: {
    label: "President",
    color: "bg-navy",
    textColor: "text-white",
    description: "Full system authority - Super Admin",
    modules: ["dashboard", "alumni", "tracer", "engagement", "community", "achievements", "surveys", "donations", "events", "notifications", "reports", "officers"],
    permissions: [
      "donations.approve",
      "donations.reject",
      "donations.view",
      "donations.verify",
      "notifications.send",
      "notifications.draft",
      "officers.manage",
      "alumni.edit",
      "alumni.view",
      "tracer.view",
      "events.manage",
      "events.view",
      "reports.view",
      "engagement.view",
      "community.moderate",
      "achievements.moderate",
      "surveys.manage",
      "settings.manage",
    ],
  },
  vice_president: {
    label: "Vice President",
    color: "bg-blue-600",
    textColor: "text-white",
    description: "Monitors engagement and tracer analytics",
    modules: ["dashboard", "engagement", "tracer", "events", "surveys", "achievements"],
    permissions: ["engagement.view", "tracer.view", "events.view", "alumni.view", "surveys.manage", "achievements.moderate"],
  },
  secretary: {
    label: "Secretary",
    color: "bg-emerald-600",
    textColor: "text-white",
    description: "Manages announcements and notifications",
    modules: ["dashboard", "notifications", "alumni", "tracer", "community"],
    permissions: ["notifications.send", "notifications.draft", "alumni.view", "tracer.view", "community.moderate"],
  },
  assistant_secretary: {
    label: "Asst. Secretary",
    color: "bg-teal-500",
    textColor: "text-white",
    description: "Assists with announcements and drafts",
    modules: ["dashboard", "notifications", "alumni"],
    permissions: ["notifications.draft", "alumni.view"],
  },
  treasurer: {
    label: "Treasurer",
    color: "bg-gold",
    textColor: "text-navy-dark",
    description: "Manages and reviews donations",
    modules: ["dashboard", "donations", "reports"],
    permissions: ["donations.approve", "donations.view", "donations.verify", "reports.view"],
  },
  assistant_treasurer: {
    label: "Asst. Treasurer",
    color: "bg-amber-400",
    textColor: "text-navy-dark",
    description: "Verifies receipts and donation details",
    modules: ["dashboard", "donations"],
    permissions: ["donations.view", "donations.verify"],
  },
  auditor: {
    label: "Auditor",
    color: "bg-orange-500",
    textColor: "text-white",
    description: "Read-only access to financial and engagement data",
    modules: ["dashboard", "donations", "reports", "engagement"],
    permissions: ["donations.view", "reports.view", "engagement.view"],
  },
  pio: {
    label: "PRO",
    color: "bg-purple-600",
    textColor: "text-white",
    description: "Public Information Officer - manages events and engagement",
    modules: ["dashboard", "events", "engagement", "notifications", "reports", "community", "achievements", "surveys"],
    permissions: ["events.manage", "events.view", "engagement.view", "notifications.draft", "reports.view", "community.moderate", "achievements.moderate", "surveys.manage"],
  },
  appointed: {
    label: "Appointed",
    color: "bg-slate-500",
    textColor: "text-white",
    description: "Limited access assigned by President",
    modules: ["dashboard"],
    permissions: [],
  },
  chairman: {
    label: "Chairman",
    color: "bg-indigo-600",
    textColor: "text-white",
    description: "Department Chairman - oversees department alumni",
    modules: ["dashboard", "alumni", "engagement"],
    permissions: ["alumni.view", "engagement.view", "tracer.view"],
  },
};

export function hasPermission(role: OfficerRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_DEFINITIONS[role]?.permissions.includes(permission) ?? false;
}

export function canAccessModule(role: OfficerRole | undefined | null, module: AdminModule): boolean {
  if (!role) return false;
  return ROLE_DEFINITIONS[role]?.modules.includes(module) ?? false;
}

export function getRoleLabel(role: OfficerRole | undefined | null): string {
  if (!role) return "Unknown";
  return ROLE_DEFINITIONS[role]?.label ?? role;
}
