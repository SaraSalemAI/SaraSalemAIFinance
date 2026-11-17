import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { Badge, Notice, PageHeader, Table } from "@/components/ui";

export default async function Audit({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ verify?: string; table?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("audit.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  let qy = ctx.sb.from("audit_log").select("id, actor, action, table_name, record_id, created_at, hash").eq("org_id", ctx.org.id).order("id", { ascending: false }).limit(200);
  if (sp.table && /^[a-z_]{1,40}$/.test(sp.table)) qy = qy.eq("table_name", sp.table);
  const { data: rows } = await qy;
  const chain = sp.verify ? await ctx.sb.rpc("verify_audit_chain", { p_org: ctx.org.id }) : null;
  const res = (chain?.data as { ok: boolean; checked: number; first_bad_id: number | null }[] | null)?.[0];
  return (
    <>
      <PageHeader title={tr(l, "audit")} subtitle={l === "ar" ? "سجل إلحاقي فقط، مربوط بسلسلة تجزئة SHA-256 لكل مؤسسة." : "Append-only, written by database triggers and SHA-256 hash-chained per organization."}
        actions={<a className="inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm hover:bg-chip" href={`/o/${org}/audit?verify=1`}>{tr(l, "verifyChain")}</a>} />
      {res && (res.ok ? <Notice tone="ok">{tr(l, "chainOk")} — {res.checked}</Notice> : <Notice tone="bad">{tr(l, "chainBroken")} #{res.first_bad_id}</Notice>)}
      {chain?.error && <Notice tone="bad">{chain.error.message}</Notice>}
      <Table head={["#", l === "ar" ? "الوقت" : "When", l === "ar" ? "الإجراء" : "Action", l === "ar" ? "الجدول" : "Table", l === "ar" ? "السجل" : "Record", l === "ar" ? "المنفّذ" : "Actor", "Hash"]} empty={rows?.length ? undefined : tr(l, "none")}>
        {(rows ?? []).map((r) => (
          <tr key={r.id}><td className="px-3 py-2 tabular-nums">{r.id}</td><td className="px-3 py-2 tabular-nums">{new Date(r.created_at).toLocaleString(l === "ar" ? "ar-EG" : "en-GB")}</td>
            <td className="px-3 py-2"><Badge tone={r.action === "delete" ? "bad" : r.action === "insert" ? "ok" : "info"}>{r.action}</Badge></td>
            <td className="px-3 py-2"><a className="text-brand underline" href={`/o/${org}/audit?table=${r.table_name}`}>{r.table_name}</a></td>
            <td className="px-3 py-2 font-mono text-xs">{r.record_id?.slice(0, 8)}</td><td className="px-3 py-2 font-mono text-xs">{r.actor?.slice(0, 8) ?? "system"}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.hash.slice(0, 12)}…</td></tr>
        ))}
      </Table>
    </>
  );
}
