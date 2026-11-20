import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseTrialBalance } from "@/lib/finance/parse";
import { assetSchedule, type FixedAsset } from "@/lib/finance/subledgers";
import { monthlyTrend, trendSummary } from "@/lib/finance/trends";
import { tbIdentity } from "@/lib/ingest/auto";
import { normaliseTable } from "@/lib/ingest/erp";
import { readOds } from "@/lib/ingest/formats";
import { joinPages } from "@/lib/ingest/pdf";
import { computeCompany, periodChecks } from "@/lib/workspace/compute";
import { newCompany } from "@/lib/workspace/defaults";
import { fiscalYearStart, rollForwardCompany } from "@/lib/workspace/period";
import type { Company } from "@/lib/workspace/types";

const tb = (csv: string) => parseTrialBalance("code,name,category,current_debit,current_credit,prior_debit,prior_credit\n" + csv).rows;
const fy = { start: "2025-01-01", end: "2025-12-31", currentLabel: "FY2025", priorLabel: "FY2024" };
const company = (patch: Partial<Company> = {}): Company => {
  const c = newCompany("Co");
  return { ...c, period: { ...c.period, ...fy }, rows: tb("1010,Cash,CASH,1000,0,1000,0\n3000,Capital,SHARE_CAPITAL,0,1000,0,1000"), ...patch };
};

describe("trend month-on-month", () => {
  const m = (cash: number) => tb(`1010,Cash,CASH,${cash},0,0,0\n3000,Capital,SHARE_CAPITAL,0,${cash},0,0`);
  it("has no comparison when the month before is missing", () => {
    const s = trendSummary(monthlyTrend([{ label: "2025-01", rows: m(100) }, { label: "2025-03", rows: m(300) }], false))!;
    expect(s.cash.momChange).toBeNull();
    expect(s.cash.momPct).toBeNull();
  });
  it("compares adjacent months, across a year end too", () => {
    const s = trendSummary(monthlyTrend([{ label: "2024-12", rows: m(100) }, { label: "2025-01", rows: m(300) }], false))!;
    expect(s.cash.momChange).toBe(200);
  });
});

describe("trial-balance identity for AI mapping", () => {
  it("changes when names or balances change without a source document, and not otherwise", () => {
    const a = company();
    const same = company();
    const renamed = company({ rows: tb("1010,Bank,CASH,1000,0,1000,0\n3000,Capital,SHARE_CAPITAL,0,1000,0,1000") });
    const moved = company({ rows: tb("1010,Cash,CASH,1200,0,1000,0\n3000,Capital,SHARE_CAPITAL,0,1200,0,1000") });
    expect(tbIdentity(a)).toBe(tbIdentity(same));
    expect(tbIdentity(renamed)).not.toBe(tbIdentity(a));
    expect(tbIdentity(moved)).not.toBe(tbIdentity(a));
    // Mapping a row does not change what was sent to the AI.
    expect(tbIdentity({ ...a, rows: a.rows.map((r) => ({ ...r, category: "CASH" as never, suggested: false })) })).toBe(tbIdentity(a));
  });
});

describe("ERP closing columns", () => {
  it("still derives the closing balance when the closing columns were mapped to the prior year", () => {
    const n = normaliseTable("Code,Name,Closing Debit,Closing Credit,End Balance\n1010,Cash,100,0,500\n", "TRIAL_BALANCE", { prior_debit: "Closing Debit", prior_credit: "Closing Credit" });
    const [head, row] = n.text.trim().split("\n").map((l) => l.split(","));
    expect(head).toContain("current_debit");
    expect(row[head.indexOf("current_debit")]).toBe("500");
    expect(row[head.indexOf("prior_debit")]).toBe("100");
  });
});

describe("ODS size limit", () => {
  it("refuses a sheet whose repeats expand past the workbook cell limit", () => {
    const wide = `<table:table-cell office:value-type="string"><text:p>x</text:p></table:table-cell>`.replace(">", ' table:number-columns-repeated="2000">');
    const xml = `<office:document-content><office:body><office:spreadsheet><table:table table:name="T"><table:table-row table:number-rows-repeated="200000">${wide}</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
    expect(() => readOds(zipSync({ "content.xml": strToU8(xml) }))).toThrow(/cells/);
  });
});

describe("PDF page joins", () => {
  const h = "Date   Description   Amount";
  it("finds the column header under a page title that has columns too", () => {
    const out = joinPages([
      ["Bank statement   Page 1", h, "01/01   A   10"],
      ["Bank statement   Page 2", h, "03/01   C   30"],
    ]);
    expect(out).toEqual(["Bank statement   Page 1", h, "01/01   A   10", "03/01   C   30"]);
  });
  it("keeps the boundary when the next page is another account with the same columns", () => {
    const out = joinPages([
      ["Account 111", h, "01/01   A   10"],
      ["Account 222", h, "03/01   C   30"],
    ]);
    expect(out).toEqual(["Account 111", h, "01/01   A   10", "", "Account 222", h, "03/01   C   30"]);
  });
});

describe("tolerance in cents", () => {
  it("accepts a one-cent difference that floating point makes slightly larger", () => {
    const c = company({ tolerance: 0.01, rows: tb("1010,Cash,CASH,0.07,0,0,0\n3000,Capital,SHARE_CAPITAL,0,0.06,0,0") });
    const a = computeCompany(c).analysis!;
    expect(periodChecks(c, a, null, {}).find((x) => x.key === "tbBalanced")!.ok).toBe(true);
    const off = company({ tolerance: 0.01, rows: tb("1010,Cash,CASH,0.08,0,0,0\n3000,Capital,SHARE_CAPITAL,0,0.06,0,0") });
    expect(periodChecks(off, computeCompany(off).analysis!, null, {}).find((x) => x.key === "tbBalanced")!.ok).toBe(false);
  });
});

describe("asset register at the year-end roll", () => {
  it("carries a full year's depreciation when the year closes on a quarter", () => {
    expect(fiscalYearStart("2025-12-31")).toBe("2025-01-01");
    expect(fiscalYearStart("2026-06-30")).toBe("2025-07-01");
    expect(fiscalYearStart("2024-02-29")).toBe("2023-03-01");
    const asset: FixedAsset = { tag: "A1", name: "Van", category: "VEHICLES", acquisitionDate: "2020-01-01", cost: 1200, usefulLifeYears: 10, accumulatedDepreciation: 0, currentYearDepreciation: 0, taxCostBase: 0, accumulatedTaxDepreciation: 0, newManufacturing: false, disposalDate: null, sourceRow: 1 };
    const q4 = company({ period: { ...company().period, start: "2025-10-01", end: "2025-12-31", currentLabel: "Q4 2025", priorLabel: "Q3 2025" }, subledgers: { ...newCompany().subledgers, far: [asset] } });
    const next = rollForwardCompany(q4, q4.rows);
    expect(next.period.start).toBe("2026-01-01");
    expect(next.subledgers.far[0].accumulatedDepreciation).toBe(assetSchedule(asset, "2025-01-01", "2025-12-31").accumulatedDepreciation);
    expect(next.subledgers.far[0].accumulatedDepreciation).toBe(120);
  });
});
