import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { getLocale } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { Card, Notice, PageHeader, Badge } from "@/components/ui";

export default async function Home() {
  const l = await getLocale();
  if (!isConfigured()) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <PageHeader title={tr(l, "appName")} />
        <Notice tone="warn">Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and set the project URL and anon key, then apply <code>supabase/migrations</code>.</Notice>
      </main>
    );
  }
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/login");
  const { data: orgs } = await sb.from("organizations").select("name, slug, is_demo").order("name");
  if (!orgs?.length) redirect("/onboarding");
  if (orgs.length === 1) redirect(`/o/${orgs[0].slug}`);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader title={tr(l, "yourOrgs")} actions={<Link className="text-sm text-brand underline" href="/onboarding">{tr(l, "newOrg")}</Link>} />
      <Card>
        <ul className="divide-y divide-line">
          {orgs.map((o) => (
            <li key={o.slug} className="flex items-center justify-between py-3">
              <Link href={`/o/${o.slug}`} className="font-medium text-brand hover:underline">{o.name}</Link>
              {o.is_demo && <Badge tone="info">{tr(l, "demoBadge")}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
