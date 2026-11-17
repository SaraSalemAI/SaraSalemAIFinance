"use server";
// Workflow engine actions. State changes go only through the wf_transition()
// database function, which checks the transition and the actor's permission.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgContext, friendlyError } from "@/lib/context";
import { definitionSchema, parseTransitions } from "@/lib/workflow";

const q = encodeURIComponent;

export async function createDefinition(fd: FormData) {
  const slug = String(fd.get("_org"));
  const back = `/o/${slug}/workflows`;
  const ctx = await orgContext(slug);
  if (!ctx.has("workflow.write")) redirect(`${back}?error=${q("Not permitted: workflow.write")}`);
  let transitions;
  try { transitions = parseTransitions(String(fd.get("transitions") ?? "")); }
  catch (e) { redirect(`${back}?error=${q((e as Error).message)}`); }
  const states = String(fd.get("states") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const p = definitionSchema.safeParse({ name: fd.get("name"), entity_type: fd.get("entity_type"), states, initial_state: states[0], transitions });
  if (!p.success) redirect(`${back}?error=${q(p.error.issues.map((i) => i.message).join("; "))}`);
  const { error } = await ctx.sb.from("wf_definitions").insert({ ...p.data, org_id: ctx.org.id });
  if (error) redirect(`${back}?error=${q(friendlyError(error))}`);
  revalidatePath(back);
  redirect(`${back}?ok=${q("Workflow definition created")}`);
}

export async function startInstance(fd: FormData) {
  const slug = String(fd.get("_org"));
  const back = `/o/${slug}/workflows`;
  const p = z.object({ def: z.string().uuid(), title: z.string().trim().min(1).max(160) }).safeParse({ def: fd.get("definition"), title: fd.get("title") });
  if (!p.success) redirect(`${back}?error=${q("Choose a workflow and give the case a title.")}`);
  const ctx = await orgContext(slug);
  const { data, error } = await ctx.sb.rpc("wf_start", { p_definition: p.data.def, p_title: p.data.title });
  if (error) redirect(`${back}?error=${q(friendlyError(error))}`);
  redirect(`${back}/${data}`);
}

export async function transition(fd: FormData) {
  const slug = String(fd.get("_org")), id = String(fd.get("_id"));
  const back = `/o/${slug}/workflows/${id}`;
  const p = z.object({ to: z.string().regex(/^[a-z0-9_]{1,40}$/), comment: z.string().max(1000) }).safeParse({ to: fd.get("to"), comment: fd.get("comment") ?? "" });
  if (!p.success) redirect(`${back}?error=${q("Invalid transition")}`);
  const ctx = await orgContext(slug);
  const { error } = await ctx.sb.rpc("wf_transition", { p_instance: id, p_to: p.data.to, p_comment: p.data.comment || null });
  if (error) redirect(`${back}?error=${q(friendlyError(error))}`);
  revalidatePath(back);
  redirect(`${back}?ok=${q("Moved to " + p.data.to)}`);
}
