// Workflow definition validation (mirror of app.validate_wf_definition) and
// transition lookup. Prepared by Sara Salem. Copyright Sara Salem 2026.
import { z } from "zod";

export const transitionSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  permission: z.string().regex(/^[a-z]+\.[a-z]+$/),
  four_eyes: z.boolean().optional(),
});
export type Transition = z.infer<typeof transitionSchema>;

export const definitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    entity_type: z.enum(["fin_invoices", "hr_leave_requests", "ops_work_orders", "risk_register", "generic"]),
    states: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/)).min(2).max(30),
    initial_state: z.string(),
    transitions: z.array(transitionSchema).min(1).max(100),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.states).size !== d.states.length) ctx.addIssue({ code: "custom", message: "states must be unique" });
    if (!d.states.includes(d.initial_state)) ctx.addIssue({ code: "custom", message: "initial state must be one of the states" });
    d.transitions.forEach((t, i) => {
      if (!d.states.includes(t.from) || !d.states.includes(t.to))
        ctx.addIssue({ code: "custom", path: ["transitions", i], message: `${t.from} → ${t.to} uses an undeclared state` });
    });
  });

/** Parse the compact text form "from -> to : permission [!]" (one per line; "!" = four-eyes). */
export function parseTransitions(text: string): Transition[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-z0-9_]+)\s*->\s*([a-z0-9_]+)\s*:\s*([a-z]+\.[a-z]+)\s*(!)?$/);
      if (!m) throw new Error(`Cannot read transition line: "${line}"`);
      return { from: m[1], to: m[2], permission: m[3], ...(m[4] ? { four_eyes: true } : {}) };
    });
}

export function nextStates(transitions: Transition[], current: string, perms: ReadonlySet<string>) {
  return transitions.filter((t) => t.from === current && perms.has(t.permission)).map((t) => t.to);
}
