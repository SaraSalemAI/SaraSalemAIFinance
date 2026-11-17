# Recon: SyncSheets landing (private-paperwork-grove.lovable.app)

Prepared by Sara Salem. Copyright Sara Salem 2026.

Source: Sara's own Lovable project "Remix of Online Spreadsheet Editor"
(id 0e76d248-2d80-4150-8ba8-4a68e83a2016). The live host is blocked by this
session's network, so values were read from the project's source
(`src/styles.css`, `src/routes/index.tsx`, `src/components/ui/button.tsx`) and the
Lovable screenshot saved as `screens/S01-landing-desktop.png`.

## Screens
- S01 Landing `/`: header, hero, sheet preview, features grid, CTA band, footer.
- S02 Auth `/auth`, S03 Sheets list `/sheets`, S04 Editor `/sheet/$id`, S05 Files, S06 Tools: present in the route tree, not captured (they need sign-in).

## Stack
TanStack Start + Tailwind v4 + shadcn/ui (Radix), Lucide icons. Colours in oklch, slate family, light and dark themes.

## Layout
- Header: bottom border, max-w 1152 (max-w-6xl), px 16/24/32, logo icon 20 + wordmark 16/600, nav = ghost "Sign in" + primary "Get started", touch targets min 44.
- Hero: centered, max-w 896, pill badge (12/500, muted bg, full radius), H1 60/600 tight tracking at lg (24 on mobile), lead 18 muted max 65ch, two buttons lg (primary + outline). Soft radial wash of primary at 12% behind.
- Sheet preview card: max-w 1024, radius 14, border, shadow-lg, window bar with three dots + caption 12 muted, 6-col mono grid (4 on mobile), header row bold on muted, formula cells in primary.
- Features: muted/20 band with top border, H2 36/600, 3-col grid (1/2/3), cards radius 10, border, p 20, icon tile 36 radius 8 primary/10, title 16/600, body 14 muted, hover shadow-sm.
- CTA: max-w 768 centered, H2 + lead + lg primary button with arrow.
- Footer: top border, 12 muted, logo left, copyright right.

## Components seen
Button (default, outline, ghost; sizes sm, lg), Badge/pill, Card, FeatureCard, IconTile, AppHeader, Footer, SheetPreview (window chrome + grid). shadcn library also ships Input, Dialog, Tabs, Table, Toast etc. used in app screens.
