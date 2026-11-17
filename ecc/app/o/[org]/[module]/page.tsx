import Link from "next/link";
import { notFound } from "next/navigation";
import { orgContext } from "@/lib/context";
import { MODULES } from "@/lib/resources";
import { loadRefs } from "@/lib/refs";
import { tr } from "@/lib/i18n";
import { deleteRecord } from "../crud-actions";
import { ResourceForm } from "@/components/ResourceForm";
import { Badge, Card, Notice, PageHeader, Table, toneFor } from "@/components/ui";

export default async function ModulePage({ params, searchParams }: {
  params: Promise<{ org: string; module: string }>; searchParams: Promise<{ r?: string; error?: string; ok?: string }>;
}) {
  const { org, module } = await params;
  const sp = await searchParams;
  const m = MODULES[module];
  if (!m) notFound();
  const ctx = await orgContext(org);
  const l = ctx.locale;
  const r = m.resources.find((x) => x.key === sp.r) ?? m.resources[0];
  if (!ctx.has(r.read)) return <><PageHeader title={m.title[l]} /><Notice tone="warn">{tr(l, "noAccess")}</Notice></>;
  const [{ data: rows, error }, refs] = await Promise.all([
    ctx.sb.from(r.table).select("*").eq("org_id", ctx.org.id).order(r.order, { ascending: r.order === "score" ? false : true }).limit(200),
    loadRefs(ctx, r),
  ]);
  const canWrite = ctx.has(r.write);
  const show = (f: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    const fd = r.fields.find((x) => x.name === f);
    if (fd?.type === "ref") return refs[f]?.find((o) => o.id === v)?.label ?? "—";
    if (f === "status" || f === "classification" || f === "priority" || f === "effectiveness") return <Badge tone={toneFor(String(v))}>{String(v).replaceAll("_", " ")}</Badge>;
    if (typeof v === "boolean") return v ? "✓" : "—";
    if (f === "amount" || f === "spent") return new Intl.NumberFormat(l === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 2 }).format(Number(v));
    return String(v);
  };
  const label = (f: string) => r.fields.find((x) => x.name === f)?.label[l] ?? (f === "score" ? (l === "ar" ? "الدرجة" : "Score") : f);
  return (
    <>
      <PageHeader title={m.title[l]} />
      <nav aria-label="Sections" className="mb-4 flex flex-wrap gap-2">
        {m.resources.filter((x) => ctx.has(x.read)).map((x) => (
          <Link key={x.key} href={`/o/${org}/${module}?r=${x.key}`} aria-current={x.key === r.key ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm ${x.key === r.key ? "bg-brand text-on-brand" : "border border-line hover:bg-chip"}`}>{x.title[l]}</Link>
        ))}
      </nav>
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {error && <Notice tone="bad">{error.message}</Notice>}
      {canWrite && <Card title={`${tr(l, "create")} — ${r.title[l]}`} className="mb-6"><ResourceForm r={r} l={l} org={org} module={module} refs={refs} /></Card>}
      <Table head={[...r.list.map(label), ...(canWrite ? [tr(l, "actions")] : [])]} empty={rows?.length ? undefined : tr(l, "none")}>
        {(rows ?? []).map((row: Record<string, unknown>) => (
          <tr key={String(row.id)}>
            {r.list.map((f) => <td key={f} className="px-3 py-2">{show(f, row[f])}</td>)}
            {canWrite && (
              <td className="px-3 py-2">
                <div className="flex gap-3">
                  <Link className="text-brand underline" href={`/o/${org}/${module}/${r.key}/${row.id}`}>{tr(l, "edit")}</Link>
                  <form action={deleteRecord}>
                    <input type="hidden" name="_org" value={org} /><input type="hidden" name="_module" value={module} />
                    <input type="hidden" name="_resource" value={r.key} /><input type="hidden" name="_id" value={String(row.id)} />
                    <button className="text-bad underline">{tr(l, "delete")}</button>
                  </form>
                </div>
              </td>
            )}
          </tr>
        ))}
      </Table>
    </>
  );
}
