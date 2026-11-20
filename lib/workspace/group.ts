import { consolidate } from "../finance/consolidation";
import { analyze } from "../finance/engine";
import { computeCompany } from "./compute";
import { newCompany, uid } from "./defaults";
import type { Company, Group } from "./types";

/** Consolidates a group from its members' adjusted trial balances (after AJEs and framework bridge entries). */
export function consolidateGroup(companies: Company[], group: Group) {
  const loaded = group.members
    .map((m) => ({ m, c: companies.find((c) => c.id === m.companyId) }))
    .filter((x): x is { m: Group["members"][number]; c: Company } => !!x.c && x.c.rows.length > 0);
  // Balances are added as they are, so every member must report in the parent's currency and for the
  // same current and comparative period; others are left out and listed rather than mixed in.
  const parent = loaded.find((x) => x.c.id === group.parentId)?.c ?? loaded[0]?.c;
  const currencyMismatch = parent ? loaded.filter((x) => x.c.settings.functionalCurrency !== parent.settings.functionalCurrency).map((x) => ({ companyId: x.c.id, currency: x.c.settings.functionalCurrency, expected: parent.settings.functionalCurrency })) : [];
  const periodMismatch = parent
    ? loaded.filter((x) => x.c.period.start !== parent.period.start || x.c.period.end !== parent.period.end).map((x) => ({ companyId: x.c.id, start: x.c.period.start, end: x.c.period.end, expected: { start: parent.period.start, end: parent.period.end } }))
    : [];
  const excluded = new Set([...currencyMismatch, ...periodMismatch].map((x) => x.companyId));
  const members = loaded.filter((x) => !excluded.has(x.c.id));
  const entities = members.map(({ m, c }) => ({
    id: c.id,
    name: c.settings.tradeNameEn || c.id,
    ownership: c.id === group.parentId ? 1 : Math.min(1, Math.max(0, m.ownership)),
    isParent: c.id === group.parentId,
    rows: computeCompany(c).rows,
    intercompanyCodes: c.intercompanyCodes,
  }));
  const result = consolidate(entities);
  return {
    ...result,
    entities,
    analysis: result.rows.length ? analyze(result.rows) : null,
    missing: group.members.filter((m) => !loaded.some((x) => x.m.companyId === m.companyId)).map((m) => m.companyId),
    currencyMismatch,
    periodMismatch,
  };
}

/** A company holding the consolidated trial balance, so every module (statements, ratios, model, board pack) runs on the group. */
export function consolidatedCompany(parent: Company, group: Group, rows: Company["rows"]): Company {
  const c = newCompany(`${group.name} (consolidated)`);
  return {
    ...c,
    id: uid("grp"),
    settings: { ...parent.settings, tradeNameEn: `${group.name} (consolidated)`, tradeNameAr: parent.settings.tradeNameAr ? `${parent.settings.tradeNameAr} (مجمعة)` : "" },
    period: { ...parent.period, status: "DRAFT", lockedAt: null, lockedBy: null, mappingConfirmed: true },
    rows: rows.map((r) => ({ ...r, suggested: false })),
  };
}
