import { describe, expect, it } from "vitest";
import { etaAuthorised } from "@/lib/eta/access";
import { onePerSlot, tbIdentity } from "@/lib/ingest/auto";
import { sampleCompany } from "@/lib/workspace/sampleCompany";

type F = { label: string; category: string; role?: string; month?: string | null; rows: number };
const slot = (f: F) => f;

describe("one file per slot in an automatic import", () => {
  it("holds the smaller of two bank statements instead of letting one replace the other", () => {
    const files: F[] = [
      { label: "bank-a.csv", category: "BANK_STATEMENT", rows: 10 },
      { label: "bank-b.csv", category: "BANK_STATEMENT", rows: 40 },
      { label: "gl.csv", category: "GENERAL_LEDGER", rows: 500 },
    ];
    const r = onePerSlot(files, slot);
    expect(r.kept.map((f) => f.label)).toEqual(["bank-b.csv", "gl.csv"]);
    expect(r.held.map((h) => h.item.label)).toEqual(["bank-a.csv"]);
    expect(r.held[0].reason).toContain("bank-b.csv");
  });

  it("keeps one trial balance per role and one per month", () => {
    const files: F[] = [
      { label: "tb.csv", category: "TRIAL_BALANCE", role: "current", rows: 50 },
      { label: "tb-copy.csv", category: "TRIAL_BALANCE", role: "current", rows: 20 },
      { label: "tb-prior.csv", category: "TRIAL_BALANCE", role: "prior", rows: 50 },
      { label: "jan.csv", category: "TRIAL_BALANCE", role: "monthly", month: "2025-01", rows: 50 },
      { label: "feb.csv", category: "TRIAL_BALANCE", role: "monthly", month: "2025-02", rows: 50 },
    ];
    const r = onePerSlot(files, slot);
    expect(r.kept.map((f) => f.label)).toEqual(["tb.csv", "tb-prior.csv", "jan.csv", "feb.csv"]);
    expect(r.held.map((h) => h.item.label)).toEqual(["tb-copy.csv"]);
    expect(r.held[0].reason).toContain("current-period trial balance");
  });
});

describe("AI mapping identity", () => {
  it("changes when the trial balance is replaced", () => {
    const c = sampleCompany();
    const before = tbIdentity(c);
    const replaced = { ...c, rows: c.rows.map((r) => ({ ...r, sourceDocId: "doc_new" })) };
    expect(tbIdentity(c)).toBe(before);
    expect(tbIdentity(replaced)).not.toBe(before);
  });
});

describe("ETA route access", () => {
  const req = (key?: string) => new Request("http://x/api/eta", { method: "POST", headers: key ? { "x-eta-access-key": key } : {} });
  it("refuses everyone when no access key is configured", () => {
    expect(etaAuthorised(req("anything"), "")).toBe(false);
  });
  it("needs the exact key", () => {
    expect(etaAuthorised(req(), "s3cret")).toBe(false);
    expect(etaAuthorised(req("wrong"), "s3cret")).toBe(false);
    expect(etaAuthorised(req("s3cret"), "s3cret")).toBe(true);
  });
});
