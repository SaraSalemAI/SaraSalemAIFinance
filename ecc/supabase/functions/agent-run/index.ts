// Supabase Edge Function: executes an APPROVED AI agent run.
// Prepared by Sara Salem. Copyright Sara Salem 2026.
//
// - The caller's JWT is verified and their membership checked (agents.manage).
// - Only runs in status 'approved' are executed; results are written with the
//   service role, which clients never hold.
// - If ANTHROPIC_API_KEY is not set, the run is marked failed with an explicit
//   "provider not configured" error. Nothing is simulated.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ECC_APP_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: user } = await userClient.auth.getUser();
  if (!user?.user) return json({ error: "not authenticated" }, 401);

  let runId: string;
  try {
    ({ runId } = await req.json());
    if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error();
  } catch {
    return json({ error: "body must be {\"runId\": uuid}" }, 400);
  }

  // Read the run as the user: RLS proves they may see it.
  const { data: run } = await userClient.from("ai_agent_runs").select("id, org_id, agent_id, input, status").eq("id", runId).maybeSingle();
  if (!run) return json({ error: "run not found" }, 404);
  const { data: allowed } = await userClient.rpc("my_permissions", { p_org: run.org_id });
  if (!(allowed as string[] | null)?.includes("agents.manage")) return json({ error: "permission denied: agents.manage" }, 403);
  if (run.status !== "approved") return json({ error: `run is ${run.status}; only approved runs execute` }, 409);

  const admin = createClient(url, service);
  const { data: agent } = await admin.from("ai_agents").select("model, system_prompt, status").eq("id", run.agent_id).single();
  if (agent?.status !== "active") return json({ error: "agent is not active" }, 409);

  await admin.from("ai_agent_runs").update({ status: "running" }).eq("id", run.id);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    await admin.from("ai_agent_runs").update({ status: "failed", error: "Model provider not configured (ANTHROPIC_API_KEY missing)" }).eq("id", run.id);
    return json({ status: "failed", error: "provider not configured" }, 503);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: 1024,
        system: (agent.system_prompt ?? "") +
          "\nYou are an assistant inside an enterprise console. You cannot take actions; you only produce text for a human to review.",
        messages: [{ role: "user", content: run.input }],
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    const text = (body.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    await admin.from("ai_agent_runs").update({ status: "succeeded", output: text }).eq("id", run.id);
    return json({ status: "succeeded" });
  } catch (e) {
    await admin.from("ai_agent_runs").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", run.id);
    return json({ status: "failed" }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
