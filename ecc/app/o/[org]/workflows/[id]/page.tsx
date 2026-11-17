import { notFound } from "next/navigation";
import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { nextStates, type Transition } from "@/lib/workflow";
import { transition } from "../actions";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Table, toneFor } from "@/components/ui";

export default async function Instance({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { org, id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await orgContext(org); const l = ctx.locale;
  const { data: inst } = await ctx.sb.from("wf_instances").select("*, wf_definitions(name, transitions)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!inst) notFound();
  const def = inst.wf_definitions as { name: string; transitions: Transition[] };
  const { data: hist } = await ctx.sb.from("wf_transitions").select("from_state, to_state, comment, created_at, actor").eq("instance_id", id).order("id");
  const options = nextStates(def.transitions, inst.current_state, ctx.perms);
  return (
    <>
      <PageHeader title={inst.title} subtitle={def.name} actions={<Badge tone={toneFor(inst.current_state)}>{inst.current_state}</Badge>} />
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <Card title={tr(l, "moveTo")} className="mb-6">
        {options.length ? (
          <form action={transition} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="_org" value={org} /><input type="hidden" name="_id" value={id} />
            <div className="min-w-60 flex-1"><Label htmlFor="comment">{tr(l, "comment")}</Label><Input id="comment" name="comment" maxLength={1000} /></div>
            {options.map((s) => <Button key={s} name="to" value={s} variant={s.includes("reject") ? "secondary" : "primary"}>{s.replaceAll("_", " ")}</Button>)}
          </form>
        ) : <p className="text-sm text-muted">{l === "ar" ? "لا توجد انتقالات متاحة لدورك من هذه الحالة." : "No transitions are available to your role from this state."}</p>}
        <p className="mt-3 text-xs text-muted">{l === "ar" ? "يتحقق الخادم من كل انتقال وصلاحيته وقاعدة العينين الأربع." : "Every move is re-checked in the database: the transition must exist, you must hold its permission, and four-eyes steps cannot be taken by the case initiator."}</p>
      </Card>
      <h2 className="mb-2 text-sm font-semibold">{tr(l, "history")}</h2>
      <Table head={[l === "ar" ? "من" : "From", l === "ar" ? "إلى" : "To", tr(l, "comment"), l === "ar" ? "الوقت" : "When"]} empty={hist?.length ? undefined : tr(l, "none")}>
        {(hist ?? []).map((h, i) => <tr key={i}><td className="px-3 py-2">{h.from_state}</td><td className="px-3 py-2">{h.to_state}</td><td className="px-3 py-2">{h.comment ?? "—"}</td><td className="px-3 py-2 tabular-nums">{new Date(h.created_at).toLocaleString(l === "ar" ? "ar-EG" : "en-GB")}</td></tr>)}
      </Table>
    </>
  );
}
