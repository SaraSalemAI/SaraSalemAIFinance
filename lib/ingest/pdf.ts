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
 * when one of a page's first lines is the header of the table in progress (the first line with
 * columns near the top of the page that started it), that line and the page title above it are
 * dropped and the rows continue the same table. Other pages stay separated by a blank line, so
 * genuinely different tables remain apart.
 */
export function joinPages(pages: string[][]): string[] {
  const norm = (l: string) => l.replace(/\s+/g, " ").trim();
  const headerOf = (page: string[]) => page.slice(0, 6).find((l) => /\S\s{2,}\S/.test(l));
  const out: string[] = [];
  let header: string | undefined;
  for (const raw of pages) {
    const page = raw.filter((l) => l.trim());
    const k = header === undefined ? -1 : page.slice(0, 6).findIndex((l) => norm(l) === header);
    if (k >= 0) out.push(...page.slice(k + 1));
    else {
      if (out.length) out.push("");
      out.push(...page);
      const h = headerOf(page);
      header = h === undefined ? undefined : norm(h);
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
