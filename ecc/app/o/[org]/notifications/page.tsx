import { revalidatePath } from "next/cache";
import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { LiveNotifications } from "@/components/LiveNotifications";
import { Badge, Button, PageHeader, Table } from "@/components/ui";

async function markRead(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org"));
  const ctx = await orgContext(slug);
  const id = String(fd.get("_id") ?? "");
  let q = ctx.sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("org_id", ctx.org.id).is("read_at", null);
  if (/^[0-9a-f-]{36}$/i.test(id)) q = q.eq("id", id);
  await q;
  revalidatePath(`/o/${slug}`, "layout");
}

export default async function Notifications({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await orgContext(org); const l = ctx.locale;
  const { data } = await ctx.sb.from("notifications").select("*").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title={tr(l, "notifications")} actions={<>
        <LiveNotifications userId={ctx.user.id} label={l === "ar" ? "مباشر" : "Live"} />
        <form action={markRead}><input type="hidden" name="_org" value={org} /><Button variant="secondary">{tr(l, "markRead")}</Button></form></>} />
      <Table head={[l === "ar" ? "العنوان" : "Title", l === "ar" ? "التفاصيل" : "Details", l === "ar" ? "الوقت" : "When", ""]} empty={data?.length ? undefined : tr(l, "none")}>
        {(data ?? []).map((n) => (
          <tr key={n.id} className={n.read_at ? "text-muted" : ""}>
            <td className="px-3 py-2">{n.title} <Badge tone="info">{n.kind}</Badge></td>
            <td className="px-3 py-2">{n.link ? <a className="text-brand underline" href={`/o/${org}${n.link}`}>{n.body}</a> : n.body}</td>
            <td className="px-3 py-2 tabular-nums">{new Date(n.created_at).toLocaleString(l === "ar" ? "ar-EG" : "en-GB")}</td>
            <td className="px-3 py-2">{!n.read_at && <form action={markRead}><input type="hidden" name="_org" value={org} /><input type="hidden" name="_id" value={n.id} /><button className="text-brand underline">{tr(l, "markRead")}</button></form>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
