import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { orgContext, friendlyError } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { CATALOG, connector } from "@/lib/integrations";
import { Badge, Button, Notice, PageHeader, Table } from "@/components/ui";

async function register(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org")), provider = String(fd.get("provider"));
  const c = connector(provider);
  const ctx = await orgContext(slug);
  if (!c?.implemented) redirect(`/o/${slug}/integrations?error=${encodeURIComponent("This connector is not implemented in this release.")}`);
  // Registering records intent; status stays not_configured until server-side secrets exist and a check passes.
  const { error } = await ctx.sb.from("int_connections").upsert({ org_id: ctx.org.id, provider, display_name: c.name, status: "not_configured" }, { onConflict: "org_id,provider" });
  if (error) redirect(`/o/${slug}/integrations?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath(`/o/${slug}/integrations`);
  redirect(`/o/${slug}/integrations`);
}

export default async function Integrations({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("integrations.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const { data: conns } = await ctx.sb.from("int_connections").select("provider, status, last_checked_at").eq("org_id", ctx.org.id);
  const manage = ctx.has("integrations.manage");
  return (
    <>
      <PageHeader title={tr(l, "integrations")} />
      <Notice tone="info">{tr(l, "integrationNote")}</Notice>
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      <Table head={[l === "ar" ? "الموصل" : "Connector", l === "ar" ? "الفئة" : "Category", tr(l, "status"), l === "ar" ? "ملاحظات" : "Notes", ...(manage ? [tr(l, "actions")] : [])]}>
        {CATALOG.map((c) => {
          const conn = conns?.find((x) => x.provider === c.provider);
          const status = !c.implemented ? "unavailable" : conn?.status ?? "not_registered";
          return (
            <tr key={c.provider}>
              <td className="px-3 py-2 font-medium">{c.name}</td><td className="px-3 py-2">{c.category}</td>
              <td className="px-3 py-2"><Badge tone={status === "connected" ? "ok" : status === "unavailable" ? "neutral" : "warn"}>
                {status === "unavailable" ? tr(l, "unavailable") : status === "not_configured" ? tr(l, "notConfigured") : status.replaceAll("_", " ")}</Badge></td>
              <td className="px-3 py-2 text-muted">{c.note}</td>
              {manage && <td className="px-3 py-2">{c.implemented && !conn && (
                <form action={register}><input type="hidden" name="_org" value={org} /><input type="hidden" name="provider" value={c.provider} /><Button variant="secondary">{l === "ar" ? "تسجيل" : "Register"}</Button></form>)}</td>}
            </tr>
          );
        })}
      </Table>
    </>
  );
}
