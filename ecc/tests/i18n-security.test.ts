import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dict, dir } from "@/lib/i18n";
import { MODULES } from "@/lib/resources";

const AR = /[؀-ۿ]/;
describe("localization", () => {
  it("every dictionary key has English and Arabic text", () => {
    for (const [k, v] of Object.entries(dict)) {
      expect(v.en.trim(), k).not.toBe("");
      if (k !== "language") expect(AR.test(v.ar), k).toBe(true);
    }
  });
  it("every resource and field label is translated", () => {
    for (const m of Object.values(MODULES)) {
      expect(AR.test(m.title.ar)).toBe(true);
      for (const r of m.resources) { expect(AR.test(r.title.ar), r.key).toBe(true); for (const f of r.fields) expect(AR.test(f.label.ar), f.name).toBe(true); }
    }
  });
  it("Arabic is right-to-left", () => { expect(dir("ar")).toBe("rtl"); expect(dir("en")).toBe("ltr"); });
});

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(p) ? [p] : []; });
}
const frontend = [...walk("app"), ...walk("components"), ...walk("lib"), "proxy.ts"];

describe("secret hygiene", () => {
  it("frontend code never references the service-role key", () => {
    for (const f of frontend) expect(readFileSync(f, "utf8"), f).not.toMatch(/SERVICE_ROLE/i);
  });
  it("only the two public Supabase variables are NEXT_PUBLIC_", () => {
    for (const f of frontend) for (const m of readFileSync(f, "utf8").matchAll(/NEXT_PUBLIC_[A-Z_]+/g))
      expect(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL"], f).toContain(m[0]);
  });
  it("permissions are never read from user metadata", () => {
    for (const f of frontend) expect(readFileSync(f, "utf8"), f).not.toMatch(/user_metadata|app_metadata/);
  });
  it("every public table in migrations has RLS enabled", () => {
    const sql = readdirSync("supabase/migrations").map((f) => readFileSync(join("supabase/migrations", f), "utf8")).join("\n");
    const tables = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1]);
    for (const t of tables) expect(sql.includes(`alter table public.${t} enable row level security`) || sql.includes(`('${t}',`), t).toBe(true);
  });
});
