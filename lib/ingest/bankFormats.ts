import { round2 } from "../finance/engine";

/** Bank lines in the shape the bank-statement CSV importer reads: date, description, signed amount, running balance. */
export interface RawBankLine {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
}

export const isMt940 = (text: string) => /(^|\n):20:/.test(text) && /(^|\n):61:/.test(text);
export const isOfx = (text: string) => /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));

const mtAmount = (s: string) => Number(s.replace(",", "."));

function yymmdd(s: string): string {
  const yy = Number(s.slice(0, 2));
  return `${yy < 70 ? 2000 + yy : 1900 + yy}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
}

/**
 * SWIFT MT940 statement. :60F:/:60M: opening, :61: statement lines with a following :86: narrative,
 * :62F:/:62M: closing. Running balances are rebuilt from the opening balance.
 */
export function parseMt940(text: string): { lines: RawBankLine[]; opening: number | null; closing: number | null; currency: string | null } {
  const fields: Array<{ tag: string; value: string }> = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const m = raw.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) fields.push({ tag: m[1], value: m[2] });
    else if (fields.length && raw.trim() && !/^-}?$/.test(raw.trim())) fields[fields.length - 1].value += " " + raw.trim();
  }
  let opening: number | null = null;
  let closing: number | null = null;
  let currency: string | null = null;
  const lines: RawBankLine[] = [];
  const bal = (v: string) => {
    const m = v.match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)/);
    if (!m) return null;
    currency = m[3];
    return (m[1] === "D" ? -1 : 1) * mtAmount(m[4]);
  };
  for (const f of fields) {
    if (f.tag.startsWith("60")) opening = opening ?? bal(f.value);
    else if (f.tag.startsWith("62")) closing = bal(f.value);
    else if (f.tag === "61") {
      // YYMMDD [MMDD] (R)C|D [funds code] amount N... reference
      const m = f.value.match(/^(\d{6})(\d{4})?(RC|RD|C|D)[A-Z]?([\d,]+)N?([A-Z0-9]{3})?(.*)$/);
      if (!m) continue;
      const sign = m[3] === "C" || m[3] === "RD" ? 1 : -1;
      lines.push({ date: yymmdd(m[1]), description: (m[6] ?? "").replace(/^\/\//, "").trim(), amount: round2(sign * mtAmount(m[4])), balance: null });
    } else if (f.tag === "86" && lines.length) {
      lines[lines.length - 1].description = f.value.replace(/\?\d{2}/g, " ").replace(/\s+/g, " ").trim() || lines[lines.length - 1].description;
    }
  }
  if (opening !== null) {
    let run = opening;
    for (const l of lines) {
      run = round2(run + l.amount);
      l.balance = run;
    }
  } else if (closing !== null && lines.length) lines[lines.length - 1].balance = closing;
  return { lines, opening, closing, currency };
}

/**
 * OFX / QFX statement (SGML 1.x or XML 2.x): one <STMTTRN> per line, <LEDGERBAL> for the closing balance.
 * A file with statements for several accounts, or a line whose amount cannot be read, is refused
 * rather than merged or imported as zero. Running balances are rebuilt from the ledger balance only
 * when its as-of date is the last line's date, or the transaction list runs up to that date.
 */
export function parseOfx(text: string): { lines: RawBankLine[]; closing: number | null; currency: string | null } {
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  const date = (s: string) => (/^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "");
  const statements = (text.match(/<(?:CC)?STMTRS>/gi) ?? []).length;
  if (statements > 1) throw new Error(`This OFX file holds ${statements} account statements. Export one account per file so each account keeps its own balance.`);
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map((m) => m[1]);
  const bad: number[] = [];
  const lines = blocks
    .map((b, i) => {
      const raw = tag(b, "TRNAMT").replace(/,/g, "");
      const amount = raw ? Number(raw) : NaN;
      const d = date(tag(b, "DTPOSTED"));
      if (d && !Number.isFinite(amount)) bad.push(i + 1);
      return { date: d, description: [tag(b, "NAME"), tag(b, "MEMO")].filter(Boolean).join(" — ") || tag(b, "TRNTYPE"), amount: round2(amount), balance: null as number | null };
    })
    .filter((l) => l.date);
  if (bad.length) throw new Error(`OFX transaction${bad.length > 1 ? "s" : ""} ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? "…" : ""} ha${bad.length > 1 ? "ve" : "s"} a missing or unreadable amount (TRNAMT).`);
  lines.sort((a, b) => a.date.localeCompare(b.date));
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[1] ?? "";
  const closingRaw = tag(ledger, "BALAMT");
  const closing = closingRaw && Number.isFinite(Number(closingRaw)) ? Number(closingRaw) : null;
  const asOf = date(tag(ledger, "DTASOF"));
  const listEnd = date(tag(text.match(/<BANKTRANLIST>([\s\S]*?)<STMTTRN>/i)?.[1] ?? "", "DTEND"));
  const last = lines.length ? lines[lines.length - 1].date : "";
  // The ledger balance is the balance after the last line only if it is dated that day, or later with
  // the transaction list running up to it. A balance dated before the last line, or after the list
  // ends, describes a different point in time, so the running balances stay unknown.
  const linked = !asOf || asOf === last || (asOf > last && !!listEnd && listEnd >= asOf);
  if (closing !== null && lines.length && linked) {
    let run = closing;
    for (let i = lines.length - 1; i >= 0; i--) {
      lines[i].balance = round2(run);
      run -= lines[i].amount;
    }
  }
  return { lines, closing, currency: tag(text, "CURDEF") || null };
}

export function bankLinesToCsv(lines: RawBankLine[]): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["date,description,amount,balance", ...lines.map((l) => [l.date, cell(l.description), l.amount, l.balance ?? ""].join(","))].join("\n") + "\n";
}
