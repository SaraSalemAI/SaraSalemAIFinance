import "server-only";
import type { OrgCtx } from "./context";
import type { Resource } from "./resources";
import type { RefOptions } from "@/components/ResourceForm";

export async function loadRefs(ctx: OrgCtx, r: Resource): Promise<RefOptions> {
  const out: RefOptions = {};
  await Promise.all(r.fields.map(async (f) => {
    if (f.type !== "ref") return;
    const { data } = await ctx.sb.from(f.table).select(`id, ${f.display}`).eq("org_id", ctx.org.id).order(f.display).limit(500);
    out[f.name] = ((data ?? []) as unknown as Record<string, string>[]).map((d) => ({ id: d.id, label: String(d[f.display]) }));
  }));
  return out;
}
