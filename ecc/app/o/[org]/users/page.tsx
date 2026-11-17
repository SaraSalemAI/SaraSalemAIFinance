import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { orgContext, friendlyError } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { ROLES } from "@/lib/rbac";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select, Table } from "@/components/ui";

const role = z.enum(ROLES);
const go = (s: string, k: "error" | "ok", m: string) => redirect(`/o/${s}/users?${k}=${encodeURIComponent(m)}`);

async function addMember(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org"));
  const p = z.object({ email: z.string().trim().email(), role }).safeParse({ email: fd.get("email"), role: fd.get("role") });
  if (!p.success) go(slug, "error", "Enter a valid e-mail and role.");
  const ctx = await orgContext(slug);
  const { error } = await ctx.sb.rpc("add_member_by_email", { p_org: ctx.org.id, p_email: p.data!.email, p_role: p.data!.role });
  if (error) go(slug, "error", error.code === "P0002" ? "No account with that e-mail. Ask them to sign up first." : friendlyError(error));
  revalidatePath(`/o/${slug}/users`); go(slug, "ok", "Member added");
}

async function updateMember(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org")), uid = String(fd.get("_user"));
  const p = z.object({ role, status: z.enum(["active", "suspended"]) }).safeParse({ role: fd.get("role"), status: fd.get("status") });
  if (!p.success) go(slug, "error", "Invalid role or status");
  const ctx = await orgContext(slug);
  const { error, data } = await ctx.sb.from("memberships").update(p.data!).eq("org_id", ctx.org.id).eq("user_id", uid).select("user_id");
  if (error || !data?.length) go(slug, "error", error ? friendlyError(error) : "Not permitted");
  revalidatePath(`/o/${slug}/users`); go(slug, "ok", "Updated");
}

async function removeMember(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org")), uid = String(fd.get("_user"));
  const ctx = await orgContext(slug);
  const { error, data } = await ctx.sb.from("memberships").delete().eq("org_id", ctx.org.id).eq("user_id", uid).select("user_id");
  if (error || !data?.length) go(slug, "error", error ? friendlyError(error) : "Not permitted");
  revalidatePath(`/o/${slug}/users`); go(slug, "ok", "Removed");
}

export default async function Users({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("users.read")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const manage = ctx.has("users.manage");
  const { data: members, error } = await ctx.sb.rpc("org_members", { p_org: ctx.org.id });
  const roles = ctx.role === "owner" ? ROLES : ROLES.filter((r) => r !== "owner");
  return (
    <>
      <PageHeader title={tr(l, "users")} />
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {error && <Notice tone="bad">{error.message}</Notice>}
      {manage && (
        <Card title={tr(l, "addMember")} className="mb-6">
          <form action={addMember} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="_org" value={org} />
            <div className="min-w-64 flex-1"><Label htmlFor="m-email">{tr(l, "email")}</Label><Input id="m-email" name="email" type="email" required /></div>
            <div><Label htmlFor="m-role">{tr(l, "role")}</Label><Select id="m-role" name="role" defaultValue="member">{roles.map((r) => <option key={r}>{r}</option>)}</Select></div>
            <Button type="submit">{tr(l, "create")}</Button>
          </form>
        </Card>
      )}
      <Table head={[tr(l, "fullName"), tr(l, "email"), tr(l, "role"), tr(l, "status"), ...(manage ? [tr(l, "actions")] : [])]}>
        {((members ?? []) as { user_id: string; email: string; full_name: string | null; role: string; status: string }[]).map((m) => (
          <tr key={m.user_id}>
            <td className="px-3 py-2">{m.full_name || "—"}</td><td className="px-3 py-2">{m.email}</td>
            {manage && m.user_id !== ctx.user.id ? (
              <td colSpan={3} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateMember} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="_org" value={org} /><input type="hidden" name="_user" value={m.user_id} />
                    <Select aria-label={tr(l, "role")} name="role" defaultValue={m.role} className="w-48">{(m.role === "owner" ? ROLES : roles).map((r) => <option key={r}>{r}</option>)}</Select>
                    <Select aria-label={tr(l, "status")} name="status" defaultValue={m.status === "suspended" ? "suspended" : "active"} className="w-36"><option>active</option><option>suspended</option></Select>
                    <Button variant="secondary">{tr(l, "save")}</Button>
                  </form>
                  <form action={removeMember}><input type="hidden" name="_org" value={org} /><input type="hidden" name="_user" value={m.user_id} /><Button variant="danger">{tr(l, "delete")}</Button></form>
                </div>
              </td>
            ) : (<><td className="px-3 py-2"><Badge>{m.role}</Badge></td><td className="px-3 py-2">{m.status}</td>{manage && <td />}</>)}
          </tr>
        ))}
      </Table>
    </>
  );
}
