# Component specs

Prepared by Sara Salem. Copyright Sara Salem 2026.
Screens: S01 landing (captured). S02-S06 app screens not yet captured.
Icons: Lucide (MIT). Font: Inter (OFL) with system fallback.

Button
  variants  primary, outline, secondary, ghost, danger, link
  sizes     sm 32px (text 12), md 36px (text 14), lg 40px (text 14, px 32); all keep a 44px min hit area on touch
  states    default, hover (primary -> accent-hover; outline/ghost -> bg surface), active, focus-visible (2px ring, offset 2), disabled (opacity .5, not-allowed), loading (spinner, label kept, aria-busy)
  tokens    bg accent, text on-accent, radius md, font sm/500, gap 8, icon 16, shadow sm (primary/outline/secondary)
  a11y      real <button> or <a> when it navigates; visible focus; loading sets aria-busy and disables
  used on   S01 header, hero, CTA

Badge (pill)
  variants  neutral, accent, success, warning, danger
  tokens    radius full, px 12 py 4, text xs/500, bg surface, border, text-muted
  a11y      plain text; never the only carrier of status meaning
  used on   S01 hero

Card
  variants  default, interactive (hover shadow-sm), raised (shadow-lg, radius xl)
  tokens    bg surface-raised, border, radius lg, padding 20
  a11y      when the whole card links, one <a> wraps the title, not nested interactives
  used on   S01 features, preview

FeatureCard
  parts     IconTile, title (16/600), body (14 muted, relaxed, max 65ch)
  layout    grid 1 / 2 (>=640) / 3 (>=1024), gap 16 / 24
  used on   S01 features

IconTile
  tokens    36x36, radius md, bg accent at 10%, icon accent 16px
  a11y      icon aria-hidden; the title names the feature

AppHeader
  layout    full-width bottom border, inner max-width 1152, px 16/24/32, height ~76
  parts     logo (icon 20 + wordmark 16/600, truncates), nav: ghost sm + primary sm
  a11y      <header> + <nav aria-label="Primary">; skip link to <main>
  used on   S01

Hero
  layout    centered, max 896, pt 40/80/112, badge, H1 (24 -> 60, 600, tight, tracking-tight), lead (14 -> 18 muted, 65ch), actions stack on mobile, row at >=640
  decoration radial accent wash at 12% behind, aria-hidden

WindowPreview (sheet mock)
  tokens    radius xl, border, shadow lg, chrome bar bg surface/30 with three 10px dots (danger, warning, success at 70%), caption xs muted
  grid      mono 11/12, 4 cols mobile, 6 cols >=640, cells px 8/12 py 6/8, header row 600 on surface/50, formula cells accent
  a11y      decorative mock: role="img" with aria-label describing it

Section band
  variants  plain, tinted (bg surface/20 + top border)
  tokens    py 40/56/80, H2 24 -> 36/600 tight, lead 14 -> 18 muted

Footer
  layout    top border, max 1152, py 24, text xs muted, stack on mobile, row at >=640

Input (from shadcn base, used in S02+)
  states    default, hover, focus-visible (ring), invalid (border danger + aria-invalid + message), disabled
  tokens    height 36, radius md, border border-input, bg bg, text sm, px 12
  a11y      always a <label>; error text linked with aria-describedby

Empty state (needed for S03 sheets list)
  parts     IconTile, title, one-line help, primary action
  a11y      heading level follows the page outline
