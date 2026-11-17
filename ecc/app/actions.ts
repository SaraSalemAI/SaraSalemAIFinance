"use server";
// Auth, locale and organization actions. Prepared by Sara Salem. Copyright Sara Salem 2026.
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { demoMode } from "@/lib/env";
import { friendlyError } from "@/lib/context";

const creds = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
const q = (s: string) => encodeURIComponent(s);

export async function signIn(fd: FormData) {
  const p = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) redirect("/login?error=" + q("Enter a valid e-mail and a password of at least 10 characters."));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword(p.data);
  if (error) redirect("/login?error=" + q("Sign-in failed. Check your e-mail and password."));
  redirect("/");
}

export async function signUp(fd: FormData) {
  const p = creds.extend({ full_name: z.string().trim().min(2).max(120) })
    .safeParse({ email: fd.get("email"), password: fd.get("password"), full_name: fd.get("full_name") });
  if (!p.success) redirect("/login?mode=signup&error=" + q("Name, valid e-mail and a password of at least 10 characters are required."));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({
    email: p.data.email, password: p.data.password,
    options: { data: { full_name: p.data.full_name }, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback` },
  });
  if (error) redirect("/login?mode=signup&error=" + q(error.message));
  redirect("/login?ok=" + q("Check your inbox to confirm your e-mail, then sign in."));
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

export async function setLocale(fd: FormData) {
  const l = fd.get("locale") === "ar" ? "ar" : "en";
  (await cookies()).set("ecc_locale", l, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const back = String(fd.get("back") ?? "/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

const orgSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,48}$/) });

export async function createOrg(fd: FormData) {
  const p = orgSchema.safeParse({ name: fd.get("name"), slug: fd.get("slug") });
  if (!p.success) redirect("/onboarding?error=" + q("Name 2–120 characters; address 3–48 of a-z, 0-9 and -."));
  const sb = await supabaseServer();
  const demo = fd.get("demo") === "on";
  if (demo && !demoMode()) redirect("/onboarding?error=" + q("Demo organizations are disabled in this environment."));
  const { error } = demo
    ? await sb.rpc("create_demo_organization", { p_name: p.data.name, p_slug: p.data.slug })
    : await sb.rpc("create_organization", { p_name: p.data.name, p_slug: p.data.slug, p_locale: "en" });
  if (error) redirect("/onboarding?error=" + q(friendlyError(error)));
  redirect(`/o/${p.data.slug}`);
}
