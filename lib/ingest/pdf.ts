import { fixedWidthToCsv } from "./formats";

/**
 * Text extraction from digital PDFs (exported reports, e-statements) in the browser with pdf.js.
 * Text items are regrouped into lines by their position and columns are separated by wide gaps, so
 * a printed trial balance or bank statement becomes a table. Scanned PDFs have no text layer and
 * need AI text recognition instead.
 */
export interface PdfText {
  pages: number;
  text: string;
  csv: string | null;
  hasText: boolean;
  /** The PDF has more pages than were read: the table is incomplete and must not be imported as it is. */
  truncated: boolean;
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
}

/** Rebuilds lines from positioned text: same baseline (±2pt) → one line; a gap wider than ~2 characters → column break. */
export function itemsToLines(items: Item[]): string[] {
  const rows: Item[][] = [];
  for (const it of [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= 2);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => {
    const sorted = r.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const it of sorted) {
      const charW = it.w / Math.max(1, it.str.length);
      const gap = it.x - end;
      line += line ? (gap > charW * 2 ? "   " : gap > charW * 0.3 ? " " : "") : "";
      line += it.str.trim();
      end = it.x + it.w;
    }
    return line;
  });
}

/**
 * Joins pages into one text. A table that runs over a page break repeats its header on the next page:
 * when a page's column header (the line near the top with the most columns, so a "Title   Page 1"
 * line above it is not mistaken for it) matches the table in progress, and the lines above it name
 * the same table once page numbers are ignored, the header and those lines are dropped and the rows
 * continue the same table. A page whose title differs (another account) or that has no matching
 * header starts a new table, separated by a blank line.
 */
export function joinPages(pages: string[][]): string[] {
  const TOP = 8;
  const norm = (l: string) => l.replace(/\s+/g, " ").trim();
  const cells = (l: string) => l.trim().split(/\s{2,}/).length;
  const headerAt = (page: string[]) => {
    let best = -1;
    page.slice(0, TOP).forEach((l, i) => {
      if (cells(l) < 2) return;
      if (best < 0 || cells(l) > cells(page[best]) || (cells(l) === cells(page[best]) && /\d/.test(page[best]) && !/\d/.test(l))) best = i;
    });
    return best;
  };
  // What identifies the table: the title lines above the header, without page numbers.
  const identity = (lines: string[]) =>
    lines
      .map((l) => norm(l.replace(/\bpage\s*\d+(\s*(of|\/)\s*\d+)?\b/gi, "").replace(/صفحة\s*\d+(\s*(من|\/)\s*\d+)?/g, "").replace(/^[-–\s]*\d+\s*(\/\s*\d+)?[-–\s]*$/, "")))
      .filter(Boolean)
      .join(" | ");
  const out: string[] = [];
  let header: string | undefined;
  let title = "";
  for (const raw of pages) {
    const page = raw.filter((l) => l.trim());
    const k = header === undefined ? -1 : page.slice(0, TOP).findIndex((l) => norm(l) === header);
    const sameTable = k >= 0 && (identity(page.slice(0, k)) === "" || identity(page.slice(0, k)) === title);
    if (sameTable) out.push(...page.slice(k + 1));
    else {
      if (out.length) out.push("");
      out.push(...page);
      const h = headerAt(page);
      header = h < 0 ? undefined : norm(page[h]);
      title = h < 0 ? "" : identity(page.slice(0, h));
    }
  }
  return out;
}

export async function extractPdfText(bytes: Uint8Array, maxPages = 200): Promise<PdfText> {
  // Loading the worker module registers it on globalThis, so pdf.js runs in this thread: no separate
  // worker file is needed (which also keeps the single-file HTML build self-contained).
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str?: string; transform?: number[]; width?: number }>)
      .filter((i) => typeof i.str === "string" && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }));
    pages.push(itemsToLines(items));
  }
  const numPages = doc.numPages;
  await doc.destroy();
  const text = joinPages(pages).join("\n") + "\n";
  const hasText = text.replace(/\s/g, "").length > 20;
  return { pages: numPages, text, csv: hasText ? fixedWidthToCsv(text) : null, hasText, truncated: numPages > maxPages };
}
