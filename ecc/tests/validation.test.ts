import { describe, expect, it } from "vitest";
import { findResource, schemaFor, MODULES } from "@/lib/resources";
import { definitionSchema, parseTransitions, nextStates } from "@/lib/workflow";

describe("resource validation", () => {
  const inv = schemaFor(findResource("finance", "invoices")!);
  it("accepts a valid invoice and applies defaults", () => {
    const r = inv.parse({ number: "A-1", direction: "payable", counterparty: "X", amount: "12.5", currency: "USD", due_date: "", status: "" });
    expect(r).toMatchObject({ amount: 12.5, due_date: null, status: "draft" });
  });
  it("rejects negative amounts, bad currency and unknown fields", () => {
    expect(inv.safeParse({ number: "A", direction: "payable", counterparty: "X", amount: "-1", currency: "USD" }).success).toBe(false);
    expect(inv.safeParse({ number: "A", direction: "payable", counterparty: "X", amount: "1", currency: "usd" }).success).toBe(false);
    expect(inv.safeParse({ number: "A", direction: "payable", counterparty: "X", amount: "1", currency: "USD", org_id: "x" }).success).toBe(false);
  });
  it("rejects out-of-range risk scores and non-uuid refs", () => {
    const risk = schemaFor(findResource("risk", "register")!);
    expect(risk.safeParse({ title: "t", likelihood: "6", impact: "1" }).success).toBe(false);
    expect(risk.safeParse({ title: "t", likelihood: "2.5", impact: "1" }).success).toBe(false);
    const leave = schemaFor(findResource("hr", "leave")!);
    expect(leave.safeParse({ employee_id: "1; drop table", start_date: "2026-01-01", end_date: "2026-01-02" }).success).toBe(false);
  });
  it("booleans parse from checkbox values", () => {
    const d = schemaFor(findResource("governance", "data-assets")!);
    expect(d.parse({ name: "x", contains_pii: "on" }).contains_pii).toBe(true);
    expect(d.parse({ name: "x", contains_pii: "false" }).contains_pii).toBe(false);
  });
  it("every resource builds a schema", () => {
    for (const m of Object.values(MODULES)) for (const r of m.resources) expect(() => schemaFor(r)).not.toThrow();
  });
});

describe("workflow definitions", () => {
  const t = parseTransitions("draft -> review : workflow.act\nreview -> approved : finance.approve !\nreview -> rejected : finance.approve");
  it("parses the compact transition syntax", () => {
    expect(t[1]).toEqual({ from: "review", to: "approved", permission: "finance.approve", four_eyes: true });
  });
  it("rejects garbage lines", () => expect(() => parseTransitions("draft => x")).toThrow());
  it("rejects undeclared states and duplicate states", () => {
    expect(definitionSchema.safeParse({ name: "x", entity_type: "generic", states: ["draft", "review"], initial_state: "draft", transitions: t }).success).toBe(false);
    expect(definitionSchema.safeParse({ name: "x", entity_type: "generic", states: ["a", "a"], initial_state: "a", transitions: [{ from: "a", to: "a", permission: "workflow.act" }] }).success).toBe(false);
    expect(definitionSchema.safeParse({ name: "x", entity_type: "generic", states: ["draft", "review", "approved", "rejected"], initial_state: "draft", transitions: t }).success).toBe(true);
  });
  it("offers only transitions the role holds", () => {
    expect(nextStates(t, "review", new Set(["workflow.act"]))).toEqual([]);
    expect(nextStates(t, "review", new Set(["finance.approve"]))).toEqual(["approved", "rejected"]);
  });
});
