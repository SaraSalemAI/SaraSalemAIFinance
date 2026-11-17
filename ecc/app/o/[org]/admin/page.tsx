import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { orgContext, friendlyError } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { ROLE_PERMISSIONS, ROLES } from "@/lib/rbac";
import { Button, Card, Input, Label, Notice, PageHeader, Select, Table } from "@/components/ui";

async function saveOrg(fd: FormData) {
  "use server";
  const slug = String(fd.get("_org"));
  const p = z.object({ name: z.string().trim().min(2).max(120), default_locale: z.enum(["en", "ar"]),
    fiscal_year_start: z.string().regex(/^(0[1-9]|1[0-2])$/), currency: z.string().regex(/^[A-Z]{3}$/) })
    .safeParse({ name: fd.get("name"), default_locale: fd.get("default_locale"), fiscal_year_start: fd.get("fiscal_year_start"), currency: fd.get("currency") });
  if (!p.success) redirect(`/o/${slug}/admin?error=${encodeURIComponent("Check the fields.")}`);
  const ctx = await orgContext(slug);
  const { name, default_locale, ...settings } = p.data;
  const { error, data } = await ctx.sb.from("organizations").update({ name, default_locale, settings }).eq("id", ctx.org.id).select("id");
  if (error || !data?.length) redirect(`/o/${slug}/admin?error=${encodeURIComponent(error ? friendlyError(error) : "Not permitted")}`);
  revalidatePath(`/o/${slug}`, "layout"); redirect(`/o/${slug}/admin?ok=1`);
}

export default async function Admin({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const ctx = await orgContext(org); const l = ctx.locale;
  if (!ctx.has("org.manage")) return <Notice tone="warn">{tr(l, "noAccess")}</Notice>;
  const s = (ctx.org.settings ?? {}) as { fiscal_year_start?: string; currency?: string };
  return (
    <>
      <PageHeader title={tr(l, "admin")} />
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{tr(l, "save")} ✓</Notice>}
      <Card title={l === "ar" ? "إعدادات المؤسسة" : "Organization settings"} className="mb-6">
        <form action={saveOrg} className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-end gap-3">
          <input type="hidden" name="_org" value={org} />
          <div><Label htmlFor="o-name">{tr(l, "orgName")}</Label><Input id="o-name" name="name" defaultValue={ctx.org.name} required /></div>
          <div><Label htmlFor="o-loc">{l === "ar" ? "اللغة الافتراضية" : "Default language"}</Label><Select id="o-loc" name="default_locale" defaultValue={ctx.org.default_locale}><option value="en">English</option><option value="ar">العربية</option></Select></div>
          <div><Label htmlFor="o-fy">{l === "ar" ? "بداية السنة المالية (شهر)" : "Fiscal year start (month)"}</Label><Input id="o-fy" name="fiscal_year_start" defaultValue={s.fiscal_year_start ?? "01"} pattern="0[1-9]|1[0-2]" /></div>
          <div><Label htmlFor="o-cur">{l === "ar" ? "العملة الأساسية" : "Base currency"}</Label><Input id="o-cur" name="currency" defaultValue={s.currency ?? "USD"} pattern="[A-Z]{3}" /></div>
          <Button type="submit">{tr(l, "save")}</Button>
        </form>
      </Card>
      <h2 className="mb-2 text-sm font-semibold">{l === "ar" ? "مصفوفة الأدوار والصلاحيات" : "Role → permission matrix (enforced in the database)"}</h2>
      <Table head={[tr(l, "role"), l === "ar" ? "الصلاحيات" : "Permissions"]}>
        {ROLES.map((r) => <tr key={r}><td className="px-3 py-2 font-medium">{r}</td><td className="px-3 py-2 text-xs">{ROLE_PERMISSIONS[r].join(", ")}</td></tr>)}
      </Table>
    </>
  );
}
