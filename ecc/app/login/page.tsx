import { signIn, signUp } from "@/app/actions";
import { getLocale } from "@/lib/context";
import { tr } from "@/lib/i18n";
import { Button, Card, Input, Label, Notice } from "@/components/ui";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import Link from "next/link";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; mode?: string }> }) {
  const sp = await searchParams;
  const l = await getLocale();
  const up = sp.mode === "signup";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{tr(l, "appName")}</h1>
        <LocaleSwitch locale={l} back="/login" />
      </div>
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <Card title={up ? tr(l, "signUp") : tr(l, "signIn")}>
        <form action={up ? signUp : signIn} className="flex flex-col gap-4">
          {up && (<div><Label htmlFor="full_name">{tr(l, "fullName")}</Label><Input id="full_name" name="full_name" required maxLength={120} autoComplete="name" /></div>)}
          <div><Label htmlFor="email">{tr(l, "email")}</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div><Label htmlFor="password">{tr(l, "password")}</Label><Input id="password" name="password" type="password" required minLength={10} autoComplete={up ? "new-password" : "current-password"} /></div>
          <Button type="submit">{up ? tr(l, "signUp") : tr(l, "signIn")}</Button>
        </form>
        <p className="mt-4 text-sm">
          <Link className="text-brand underline" href={up ? "/login" : "/login?mode=signup"}>{up ? tr(l, "signIn") : tr(l, "signUp")}</Link>
        </p>
      </Card>
      <p className="mt-6 text-center text-xs text-muted">{tr(l, "footer")}</p>
    </main>
  );
}
