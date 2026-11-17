// Mirror of public.role_permissions (UI gating only — the database enforces).
// tests/rbac.test.ts fails if this drifts from the migration.
// Prepared by Sara Salem. Copyright Sara Salem 2026.
export const ROLES = ["owner","admin","executive","finance_manager","hr_manager","operations_manager","compliance_officer","analyst","member","viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard.read","org.manage","users.read","users.manage",
  "finance.read","finance.write","finance.approve","hr.read","hr.write","hr.approve",
  "ops.read","ops.write","workflow.read","workflow.write","workflow.act",
  "agents.read","agents.manage","integrations.read","integrations.manage",
  "governance.read","governance.manage","risk.read","risk.write",
  "reports.read","reports.manage","audit.read","documents.read","documents.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: all,
  admin: all.filter((p) => p !== "finance.approve" && p !== "hr.approve"),
  executive: ["dashboard.read","users.read","finance.read","finance.approve","hr.read","hr.approve","ops.read","workflow.read","workflow.act","agents.read","integrations.read","governance.read","risk.read","reports.read","audit.read","documents.read"],
  finance_manager: ["dashboard.read","finance.read","finance.write","finance.approve","workflow.read","workflow.act","reports.read","documents.read","documents.write"],
  hr_manager: ["dashboard.read","users.read","hr.read","hr.write","hr.approve","workflow.read","workflow.act","reports.read","documents.read","documents.write"],
  operations_manager: ["dashboard.read","ops.read","ops.write","workflow.read","workflow.act","reports.read","documents.read","documents.write"],
  compliance_officer: ["dashboard.read","governance.read","governance.manage","risk.read","risk.write","audit.read","workflow.read","reports.read","documents.read"],
  analyst: ["dashboard.read","finance.read","hr.read","ops.read","risk.read","governance.read","workflow.read","reports.read","reports.manage","agents.read"],
  member: ["dashboard.read","workflow.read","documents.read"],
  viewer: ["dashboard.read"],
};

export function can(perms: ReadonlySet<string> | readonly string[], p: Permission): boolean {
  return Array.isArray(perms) ? perms.includes(p) : (perms as ReadonlySet<string>).has(p);
}
