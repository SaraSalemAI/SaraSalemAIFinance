import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { saveAgent, setAgentStatus, requestRun, decideRun, executeRun } from "./actions";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select, Table, Textarea, toneFor } from "@/components/ui";

export default async function Agents({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("agents.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const manage = ctx.has("agents.manage");
  const [{ data: agents }, { data: runs }] = await Promise.all([
    ctx.sb.from("ai_agents").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.sb.from("ai_agent_runs").select("*").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const H = (v: string) => <input type="hidden" name="_org" value={v} />;
  return (
    <>
      <PageHeader title={tr(l, "agents")} />
      <Notice tone="info">{tr(l, "agentNote")}</Notice>
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        {manage && (
          <Card title={l === "ar" ? "تسجيل وكيل" : "Register an agent"}>
            <form action={saveAgent} className="flex flex-col gap-3">{H(org)}
              <div><Label htmlFor="a-name">{l === "ar" ? "الاسم" : "Name"}</Label><Input id="a-name" name="name" required maxLength={80} /></div>
              <div><Label htmlFor="a-purpose">{l === "ar" ? "الغرض" : "Purpose"}</Label><Input id="a-purpose" name="purpose" required maxLength={500} /></div>
              <div><Label htmlFor="a-model">{l === "ar" ? "النموذج" : "Model id"}</Label><Input id="a-model" name="model" defaultValue="claude-sonnet-5-5" required /></div>
              <div><Label htmlFor="a-sys">{l === "ar" ? "التعليمات" : "Instructions (system prompt)"}</Label><Textarea id="a-sys" name="system_prompt" rows={4} maxLength={8000} /></div>
              <Button type="submit">{tr(l, "create")}</Button>
            </form>
          </Card>
        )}
        {!!agents?.some((a) => a.status === "active") && (
          <Card title={l === "ar" ? "طلب تشغيل" : "Request a run"}>
            <form action={requestRun} className="flex flex-col gap-3">{H(org)}
              <div><Label htmlFor="r-agent">{l === "ar" ? "الوكيل" : "Agent"}</Label>
                <Select id="r-agent" name="agent">{agents!.filter((a) => a.status === "active").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
              <div><Label htmlFor="r-input">{l === "ar" ? "الطلب" : "Request"}</Label><Textarea id="r-input" name="input" rows={4} required maxLength={8000} /></div>
              <Button type="submit">{tr(l, "run")}</Button>
            </form>
          </Card>
        )}
      </div>
      <h2 className="mb-2 mt-8 text-sm font-semibold">{l === "ar" ? "الوكلاء" : "Registered agents"}</h2>
      <Table head={[l === "ar" ? "الاسم" : "Name", l === "ar" ? "الغرض" : "Purpose", l === "ar" ? "النموذج" : "Model", tr(l, "status"), ...(manage ? [tr(l, "actions")] : [])]} empty={agents?.length ? undefined : tr(l, "none")}>
        {(agents ?? []).map((a) => (
          <tr key={a.id}><td className="px-3 py-2">{a.name}</td><td className="px-3 py-2">{a.purpose}</td><td className="px-3 py-2 font-mono text-xs">{a.model}</td>
            <td className="px-3 py-2"><Badge tone={toneFor(a.status)}>{a.status}</Badge></td>
            {manage && <td className="px-3 py-2"><form action={setAgentStatus}>{H(org)}<input type="hidden" name="_id" value={a.id} />
              <input type="hidden" name="status" value={a.status === "active" ? "disabled" : "active"} />
              <button className="text-brand underline">{a.status === "active" ? (l === "ar" ? "تعطيل" : "Disable") : (l === "ar" ? "تفعيل" : "Activate")}</button></form></td>}
          </tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-8 text-sm font-semibold">{l === "ar" ? "عمليات التشغيل" : "Runs"}</h2>
      <Table head={[l === "ar" ? "الطلب" : "Request", tr(l, "status"), l === "ar" ? "النتيجة" : "Output / error", ...(manage ? [tr(l, "actions")] : [])]} empty={runs?.length ? undefined : tr(l, "none")}>
        {(runs ?? []).map((r) => (
          <tr key={r.id} className="align-top">
            <td className="max-w-xs px-3 py-2">{r.input}</td><td className="px-3 py-2"><Badge tone={toneFor(r.status)}>{r.status}</Badge></td>
            <td className="max-w-md whitespace-pre-wrap px-3 py-2">{r.output ?? (r.error ? <span className="text-bad">{r.error}</span> : "—")}</td>
            {manage && <td className="px-3 py-2">
              {r.status === "requested" && r.requested_by !== ctx.user.id && (
                <form action={decideRun} className="flex gap-2">{H(org)}<input type="hidden" name="_id" value={r.id} />
                  <Button name="decision" value="approved">{tr(l, "approve")}</Button><Button variant="secondary" name="decision" value="rejected">{tr(l, "reject")}</Button></form>)}
              {r.status === "approved" && (<form action={executeRun}>{H(org)}<input type="hidden" name="_id" value={r.id} /><Button>{tr(l, "execute")}</Button></form>)}
            </td>}
          </tr>
        ))}
      </Table>
    </>
  );
}
