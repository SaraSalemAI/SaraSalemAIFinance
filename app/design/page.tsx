"use client";

/* Replica design system check page.
   Prepared by Sara Salem. Copyright Sara Salem 2026.
   Icons: paths from Lucide (ISC licence). Copy is original. */

import { useState, type ReactNode } from "react";
import "./tokens.css";
import s from "./design.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function Icon({ d }: { d: string[] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}
const I = {
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  lock: ["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14v10H5z"],
  sigma: ["M18 7V4H6l6 8-6 8h12v-3"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  sort: ["m21 16-4 4-4-4", "M17 20V4", "m3 8 4-4 4 4", "M7 4v16"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h8", "M8 17h8"],
  cloud: ["M12 13v8", "m8 17 4-4 4 4", "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"],
  loader: ["M21 12a9 9 0 1 1-6.2-8.6"],
};

type Variant = "primary" | "outline" | "secondary" | "ghost" | "danger" | "link";
function Button({ variant = "primary", size, loading, disabled, onClick, children }: { variant?: Variant; size?: "sm" | "lg"; loading?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cx(s.btn, s[variant], size && s[size])} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className={s.spin} style={{ display: "inline-flex" }}><Icon d={I.loader} /></span>}
      {children}
    </button>
  );
}

const COLORS = ["bg", "surface", "surface-raised", "border", "border-input", "text", "text-muted", "accent", "accent-hover", "on-accent", "ring", "danger", "success", "warning"];

const FEATURES = [
  { icon: I.lock, t: "Yours alone", b: "Each workbook is visible only to its owner unless you choose to share it." },
  { icon: I.sigma, t: "Real formulas", b: "Totals, lookups and conditions recalculate the moment a value changes." },
  { icon: I.chat, t: "Notes on cells", b: "Leave context beside the number it explains, right where it is needed." },
  { icon: I.sort, t: "Sort and search", b: "Order any range and find or replace values across every sheet." },
  { icon: I.file, t: "Import and export", b: "Bring in CSV or XLSX files and send them back out with formatting kept." },
  { icon: I.cloud, t: "Autosave", b: "Every change is stored as you type, so nothing waits on a save button." },
];

const SAMPLE = ["Account", "Jan", "Feb", "Mar", "Apr", "Sum", "Revenue", "410", "455", "472", "498", "=SUM(B2:E2)", "COGS", "190", "204", "211", "220", "=SUM(B3:E3)", "Opex", "120", "118", "125", "131", "=SUM(B4:E4)"];

export default function DesignPage() {
  const [dark, setDark] = useState(false);
  return (
    <div className={cx(s.page, dark && "dark")}>
      <main className={s.wrap}>
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <div>
            <span className={s.badge}>Replica design system</span>
            <h1 className={s.h1} style={{ marginTop: 12 }}>Primitives check</h1>
            <p className={s.lead}>Every component below reads only from the token roles in tokens.css. Toggle the theme to check both palettes.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDark((d) => !d)}>
            {dark ? "Light theme" : "Dark theme"}
          </Button>
        </div>

        <h2 className={s.h2}>Colour roles</h2>
        <div className={s.swatches}>
          {COLORS.map((c) => (
            <div key={c} className={s.swatch}>
              <span style={{ background: `var(--rp-${c})` }} />
              <p>{c}</p>
            </div>
          ))}
        </div>

        <h2 className={s.h2}>Buttons</h2>
        <div className={s.row}>
          <Button>Start free <Icon d={I.arrow} /></Button>
          <Button variant="outline">Log in</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete sheet</Button>
          <Button variant="link">Read more</Button>
        </div>
        <div className={s.row} style={{ marginTop: 12 }}>
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
        </div>

        <h2 className={s.h2}>Badges</h2>
        <div className={s.row}>
          <span className={s.badge}>Neutral</span>
          <span className={cx(s.badge, s.bAccent)}>Accent</span>
          <span className={cx(s.badge, s.bSuccess)}>Saved</span>
          <span className={cx(s.badge, s.bWarning)}>Offline</span>
          <span className={cx(s.badge, s.bDanger)}>Error</span>
        </div>

        <h2 className={s.h2}>Inputs</h2>
        <div className={s.row} style={{ alignItems: "flex-start" }}>
          <div className={s.field}>
            <label htmlFor="d-email">Email</label>
            <input id="d-email" className={s.input} placeholder="name@company.com" aria-describedby="d-email-h" />
            <p id="d-email-h" className={s.help}>We only use this to sign you in.</p>
          </div>
          <div className={s.field}>
            <label htmlFor="d-name">Workbook name</label>
            <input id="d-name" className={s.input} defaultValue="" aria-invalid="true" aria-describedby="d-name-e" />
            <p id="d-name-e" className={s.err}>Give the workbook a name.</p>
          </div>
          <div className={s.field}>
            <label htmlFor="d-off">Owner</label>
            <input id="d-off" className={s.input} value="Read only" disabled readOnly />
          </div>
        </div>

        <h2 className={s.h2}>Feature cards</h2>
        <div className={s.grid}>
          {FEATURES.map((f) => (
            <div key={f.t} className={s.card}>
              <div className={s.tile}><Icon d={f.icon} /></div>
              <h3 className={s.cardTitle}>{f.t}</h3>
              <p className={s.cardBody}>{f.b}</p>
            </div>
          ))}
        </div>

        <h2 className={s.h2}>Window preview</h2>
        <div className={s.win} role="img" aria-label="Example workbook showing monthly totals per account">
          <div className={s.chrome}>
            <span className={s.dot} style={{ background: "color-mix(in srgb, var(--rp-danger) 70%, transparent)" }} />
            <span className={s.dot} style={{ background: "color-mix(in srgb, var(--rp-warning) 70%, transparent)" }} />
            <span className={s.dot} style={{ background: "color-mix(in srgb, var(--rp-success) 70%, transparent)" }} />
            <span style={{ marginLeft: 12 }}>FY Budget · private</span>
          </div>
          <div className={s.cells}>
            {Array.from({ length: 30 }).map((_, i) => {
              const v = SAMPLE[i] ?? "";
              const col = i % 6;
              return (
                <div key={i} className={cx(s.cell, (col === 3 || col === 4) && s.hideSm, i < 6 && s.cellHead, v.startsWith("=") && s.cellFormula)}>{v}</div>
              );
            })}
          </div>
        </div>

        <h2 className={s.h2}>Empty state</h2>
        <div className={s.empty}>
          <div className={s.tile}><Icon d={I.file} /></div>
          <h3>No workbooks yet</h3>
          <p className={s.help}>Create one to start adding rows and formulas.</p>
          <Button size="sm">New workbook</Button>
        </div>

        <p className={s.foot}>Prepared by Sara Salem. © Sara Salem 2026.</p>
      </main>
    </div>
  );
}
