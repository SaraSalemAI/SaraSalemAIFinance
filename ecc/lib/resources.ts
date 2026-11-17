// Declarative registry of CRUD resources per module. Drives forms, tables,
// validation and permission gating. The database enforces the same rules.
// Prepared by Sara Salem. Copyright Sara Salem 2026.
import { z } from "zod";
import type { L } from "./i18n";
import type { Permission } from "./rbac";

export type Field =
  | { name: string; label: L; type: "text" | "textarea"; required?: boolean; max?: number; pattern?: string }
  | { name: string; label: L; type: "number"; required?: boolean; min?: number; max?: number; int?: boolean }
  | { name: string; label: L; type: "date"; required?: boolean }
  | { name: string; label: L; type: "boolean" }
  | { name: string; label: L; type: "select"; options: readonly string[]; required?: boolean; default?: string }
  | { name: string; label: L; type: "ref"; table: string; display: string; required?: boolean };

export type Resource = {
  key: string;
  table: string;
  title: L;
  read: Permission;
  write: Permission;
  fields: Field[];
  list: string[];
  order: string;
};

const f = (en: string, ar: string): L => ({ en, ar });
const STATUS = f("Status", "الحالة");

export const MODULES: Record<string, { title: L; resources: Resource[] }> = {
  finance: {
    title: f("Finance", "المالية"),
    resources: [
      { key: "invoices", table: "fin_invoices", title: f("Invoices", "الفواتير"), read: "finance.read", write: "finance.write", order: "created_at",
        list: ["number", "direction", "counterparty", "amount", "currency", "due_date", "status"],
        fields: [
          { name: "number", label: f("Number", "الرقم"), type: "text", required: true, max: 40 },
          { name: "direction", label: f("Type", "النوع"), type: "select", options: ["payable", "receivable"], required: true },
          { name: "counterparty", label: f("Counterparty", "الطرف المقابل"), type: "text", required: true, max: 160 },
          { name: "amount", label: f("Amount", "المبلغ"), type: "number", required: true, min: 0 },
          { name: "currency", label: f("Currency", "العملة"), type: "text", required: true, pattern: "^[A-Z]{3}$" },
          { name: "due_date", label: f("Due date", "تاريخ الاستحقاق"), type: "date" },
          { name: "status", label: STATUS, type: "select", options: ["draft", "submitted", "approved", "paid", "void"], default: "draft" },
        ] },
      { key: "budgets", table: "fin_budgets", title: f("Budgets", "الموازنات"), read: "finance.read", write: "finance.write", order: "period",
        list: ["department", "period", "amount", "spent"],
        fields: [
          { name: "department", label: f("Department", "الإدارة"), type: "text", required: true, max: 80 },
          { name: "period", label: f("Period (2026-Q4, 2026-03, 2026-FY)", "الفترة"), type: "text", required: true, pattern: "^[0-9]{4}-(0[1-9]|1[0-2]|Q[1-4]|FY)$" },
          { name: "amount", label: f("Budget", "الموازنة"), type: "number", required: true, min: 0 },
          { name: "spent", label: f("Spent", "المصروف"), type: "number", min: 0 },
        ] },
      { key: "accounts", table: "fin_accounts", title: f("Chart of accounts", "دليل الحسابات"), read: "finance.read", write: "finance.write", order: "code",
        list: ["code", "name", "type"],
        fields: [
          { name: "code", label: f("Code", "الرمز"), type: "text", required: true, pattern: "^[0-9A-Za-z.-]{1,20}$" },
          { name: "name", label: f("Name", "الاسم"), type: "text", required: true, max: 120 },
          { name: "type", label: f("Type", "النوع"), type: "select", options: ["asset", "liability", "equity", "revenue", "expense"], required: true },
        ] },
    ],
  },
  hr: {
    title: f("Human resources", "الموارد البشرية"),
    resources: [
      { key: "employees", table: "hr_employees", title: f("Employees", "الموظفون"), read: "hr.read", write: "hr.write", order: "employee_no",
        list: ["employee_no", "full_name", "department", "title", "status"],
        fields: [
          { name: "employee_no", label: f("Employee no.", "الرقم الوظيفي"), type: "text", required: true, max: 30 },
          { name: "full_name", label: f("Full name", "الاسم الكامل"), type: "text", required: true, max: 120 },
          { name: "department", label: f("Department", "الإدارة"), type: "text", max: 80 },
          { name: "title", label: f("Job title", "المسمى الوظيفي"), type: "text", max: 80 },
          { name: "hire_date", label: f("Hire date", "تاريخ التعيين"), type: "date" },
          { name: "status", label: STATUS, type: "select", options: ["active", "on_leave", "terminated"], default: "active" },
        ] },
      { key: "leave", table: "hr_leave_requests", title: f("Leave requests", "طلبات الإجازة"), read: "hr.read", write: "hr.write", order: "start_date",
        list: ["employee_id", "kind", "start_date", "end_date", "status"],
        fields: [
          { name: "employee_id", label: f("Employee", "الموظف"), type: "ref", table: "hr_employees", display: "full_name", required: true },
          { name: "kind", label: f("Type", "النوع"), type: "select", options: ["annual", "sick", "unpaid", "other"], default: "annual" },
          { name: "start_date", label: f("From", "من"), type: "date", required: true },
          { name: "end_date", label: f("To", "إلى"), type: "date", required: true },
          { name: "status", label: STATUS, type: "select", options: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
        ] },
    ],
  },
  operations: {
    title: f("Operations", "العمليات"),
    resources: [
      { key: "work-orders", table: "ops_work_orders", title: f("Work orders", "أوامر العمل"), read: "ops.read", write: "ops.write", order: "due_date",
        list: ["title", "asset_id", "priority", "status", "due_date"],
        fields: [
          { name: "title", label: f("Title", "العنوان"), type: "text", required: true, max: 160 },
          { name: "asset_id", label: f("Asset", "الأصل"), type: "ref", table: "ops_assets", display: "name" },
          { name: "priority", label: f("Priority", "الأولوية"), type: "select", options: ["low", "medium", "high", "critical"], default: "medium" },
          { name: "status", label: STATUS, type: "select", options: ["open", "in_progress", "done", "cancelled"], default: "open" },
          { name: "due_date", label: f("Due date", "تاريخ الاستحقاق"), type: "date" },
        ] },
      { key: "assets", table: "ops_assets", title: f("Assets", "الأصول"), read: "ops.read", write: "ops.write", order: "tag",
        list: ["tag", "name", "location", "status"],
        fields: [
          { name: "tag", label: f("Tag", "الوسم"), type: "text", required: true, max: 40 },
          { name: "name", label: f("Name", "الاسم"), type: "text", required: true, max: 120 },
          { name: "location", label: f("Location", "الموقع"), type: "text", max: 120 },
          { name: "status", label: STATUS, type: "select", options: ["operational", "maintenance", "retired"], default: "operational" },
        ] },
    ],
  },
  governance: {
    title: f("Data governance", "حوكمة البيانات"),
    resources: [
      { key: "data-assets", table: "gov_data_assets", title: f("Data catalogue", "فهرس البيانات"), read: "governance.read", write: "governance.manage", order: "name",
        list: ["name", "system", "owner_name", "classification", "contains_pii", "retention_days"],
        fields: [
          { name: "name", label: f("Dataset", "مجموعة البيانات"), type: "text", required: true, max: 120 },
          { name: "system", label: f("System", "النظام"), type: "text", max: 80 },
          { name: "owner_name", label: f("Data owner", "مالك البيانات"), type: "text", max: 120 },
          { name: "classification", label: f("Classification", "التصنيف"), type: "select", options: ["public", "internal", "confidential", "restricted"], default: "internal" },
          { name: "contains_pii", label: f("Contains personal data", "يحتوي بيانات شخصية"), type: "boolean" },
          { name: "retention_days", label: f("Retention (days)", "مدة الاحتفاظ (أيام)"), type: "number", min: 1, max: 36500, int: true },
        ] },
      { key: "policies", table: "gov_policies", title: f("Policies", "السياسات"), read: "governance.read", write: "governance.manage", order: "title",
        list: ["title", "status", "review_date"],
        fields: [
          { name: "title", label: f("Title", "العنوان"), type: "text", required: true, max: 160 },
          { name: "body", label: f("Policy text", "نص السياسة"), type: "textarea", max: 20000 },
          { name: "status", label: STATUS, type: "select", options: ["draft", "in_review", "published", "retired"], default: "draft" },
          { name: "review_date", label: f("Next review", "المراجعة القادمة"), type: "date" },
        ] },
    ],
  },
  risk: {
    title: f("Risk & compliance", "المخاطر والامتثال"),
    resources: [
      { key: "register", table: "risk_register", title: f("Risk register", "سجل المخاطر"), read: "risk.read", write: "risk.write", order: "score",
        list: ["title", "category", "likelihood", "impact", "score", "owner_name", "status"],
        fields: [
          { name: "title", label: f("Risk", "الخطر"), type: "text", required: true, max: 160 },
          { name: "category", label: f("Category", "الفئة"), type: "select", options: ["strategic", "financial", "operational", "compliance", "technology", "people"], default: "operational" },
          { name: "likelihood", label: f("Likelihood (1–5)", "الاحتمالية (1–5)"), type: "number", required: true, min: 1, max: 5, int: true },
          { name: "impact", label: f("Impact (1–5)", "الأثر (1–5)"), type: "number", required: true, min: 1, max: 5, int: true },
          { name: "owner_name", label: f("Owner", "المالك"), type: "text", max: 120 },
          { name: "status", label: STATUS, type: "select", options: ["open", "mitigating", "accepted", "closed"], default: "open" },
        ] },
      { key: "controls", table: "risk_controls", title: f("Controls", "الضوابط"), read: "risk.read", write: "risk.write", order: "title",
        list: ["title", "risk_id", "frequency", "last_tested", "effectiveness"],
        fields: [
          { name: "title", label: f("Control", "الضابط"), type: "text", required: true, max: 160 },
          { name: "risk_id", label: f("Mitigates risk", "يخفف الخطر"), type: "ref", table: "risk_register", display: "title" },
          { name: "frequency", label: f("Frequency", "التكرار"), type: "select", options: ["continuous", "monthly", "quarterly", "annual"], default: "quarterly" },
          { name: "last_tested", label: f("Last tested", "آخر اختبار"), type: "date" },
          { name: "effectiveness", label: f("Effectiveness", "الفعالية"), type: "select", options: ["untested", "effective", "partially_effective", "ineffective"], default: "untested" },
        ] },
      { key: "requirements", table: "compliance_requirements", title: f("Compliance requirements", "متطلبات الامتثال"), read: "risk.read", write: "risk.write", order: "framework",
        list: ["framework", "reference", "title", "status", "control_id"],
        fields: [
          { name: "framework", label: f("Framework", "الإطار"), type: "text", required: true, max: 40 },
          { name: "reference", label: f("Reference", "المرجع"), type: "text", required: true, max: 40 },
          { name: "title", label: f("Requirement", "المتطلب"), type: "text", required: true, max: 200 },
          { name: "status", label: STATUS, type: "select", options: ["not_assessed", "compliant", "partial", "non_compliant", "not_applicable"], default: "not_assessed" },
          { name: "control_id", label: f("Control", "الضابط"), type: "ref", table: "risk_controls", display: "title" },
        ] },
    ],
  },
};

export function findResource(module: string, key: string): Resource | undefined {
  return MODULES[module]?.resources.find((r) => r.key === key);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build a zod schema from resource fields; parses FormData-like string records. */
export function schemaFor(r: Resource) {
  const shape: Record<string, z.ZodType> = {};
  for (const fd of r.fields) {
    let s: z.ZodType;
    const opt = !("required" in fd && fd.required);
    const blank = (v: unknown) => (v === "" || v === undefined ? null : v);
    switch (fd.type) {
      case "text":
      case "textarea": {
        let t = z.string().trim().max(fd.max ?? 2000);
        if (fd.pattern) t = t.regex(new RegExp(fd.pattern));
        s = opt ? z.preprocess(blank, t.nullable()) : t.min(1);
        break;
      }
      case "number": {
        let n = z.coerce.number().finite();
        if (fd.int) n = n.int();
        if (fd.min !== undefined) n = n.min(fd.min);
        if (fd.max !== undefined) n = n.max(fd.max);
        s = opt ? z.preprocess(blank, n.nullable()) : n;
        break;
      }
      case "date": {
        const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
        s = opt ? z.preprocess(blank, d.nullable()) : d;
        break;
      }
      case "boolean":
        s = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
        break;
      case "select": {
        const e = z.enum(fd.options as [string, ...string[]]);
        s = opt ? z.preprocess((v) => (blank(v) ?? fd.default ?? null), fd.default ? e : e.nullable()) : e;
        break;
      }
      case "ref": {
        const u = z.string().regex(UUID);
        s = opt ? z.preprocess(blank, u.nullable()) : u;
        break;
      }
    }
    shape[fd.name] = s;
  }
  return z.object(shape).strict();
}
