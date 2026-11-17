-- ECC business modules: Finance, HR, Operations, Workflow, AI Agents,
-- Integrations, Data Governance, Risk & Compliance, Reporting, Notifications.
-- Prepared by Sara Salem. Copyright Sara Salem 2026.

-- ----------------------------------------------------------------- Finance
create table public.fin_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[0-9A-Za-z.-]{1,20}$'),
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.fin_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null check (char_length(number) between 1 and 40),
  direction text not null default 'payable' check (direction in ('payable','receivable')),
  counterparty text not null check (char_length(counterparty) between 1 and 160),
  amount numeric(16,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  due_date date,
  status text not null default 'draft' check (status in ('draft','submitted','approved','paid','void')),
  approved_by uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, direction, number)
);

create table public.fin_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  department text not null check (char_length(department) between 1 and 80),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2]|Q[1-4]|FY)$'),
  amount numeric(16,2) not null check (amount >= 0),
  spent numeric(16,2) not null default 0 check (spent >= 0),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, department, period)
);

-- ---------------------------------------------------------------------- HR
create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_no text not null check (char_length(employee_no) between 1 and 30),
  full_name text not null check (char_length(full_name) between 1 and 120),
  department text check (char_length(department) <= 80),
  title text check (char_length(title) <= 80),
  hire_date date,
  status text not null default 'active' check (status in ('active','on_leave','terminated')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, employee_no)
);

create table public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null default 'annual' check (kind in ('annual','sick','unpaid','other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- -------------------------------------------------------------- Operations
create table public.ops_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 40),
  name text not null check (char_length(name) between 1 and 120),
  location text check (char_length(location) <= 120),
  status text not null default 'operational' check (status in ('operational','maintenance','retired')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, tag)
);

create table public.ops_work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  asset_id uuid references public.ops_assets(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_date date,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Workflow
create table public.wf_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  entity_type text not null check (entity_type in ('fin_invoices','hr_leave_requests','ops_work_orders','risk_register','generic')),
  initial_state text not null,
  states text[] not null check (cardinality(states) between 2 and 30),
  transitions jsonb not null check (jsonb_typeof(transitions) = 'array'),
  is_active boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (initial_state = any(states))
);

create table public.wf_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  definition_id uuid not null references public.wf_definitions(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  entity_id uuid,
  current_state text not null,
  started_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.wf_transitions (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null references public.wf_instances(id) on delete cascade,
  from_state text not null,
  to_state text not null,
  actor uuid not null,
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- Validate definition shape: every transition is {from,to,permission} over declared states.
create or replace function app.validate_wf_definition() returns trigger language plpgsql as $$
declare t jsonb;
begin
  for t in select * from jsonb_array_elements(new.transitions) loop
    if not (t ? 'from' and t ? 'to' and t ? 'permission') then
      raise exception 'each transition needs from, to and permission' using errcode = '23514';
    end if;
    if not (t->>'from' = any(new.states) and t->>'to' = any(new.states)) then
      raise exception 'transition % -> % uses an undeclared state', t->>'from', t->>'to' using errcode = '23514';
    end if;
    if (t->>'permission') !~ '^[a-z]+\.[a-z]+$' then
      raise exception 'invalid permission %', t->>'permission' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger wf_def_validate before insert or update on public.wf_definitions
for each row execute function app.validate_wf_definition();

create or replace function public.wf_start(p_definition uuid, p_title text, p_entity uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.wf_definitions; v_id uuid;
begin
  select * into d from public.wf_definitions where id = p_definition and is_active;
  if d.id is null then raise exception 'workflow definition not found' using errcode = 'P0002'; end if;
  if not app.has_permission(d.org_id, 'workflow.act') then raise exception 'permission denied: workflow.act' using errcode = '42501'; end if;
  insert into public.wf_instances(org_id, definition_id, title, entity_id, current_state)
  values (d.org_id, d.id, p_title, p_entity, d.initial_state) returning id into v_id;
  return v_id;
end $$;

-- The only way to change state: checks the transition exists and the actor holds its permission.
create or replace function public.wf_transition(p_instance uuid, p_to text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare i public.wf_instances; d public.wf_definitions; t jsonb; v_creator uuid;
begin
  select * into i from public.wf_instances where id = p_instance for update;
  if i.id is null then raise exception 'workflow instance not found' using errcode = 'P0002'; end if;
  if not app.is_member(i.org_id) then raise exception 'not a member' using errcode = '42501'; end if;
  select * into d from public.wf_definitions where id = i.definition_id;
  select x into t from jsonb_array_elements(d.transitions) x
   where x->>'from' = i.current_state and x->>'to' = p_to limit 1;
  if t is null then
    raise exception 'transition % -> % is not allowed', i.current_state, p_to using errcode = '23514';
  end if;
  if not app.has_permission(i.org_id, t->>'permission') then
    raise exception 'permission denied: %', t->>'permission' using errcode = '42501';
  end if;
  if coalesce((t->>'four_eyes')::boolean, false) and i.started_by = auth.uid() then
    raise exception 'four-eyes rule: the initiator cannot perform this transition' using errcode = '42501';
  end if;
  insert into public.wf_transitions(org_id, instance_id, from_state, to_state, actor, comment)
  values (i.org_id, i.id, i.current_state, p_to, auth.uid(), p_comment);
  update public.wf_instances set current_state = p_to, updated_at = now() where id = i.id;
  if i.started_by is not null and i.started_by <> auth.uid() then
    insert into public.notifications(org_id, user_id, kind, title, body, link)
    values (i.org_id, i.started_by, 'workflow', 'Workflow updated', i.title || ': ' || i.current_state || ' → ' || p_to,
            '/workflows/' || i.id);
  end if;
  return p_to;
end $$;
grant execute on function public.wf_start(uuid,text,uuid), public.wf_transition(uuid,text,text) to authenticated;

-- --------------------------------------------------------------- AI agents
-- Agents are registered and governed here. Execution happens only through the
-- `agent-run` Edge Function and only when a model provider key is configured.
create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  purpose text not null check (char_length(purpose) between 1 and 500),
  model text not null default 'claude-sonnet-5-5' check (model ~ '^[a-z0-9.-]{3,60}$'),
  system_prompt text check (char_length(system_prompt) <= 8000),
  status text not null default 'disabled' check (status in ('disabled','active')),
  requires_approval boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  input text not null check (char_length(input) between 1 and 8000),
  output text,
  status text not null default 'requested' check (status in ('requested','approved','running','succeeded','failed','rejected')),
  error text,
  requested_by uuid default auth.uid(),
  approved_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ Integrations
create table public.int_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'not_configured' check (status in ('not_configured','pending','connected','error','disabled')),
  -- Non-secret settings only. Secrets live in Supabase Vault / Edge Function secrets.
  config jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, provider),
  check (not (config ?| array['secret','password','api_key','token','client_secret','private_key']))
);

-- --------------------------------------------------------- Data governance
create table public.gov_data_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  system text check (char_length(system) <= 80),
  owner_name text check (char_length(owner_name) <= 120),
  classification text not null default 'internal' check (classification in ('public','internal','confidential','restricted')),
  contains_pii boolean not null default false,
  retention_days int check (retention_days between 1 and 36500),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.gov_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text check (char_length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft','in_review','published','retired')),
  review_date date,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ------------------------------------------------------- Risk & compliance
create table public.risk_register (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'operational' check (category in ('strategic','financial','operational','compliance','technology','people')),
  likelihood int not null check (likelihood between 1 and 5),
  impact int not null check (impact between 1 and 5),
  score int generated always as (likelihood * impact) stored,
  owner_name text check (char_length(owner_name) <= 120),
  status text not null default 'open' check (status in ('open','mitigating','accepted','closed')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.risk_controls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  risk_id uuid references public.risk_register(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  frequency text not null default 'quarterly' check (frequency in ('continuous','monthly','quarterly','annual')),
  last_tested date,
  effectiveness text not null default 'untested' check (effectiveness in ('untested','effective','partially_effective','ineffective')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  framework text not null check (char_length(framework) between 1 and 40),
  reference text not null check (char_length(reference) between 1 and 40),
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'not_assessed' check (status in ('not_assessed','compliant','partial','non_compliant','not_applicable')),
  control_id uuid references public.risk_controls(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, framework, reference)
);

-- --------------------------------------------------------------- Reporting
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source text not null check (source in ('fin_invoices','fin_budgets','hr_employees','hr_leave_requests','ops_work_orders','ops_assets','risk_register','compliance_requirements','gov_data_assets')),
  group_by text not null check (group_by ~ '^[a-z_]{1,40}$'),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Run a saved report: count rows grouped by a whitelisted column. Runs as the
-- caller (security invoker) so the source table's RLS applies.
create or replace function public.run_report(p_report uuid)
returns table(bucket text, total bigint) language plpgsql stable security invoker set search_path = public as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.source and column_name = r.group_by) then
    raise exception 'column % is not on %', r.group_by, r.source using errcode = '23514';
  end if;
  return query execute format(
    'select coalesce(%I::text, ''(none)'') as bucket, count(*)::bigint from public.%I where org_id = $1 group by 1 order by 2 desc',
    r.group_by, r.source) using r.org_id;
end $$;
grant execute on function public.run_report(uuid) to authenticated;

-- ----------------------------------------------------------- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'info' check (kind in ('info','workflow','approval','risk','system')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (char_length(body) <= 2000),
  link text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- -------------------------------------------- Sensitive-action guards
-- Approvals require *.approve, and the approver must not be the creator.
create or replace function app.guard_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_perm text; v_approved text[];
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'fin_invoices' then v_perm := 'finance.approve'; v_approved := array['approved','paid'];
  elsif tg_table_name = 'hr_leave_requests' then v_perm := 'hr.approve'; v_approved := array['approved','rejected'];
  else return new; end if;
  if new.status = any(v_approved) and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not app.has_permission(new.org_id, v_perm) then
      raise exception 'permission denied: %', v_perm using errcode = '42501';
    end if;
    if new.created_by = auth.uid() then
      raise exception 'four-eyes rule: you cannot approve a record you created' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
  elsif tg_op = 'UPDATE' and new.approved_by is distinct from old.approved_by then
    new.approved_by := old.approved_by; -- not client-settable
  elsif tg_op = 'INSERT' then
    new.approved_by := null;
  end if;
  -- an approved invoice is frozen except for paying / voiding it
  if tg_table_name = 'fin_invoices' and tg_op = 'UPDATE' then
    if old.status in ('approved','paid') and (to_jsonb(new) - array['status','approved_by','updated_at','due_date'])
        is distinct from (to_jsonb(old) - array['status','approved_by','updated_at','due_date']) then
      raise exception 'approved invoices cannot be edited' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger fin_invoices_approval before insert or update on public.fin_invoices for each row execute function app.guard_approval();
create trigger hr_leave_approval before insert or update on public.hr_leave_requests for each row execute function app.guard_approval();

-- Agent runs: requester may not approve their own run; only agents.manage approves.
create or replace function app.guard_agent_run() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'requested'; new.output := null; new.error := null; new.approved_by := null; new.requested_by := auth.uid();
    if not exists (select 1 from public.ai_agents a where a.id = new.agent_id and a.org_id = new.org_id and a.status = 'active') then
      raise exception 'agent is not active in this organization' using errcode = '23514';
    end if;
    return new;
  end if;
  -- clients may only approve or reject a requested run; execution results are written by the Edge Function (service role)
  if new.output is distinct from old.output or new.error is distinct from old.error or new.input <> old.input then
    raise exception 'run results are written by the execution service only' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not (old.status = 'requested' and new.status in ('approved','rejected')) then
      raise exception 'invalid run status change % -> %', old.status, new.status using errcode = '23514';
    end if;
    if old.requested_by = auth.uid() then
      raise exception 'four-eyes rule: you cannot approve your own run' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;
create trigger ai_runs_guard before insert or update on public.ai_agent_runs for each row execute function app.guard_agent_run();

-- Cross-table org consistency for foreign keys inside a tenant.
create or replace function app.same_org(p_table regclass, p_id uuid, p_org uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if p_id is null then return true; end if;
  execute format('select exists(select 1 from %s where id = $1 and org_id = $2)', p_table) into v using p_id, p_org;
  return v;
end $$;

alter table public.hr_leave_requests add constraint leave_same_org check (app.same_org('public.hr_employees', employee_id, org_id));
alter table public.ops_work_orders add constraint wo_same_org check (app.same_org('public.ops_assets', asset_id, org_id));
alter table public.wf_instances add constraint wfi_same_org check (app.same_org('public.wf_definitions', definition_id, org_id));
alter table public.ai_agent_runs add constraint run_same_org check (app.same_org('public.ai_agents', agent_id, org_id));
alter table public.risk_controls add constraint ctl_same_org check (app.same_org('public.risk_register', risk_id, org_id));
alter table public.compliance_requirements add constraint req_same_org check (app.same_org('public.risk_controls', control_id, org_id));

-- -------------------------------------------- RLS, triggers, audit (generated)
do $$
declare
  r record;
begin
  for r in select * from (values
    ('fin_accounts','finance.read','finance.write'),
    ('fin_invoices','finance.read','finance.write'),
    ('fin_budgets','finance.read','finance.write'),
    ('hr_employees','hr.read','hr.write'),
    ('hr_leave_requests','hr.read','hr.write'),
    ('ops_assets','ops.read','ops.write'),
    ('ops_work_orders','ops.read','ops.write'),
    ('wf_definitions','workflow.read','workflow.write'),
    ('ai_agents','agents.read','agents.manage'),
    ('int_connections','integrations.read','integrations.manage'),
    ('gov_data_assets','governance.read','governance.manage'),
    ('gov_policies','governance.read','governance.manage'),
    ('risk_register','risk.read','risk.write'),
    ('risk_controls','risk.read','risk.write'),
    ('compliance_requirements','risk.read','risk.write'),
    ('reports','reports.read','reports.manage')
  ) as t(tbl, rd, wr) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (app.has_permission(org_id, %2$L))', r.tbl, r.rd);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.has_permission(org_id, %2$L))', r.tbl, r.wr);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (app.has_permission(org_id, %2$L)) with check (app.has_permission(org_id, %2$L))', r.tbl, r.wr);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (app.has_permission(org_id, %2$L))', r.tbl, r.wr);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function app.touch_updated_at()', r.tbl);
    execute format('create trigger %1$s_lock before update on public.%1$I for each row execute function app.lock_org_id()', r.tbl);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function app.audit_row()', r.tbl);
    execute format('create index %1$s_org_idx on public.%1$I(org_id)', r.tbl);
  end loop;
end $$;

-- Hiding confidential HR fields from read-only roles is handled by RLS on hr.read
-- (only HR, executives, analysts and admins hold it).

-- Workflow instances / transitions: read with workflow.read, writes only via functions.
alter table public.wf_instances enable row level security;
alter table public.wf_transitions enable row level security;
create policy wfi_select on public.wf_instances for select to authenticated using (app.has_permission(org_id, 'workflow.read'));
create policy wft_select on public.wf_transitions for select to authenticated using (app.has_permission(org_id, 'workflow.read'));
revoke insert, update, delete on public.wf_instances, public.wf_transitions from anon, authenticated;
create trigger wf_instances_audit after insert or update on public.wf_instances for each row execute function app.audit_row();

-- Agent runs: read with agents.read; request with agents.read; approve with agents.manage.
alter table public.ai_agent_runs enable row level security;
create policy runs_select on public.ai_agent_runs for select to authenticated using (app.has_permission(org_id, 'agents.read'));
create policy runs_insert on public.ai_agent_runs for insert to authenticated with check (app.has_permission(org_id, 'agents.read'));
create policy runs_update on public.ai_agent_runs for update to authenticated
  using (app.has_permission(org_id, 'agents.manage')) with check (app.has_permission(org_id, 'agents.manage'));
create trigger ai_runs_touch before update on public.ai_agent_runs for each row execute function app.touch_updated_at();
create trigger ai_runs_lock before update on public.ai_agent_runs for each row execute function app.lock_org_id();
create trigger ai_runs_audit after insert or update on public.ai_agent_runs for each row execute function app.audit_row();

-- Notifications: each user sees and marks only their own, within orgs they belong to.
alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid() and app.is_member(org_id));
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;

-- Default privileges for the authenticated role (RLS still applies).
grant select, insert, update, delete on
  public.fin_accounts, public.fin_invoices, public.fin_budgets, public.hr_employees, public.hr_leave_requests,
  public.ops_assets, public.ops_work_orders, public.wf_definitions, public.ai_agents, public.int_connections,
  public.gov_data_assets, public.gov_policies, public.risk_register, public.risk_controls,
  public.compliance_requirements, public.reports
to authenticated;
grant select, insert, update on public.ai_agent_runs to authenticated;
grant select on public.wf_instances, public.wf_transitions, public.audit_log to authenticated;
grant select, update on public.organizations, public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
revoke all on all tables in schema public from anon;

-- --------------------------------------------------- Executive dashboard
create or replace function public.dashboard_kpis(p_org uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'payables_open', (select coalesce(sum(amount),0) from fin_invoices where org_id = p_org and direction = 'payable' and status in ('submitted','approved')),
    'receivables_open', (select coalesce(sum(amount),0) from fin_invoices where org_id = p_org and direction = 'receivable' and status in ('submitted','approved')),
    'invoices_overdue', (select count(*) from fin_invoices where org_id = p_org and status in ('submitted','approved') and due_date < current_date),
    'budget_total', (select coalesce(sum(amount),0) from fin_budgets where org_id = p_org),
    'budget_spent', (select coalesce(sum(spent),0) from fin_budgets where org_id = p_org),
    'headcount', (select count(*) from hr_employees where org_id = p_org and status <> 'terminated'),
    'leave_pending', (select count(*) from hr_leave_requests where org_id = p_org and status = 'pending'),
    'work_orders_open', (select count(*) from ops_work_orders where org_id = p_org and status in ('open','in_progress')),
    'work_orders_critical', (select count(*) from ops_work_orders where org_id = p_org and status in ('open','in_progress') and priority = 'critical'),
    'risks_high', (select count(*) from risk_register where org_id = p_org and status <> 'closed' and score >= 15),
    'compliance_gaps', (select count(*) from compliance_requirements where org_id = p_org and status in ('partial','non_compliant')),
    'workflows_active', (select count(*) from wf_instances where org_id = p_org),
    'agents_active', (select count(*) from ai_agents where org_id = p_org and status = 'active'),
    'integrations_connected', (select count(*) from int_connections where org_id = p_org and status = 'connected')
  );
$$;
grant execute on function public.dashboard_kpis(uuid) to authenticated;
-- Each figure is computed with the caller's RLS: a KPI from a module the caller
-- cannot read evaluates to 0 rather than leaking data.

-- ------------------------------------------------------------- Realtime
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.wf_instances;
  end if;
end $$;
