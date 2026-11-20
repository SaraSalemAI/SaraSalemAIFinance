import { computePeriod, round2, type PeriodFigures } from "./engine";
import type { TBRow } from "./types";

export const TREND_KEYS = ["revenue", "grossProfit", "ebitda", "netProfit", "cash", "receivables", "inventory", "payables", "totalEquity"] as const;
export type TrendKey = (typeof TREND_KEYS)[number];
const PL_KEYS: ReadonlySet<TrendKey> = new Set(["revenue", "grossProfit", "ebitda", "netProfit"]);

export interface TrendPoint {
  label: string;
  values: Record<TrendKey, number>;
  grossMargin: number | null;
  netMargin: number | null;
  /** Receivable days on the month's revenue, annualised. */
  dso: number | null;
  /**
   * True when the P&L figures cover more than this month: year-to-date files with a missing earlier
   * month (the difference spans several months) or a first file that is not the fiscal year's first month.
   */
  gap: boolean;
}

/**
 * Month-by-month figures from monthly trial balances. When the files show year-to-date P&L, each
 * month's P&L is the difference from the previous month of the same fiscal year; balance sheet
 * figures are always the month-end balances.
 */
export function monthlyTrend(months: Array<{ label: string; rows: TBRow[] }>, ytd: boolean, fiscalYearStartMonth = 1): TrendPoint[] {
  const sorted = [...months].sort((a, b) => a.label.localeCompare(b.label));
  const figs = sorted.map((m) => ({ label: m.label, f: computePeriod(m.rows, "current") }));
  const fyOf = (label: string) => {
    const [y, mo] = label.split("-").map(Number);
    return mo >= fiscalYearStartMonth ? y : y - 1;
  };
  const monthIndex = (label: string) => {
    const [y, mo] = label.split("-").map(Number);
    return y * 12 + mo;
  };
  return figs.map((m, i) => {
    const prev = i > 0 && fyOf(figs[i - 1].label) === fyOf(m.label) ? figs[i - 1].f : null;
    const firstOfYear = Number(m.label.split("-")[1]) === fiscalYearStartMonth;
    const gap = ytd && !firstOfYear && !(prev && monthIndex(m.label) - monthIndex(figs[i - 1].label) === 1);
    const values = Object.fromEntries(
      TREND_KEYS.map((k) => {
        const v = m.f[k as keyof PeriodFigures] as number;
        return [k, round2(PL_KEYS.has(k) && ytd && prev ? v - (prev[k as keyof PeriodFigures] as number) : v)];
      }),
    ) as Record<TrendKey, number>;
    const rev = values.revenue;
    return {
      label: m.label,
      values,
      grossMargin: rev ? round2((values.grossProfit / rev) * 100) : null,
      netMargin: rev ? round2((values.netProfit / rev) * 100) : null,
      dso: rev > 0 && !gap ? round2((values.receivables / (rev * 12)) * 365) : null,
      gap,
    };
  });
}

/** Simple outlook: average of the last three months and the month-on-month change of the latest month. */
export function trendSummary(points: TrendPoint[]) {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const last3 = points.slice(-3);
  return Object.fromEntries(
    TREND_KEYS.map((k) => {
      // P&L of a multi-month span is not a monthly figure: leave it out of month-on-month and the average.
      const pl = PL_KEYS.has(k);
      const cmp = prev && !(pl && (prev.gap || last.gap)) ? prev : null;
      const avgPts = pl ? last3.filter((p) => !p.gap) : last3;
      return [
        k,
        {
          latest: last.values[k],
          momChange: cmp ? round2(last.values[k] - cmp.values[k]) : null,
          momPct: cmp && cmp.values[k] ? round2(((last.values[k] - cmp.values[k]) / Math.abs(cmp.values[k])) * 100) : null,
          avg3: avgPts.length ? round2(avgPts.reduce((a, p) => a + p.values[k], 0) / avgPts.length) : null,
        },
      ];
    }),
  ) as Record<TrendKey, { latest: number; momChange: number | null; momPct: number | null; avg3: number | null }>;
}
