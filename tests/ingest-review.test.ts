import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseOfx } from "@/lib/ingest/bankFormats";
import { detectFile, monthFromName } from "@/lib/ingest/detect";
import { normaliseTable } from "@/lib/ingest/erp";
import { pipeToCsv, readDbf, readOds } from "@/lib/ingest/formats";
import { joinPages } from "@/lib/ingest/pdf";
import { expandFiles } from "@/lib/ingest/stage";
import { gridToSheet, readXlsx, serialToIso } from "@/lib/ingest/xlsx";

const ods = (body: string) => zipSync({ "content.xml": strToU8(`<office:document-content><office:body><office:spreadsheet><table:table table:name="TB">${body}</table:table></office:spreadsheet></office:body></office:document-content>`) });
const cell = (v: string) => `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`;

describe("ODS repeats", () => {
  it("keeps repeated blank cells between values in their columns", () => {
    const row = (...c: string[]) => `<table:table-row>${c.join("")}</table:table-row>`;
    const [s] = readOds(ods(row(cell("code"), cell("name"), cell("x"), cell("current_debit")) + row(cell("1010"), `<table:table-cell table:number-columns-repeated="2"/>`, cell("500"), `<table:table-cell table:number-columns-repeated="16000"/>`)));
    expect(s.csv.split("\n")[1]).toBe("1010,,,500");
  });

  it("expands a repeated populated row in full and holds sheets over the row budget", () => {
    const [s] = readOds(ods(`<table:table-row table:number-rows-repeated="1001">${cell("a")}</table:table-row>`));
    expect(s.rows).toBe(1001);
    expect(() => readOds(ods(`<table:table-row table:number-rows-repeated="300000">${cell("a")}</table:table-row>`))).toThrow(/more than/);
  });
});

describe("DBF", () => {
  it("rejects a file cut short instead of returning part of it", () => {
    const head = new Uint8Array(65);
    const dv = new DataView(head.buffer);
    dv.setUint32(4, 3, true);
    dv.setUint16(8, 65, true);
    dv.setUint16(10, 5, true);
    head.set(strToU8("CODE"), 32);
    head[43] = "C".charCodeAt(0);
    head[48] = 4;
    head[64] = 0x0d;
    const rec = (s: string) => [0x20, ...strToU8(s.padEnd(4))];
    const full = Uint8Array.from([...head, ...rec("1"), ...rec("2"), ...rec("3")]);
    expect(readDbf(full)[0].rows).toBe(4);
    expect(() => readDbf(full.subarray(0, full.length - 2))).toThrow(/incomplete/);
  });
});

describe("pipe text", () => {
  it("does not treat pipes inside quoted CSV values as delimiters", () => {
    const csv = `date,description,amount\n2025-01-01,"ACH|Nile|REF1",10\n2025-01-02,"ACH|Nile|REF2",20\n2025-01-03,"ACH|Nile|REF3",30\n`;
    expect(pipeToCsv(csv)).toBeNull();
    expect(pipeToCsv("| code | name |\n|---|---|\n| 1 | Cash |\n")).toContain("1,Cash");
  });
});

describe("xlsx", () => {
  const workbook = (pr: string) =>
    zipSync({
      "xl/workbook.xml": strToU8(`<workbook>${pr}<sheets><sheet name="S" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/styles.xml": strToU8(`<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>44196</v></c></row></sheetData></worksheet>`),
    });

  it("honours the 1904 date system", () => {
    expect(readXlsx(workbook(""))[0].csv.trim()).toBe("2020-12-31");
    expect(readXlsx(workbook(`<workbookPr date1904="1"/>`))[0].csv.trim()).toBe("2025-01-01");
    expect(serialToIso(0, true)).toBe("1904-01-01");
  });

  it("sizes very tall grids without spreading one argument per row", () => {
    const grid = Array.from({ length: 200_000 }, (_, i) => [String(i)]);
    expect(gridToSheet("big", grid).rows).toBe(200_000);
  });
});

describe("PDF pages", () => {
  it("continues a table over a page break and drops the repeated header", () => {
    const h = "Date   Description   Amount";
    const out = joinPages([
      ["Bank statement", h, "01/01   A   10", "02/01   B   20"],
      ["Bank statement page 2", h, "03/01   C   30", "04/01   D   40"],
    ]);
    expect(out).toEqual(["Bank statement", h, "01/01   A   10", "02/01   B   20", "03/01   C   30", "04/01   D   40"]);
  });

  it("keeps a page with a different table separate", () => {
    const out = joinPages([["Code   Name   Debit", "1   Cash   10"], ["Customer   Invoice   Amount", "Delta   1   5"]]);
    expect(out).toContain("");
  });
});

describe("detection", () => {
  it("recognises a trial balance with a code and a signed end balance", () => {
    expect(detectFile("odoo.csv", "Code,Account Name,End Balance\n1010,Cash,500\n4000,Sales,-500\n").category).toBe("TRIAL_BALANCE");
  });

  it("matches month names as whole words", () => {
    expect(monthFromName("TB Summary April 2025.csv")?.label).toBe("2025-04");
    expect(monthFromName("ميزان مارس 2025.csv")?.label).toBe("2025-03");
    expect(monthFromName("tb_202504.csv")?.label).toBe("2025-04");
  });

  it("does not take a JSON record list with an internalId column for ETA invoices", () => {
    const payroll = JSON.stringify([{ internalId: "E1", employee: "Ali", basic: 9000 }]);
    expect(detectFile("payroll.json", payroll).format).not.toBe("eta");
    const eta = JSON.stringify({ documents: [{ uuid: "U1", internalId: "I1", dateTimeIssued: "2025-01-01T00:00:00Z", taxTotals: [] }] });
    expect(detectFile("eta.json", eta).format).toBe("eta");
  });

  it("detects a table converted from JSON as CSV", async () => {
    const json = JSON.stringify([{ code: "1010", name: "Cash", current_debit: 500, current_credit: 0 }, { code: "4000", name: "Sales", current_debit: 0, current_credit: 500 }]);
    const { units } = await expandFiles([{ name: "tb.json", bytes: strToU8(json) }]);
    expect(units[0].fileName).toBe("tb.json");
    expect(units[0].detection.category).toBe("TRIAL_BALANCE");
  });
});

describe("archives", () => {
  it("does not unpack archives nested deeper than one level", async () => {
    const inner = zipSync({ "deep.zip": zipSync({ "a.csv": strToU8("code,name\n1,x\n") }) });
    const outer = zipSync({ "mid.zip": inner });
    const { units, errors } = await expandFiles([{ name: "pack.zip", bytes: outer }]);
    expect(units).toHaveLength(0);
    expect(errors.join(" ")).toMatch(/nested/);
  });
});

describe("OFX", () => {
  const stmt = (txns: string, ledger: string, end = "") => `<STMTRS><CURDEF>EGP<BANKTRANLIST>${end}${txns}</BANKTRANLIST><LEDGERBAL>${ledger}</LEDGERBAL></STMTRS>`;
  const t = (d: string, a: string) => `<STMTTRN><TRNTYPE>X<DTPOSTED>${d}<TRNAMT>${a}<NAME>n\n`;

  it("refuses files holding several account statements", () => {
    const one = stmt(t("20251201", "10"), "<BALAMT>10<DTASOF>20251201");
    expect(() => parseOfx(`OFXHEADER:100\n<OFX>${one}${one}</OFX>`)).toThrow(/2 account statements/);
  });

  it("refuses missing or unreadable amounts", () => {
    expect(() => parseOfx(`<OFX>${stmt(t("20251201", "abc") + t("20251202", ""), "<BALAMT>10")}</OFX>`)).toThrow(/transactions 1, 2/);
  });

  it("rebuilds balances only when the ledger balance date is linked to the lines", () => {
    const lines = t("20251210", "-300") + t("20251215", "1000");
    const gap = parseOfx(`<OFX>${stmt(lines, "<BALAMT>5700<DTASOF>20251231")}</OFX>`);
    expect(gap.lines.map((l) => l.balance)).toEqual([null, null]);
    const covered = parseOfx(`<OFX>${stmt(lines, "<BALAMT>5700<DTASOF>20251231", "<DTSTART>20251201<DTEND>20251231")}</OFX>`);
    expect(covered.lines.map((l) => l.balance)).toEqual([4700, 5700]);
    const sameDay = parseOfx(`<OFX>${stmt(lines, "<BALAMT>5700<DTASOF>20251215")}</OFX>`);
    expect(sameDay.lines.map((l) => l.balance)).toEqual([4700, 5700]);
  });
});

describe("ERP trial balances", () => {
  const rows = (text: string) => normaliseTable(text, "TRIAL_BALANCE").text.trim().split("\n");

  it("keeps coded accounts named Total… and drops uncoded total lines", () => {
    const out = rows("code,name,current_debit,current_credit\n2100,Total deposits,0,5000\n1010,Cash,5000,0\n,TOTAL,5000,5000\n,المجموع,5000,5000\n");
    expect(out).toHaveLength(3);
    expect(out.join("\n")).toContain("Total deposits");
  });

  it("holds the file when a signed balance cannot be read", () => {
    expect(() => normaliseTable("Code,Account Name,End Balance\n1010,Cash,N/A\n4000,Sales,-500\n", "TRIAL_BALANCE")).toThrow(/could not be read/);
    expect(rows("Code,Account Name,End Balance\n1010,Cash,\n4000,Sales,-500\n")).toHaveLength(3);
  });

  it("prefers closing columns over bare debit/credit movements", () => {
    const n = normaliseTable("Code,Name,Debit,Credit,Closing Debit,Closing Credit\n1010,Cash,100,0,900,0\n", "TRIAL_BALANCE");
    expect(n.headers.slice(2)).toEqual(["period_debit", "period_credit", "current_debit", "current_credit"]);
  });

  it("keeps analyst-mapped closing columns when a balance column is also present", () => {
    const n = normaliseTable("Code,Name,Close Dr,Close Cr,Balance\n1010,Cash,900,0,123\n", "TRIAL_BALANCE", { current_debit: "Close Dr", current_credit: "Close Cr" });
    expect(n.headers.filter((h) => h === "current_debit")).toHaveLength(1);
    expect(n.text.split("\n")[1]).toBe("1010,Cash,900,0,123");
  });
});
