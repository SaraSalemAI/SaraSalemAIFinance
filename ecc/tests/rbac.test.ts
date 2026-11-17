import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/rbac";
import { NAV } from "@/lib/nav";
import { MODULES } from "@/lib/resources";

const sql = readFileSync("supabase/migrations/20261117000100_core_tenancy_rbac.sql", "utf8");
const seed = sql.slice(sql.indexOf("insert into public.role_permissions"), sql.indexOf(") as t(r, p)"));
const pairs = [...seed.matchAll(/\('([a-z_]+)','([a-z*.]+)'\)/g)].map((m) => [m[1], m[2]] as const);

describe("RBAC matrix", () => {
  it("TS mirror matches the SQL role_permissions seed exactly", () => {
    const fromSql: Record<string, Set<string>> = {};
    for (const [r, p] of pairs) (fromSql[r] ??= new Set()).add(p);
    for (const role of ROLES) {
      const expected = role === "owner" ? new Set(["*"]) : new Set(ROLE_PERMISSIONS[role]);
      expect(fromSql[role], role).toEqual(expected);
    }
  });
  it("every SQL permission is a known permission", () => {
    for (const [, p] of pairs) if (p !== "*") expect(PERMISSIONS).toContain(p);
  });
  it("every permission is granted to at least one non-owner role", () => {
    for (const p of PERMISSIONS) expect(ROLES.some((r) => r !== "owner" && ROLE_PERMISSIONS[r].includes(p)), p).toBe(true);
  });
  it("viewer can only see the dashboard", () => {
    expect(ROLE_PERMISSIONS.viewer).toEqual(["dashboard.read"]);
  });
  it("admins cannot approve; approvals need a business role", () => {
    expect(ROLE_PERMISSIONS.admin).not.toContain("finance.approve");
    expect(ROLE_PERMISSIONS.admin).not.toContain("hr.approve");
  });
  it("nav and resources reference real permissions and RLS-protected tables", () => {
    for (const n of NAV) expect(PERMISSIONS).toContain(n.perm);
    const mod = readFileSync("supabase/migrations/20261117000200_modules.sql", "utf8");
    for (const m of Object.values(MODULES)) for (const r of m.resources) {
      expect(PERMISSIONS).toContain(r.read); expect(PERMISSIONS).toContain(r.write);
      expect(mod).toContain(`('${r.table}','${r.read}','${r.write}')`);
    }
  });
});
