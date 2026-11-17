# Enterprise Control Console (ECC)

Prepared by Sara Salem · © Sara Salem 2026

Multi-tenant enterprise console on **Next.js 16 + React 19 + TypeScript + Tailwind 4** and **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions). Arabic and English with right-to-left layout.

Modules: executive dashboard · organization & users · finance · HR · operations · workflow engine · AI agent console · integration hub · data governance · risk & compliance · reports · documents · notifications · audit log · administration.

Status of every module and how it was verified: [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

## Architecture

- **Authorization lives in the database.** Roles are rows in `memberships`; `role_permissions` maps 10 roles to 28 permissions; every table has RLS calling `app.has_permission(org_id, perm)`. The UI hides what a role cannot use, but the database is the gate.
- **Sensitive actions are database functions or triggers:** organization creation, member management, workflow transitions (`wf_transition`), invoice/leave approvals (four-eyes), agent-run approval, report execution, audit-chain verification.
- **Audit:** triggers write every change to `audit_log`, SHA-256 hash-chained per organization; clients cannot write or alter it.
- **Storage:** private `documents` bucket; object paths start with the organization id, enforced by storage policies.
- **AI:** agents only return text for review. Runs need a second person's approval and execute in the `agent-run` Edge Function with the server-side `ANTHROPIC_API_KEY`; without the key they fail with an explicit message.

```
app/            routes (login, onboarding, /o/[org]/… modules), server actions
components/     UI primitives, resource form, realtime + upload clients
lib/            rbac, resources registry + zod validation, workflow, i18n, Supabase clients
supabase/       migrations, Edge Function, DB test suite
tests/          Vitest unit tests
```

## Connect a Supabase project

```bash
npm install
cp .env.example .env.local      # set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

```bash
npx supabase functions deploy agent-run
```

```bash
npx supabase secrets set ANTHROPIC_API_KEY=<key> ECC_APP_ORIGIN=https://your-app
```

```bash
npm run dev
```

In Supabase Auth, set the Site URL and add `<site>/auth/callback` as a redirect URL.

## Tests

```bash
npm run typecheck && npm test && npm run build
```

Database suite (needs a PostgreSQL 16 server; uses a minimal Supabase shim):

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/test-db.sh
```
