import Link from "next/link";
import { orgContext } from "@/lib/context";
import { NAV } from "@/lib/nav";
import { tr } from "@/lib/i18n";
import { signOut } from "@/app/actions";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Badge } from "@/components/ui";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await orgContext(slug);
  const l = ctx.locale;
  const { count } = await ctx.sb.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("read_at", null);
  const base = `/o/${slug}`;
  return (
    <div className="flex min-h-screen flex-wrap">
      <nav aria-label="Main" className="w-full border-line bg-surface p-4 md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-e">
        <Link href="/" className="block text-sm font-semibold">{ctx.org.name}</Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">{ctx.role}{ctx.org.is_demo && <Badge tone="info">{tr(l, "demoBadge")}</Badge>}</div>
        <ul className="mt-4 flex flex-wrap gap-1 md:flex-col">
          {NAV.filter((n) => ctx.has(n.perm)).map((n) => (
            <li key={n.href}><Link href={base + n.href} className="block rounded-md px-3 py-2 text-sm hover:bg-chip">{tr(l, n.label)}</Link></li>
          ))}
          <li>
            <Link href={`${base}/notifications`} className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-chip">
              {tr(l, "notifications")} {!!count && <Badge tone="warn">{count}</Badge>}
            </Link>
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <LocaleSwitch locale={l} back={base} />
          <form action={signOut}><button className="min-h-10 rounded-md border border-line px-3 text-sm hover:bg-chip">{tr(l, "signOut")}</button></form>
        </div>
        <p className="mt-6 text-xs text-muted">{ctx.user.email}</p>
      </nav>
      <main className="min-w-0 flex-[999_1_560px] p-4 md:p-8">
        {children}
        <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">{tr(l, "footer")}</footer>
      </main>
    </div>
  );
}
