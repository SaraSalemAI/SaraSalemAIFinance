import Link from "next/link";
import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { createDefinition, startInstance } from "./actions";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select, Table, Textarea, toneFor } from "@/components/ui";

export default async function Workflows({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("workflow.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const [{ data: defs }, { data: inst }] = await Promise.all([
    ctx.sb.from("wf_definitions").select("id, name, entity_type, states, transitions, is_active").eq("org_id", ctx.org.id).order("name"),
    ctx.sb.from("wf_instances").select("id, title, current_state, definition_id, updated_at").eq("org_id", ctx.org.id).order("updated_at", { ascending: false }).limit(100),
  ]);
  const defName = (id: string) => defs?.find((d) => d.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader title={tr(l, "workflows")} />
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        {ctx.has("workflow.act") && !!defs?.length && (
          <Card title={l === "ar" ? "بدء حالة" : "Start a case"}>
            <form action={startInstance} className="flex flex-col gap-3">
              <input type="hidden" name="_org" value={org} />
              <div><Label htmlFor="definition">{l === "ar" ? "سير العمل" : "Workflow"}</Label>
                <Select id="definition" name="definition" required>{defs.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
              <div><Label htmlFor="title">{l === "ar" ? "العنوان" : "Title"}</Label><Input id="title" name="title" required maxLength={160} /></div>
              <Button type="submit">{tr(l, "start")}</Button>
            </form>
          </Card>
        )}
        {ctx.has("workflow.write") && (
          <Card title={l === "ar" ? "تعريف سير عمل جديد" : "New workflow definition"}>
            <form action={createDefinition} className="flex flex-col gap-3">
              <input type="hidden" name="_org" value={org} />
              <div><Label htmlFor="name">{l === "ar" ? "الاسم" : "Name"}</Label><Input id="name" name="name" required maxLength={120} /></div>
              <div><Label htmlFor="entity_type">{l === "ar" ? "يطبق على" : "Applies to"}</Label>
                <Select id="entity_type" name="entity_type">{["generic","fin_invoices","hr_leave_requests","ops_work_orders","risk_register"].map((e) => <option key={e}>{e}</option>)}</Select></div>
              <div><Label htmlFor="states">{l === "ar" ? "الحالات (أولها البداية)" : "States, comma separated (first = initial)"}</Label><Input id="states" name="states" required placeholder="draft, review, approved, rejected" /></div>
              <div><Label htmlFor="transitions">{l === "ar" ? "الانتقالات" : "Transitions — one per line: from -> to : permission (add ! for four-eyes)"}</Label>
                <Textarea id="transitions" name="transitions" rows={5} required placeholder={"draft -> review : workflow.act\nreview -> approved : finance.approve !\nreview -> rejected : finance.approve"} /></div>
              <Button type="submit">{tr(l, "create")}</Button>
            </form>
          </Card>
        )}
      </div>
      <h2 className="mb-2 mt-8 text-sm font-semibold">{l === "ar" ? "التعريفات" : "Definitions"}</h2>
      <Table head={[l === "ar" ? "الاسم" : "Name", l === "ar" ? "يطبق على" : "Applies to", l === "ar" ? "الحالات" : "States", l === "ar" ? "الانتقالات" : "Transitions"]} empty={defs?.length ? undefined : tr(l, "none")}>
        {(defs ?? []).map((d) => (
          <tr key={d.id}><td className="px-3 py-2">{d.name}</td><td className="px-3 py-2">{d.entity_type}</td><td className="px-3 py-2">{d.states.join(" · ")}</td>
            <td className="px-3 py-2 text-xs">{(d.transitions as { from: string; to: string; permission: string; four_eyes?: boolean }[]).map((t, i) => <div key={i}>{t.from} → {t.to} <span className="text-muted">({t.permission}{t.four_eyes ? ", four-eyes" : ""})</span></div>)}</td></tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-8 text-sm font-semibold">{l === "ar" ? "الحالات" : "Cases"}</h2>
      <Table head={[l === "ar" ? "العنوان" : "Title", l === "ar" ? "سير العمل" : "Workflow", tr(l, "status")]} empty={inst?.length ? undefined : tr(l, "none")}>
        {(inst ?? []).map((i) => (
          <tr key={i.id}><td className="px-3 py-2"><Link className="text-brand underline" href={`/o/${org}/workflows/${i.id}`}>{i.title}</Link></td>
            <td className="px-3 py-2">{defName(i.definition_id)}</td><td className="px-3 py-2"><Badge tone={toneFor(i.current_state)}>{i.current_state}</Badge></td></tr>
        ))}
      </Table>
    </>
  );
}
