import { describe, expect, it } from "vitest";
import { buildAgentTools, type AgentTools } from "@/lib/agent/tools";
import { cashForecast } from "@/lib/finance/cashforecast";
import { parseTrialBalance } from "@/lib/finance/parse";
import { monthlyTrend, trendSummary } from "@/lib/finance/trends";
import { computeCompany, periodChecks } from "@/lib/workspace/compute";
import { newCompany } from "@/lib/workspace/defaults";
import { consolidateGroup } from "@/lib/workspace/group";
import { rollForwardCompany } from "@/lib/workspace/period";
import type { Company } from "@/lib/workspace/types";

const tb = (csv: string) => parseTrialBalance("code,name,category,current_debit,current_credit,prior_debit,prior_credit\n" + csv).rows;
const base = { startDate: "2026-01-01", openingCash: 1000, weeks: 13, overdueCollectionRate: 1, overdueWeeks: 2, collectionLagDays: 0, overduePayableWeeks: 1, includePayroll: false, minimumCash: null, items: [], ar: [], ap: [], payroll: [], payrollPeriodsPerYear: 12 };
// FY2025 fixed here: newCompany() takes its period from today's date, which would move the fixtures with the calendar.
const FY2025 = { start: "2025-01-01", end: "2025-12-31", currentLabel: "FY2025", priorLabel: "FY2024" };
const company = (patch: Partial<Company> = {}): Company => {
  const c = newCompany("Co");
  return { ...c, period: { ...c.period, ...FY2025 }, rows: tb("1010,Cash,CASH,1000,0,1000,0\n3000,Capital,SHARE_CAPITAL,0,1000,0,1000"), ...patch };
};

describe("cash forecast review fixes", () => {
  it("pays January payroll in the week that crosses into February", () => {
    const line = { employee: "A", net: 100, employeeSocialInsurance: 0, companySocialInsurance: 0, incomeTax: 0 } as never;
    const f = cashForecast({ ...base, includePayroll: true, payroll: [line] });
    const week = f.weeks.find((w) => w.start === "2026-01-29")!;
    expect(week.end).toBe("2026-02-04");
    expect(week.payroll).toBe(-100);
    expect(f.weeks.filter((w) => w.payroll !== 0).map((w) => w.start)).toEqual(["2026-01-29", "2026-02-26", "2026-03-26"]);
  });

  it("keeps the spread duration when the horizon is shorter and reports the rest beyond it", () => {
    const ar = { invoice: "1", customer: "C", invoiceDate: "2025-11-01", dueDate: "2025-12-01", amount: 400, outstanding: 400 } as never;
    const f = cashForecast({ ...base, weeks: 2, overdueWeeks: 4, ar: [ar] });
    expect(f.weeks.map((w) => w.overdueCollections)).toEqual([100, 100]);
    expect(f.beyondHorizon.receivables).toBe(200);
  });
});

describe("trend gaps", () => {
  const m = (rev: number) => tb(`1010,Cash,CASH,${rev},0,0,0\n4000,Sales,REVENUE,0,${rev},0,0`);
  it("marks a multi-month year-to-date difference and a mid-year first file as gaps", () => {
    const t = monthlyTrend([{ label: "2025-01", rows: m(100) }, { label: "2025-03", rows: m(400) }, { label: "2025-04", rows: m(500) }], true);
    expect(t.map((p) => [p.label, p.values.revenue, p.gap])).toEqual([
      ["2025-01", 100, false],
      ["2025-03", 300, true],
      ["2025-04", 100, false],
    ]);
    const s = trendSummary(t)!;
    expect(s.revenue.momChange).toBeNull();
    expect(s.revenue.avg3).toBe(100);
    expect(monthlyTrend([{ label: "2025-06", rows: m(600) }], true)[0].gap).toBe(true);
    expect(monthlyTrend([{ label: "2025-06", rows: m(600) }], false)[0].gap).toBe(false);
  });
});

describe("period roll forward", () => {
  it("does not charge the IFRS bridge again and rolls the asset register at a year end", () => {
    const c = company({
      settings: { ...newCompany().settings, framework: "IFRS" },
      period: { ...newCompany().period, start: "2025-01-01", end: "2025-12-31", currentLabel: "FY2025", priorLabel: "FY2024" },
      bridge: { employeeProfitShare: 50, boardRemuneration: 0 },
      subledgers: {
        ...newCompany().subledgers,
        far: [{ tag: "F1", name: "Desk", category: "FURNITURE", acquisitionDate: "2020-01-01", cost: 1000, usefulLifeYears: 10, accumulatedDepreciation: 500, currentYearDepreciation: 100, taxCostBase: 1000, accumulatedTaxDepreciation: 600, newManufacturing: false, disposalDate: null, sourceRow: 1 }],
      },
    });
    const rolled = rollForwardCompany(c, computeCompany(c).rows);
    expect(rolled.bridge).toEqual({ employeeProfitShare: 0, boardRemuneration: 0 });
    const next = computeCompany(rolled).rows;
    // The payable is brought forward once; the expense is closed to retained earnings and not charged again.
    expect(next.find((r) => r.code === "BR-2901")?.currentCredit).toBe(50);
    expect(next.find((r) => r.code === "BR-6901")?.currentDebit ?? 0).toBe(0);
    expect(rolled.subledgers.far[0]).toMatchObject({ accumulatedDepreciation: 600, currentYearDepreciation: 0, accumulatedTaxDepreciation: 700 });
  });
});

describe("trial-balance tolerance", () => {
  it("lets a difference within the company tolerance pass the gate, for both periods", () => {
    const c = company({ rows: tb("1010,Cash,CASH,1000.4,0,1000,0\n3000,Capital,SHARE_CAPITAL,0,1000,0,1000.4"), tolerance: 1 });
    const a = computeCompany(c).analysis!;
    expect(periodChecks(c, a, null, {}).find((x) => x.key === "tbBalanced")!.ok).toBe(true);
    expect(periodChecks({ ...c, tolerance: 0.01 }, a, null, {}).find((x) => x.key === "tbBalanced")!.ok).toBe(false);
  });
});

describe("group consolidation", () => {
  it("leaves out members in another currency or period instead of adding them", () => {
    const p = { ...company(), id: "p" };
    const usd = { ...company(), id: "u", settings: { ...company().settings, functionalCurrency: "USD" } };
    const late = { ...company(), id: "l", period: { ...company().period, start: "2026-01-01", end: "2026-12-31" } };
    const r = consolidateGroup([p, usd, late], { id: "g", name: "G", parentId: "p", members: [{ companyId: "p", ownership: 1 }, { companyId: "u", ownership: 1 }, { companyId: "l", ownership: 1 }] });
    expect(r.entities.map((e) => e.id)).toEqual(["p"]);
    expect(r.currencyMismatch.map((x) => x.companyId)).toEqual(["u"]);
    expect(r.periodMismatch.map((x) => x.companyId)).toEqual(["l"]);
    expect(r.analysis!.current.cash).toBe(1000);
  });
});

describe("top counterparties", () => {
  it("ranks customers in the functional currency at the analyst's rates", async () => {
    const inv = (customer: string, currency: string, outstanding: number) => ({ invoice: customer, customer, invoiceDate: "2025-11-01", dueDate: "2026-02-01", amount: outstanding, outstanding, currency });
    const c = company({ fxRates: { USD: 50 }, subledgers: { ...newCompany().subledgers, ar: [inv("Egypt", "EGP", 2000), inv("US", "USD", 1000), inv("EU", "EUR", 10)] as never } });
    const tools = buildAgentTools(c) as AgentTools;
    const out = (await (tools.get_top_counterparties.execute as unknown as (i: unknown, o: unknown) => Promise<{ currency: string; customers: { customer: string; open: number }[]; leftOutNoRate: string[] }>)({ side: "customers", limit: 10 }, { toolCallId: "t", messages: [] }));
    expect(out.currency).toBe("EGP");
    expect(out.customers.map((x) => [x.customer, x.open])).toEqual([["US", 50_000], ["Egypt", 2000]]);
    expect(out.leftOutNoRate).toEqual(["EUR"]);
  });
});
