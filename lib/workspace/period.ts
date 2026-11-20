import { sha256 } from "../finance/hash";
import { nextPeriod, openingBalances, startsFiscalYear } from "../finance/rollforward";
import { assetSchedule, type FixedAsset } from "../finance/subledgers";
import { uid } from "./defaults";
import type { TBRow } from "../finance/types";
import type { BoardPackSnapshot, Company } from "./types";

/** First day of the twelve months ending on `end` (YYYY-MM-DD). */
export function fiscalYearStart(end: string): string {
  const [y, m, d] = end.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  next.setUTCFullYear(next.getUTCFullYear() - 1);
  return next.toISOString().slice(0, 10);
}

/** The company state a board pack is produced from, without raw ledgers or earlier packs, hashed for evidence. */
export function snapshotPack(c: Company, by: string): BoardPackSnapshot {
  const company: Company = { ...c, subledgers: { ...c.subledgers, gl: [], bank: [] }, boardPacks: [], history: [], monthly: [] };
  return { id: uid("pack"), periodLabel: c.period.currentLabel, createdAt: new Date().toISOString(), createdBy: by, hash: sha256(JSON.stringify(company)), company };
}

/**
 * Closes the period and opens the next one: the locked period is archived, closing balances become
 * opening balances (P&L closed to retained earnings when a new fiscal year starts) and the
 * comparatives. Current balances start at the opening balances until a new TB or GL is loaded.
 */
export function rollForwardCompany(c: Company, adjustedRows: Company["rows"]): Company {
  const p = nextPeriod(c.period);
  const closeYear = startsFiscalYear(p.start, c.settings.fiscalYearEnd);
  const opening = openingBalances(adjustedRows, closeYear);
  const rows: TBRow[] = adjustedRows.map((r) => ({ ...r, priorDebit: r.currentDebit, priorCredit: r.currentCredit, currentDebit: 0, currentCredit: 0, sourceDocId: undefined, mappingRule: r.mappingRule ?? "roll-forward" }));
  // Balance-sheet accounts open at their brought-forward balance; P&L opens at zero at a year end.
  const byCode = new Map(opening.map((o) => [o.code, o]));
  const seeded = rows.map((r) => ({ ...r, currentDebit: byCode.get(r.code)?.currentDebit ?? 0, currentCredit: byCode.get(r.code)?.currentCredit ?? 0 }));
  for (const o of opening) if (!rows.some((r) => r.code === o.code)) seeded.push(o);
  // At a new fiscal year the asset register opens at last year's closing accumulated (and tax)
  // depreciation, without last year's charge; disposed assets leave the register. Within a year the
  // register holds the year's opening figures, so the charge carried is the whole fiscal year's, not
  // only the closing quarter's (tax depreciation is already an annual figure).
  const far: FixedAsset[] = closeYear
    ? c.subledgers.far.flatMap((a) => {
        const s = assetSchedule(a, fiscalYearStart(c.period.end), c.period.end);
        if (s.disposed) return [];
        const taxCost = a.taxCostBase || a.cost;
        return [{ ...a, accumulatedDepreciation: s.accumulatedDepreciation, currentYearDepreciation: 0, accumulatedTaxDepreciation: Math.round((taxCost - s.taxBase) * 100) / 100 }];
      })
    : c.subledgers.far;
  return {
    ...c,
    history: [...c.history, { id: uid("hist"), label: c.period.currentLabel, start: c.period.start, end: c.period.end, status: c.period.status, lockedAt: c.period.lockedAt, lockedBy: c.period.lockedBy, rows: adjustedRows, ajes: c.ajes, archivedAt: new Date().toISOString() }],
    period: { ...c.period, start: p.start, end: p.end, currentLabel: p.currentLabel, priorLabel: p.priorLabel, status: "DRAFT", lockedAt: null, lockedBy: null, mappingConfirmed: false },
    rows: seeded,
    opening,
    ajes: [],
    docs: [],
    subledgers: { ar: [], ap: [], far, inventory: [], payroll: [], bank: [], eta: [], gl: [] },
    // The carried rows already hold this period's IFRS bridge entries; keeping the inputs would charge them again.
    bridge: { employeeProfitShare: 0, boardRemuneration: 0 },
    disclosures: {},
    model: null,
  };
}
