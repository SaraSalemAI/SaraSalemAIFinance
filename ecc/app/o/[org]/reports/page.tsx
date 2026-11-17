import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { orgContext, friendlyError } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { MODULES } from "@/lib/resources";
import { Button, Card, Input, Label, Notice, PageHeader, Select, Table } from "@/components/ui";

const SOURCES: Record<string, string[]> = Object.fromEntries(
  Object.values(MODULES).flatMap((m) => m.resources).map((r) => [r.table, r.fields.filter((f) => f.type === "select" || f.type === "boolean").map((f) => f.name)]),
);

async function createReport(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org"));
  const [source, group_by] = String(fd.get("spec") ?? "").split(":");
  const p = z.object({ name: z.string().trim().min(1).max(120), source: z.string(), group_by: z.string() })
    .refine((v) => SOURCES[v.source]?.includes(v.group_by), "Invalid source/column").safeParse({ name: fd.get("name"), source, group_by });
  if (!p.success) redirect(`/o/${slug}/reports?error=${encodeURIComponent("Choose a name and a dimension.")}`);
  const ctx = await orgContext(slug);
  const { error } = await ctx.sb.from("reports").insert({ ...p.data, org_id: ctx.org.id });
  if (error) redirect(`/o/${slug}/reports?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath(`/o/${slug}/reports`); redirect(`/o/${slug}/reports`);
}

export default async function Reports({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; run?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("reports.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const { data: reports } = await ctx.sb.from("reports").select("*").eq("org_id", ctx.org.id).order("name");
  const selected = reports?.find((r) => r.id === sp.run);
  const result = selected ? await ctx.sb.rpc("run_report", { p_report: selected.id }) : null;
  return (
    <>
      <PageHeader title={tr(l, "reports")} subtitle={l === "ar" ? "تُحسب التقارير بصلاحياتك؛ لا تظهر بيانات من وحدات لا يمكنك قراءتها." : "Reports run with your own access rights — modules you cannot read return no rows."} />
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {ctx.has("reports.manage") && (
        <Card title={l === "ar" ? "تقرير جديد" : "New report"} className="mb-6">
          <form action={createReport} className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-end gap-3">
            <input type="hidden" name="_org" value={org} />
            <div><Label htmlFor="rp-name">{l === "ar" ? "الاسم" : "Name"}</Label><Input id="rp-name" name="name" required maxLength={120} /></div>
            <div><Label htmlFor="rp-spec">{l === "ar" ? "عدّ السجلات حسب" : "Count records by"}</Label>
              <Select id="rp-spec" name="spec">{Object.entries(SOURCES).flatMap(([t, cols]) => cols.map((c) => <option key={t + c} value={`${t}:${c}`}>{t} → {c}</option>))}</Select></div>
            <Button type="submit">{tr(l, "create")}</Button>
          </form>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Table head={[l === "ar" ? "التقرير" : "Report", l === "ar" ? "المصدر" : "Source", ""]} empty={reports?.length ? undefined : tr(l, "none")}>
          {(reports ?? []).map((r) => <tr key={r.id}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-xs">{r.source} → {r.group_by}</td>
            <td className="px-3 py-2"><a className="text-brand underline" href={`/o/${org}/reports?run=${r.id}`}>{tr(l, "run")}</a></td></tr>)}
        </Table>
        {selected && (
          <Card title={selected.name}>
            {result?.error ? <Notice tone="bad">{friendlyError(result.error)}</Notice> : (
              <ul className="space-y-2 text-sm">
                {((result?.data ?? []) as { bucket: string; total: number }[]).map((b) => {
                  const max = Math.max(...((result?.data ?? []) as { total: number }[]).map((x) => x.total), 1);
                  return <li key={b.bucket}><div className="flex justify-between"><span>{b.bucket}</span><span className="tabular-nums">{b.total}</span></div>
                    <div className="mt-1 h-2 rounded bg-chip"><div className="h-2 rounded bg-brand" style={{ width: `${(b.total / max) * 100}%` }} /></div></li>;
                })}
                {!result?.data?.length && <li className="text-muted">{tr(l, "none")}</li>}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
