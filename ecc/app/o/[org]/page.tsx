import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { Card, Notice, PageHeader, Stat, Badge, toneFor } from "@/components/ui";

type K = Record<string, number>;
const fmt = (n: number, l: string) => new Intl.NumberFormat(l === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 0 }).format(n);

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await orgContext(org);
  const l = ctx.locale;
  if (!ctx.has("dashboard.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const { data, error } = await ctx.sb.rpc("dashboard_kpis", { p_org: ctx.org.id });
  const k = (data ?? {}) as K;
  const [{ data: risks }, { data: wf }] = await Promise.all([
    ctx.has("risk.read") ? ctx.sb.from("risk_register").select("title, score, status").eq("org_id", ctx.org.id).neq("status", "closed").order("score", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    ctx.has("workflow.read") ? ctx.sb.from("wf_instances").select("id, title, current_state, updated_at").eq("org_id", ctx.org.id).order("updated_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const usedPct = k.budget_total ? Math.round((k.budget_spent / k.budget_total) * 100) : 0;
  return (
    <>
      <PageHeader title={tr(l, "dashboard")} subtitle={ctx.org.name} />
      {error && <Notice tone="bad">{error.message}</Notice>}
      <p className="mb-4 text-xs text-muted">{l === "ar" ? "تعرض كل بطاقة البيانات المسموح لدورك برؤيتها فقط." : "Each figure only counts records your role is allowed to read."}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {ctx.has("finance.read") && <>
          <Stat label={l === "ar" ? "مستحقات دائنة مفتوحة" : "Open payables"} value={fmt(k.payables_open ?? 0, l)} />
          <Stat label={l === "ar" ? "مستحقات مدينة مفتوحة" : "Open receivables"} value={fmt(k.receivables_open ?? 0, l)} />
          <Stat label={l === "ar" ? "فواتير متأخرة" : "Overdue invoices"} value={k.invoices_overdue ?? 0} tone={k.invoices_overdue ? "bad" : "default"} />
          <Stat label={l === "ar" ? "استخدام الموازنة" : "Budget used"} value={`${usedPct}%`} tone={usedPct > 90 ? "warn" : "default"} />
        </>}
        {ctx.has("hr.read") && <>
          <Stat label={l === "ar" ? "عدد الموظفين" : "Headcount"} value={k.headcount ?? 0} />
          <Stat label={l === "ar" ? "إجازات معلقة" : "Pending leave"} value={k.leave_pending ?? 0} />
        </>}
        {ctx.has("ops.read") && <>
          <Stat label={l === "ar" ? "أوامر عمل مفتوحة" : "Open work orders"} value={k.work_orders_open ?? 0} />
          <Stat label={l === "ar" ? "حرجة" : "Critical work orders"} value={k.work_orders_critical ?? 0} tone={k.work_orders_critical ? "bad" : "default"} />
        </>}
        {ctx.has("risk.read") && <>
          <Stat label={l === "ar" ? "مخاطر عالية" : "High risks (score ≥ 15)"} value={k.risks_high ?? 0} tone={k.risks_high ? "warn" : "default"} />
          <Stat label={l === "ar" ? "فجوات امتثال" : "Compliance gaps"} value={k.compliance_gaps ?? 0} tone={k.compliance_gaps ? "warn" : "default"} />
        </>}
        {ctx.has("workflow.read") && <Stat label={l === "ar" ? "مسارات عمل" : "Workflow instances"} value={k.workflows_active ?? 0} />}
        {ctx.has("agents.read") && <Stat label={l === "ar" ? "وكلاء نشطون" : "Active agents"} value={k.agents_active ?? 0} />}
        {ctx.has("integrations.read") && <Stat label={l === "ar" ? "تكاملات متصلة" : "Connected integrations"} value={k.integrations_connected ?? 0} />}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {ctx.has("risk.read") && (
          <Card title={l === "ar" ? "أعلى المخاطر" : "Top open risks"}>
            <ul className="divide-y divide-line text-sm">
              {(risks ?? []).map((r) => <li key={r.title} className="flex justify-between gap-2 py-2"><span>{r.title}</span><Badge tone={r.score >= 15 ? "bad" : r.score >= 8 ? "warn" : "neutral"}>{r.score}</Badge></li>)}
              {!risks?.length && <li className="py-2 text-muted">{tr(l, "none")}</li>}
            </ul>
          </Card>
        )}
        {ctx.has("workflow.read") && (
          <Card title={l === "ar" ? "أحدث مسارات العمل" : "Recent workflow activity"}>
            <ul className="divide-y divide-line text-sm">
              {(wf ?? []).map((w) => <li key={w.id} className="flex justify-between gap-2 py-2"><a className="text-brand hover:underline" href={`/o/${org}/workflows/${w.id}`}>{w.title}</a><Badge tone={toneFor(w.current_state)}>{w.current_state}</Badge></li>)}
              {!wf?.length && <li className="py-2 text-muted">{tr(l, "none")}</li>}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
