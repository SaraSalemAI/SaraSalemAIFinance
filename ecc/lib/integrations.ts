// Integration catalogue. "implemented: false" means no connector code exists in
// this release; the UI shows it as Unavailable and nothing is exchanged.
// Prepared by Sara Salem. Copyright Sara Salem 2026.
export type Connector = { provider: string; name: string; category: string; implemented: boolean; note: string };
export const CATALOG: Connector[] = [
  { provider: "supabase_storage", name: "Supabase Storage", category: "Documents", implemented: true, note: "Built in: private, org-scoped documents bucket." },
  { provider: "anthropic", name: "Anthropic Claude API", category: "AI", implemented: true, note: "Used by the agent-run Edge Function when ANTHROPIC_API_KEY is set as a function secret." },
  { provider: "smtp_email", name: "E-mail (Supabase Auth SMTP)", category: "Messaging", implemented: true, note: "Auth e-mails use the SMTP settings of the Supabase project." },
  { provider: "sap", name: "SAP S/4HANA", category: "ERP", implemented: false, note: "Not implemented." },
  { provider: "oracle_netsuite", name: "Oracle NetSuite", category: "ERP", implemented: false, note: "Not implemented." },
  { provider: "quickbooks", name: "QuickBooks Online", category: "Accounting", implemented: false, note: "Not implemented." },
  { provider: "workday", name: "Workday", category: "HRIS", implemented: false, note: "Not implemented." },
  { provider: "microsoft_entra", name: "Microsoft Entra ID (SSO)", category: "Identity", implemented: false, note: "Configure SAML/SSO in Supabase Auth; not wired in this release." },
  { provider: "slack", name: "Slack", category: "Messaging", implemented: false, note: "Not implemented." },
  { provider: "servicenow", name: "ServiceNow", category: "ITSM", implemented: false, note: "Not implemented." },
];
export const connector = (p: string) => CATALOG.find((c) => c.provider === p);
