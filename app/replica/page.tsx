"use client";

/* Replica interactive dashboard, built on the replica design tokens.
   Prepared by Sara Salem. Copyright Sara Salem 2026.
   Icons: paths from Lucide (ISC licence). Chart palette validated with the dataviz checker. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import "../design/tokens.css";
import s from "./replica.module.css";
import { colName, evaluate, fmt, type Grid, type Value } from "./engine";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const FIRST = 1, LAST = 6, TOTAL = 7;
const SERIES = { light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"], dark: ["#3987e5", "#d95926", "#199e70", "#c98500"] };
const STORE = "replica-dashboard-v1";

type Book = { id: string; name: string; grid: Grid; rowIds: string[]; slots: Record<string, number> };

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const header = () => ["Line", ...MONTHS, "Total"];
const totalF = (r: number) => `=SUM(B${r + 1}:G${r + 1})`;
const perMonth = (r: number, f: (col: string) => string) => MONTHS.map((_, i) => f(colName(i + 1)));

function makeBook(name: string, rows: [string, (string | number)[]][]): Book {
  const grid: Grid = [header(), ...rows.map(([label, vals], i) => [label, ...vals.map(String), totalF(i + 1)])];
  const rowIds = rows.map(() => uid());
  const slots: Record<string, number> = {};
  rowIds.slice(0, 3).forEach((id, i) => (slots[id] = i));
  return { id: uid(), name, grid, rowIds, slots };
}

function seed(): Book[] {
  return [
    makeBook("FY budget", [
      ["Revenue", [410, 455, 472, 498, 520, 545]],
      ["Cost of sales", [190, 204, 211, 220, 228, 236]],
      ["Operating costs", [120, 118, 125, 131, 134, 138]],
      ["Net profit", perMonth(4, (c) => `=${c}2-${c}3-${c}4`)],
    ]),
    makeBook("Sales by region", [
      ["North", [120, 140, 168, 201, 214, 230]],
      ["South", [98, 115, 132, 150, 149, 161]],
      ["West", [210, 225, 247, 260, 255, 279]],
      ["All regions", perMonth(4, (c) => `=SUM(${c}2:${c}4)`)],
    ]),
    makeBook("Cash plan", [
      ["Cash in", [300, 280, 340, 360, 390, 410]],
      ["Cash out", [260, 300, 310, 320, 330, 345]],
      ["Net flow", perMonth(3, (c) => `=${c}2-${c}3`)],
      ["Closing cash", perMonth(4, (c) => (c === "B" ? "=500+B4" : `=${String.fromCharCode(c.charCodeAt(0) - 1)}5+${c}4`))],
    ]),
  ];
}

const P = {
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h8", "M8 17h8"],
  plus: ["M5 12h14", "M12 5v14"],
  down: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m6.3 17.7-1.4 1.4", "m19.1 4.9-1.4 1.4"],
  up: ["m5 12 7-7 7 7", "M12 19V5"],
  dn: ["M12 5v14", "m19 12-7 7-7-7"],
  search: ["m21 21-4.3-4.3", "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
};
const Icon = ({ d }: { d: string[] }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p) => <path key={p} d={p} />)}
  </svg>
);

export default function ReplicaDashboard() {
  const [books, setBooks] = useState<Book[]>(() => seed());
  const [activeId, setActiveId] = useState<string>("");
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(FIRST);
  const [to, setTo] = useState(LAST);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [sel, setSel] = useState<[number, number]>([1, 1]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editIn, setEditIn] = useState<"cell" | "fx">("cell");
  const [navOpen, setNavOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // load + autosave (per-viewer convenience; the page works without storage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const d = JSON.parse(raw) as { books: Book[]; activeId: string; dark: boolean };
        if (d.books?.length) { setBooks(d.books); setActiveId(d.activeId); setDark(!!d.dark); }
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setDark(true);
    } catch { /* storage unavailable */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setSaved(false);
    const t = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify({ books, activeId, dark })); } catch { /* ignore */ }
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [books, activeId, dark, loaded]);

  const book = books.find((b) => b.id === activeId) ?? books[0];
  const values = useMemo(() => (book ? evaluate(book.grid) : []), [book]);
  const palette = dark ? SERIES.dark : SERIES.light;

  const update = (fn: (b: Book) => Book) => setBooks((bs) => bs.map((b) => (b.id === book.id ? fn(b) : b)));
  const setCell = (r: number, c: number, v: string) =>
    update((b) => ({ ...b, grid: b.grid.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) }));

  const numAt = (r: number, c: number) => (typeof values[r]?.[c] === "number" ? (values[r][c] as number) : 0);
  const sumRange = (r: number) => { let t = 0; for (let c = from; c <= to; c++) t += numAt(r, c); return t; };

  // ---- grid keyboard
  const rows = book?.grid.length ?? 0;
  const move = (dr: number, dc: number) =>
    setSel(([r, c]) => [Math.min(Math.max(1, r + dr), rows - 1), Math.min(Math.max(0, c + dc), TOTAL)]);
  const commit = (dr = 1, dc = 0) => {
    if (editing !== null) setCell(sel[0], sel[1], editing);
    setEditing(null);
    move(dr, dc);
    requestAnimationFrame(() => gridRef.current?.focus());
  };
  const onGridKey = (e: KeyboardEvent) => {
    if (editing !== null) return;
    const map: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
    if (map[e.key]) { e.preventDefault(); move(...map[e.key]); return; }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setEditIn("cell"); setEditing(book.grid[sel[0]][sel[1]] ?? ""); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setCell(sel[0], sel[1], ""); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setEditIn("cell"); setEditing(e.key); }
  };

  // ---- actions
  const addBook = () => {
    const b = makeBook(`Untitled ${books.length + 1}`, [["New line", [0, 0, 0, 0, 0, 0]]]);
    setBooks((bs) => [...bs, b]); setActiveId(b.id); setSel([1, 1]); setNavOpen(false);
  };
  const deleteBook = () => {
    if (!window.confirm(`Delete "${book.name}"? This can't be undone.`)) return;
    setBooks((bs) => bs.filter((b) => b.id !== book.id)); setActiveId("");
  };
  const addRow = () => update((b) => {
    const r = b.grid.length;
    const id = uid();
    return { ...b, grid: [...b.grid, [`Line ${r}`, ...MONTHS.map(() => "0"), totalF(r)]], rowIds: [...b.rowIds, id] };
  });
  const deleteRow = () => {
    if (sel[0] < 1 || rows <= 2) return;
    const id = book.rowIds[sel[0] - 1];
    update((b) => {
      const slots = { ...b.slots }; delete slots[id];
      return { ...b, grid: b.grid.filter((_, i) => i !== sel[0]), rowIds: b.rowIds.filter((x) => x !== id), slots };
    });
    setSel(([r, c]) => [Math.max(1, r - 1), c]);
  };
  const toggleSeries = (id: string) => update((b) => {
    const slots = { ...b.slots };
    if (slots[id] !== undefined) delete slots[id];
    else {
      const used = new Set(Object.values(slots));
      const free = [0, 1, 2, 3].find((n) => !used.has(n));
      if (free === undefined) return b;
      slots[id] = free;
    }
    return { ...b, slots };
  });
  const exportCsv = () => {
    const esc = (v: Value) => { const t = String(typeof v === "number" ? v : v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = values.map((row) => row.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${book.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const reset = () => { if (window.confirm("Restore the sample workbooks? Your changes will be replaced.")) { setBooks(seed()); setActiveId(""); } };

  const shown = books.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()));

  if (!book) {
    return (
      <div className={cx(s.page, dark && "dark")}>
        <div className={s.emptyWrap}>
          <div className={s.tile}><Icon d={P.file} /></div>
          <h1 className={s.emptyTitle}>No workbooks yet</h1>
          <p className={s.muted}>Create one to start adding lines and formulas.</p>
          <button className={cx(s.btn, s.primary)} onClick={addBook}><Icon d={P.plus} />New workbook</button>
        </div>
      </div>
    );
  }

  const series = book.rowIds
    .map((id, i) => ({ id, r: i + 1, label: book.grid[i + 1][0] || `Row ${i + 2}`, slot: book.slots[id] }))
    .filter((x) => x.slot !== undefined) as { id: string; r: number; label: string; slot: number }[];
  const kpiRows = book.rowIds.slice(0, 4).map((_, i) => i + 1);
  const curRaw = book.grid[sel[0]]?.[sel[1]] ?? "";

  return (
    <div className={cx(s.page, dark && "dark")}>
      <a href="#sheet" className={s.skip}>Skip to sheet</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <div className={s.brand}>
            <button className={cx(s.btn, s.ghost, s.icon, s.menuBtn)} aria-label="Open workbook list" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}><Icon d={P.menu} /></button>
            <Icon d={P.file} /><span>Sheets</span>
          </div>
          <div className={s.headerActions}>
            <span className={cx(s.badge, saved ? s.bSuccess : s.bMuted)} role="status" aria-live="polite">{saved ? "Saved" : "Saving…"}</span>
            <button className={cx(s.btn, s.ghost, s.icon)} onClick={() => setDark((d) => !d)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
              <Icon d={dark ? P.sun : P.moon} />
            </button>
          </div>
        </div>
      </header>

      <div className={s.layout}>
        <aside className={cx(s.sidebar, navOpen && s.sidebarOpen)} aria-label="Workbooks">
          <button className={cx(s.btn, s.primary, s.full)} onClick={addBook}><Icon d={P.plus} />New workbook</button>
          <label className={s.searchBox}>
            <Icon d={P.search} />
            <span className={s.srOnly}>Search workbooks</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workbooks" />
          </label>
          <nav className={s.bookList}>
            {shown.map((b) => (
              <button key={b.id} className={cx(s.bookItem, b.id === book.id && s.bookActive)} aria-current={b.id === book.id ? "page" : undefined}
                onClick={() => { setActiveId(b.id); setSel([1, 1]); setEditing(null); setNavOpen(false); }}>
                <Icon d={P.file} /><span>{b.name}</span>
              </button>
            ))}
            {!shown.length && <p className={s.muted} style={{ padding: "8px 10px" }}>No workbook matches “{query}”.</p>}
          </nav>
          <button className={cx(s.btn, s.ghost, s.full, s.small)} onClick={reset}>Restore samples</button>
        </aside>

        <main className={s.main}>
          <div className={s.titleRow}>
            <div>
              <label className={s.srOnly} htmlFor="bookname">Workbook name</label>
              <input id="bookname" className={s.titleInput} value={book.name} onChange={(e) => update((b) => ({ ...b, name: e.target.value }))} />
              <p className={s.muted}>Only you can see this workbook.</p>
            </div>
            <div className={s.filters} role="group" aria-label="Filters">
              <label className={s.selectLabel}>From
                <select value={from} onChange={(e) => { const v = +e.target.value; setFrom(v); if (v > to) setTo(v); }}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className={s.selectLabel}>To
                <select value={to} onChange={(e) => { const v = +e.target.value; setTo(v); if (v < from) setFrom(v); }}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <button className={cx(s.btn, s.outline)} onClick={exportCsv}><Icon d={P.down} />Export CSV</button>
            </div>
          </div>

          <section className={s.kpis} aria-label="Key figures">
            {kpiRows.map((r) => {
              const total = sumRange(r);
              const last = numAt(r, to), prev = to > from ? numAt(r, to - 1) : NaN;
              const pct = Number.isFinite(prev) && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;
              return (
                <div key={r} className={s.kpi}>
                  <p className={s.kpiLabel}>{book.grid[r][0]}</p>
                  <p className={s.kpiValue}>{fmt(total)}</p>
                  <p className={s.kpiDelta}>
                    {pct === null ? `${MONTHS[from - 1]}–${MONTHS[to - 1]}` : (
                      <><Icon d={pct >= 0 ? P.up : P.dn} />{Math.abs(pct).toFixed(1)}% vs {MONTHS[to - 2]}</>
                    )}
                  </p>
                </div>
              );
            })}
          </section>

          <section className={s.card} aria-labelledby="chart-title">
            <div className={s.cardHead}>
              <h2 id="chart-title" className={s.h2}>Monthly trend</h2>
              <div className={s.segmented} role="radiogroup" aria-label="Chart type">
                {(["bar", "line"] as const).map((t) => (
                  <button key={t} role="radio" aria-checked={chartType === t} className={cx(s.seg, chartType === t && s.segOn)} onClick={() => setChartType(t)}>{t === "bar" ? "Bars" : "Lines"}</button>
                ))}
              </div>
            </div>
            <div className={s.legend} aria-label="Series. Select to show or hide">
              {book.rowIds.map((id, i) => {
                const slot = book.slots[id];
                const on = slot !== undefined;
                const full = !on && Object.keys(book.slots).length >= 4;
                return (
                  <button key={id} className={cx(s.legendItem, !on && s.legendOff)} aria-pressed={on} disabled={full} title={full ? "Up to 4 lines can be charted" : undefined} onClick={() => toggleSeries(id)}>
                    <span className={s.swatch} style={{ background: on ? palette[slot] : "transparent", borderColor: on ? palette[slot] : "var(--rp-border-input)" }} />
                    {book.grid[i + 1][0] || `Row ${i + 2}`}
                  </button>
                );
              })}
            </div>
            <Chart type={chartType} series={series} months={MONTHS.slice(from - 1, to)} cols={Array.from({ length: to - from + 1 }, (_, i) => from + i)} numAt={numAt} palette={palette} />
          </section>

          <section className={s.card} aria-labelledby="sheet-title">
            <div className={s.cardHead}>
              <h2 id="sheet-title" className={s.h2}>Sheet</h2>
              <div className={s.row}>
                <button className={cx(s.btn, s.outline, s.small)} onClick={addRow}><Icon d={P.plus} />Add line</button>
                <button className={cx(s.btn, s.ghost, s.small)} onClick={deleteRow} disabled={rows <= 2}><Icon d={P.trash} />Delete line</button>
                <button className={cx(s.btn, s.ghost, s.small, s.dangerText)} onClick={deleteBook}>Delete workbook</button>
              </div>
            </div>
            <div className={s.formulaBar}>
              <span className={s.cellName}>{colName(sel[1])}{sel[0] + 1}</span>
              <label className={s.srOnly} htmlFor="fx">Cell contents</label>
              <input id="fx" className={s.fx} value={editing ?? curRaw} placeholder="Type a value or a formula like =SUM(B2:G2)"
                onFocus={() => { setEditIn("fx"); if (editing === null) setEditing(curRaw); }}
                onChange={(e) => setEditing(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(0, 0); } if (e.key === "Escape") { setEditing(null); gridRef.current?.focus(); } }} />
            </div>
            <div id="sheet" ref={gridRef} className={s.gridWrap} tabIndex={0} role="grid" aria-label={`${book.name} sheet. Arrow keys move, Enter edits, Delete clears.`} aria-rowcount={rows} onKeyDown={onGridKey}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.corner} aria-hidden="true" />
                    {book.grid[0].map((h, c) => (
                      <th key={c} scope="col" className={cx(c >= from && c <= to && c !== 0 && c !== TOTAL && s.inRange)}>
                        <span className={s.colLetter}>{colName(c)}</span>{h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {book.grid.slice(1).map((row, ri) => {
                    const r = ri + 1;
                    const slot = book.slots[book.rowIds[ri]];
                    return (
                      <tr key={book.rowIds[ri]}>
                        <th scope="row" className={s.rowNum}>
                          {slot !== undefined && <span className={s.rowDot} style={{ background: palette[slot] }} aria-hidden="true" />}{r + 1}
                        </th>
                        {row.map((raw, c) => {
                          const active = sel[0] === r && sel[1] === c;
                          const v = values[r]?.[c];
                          const isErr = typeof v === "string" && v.startsWith("#");
                          return (
                            <td key={c} role="gridcell" aria-selected={active}
                              className={cx(s.td, c === 0 && s.labelCell, c > 0 && s.numCell, raw.startsWith("=") && s.formula, isErr && s.errCell, active && s.selected)}
                              onMouseDown={() => { if (editing !== null && !active) commit(0, 0); setSel([r, c]); }}
                              onDoubleClick={() => { setEditIn("cell"); setEditing(raw); }}>
                              {active && editing !== null && editIn === "cell" ? (
                                <input autoFocus className={s.cellInput} value={editing} aria-label={`Edit ${colName(c)}${r + 1}`}
                                  onChange={(e) => setEditing(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); commit(1, 0); }
                                    else if (e.key === "Tab") { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
                                    else if (e.key === "Escape") { setEditing(null); gridRef.current?.focus(); }
                                  }}
                                  onBlur={() => editing !== null && commit(0, 0)} />
                              ) : (
                                <span title={raw.startsWith("=") ? raw : undefined}>{v === undefined ? "" : fmt(v)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={s.hint}>Formulas: SUM, AVG, MIN, MAX, COUNT, cell references like B2 and ranges like B2:G2, with + − × ÷.</p>
          </section>

          <footer className={s.foot}>Prepared by Sara Salem. © Sara Salem 2026.</footer>
        </main>
      </div>
    </div>
  );
}

type ChartProps = {
  type: "bar" | "line";
  series: { id: string; r: number; label: string; slot: number }[];
  months: string[];
  cols: number[];
  numAt: (r: number, c: number) => number;
  palette: string[];
};

function Chart({ type, series, months, cols, numAt, palette }: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!series.length) return <div ref={wrap} className={s.chartEmpty}>Select a line in the legend to chart it.</div>;

  const H = 260, m = { t: 16, r: type === "line" ? 104 : 16, b: 28, l: 48 };
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const all = series.flatMap((sr) => cols.map((c) => numAt(sr.r, c)));
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const step = niceStep((max - min) / 4 || 1);
  const yMax = Math.ceil(max / step) * step || step, yMin = Math.floor(min / step) * step;
  const y = (v: number) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const ticks: number[] = []; for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t);
  const band = iw / cols.length;
  const xC = (i: number) => m.l + band * i + band / 2;
  const groupW = Math.min(band * 0.72, series.length * 28);
  const barW = (groupW - (series.length - 1) * 2) / series.length;
  const ordered = [...series].sort((a, b) => a.slot - b.slot);
  const tipX = hover === null ? 0 : xC(hover);

  return (
    <div ref={wrap} className={s.chart}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`${type === "bar" ? "Bar" : "Line"} chart of ${ordered.map((x) => x.label).join(", ")} from ${months[0]} to ${months[months.length - 1]}. Exact values are in the sheet below.`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--rp-border)" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className={s.axis}>{compact(t)}</text>
          </g>
        ))}
        {months.map((mo, i) => <text key={mo} x={xC(i)} y={H - 8} textAnchor="middle" className={s.axis}>{mo}</text>)}
        {hover !== null && (type === "line"
          ? <line x1={tipX} x2={tipX} y1={m.t} y2={m.t + ih} stroke="var(--rp-border-input)" strokeDasharray="3 3" />
          : <rect x={m.l + band * hover} y={m.t} width={band} height={ih} fill="var(--rp-surface)" opacity={0.6} />)}
        {type === "bar"
          ? ordered.map((sr, k) => cols.map((c, i) => {
              const v = numAt(sr.r, c);
              const x = xC(i) - groupW / 2 + k * (barW + 2);
              const y0 = y(0), y1 = y(v), h = Math.abs(y0 - y1), top = Math.min(y0, y1);
              const rr = Math.min(4, barW / 2, h);
              return <path key={`${sr.id}${c}`} d={roundedBar(x, top, barW, h, rr, v >= 0)} fill={palette[sr.slot]} />;
            }))
          : ordered.map((sr) => {
              const pts = cols.map((c, i) => [xC(i), y(numAt(sr.r, c))] as const);
              return (
                <g key={sr.id}>
                  <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={palette[sr.slot]} strokeWidth={2} strokeLinejoin="round" />
                  {pts.map(([px, py], i) => (hover === i || pts.length <= 6) && (
                    <circle key={i} cx={px} cy={py} r={hover === i ? 5 : 4} fill={palette[sr.slot]} stroke="var(--rp-surface-raised)" strokeWidth={2} />
                  ))}
                  <text x={pts[pts.length - 1][0] + 6} y={pts[pts.length - 1][1]} dy="0.32em" className={s.directLabel}>{ordered.length <= 4 ? sr.label : ""}</text>
                </g>
              );
            })}
        {cols.map((_, i) => (
          <rect key={i} x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className={s.tooltip} style={{ left: Math.min(Math.max(tipX, 90), w - 90), top: 8 }} role="status">
          <p className={s.tipTitle}>{months[hover]}</p>
          {ordered.map((sr) => (
            <p key={sr.id} className={s.tipRow}>
              <span className={s.swatch} style={{ background: palette[sr.slot], borderColor: palette[sr.slot] }} />
              <span>{sr.label}</span><strong>{fmt(numAt(sr.r, cols[hover]))}</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`);
function roundedBar(x: number, y: number, w: number, h: number, r: number, up: boolean) {
  if (h <= 0) return "";
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}
