import { orgContext } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { DocumentUpload } from "@/components/DocumentUpload";
import { Card, Notice, PageHeader, Table } from "@/components/ui";

const FOLDERS = ["finance", "hr", "operations", "governance", "risk", "general"];

export default async function Documents({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("documents.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const store = ctx.sb.storage.from("documents");
  const lists = await Promise.all(FOLDERS.map(async (f) => ({ f, r: await store.list(`${ctx.org.id}/${f}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } }) })));
  const files = lists.flatMap(({ f, r }) => (r.data ?? []).filter((x) => x.id).map((x) => ({ folder: f, name: x.name, size: x.metadata?.size as number | undefined, path: `${ctx.org.id}/${f}/${x.name}` })));
  // Short-lived signed URLs; the bucket is private.
  const signed = files.length ? await store.createSignedUrls(files.map((x) => x.path), 300) : { data: [] };
  return (
    <>
      <PageHeader title={tr(l, "documents")} subtitle={l === "ar" ? "مستودع خاص؛ الروابط صالحة 5 دقائق." : "Private bucket; download links expire after 5 minutes."} />
      {ctx.has("documents.write") && <Card title={tr(l, "upload")} className="mb-6"><DocumentUpload orgId={ctx.org.id} folders={FOLDERS} label={tr(l, "upload")} /></Card>}
      <Table head={[l === "ar" ? "المجلد" : "Folder", l === "ar" ? "الملف" : "File", l === "ar" ? "الحجم" : "Size"]} empty={files.length ? undefined : tr(l, "none")}>
        {files.map((x, i) => (
          <tr key={x.path}><td className="px-3 py-2">{x.folder}</td>
            <td className="px-3 py-2">{signed.data?.[i]?.signedUrl ? <a className="text-brand underline" href={signed.data[i].signedUrl} rel="noopener">{x.name}</a> : x.name}</td>
            <td className="px-3 py-2 tabular-nums">{x.size ? `${Math.ceil(x.size / 1024)} KB` : "—"}</td></tr>
        ))}
      </Table>
    </>
  );
}
