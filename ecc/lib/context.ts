import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import type { Permission } from "@/lib/rbac";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get("ecc_locale")?.value;
  return v === "ar" ? "ar" : "en";
}

/** Signed-in user (verified with the Auth server, not just the cookie). */
export const requireUser = cache(async () => {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { sb, user: data.user };
});

export type OrgCtx = Awaited<ReturnType<typeof orgContext>>;

/** Resolve an org by slug under RLS (non-members get 404) and load the caller's permissions from the DB. */
export const orgContext = cache(async (slug: string) => {
  const { sb, user } = await requireUser();
  const { data: org } = await sb.from("organizations").select("id, name, slug, is_demo, default_locale, settings").eq("slug", slug).maybeSingle();
  if (!org) notFound();
  const [{ data: perms }, { data: mem }] = await Promise.all([
    sb.rpc("my_permissions", { p_org: org.id }),
    sb.from("memberships").select("role").eq("org_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);
  const set = new Set<string>((perms as string[] | null) ?? []);
  return { sb, user, org, role: (mem?.role as string) ?? "viewer", perms: set, has: (p: Permission) => set.has(p), locale: await getLocale() };
});

export async function requirePerm(slug: string, p: Permission) {
  const ctx = await orgContext(slug);
  return { ctx, allowed: ctx.has(p) };
}

export function friendlyError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "Unknown error";
  if (e.code === "42501") return "Not permitted: " + (e.message ?? "");
  if (e.code === "23505") return "A record with the same unique value already exists.";
  if (e.code === "23514") return "Rejected by a business rule: " + (e.message ?? "");
  return e.message ?? "Request failed";
}
