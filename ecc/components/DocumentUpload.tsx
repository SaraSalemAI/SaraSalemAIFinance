"use client";
// Uploads straight to the private `documents` bucket under <org_id>/<folder>/.
// Storage RLS checks documents.write for that org; this UI does not decide access.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export function DocumentUpload({ orgId, folders, label }: { orgId: string; folders: string[]; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null, folder = String(fd.get("folder"));
    if (!file?.size) return setMsg("Choose a file.");
    if (!ALLOWED.includes(file.type)) return setMsg("File type not allowed.");
    if (file.size > 25 * 1024 * 1024) return setMsg("Maximum size is 25 MB.");
    setBusy(true);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
    const { error } = await supabaseBrowser().storage.from("documents").upload(`${orgId}/${folder}/${Date.now()}-${safe}`, file, { contentType: file.type });
    setBusy(false);
    setMsg(error ? `Upload refused: ${error.message}` : "Uploaded.");
    if (!error) { e.currentTarget.reset(); router.refresh(); }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><label htmlFor="doc-folder" className="mb-1 block text-xs text-muted">Folder</label>
        <select id="doc-folder" name="folder" className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">{folders.map((f) => <option key={f}>{f}</option>)}</select></div>
      <div><label htmlFor="doc-file" className="mb-1 block text-xs text-muted">File</label><input id="doc-file" name="file" type="file" accept={ALLOWED.join(",")} className="text-sm" /></div>
      <button disabled={busy} className="min-h-10 rounded-md bg-brand px-4 text-sm font-medium text-on-brand disabled:opacity-50">{label}</button>
      {msg && <p role="status" className="w-full text-sm">{msg}</p>}
    </form>
  );
}
