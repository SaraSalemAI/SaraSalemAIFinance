"use server";
// Generic, validated CRUD for registry resources. Authorization is re-checked
// server-side and enforced again by RLS + triggers in the database.
// Prepared by Sara Salem. Copyright Sara Salem 2026.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { orgContext, friendlyError } from "@/lib/context";
import { findResource, schemaFor } from "@/lib/resources";

const q = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveRecord(fd: FormData) {
  const slug = String(fd.get("_org")), mod = String(fd.get("_module")), key = String(fd.get("_resource"));
  const id = String(fd.get("_id") ?? "");
  const r = findResource(mod, key);
  if (!r) redirect(`/o/${slug}`);
  const back = `/o/${slug}/${mod}?r=${key}`;
  const ctx = await orgContext(slug);
  if (!ctx.has(r.write)) redirect(`${back}&error=${q("Not permitted: " + r.write)}`);

  const raw: Record<string, unknown> = {};
  for (const f of r.fields) raw[f.name] = f.type === "boolean" ? fd.get(f.name) ?? "false" : fd.get(f.name) ?? undefined;
  const parsed = schemaFor(r).safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    redirect(`${id ? `/o/${slug}/${mod}/${key}/${id}?` : back + "&"}error=${q(msg)}`);
  }
  const row = { ...parsed.data, org_id: ctx.org.id };
  const res = id && UUID.test(id)
    ? await ctx.sb.from(r.table).update(parsed.data).eq("id", id).eq("org_id", ctx.org.id).select("id")
    : await ctx.sb.from(r.table).insert(row).select("id");
  if (res.error) redirect(`${id ? `/o/${slug}/${mod}/${key}/${id}?` : back + "&"}error=${q(friendlyError(res.error))}`);
  if (!res.data?.length) redirect(`${back}&error=${q("No row changed — it may not exist or you may lack access.")}`);
  revalidatePath(`/o/${slug}`, "layout");
  redirect(`${back}&ok=${q("Saved")}`);
}

export async function deleteRecord(fd: FormData) {
  const slug = String(fd.get("_org")), mod = String(fd.get("_module")), key = String(fd.get("_resource")), id = String(fd.get("_id"));
  const r = findResource(mod, key);
  if (!r || !UUID.test(id)) redirect(`/o/${slug}`);
  const back = `/o/${slug}/${mod}?r=${key}`;
  const ctx = await orgContext(slug);
  if (!ctx.has(r.write)) redirect(`${back}&error=${q("Not permitted")}`);
  const { error, data } = await ctx.sb.from(r.table).delete().eq("id", id).eq("org_id", ctx.org.id).select("id");
  if (error) redirect(`${back}&error=${q(friendlyError(error))}`);
  if (!data?.length) redirect(`${back}&error=${q("Nothing deleted.")}`);
  revalidatePath(`/o/${slug}`, "layout");
  redirect(`${back}&ok=${q("Deleted")}`);
}
