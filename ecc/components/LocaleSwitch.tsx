import { setLocale } from "@/app/actions";
import type { Locale } from "@/lib/i18n";
import { tr } from "@/lib/i18n";

export function LocaleSwitch({ locale, back }: { locale: Locale; back: string }) {
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
      <input type="hidden" name="back" value={back} />
      <button className="min-h-10 rounded-md border border-line px-3 text-sm hover:bg-chip">{tr(locale, "language")}</button>
    </form>
  );
}
