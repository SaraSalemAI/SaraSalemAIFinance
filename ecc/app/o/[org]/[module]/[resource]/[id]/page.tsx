import Link from "next/link";
import { notFound } from "next/navigation";
import { orgContext } from "@/lib/context";
import { findResource, MODULES } from "@/lib/resources";
import { loadRefs } from "@/lib/refs";
import { tr } from "@/lib/i18n";
import { ResourceForm } from "@/components/ResourceForm";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function EditRecord({ params, searchParams }: {
  params: Promise<{ org: string; module: string; resource: string; id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { org, module, resource, id } = await params;
  const { error: err } = await searchParams;
  const r = findResource(module, resource);
  if (!r || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await orgContext(org);
  const l = ctx.locale;
  if (!ctx.has(r.write)) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const { data } = await ctx.sb.from(r.table).select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const refs = await loadRefs(ctx, r);
  return (
    <>
      <PageHeader title={`${tr(l, "edit")} — ${r.title[l]}`} subtitle={MODULES[module].title[l]}
        actions={<Link className="text-sm text-brand underline" href={`/o/${org}/${module}?r=${resource}`}>{tr(l, "cancel")}</Link>} />
      {err && <Notice tone="bad">{err}</Notice>}
      <Card><ResourceForm r={r} l={l} org={org} module={module} refs={refs} values={data} id={id} /></Card>
    </>
  );
}
