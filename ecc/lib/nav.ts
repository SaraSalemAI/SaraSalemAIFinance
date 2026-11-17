import type { Key } from "./i18n";
import type { Permission } from "./rbac";
export const NAV: { href: string; label: Key; perm: Permission }[] = [
  { href: "", label: "dashboard", perm: "dashboard.read" },
  { href: "/finance", label: "finance", perm: "finance.read" },
  { href: "/hr", label: "hr", perm: "hr.read" },
  { href: "/operations", label: "operations", perm: "ops.read" },
  { href: "/workflows", label: "workflows", perm: "workflow.read" },
  { href: "/agents", label: "agents", perm: "agents.read" },
  { href: "/integrations", label: "integrations", perm: "integrations.read" },
  { href: "/governance", label: "governance", perm: "governance.read" },
  { href: "/risk", label: "risk", perm: "risk.read" },
  { href: "/reports", label: "reports", perm: "reports.read" },
  { href: "/documents", label: "documents", perm: "documents.read" },
  { href: "/users", label: "users", perm: "users.read" },
  { href: "/audit", label: "audit", perm: "audit.read" },
  { href: "/admin", label: "admin", perm: "org.manage" },
];
