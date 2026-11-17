"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgContext, friendlyError } from "@/lib/context";

const q = encodeURIComponent;
const back = (s: string, m: string, ok = false) => `/o/${s}/agents?${ok ? "ok" : "error"}=${q(m)}`;

export async function saveAgent(fd: FormData) {
  const slug = String(fd.get("_org"));
  const p = z.object({
    name: z.string().trim().min(1).max(80), purpose: z.string().trim().min(1).max(500),
    model: z.string().regex(/^[a-z0-9.-]{3,60}$/), system_prompt: z.string().max(8000),
  }).safeParse({ name: fd.get("name"), purpose: fd.get("purpose"), model: fd.get("model"), system_prompt: fd.get("system_prompt") ?? "" });
  if (!p.success) redirect(back(slug, "Check name, purpose and model id."));
  const ctx = await orgContext(slug);
  const { error } = await ctx.sb.from("ai_agents").insert({ ...p.data, org_id: ctx.org.id });
  if (error) redirect(back(slug, friendlyError(error)));
  revalidatePath(`/o/${slug}/agents`); redirect(back(slug, "Agent registered (disabled until activated)", true));
}

export async function setAgentStatus(fd: FormData) {
  const slug = String(fd.get("_org")), id = String(fd.get("_id"));
  const status = fd.get("status") === "active" ? "active" : "disabled";
  const ctx = await orgContext(slug);
  const { error, data } = await ctx.sb.from("ai_agents").update({ status }).eq("id", id).eq("org_id", ctx.org.id).select("id");
  if (error || !data?.length) redirect(back(slug, error ? friendlyError(error) : "Not permitted"));
  revalidatePath(`/o/${slug}/agents`); redirect(back(slug, `Agent ${status}`, true));
}

export async function requestRun(fd: FormData) {
  const slug = String(fd.get("_org"));
  const p = z.object({ agent: z.string().uuid(), input: z.string().trim().min(1).max(8000) }).safeParse({ agent: fd.get("agent"), input: fd.get("input") });
  if (!p.success) redirect(back(slug, "Choose an agent and enter a request."));
  const ctx = await orgContext(slug);
  const { error } = await ctx.sb.from("ai_agent_runs").insert({ org_id: ctx.org.id, agent_id: p.data.agent, input: p.data.input });
  if (error) redirect(back(slug, friendlyError(error)));
  revalidatePath(`/o/${slug}/agents`); redirect(back(slug, "Run requested — awaiting approval by another manager", true));
}

export async function decideRun(fd: FormData) {
  const slug = String(fd.get("_org")), id = String(fd.get("_id"));
  const status = fd.get("decision") === "approved" ? "approved" : "rejected";
  const ctx = await orgContext(slug);
  const { error, data } = await ctx.sb.from("ai_agent_runs").update({ status }).eq("id", id).eq("org_id", ctx.org.id).select("id");
  if (error || !data?.length) redirect(back(slug, error ? friendlyError(error) : "Not permitted"));
  revalidatePath(`/o/${slug}/agents`); redirect(back(slug, `Run ${status}`, true));
}

export async function executeRun(fd: FormData) {
  const slug = String(fd.get("_org")), id = String(fd.get("_id"));
  const ctx = await orgContext(slug);
  if (!ctx.has("agents.manage")) redirect(back(slug, "Not permitted: agents.manage"));
  const { data, error } = await ctx.sb.functions.invoke("agent-run", { body: { runId: id } });
  revalidatePath(`/o/${slug}/agents`);
  if (error) redirect(back(slug, "Execution service: " + (error.message ?? "unavailable") + ". See the run's error column."));
  redirect(back(slug, "Run " + (data?.status ?? "finished"), true));
}
