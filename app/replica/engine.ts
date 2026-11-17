/* Tiny formula engine for the replica dashboard.
   Prepared by Sara Salem. Copyright Sara Salem 2026.
   Supports numbers, A1 refs, ranges, + - * / ( ), unary minus, SUM AVG MIN MAX COUNT. */

export type Grid = string[][]; // grid[r][c], row 0 = header, col 0 = label
export type Value = number | string; // string = text or "#ERR"-style error

export const colName = (c: number) => String.fromCharCode(65 + c);
const colIndex = (s: string) => s.charCodeAt(0) - 65;

function parseRef(ref: string): [number, number] {
  const m = /^([A-Z])(\d+)$/.exec(ref);
  if (!m) throw new Error("#REF");
  return [Number(m[2]) - 1, colIndex(m[1])];
}

export function evaluate(grid: Grid): Value[][] {
  const memo = new Map<string, Value>();
  const visiting = new Set<string>();

  const cell = (r: number, c: number): Value => {
    if (r < 0 || c < 0 || r >= grid.length || c >= (grid[r]?.length ?? 0)) throw new Error("#REF");
    const key = `${r},${c}`;
    if (memo.has(key)) return memo.get(key)!;
    if (visiting.has(key)) throw new Error("#CYCLE");
    visiting.add(key);
    let v: Value;
    try { v = compute(grid[r][c] ?? ""); } catch (e) { v = (e as Error).message.startsWith("#") ? (e as Error).message : "#ERR"; }
    visiting.delete(key);
    memo.set(key, v);
    return v;
  };

  const num = (v: Value): number => {
    if (typeof v === "number") return v;
    if (v.startsWith("#")) throw new Error(v);
    if (v.trim() === "") return 0;
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error("#VALUE");
    return n;
  };

  const compute = (raw: string): Value => {
    const s = raw.trim();
    if (!s.startsWith("=")) {
      const n = Number(s.replace(/,/g, ""));
      return s !== "" && !Number.isNaN(n) ? n : raw;
    }
    const tokens = s.slice(1).toUpperCase().match(/\d+(?:\.\d+)?|[A-Z]+\d+(?::[A-Z]+\d+)?|[A-Z]+|[()+\-*/,]|\S/g) ?? [];
    let i = 0;
    const peek = () => tokens[i];
    const take = (t?: string) => {
      const tok = tokens[i++];
      if (t && tok !== t) throw new Error("#ERR");
      return tok;
    };
    const rangeValues = (tok: string): number[] => {
      const [a, b] = tok.split(":");
      const [r1, c1] = parseRef(a);
      const [r2, c2] = parseRef(b ?? a);
      const out: number[] = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          const v = cell(r, c);
          if (typeof v === "string" && v.startsWith("#")) throw new Error(v);
          if (typeof v === "number") out.push(v);
          else if (v.trim() !== "" && !Number.isNaN(Number(v))) out.push(Number(v));
        }
      return out;
    };
    const FN: Record<string, (xs: number[]) => number> = {
      SUM: (xs) => xs.reduce((a, b) => a + b, 0),
      AVG: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
      AVERAGE: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
      MIN: (xs) => (xs.length ? Math.min(...xs) : 0),
      MAX: (xs) => (xs.length ? Math.max(...xs) : 0),
      COUNT: (xs) => xs.length,
    };
    const expr = (): number => {
      let v = term();
      while (peek() === "+" || peek() === "-") v = take() === "+" ? v + term() : v - term();
      return v;
    };
    const term = (): number => {
      let v = factor();
      while (peek() === "*" || peek() === "/") {
        if (take() === "*") v *= factor();
        else {
          const d = factor();
          if (d === 0) throw new Error("#DIV/0");
          v /= d;
        }
      }
      return v;
    };
    const factor = (): number => {
      const t = take();
      if (t === undefined) throw new Error("#ERR");
      if (t === "-") return -factor();
      if (t === "+") return factor();
      if (t === "(") { const v = expr(); take(")"); return v; }
      if (/^\d/.test(t)) return Number(t);
      if (FN[t]) {
        take("(");
        const xs: number[] = [];
        if (peek() !== ")") {
          do {
            const a = peek();
            if (a && /^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(a)) { take(); xs.push(...rangeValues(a)); }
            else xs.push(expr());
          } while (peek() === "," && take());
        }
        take(")");
        return FN[t](xs);
      }
      if (/^[A-Z]\d+$/.test(t)) { const [r, c] = parseRef(t); return num(cell(r, c)); }
      throw new Error("#NAME");
    };
    const v = expr();
    if (i < tokens.length) throw new Error("#ERR");
    return Math.round(v * 1e6) / 1e6;
  };

  return grid.map((row, r) => row.map((_, c) => cell(r, c)));
}

export const fmt = (v: Value) =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v;
