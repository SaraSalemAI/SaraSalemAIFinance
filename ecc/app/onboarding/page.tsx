import { createOrg } from "@/app/actions";
import { getLocale, requireUser } from "@/lib/context";
import { demoMode } from "@/lib/env";
import { tr } from "@/lib/i18n";
import { Button, Card, Input, Label, Notice, PageHeader } from "@/components/ui";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const l = await getLocale();
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-lg p-6">
      <PageHeader title={tr(l, "newOrg")} />
      {error && <Notice tone="bad">{error}</Notice>}
      <Card>
        <form action={createOrg} className="flex flex-col gap-4">
          <div><Label htmlFor="name">{tr(l, "orgName")}</Label><Input id="name" name="name" required minLength={2} maxLength={120} /></div>
          <div><Label htmlFor="slug">{tr(l, "orgSlug")}</Label><Input id="slug" name="slug" required pattern="[a-z0-9-]{3,48}" /></div>
          {demoMode() && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="demo" className="size-4" /> {tr(l, "demoOrg")}</label>
          )}
          <Button type="submit">{tr(l, "create")}</Button>
        </form>
      </Card>
    </main>
  );
}
