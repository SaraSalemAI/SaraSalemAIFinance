import "./globals.css";
import type { Metadata } from "next";
import { getLocale } from "@/lib/context";
import { dir } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Enterprise Control Console",
  description: "Multi-tenant enterprise control console. Prepared by Sara Salem. © Sara Salem 2026.",
  authors: [{ name: "Sara Salem" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dir(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
