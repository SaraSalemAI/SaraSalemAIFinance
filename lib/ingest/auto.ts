import { canAdvance, computeCompany } from "../workspace/compute";
import type { Company, ImportRun } from "../workspace/types";
import type { BatchItem } from "./checks";
import type { Unit } from "./stage";
import { applyStaged } from "./stage";
import { summarise, toRun, validateCompany } from "./validate";
import type { Category } from "../finance/types";

/**
 * The automatic pipeline behind "upload and it's done": recognised files are imported, mappings
 * the classifier is sure of are accepted, every validation runs and the period advances when every
 * gate passes. Anything uncertain is held for the analyst. Locking is never automatic.
 */

/** A file's identity across months: its name without dates, numbers or extension ("TB 2025-03.csv" → "tb"). */
export function fileKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[٠-٩0-9]+/g, " ")
    .replace(/\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|fy|q)\b/g, " ")
    .replace(/(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)/g, " ")
    .replace(/[\s_\-.()›·]+/g, " ")
    .trim();
}

export function remembered(c: Company, u: Unit) {
  return c.fileMemory[fileKey(u.sheet ? `${u.fileName} ${u.sheet}` : u.fileName)] ?? null;
}

/** Whether a staged file can be imported without asking: recognised confidently (or remembered), readable, and not a scan. */
export function autoEligible(c: Company, u: Unit, staged: BatchItem["staged"] | null): { ok: boolean; reason: string } {
  if (!staged) return { ok: false, reason: "not read yet" };
  if (staged.issues.some((i) => i.level === "error")) return { ok: false, reason: "has rows that cannot be read" };
  const mem = remembered(c, u);
  if (mem && mem.category === staged.category) return { ok: true, reason: "remembered from an earlier upload" };
  if (u.detection.category !== staged.category) return { ok: true, reason: "type chosen by you" };
  if (u.detection.confidence < c.automation.minConfidence) return { ok: false, reason: `recognition confidence ${u.detection.confidence}% is below ${c.automation.minConfidence}%` };
  return { ok: true, reason: "recognised" };
}

/** Accepts suggested mappings at or above the threshold. Lower ones stay as suggestions for review. */
export function autoMap(c: Company, threshold: number) {
  let accepted = 0;
  const rows = c.rows.map((r) => {
    if (r.suggested && r.category && (r.confidence ?? 0) >= threshold) {
      accepted++;
      return { ...r, suggested: false, mappingRule: `${r.mappingRule ?? "keyword"} · auto-accepted ≥${threshold}%` };
    }
    return r;
  });
  const pending = rows.filter((r) => r.suggested || !r.category).length;
  return { company: accepted ? { ...c, rows } : c, accepted, pending };
}

/** Moves a draft period forward as far as its gates allow (never to LOCKED). */
export function autoAdvance(c: Company): Company {
  if (c.period.status === "LOCKED" || !c.rows.length) return c;
  let next = c;
  if (!c.rows.some((r) => r.suggested || !r.category) && !c.period.mappingConfirmed) next = { ...next, period: { ...next.period, mappingConfirmed: true } };
  const k = computeCompany(next);
  if (!k.analysis) return next;
  let status = next.period.status as "DRAFT" | "MAPPED" | "RECONCILED";
  if (canAdvance(k.checks, "MAPPED")) status = "MAPPED";
  if (canAdvance(k.checks, "RECONCILED")) status = "RECONCILED";
  return status === next.period.status ? next : { ...next, period: { ...next.period, status } };
}

/**
 * Importing a file replaces whatever already fills its slot (one trial balance per role and month,
 * one ledger, one bank statement, one listing per subledger). When a batch has several files for
 * the same slot, the largest is kept and the others are held for the analyst to choose, so no file
 * is silently overwritten by the next one.
 */
export function onePerSlot<T>(items: T[], slotOf: (t: T) => { category: string; role?: string; month?: string | null; rows: number; label: string }) {
  const slot = (t: T) => {
    const s = slotOf(t);
    return s.category === "TRIAL_BALANCE" ? `${s.category}|${s.role ?? "current"}|${s.role === "monthly" ? (s.month ?? "") : ""}` : s.category;
  };
  const groups = new Map<string, T[]>();
  for (const t of items) groups.set(slot(t), [...(groups.get(slot(t)) ?? []), t]);
  const keep = new Set<T>();
  const held: Array<{ item: T; reason: string }> = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((p, q) => slotOf(q).rows - slotOf(p).rows);
    keep.add(sorted[0]);
    const s0 = slotOf(sorted[0]);
    const what = s0.category === "TRIAL_BALANCE" ? `${s0.role ?? "current"}-period trial balance` : "file of this type";
    for (const extra of sorted.slice(1)) held.push({ item: extra, reason: `another ${what} (${s0.label}) was used; importing both would replace one with the other, so choose which one to import` });
  }
  return { kept: items.filter((t) => keep.has(t)), held };
}

export interface PipelineResult {
  company: Company;
  run: ImportRun;
}

/**
 * Imports the eligible items in one step and records the run. `held` lists the files left for review
 * with the reason. Returns the company with the import, auto-mapping, period status and a new
 * validation run applied.
 */
export function runPipeline(c: Company, items: Array<BatchItem & { unit: Unit }>, held: Array<{ name: string; reason: string }>, opts: { by: string; ids: string[]; runId: string; at?: string }): PipelineResult {
  const at = opts.at ?? new Date().toISOString();
  let next = items.reduce((acc, it, i) => applyStaged(acc, it.staged, opts.ids[i], it.role, it.month), c);
  // Remember what each file turned out to be, for next month's upload.
  const memory = { ...next.fileMemory };
  for (const it of items) memory[fileKey(it.unit.sheet ? `${it.unit.fileName} ${it.unit.sheet}` : it.unit.fileName)] = { category: it.staged.category, ...(it.staged.category === "TRIAL_BALANCE" ? { role: it.role } : {}) };
  next = { ...next, fileMemory: memory };

  const threshold = next.automation.autoMapThreshold;
  const mapped = threshold <= 100 ? autoMap(next, threshold) : { company: next, accepted: 0, pending: next.rows.filter((r) => r.suggested || !r.category).length };
  next = mapped.company;
  if (next.automation.autoAdvance) next = autoAdvance(next);

  const k = computeCompany(next);
  const checks = validateCompany(next, k);
  const vrun = toRun(checks, "import", next.tolerance, `${opts.runId}-v`, at);
  const run: ImportRun = {
    id: opts.runId,
    at,
    by: opts.by,
    files: items.map((it) => ({ name: it.unit.sheet ? `${it.unit.fileName} › ${it.unit.sheet}` : it.unit.fileName, category: it.staged.category, role: it.staged.category === "TRIAL_BALANCE" ? it.role : undefined, rows: it.staged.rowCount, erp: it.staged.erp, via: it.unit.encoding, confidence: it.unit.detection.confidence })),
    held,
    autoMapped: mapped.accepted,
    aiSuggested: 0,
    stillToMap: mapped.pending,
    statusAfter: next.period.status,
  };
  return { company: { ...next, importRuns: [...next.importRuns, run].slice(-20), validationRuns: [...next.validationRuns, vrun].slice(-30) }, run };
}

/** Which trial balance a company's rows came from, so a late AI answer is applied only to the file it was asked about. */
export function tbIdentity(c: Company): string {
  return [...new Set(c.rows.map((r) => r.sourceDocId ?? ""))].sort().join(",");
}

/** Applies the AI's account suggestions: confident ones are accepted, the rest wait for review. Never overrides a confirmed mapping. */
export function applyAiMappings(c: Company, mappings: Array<{ code: string; category: string; confidence: number }>, threshold: number, runId: string) {
  let accepted = 0;
  let suggested = 0;
  const byCode = new Map(mappings.filter((m) => m.category !== "UNMAPPED").map((m) => [m.code, m]));
  const rows = c.rows.map((r) => {
    const m = byCode.get(r.code);
    if (!m || (r.category && !r.suggested)) return r;
    if (r.suggested && r.category && (r.confidence ?? 0) >= m.confidence) return r;
    if (m.confidence >= threshold) {
      accepted++;
      return { ...r, category: m.category as Category, suggested: false, confidence: m.confidence, mappingRule: `ai · auto-accepted ≥${threshold}%` };
    }
    suggested++;
    return { ...r, category: m.category as Category, suggested: true, confidence: m.confidence, mappingRule: "ai suggestion" };
  });
  let next: Company = { ...c, rows };
  if (next.automation.autoAdvance) next = autoAdvance(next);
  const k = computeCompany(next);
  const vrun = toRun(validateCompany(next, k), "import + AI mapping", next.tolerance, `${runId}-v`);
  const importRuns = next.importRuns.map((r) => (r.id === runId ? { ...r, autoMapped: r.autoMapped + accepted, aiSuggested: suggested, stillToMap: next.rows.filter((x) => x.suggested || !x.category).length, statusAfter: next.period.status } : r));
  const validationRuns = next.validationRuns.some((v) => v.id === vrun.id) ? next.validationRuns.map((v) => (v.id === vrun.id ? vrun : v)) : [...next.validationRuns, vrun].slice(-30);
  return { company: { ...next, importRuns, validationRuns }, accepted, suggested };
}

export { summarise };
