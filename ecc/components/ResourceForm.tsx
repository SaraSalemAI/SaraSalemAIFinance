import type { Resource } from "@/lib/resources";
import type { Locale } from "@/lib/i18n";
import { tr } from "@/lib/i18n";
import { saveRecord } from "@/app/o/[org]/crud-actions";
import { Button, Input, Label, Select, Textarea } from "./ui";

export type RefOptions = Record<string, { id: string; label: string }[]>;

export function ResourceForm({ r, l, org, module, values, refs, id }: {
  r: Resource; l: Locale; org: string; module: string; values?: Record<string, unknown>; refs: RefOptions; id?: string;
}) {
  const v = (n: string) => (values?.[n] ?? "") as string;
  return (
    <form action={saveRecord} className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      <input type="hidden" name="_org" value={org} />
      <input type="hidden" name="_module" value={module} />
      <input type="hidden" name="_resource" value={r.key} />
      {id && <input type="hidden" name="_id" value={id} />}
      {r.fields.map((f) => {
        const fid = `${r.key}-${f.name}`;
        const req = "required" in f && f.required;
        return (
          <div key={f.name} className={f.type === "textarea" ? "col-span-full" : ""}>
            {f.type === "boolean" ? (
              <label htmlFor={fid} className="flex min-h-10 items-center gap-2 pt-5 text-sm">
                <input id={fid} name={f.name} type="checkbox" defaultChecked={Boolean(values?.[f.name])} className="size-4" /> {f.label[l]}
              </label>
            ) : (
              <>
                <Label htmlFor={fid}>{f.label[l]}{req ? " *" : ""}</Label>
                {f.type === "select" ? (
                  <Select id={fid} name={f.name} defaultValue={v(f.name) || (f.default ?? "")} required={req}>
                    {!req && !f.default && <option value="">—</option>}
                    {f.options.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
                  </Select>
                ) : f.type === "ref" ? (
                  <Select id={fid} name={f.name} defaultValue={v(f.name)} required={req}>
                    <option value="">—</option>
                    {(refs[f.name] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea id={fid} name={f.name} rows={6} defaultValue={v(f.name)} maxLength={f.max} />
                ) : (
                  <Input id={fid} name={f.name} required={req} defaultValue={v(f.name)}
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    step={f.type === "number" ? (f.int ? 1 : "0.01") : undefined}
                    min={f.type === "number" ? f.min : undefined} max={f.type === "number" ? f.max : undefined}
                    maxLength={f.type === "text" ? f.max : undefined} pattern={f.type === "text" ? f.pattern : undefined} />
                )}
              </>
            )}
          </div>
        );
      })}
      <div className="col-span-full"><Button type="submit">{id ? tr(l, "save") : tr(l, "create")}</Button></div>
    </form>
  );
}
