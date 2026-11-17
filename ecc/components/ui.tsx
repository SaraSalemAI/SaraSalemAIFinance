// Reusable enterprise UI primitives. Prepared by Sara Salem. Copyright Sara Salem 2026.
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, TextareaHTMLAttributes } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "warn" | "bad" }) {
  const c = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "info" }) {
  const map = { neutral: "bg-chip text-ink", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", info: "bg-info-soft text-info" };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Button({ variant = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const v = variant === "primary" ? "bg-brand text-on-brand hover:bg-brand-strong" : variant === "danger" ? "bg-bad text-white hover:opacity-90" : "border border-line bg-surface text-ink hover:bg-chip";
  return <button {...p} className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50 ${v} ${className}`} />;
}

const inputCls = "w-full min-h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:outline-2 focus:outline-brand";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${inputCls} py-2 ${p.className ?? ""}`} />;

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">{children}</label>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "bad" | "ok" | "warn"; children: ReactNode }) {
  const map = { info: "border-info/30 bg-info-soft text-info", bad: "border-bad/30 bg-bad-soft text-bad", ok: "border-ok/30 bg-ok-soft text-ok", warn: "border-warn/30 bg-warn-soft text-warn" };
  return <div role={tone === "bad" ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-sm ${map[tone]}`}>{children}</div>;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-chip text-start text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-3 py-2 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">{children}</tbody>
      </table>
      {empty && <p className="p-4 text-sm text-muted">{empty}</p>}
    </div>
  );
}

export const toneFor = (status: string): "neutral" | "ok" | "warn" | "bad" | "info" =>
  ["approved", "paid", "done", "compliant", "effective", "connected", "published", "succeeded", "active", "operational", "closed"].includes(status) ? "ok"
  : ["rejected", "void", "non_compliant", "ineffective", "error", "failed", "critical", "terminated", "restricted"].includes(status) ? "bad"
  : ["submitted", "pending", "partial", "in_progress", "mitigating", "high", "requested", "maintenance", "in_review", "partially_effective", "confidential"].includes(status) ? "warn"
  : "neutral";
