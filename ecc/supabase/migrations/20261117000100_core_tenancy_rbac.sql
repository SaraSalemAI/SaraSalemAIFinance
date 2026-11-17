-- Enterprise Control Console — core tenancy, RBAC and audit
-- Prepared by Sara Salem. Copyright Sara Salem 2026.
-- Every exposed table has RLS enabled. Permissions come from memberships
-- stored in the database, never from user-editable JWT/user metadata.

create extension if not exists pgcrypto;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create type public.app_role as enum (
  'owner','admin','executive','finance_manager','hr_manager',
  'operations_manager','compliance_officer','analyst','member','viewer'
);

-- ---------------------------------------------------------------- tenancy
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  default_locale text not null default 'en' check (default_locale in ('en','ar')),
  is_demo boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  locale text not null default 'en' check (locale in ('en','ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

-- Permission matrix. Mirrored in ecc/lib/rbac.ts; a test checks parity.
insert into public.role_permissions(role, permission)
select r::public.app_role, p from (values
 ('owner','*'),
 ('admin','dashboard.read'),('admin','org.manage'),('admin','users.read'),('admin','users.manage'),
 ('admin','finance.read'),('admin','finance.write'),('admin','hr.read'),('admin','hr.write'),
 ('admin','ops.read'),('admin','ops.write'),('admin','workflow.read'),('admin','workflow.write'),('admin','workflow.act'),
 ('admin','agents.read'),('admin','agents.manage'),('admin','integrations.read'),('admin','integrations.manage'),
 ('admin','governance.read'),('admin','governance.manage'),('admin','risk.read'),('admin','risk.write'),
 ('admin','reports.read'),('admin','reports.manage'),('admin','audit.read'),('admin','documents.read'),('admin','documents.write'),
 ('executive','dashboard.read'),('executive','users.read'),('executive','finance.read'),('executive','finance.approve'),
 ('executive','hr.read'),('executive','hr.approve'),('executive','ops.read'),('executive','workflow.read'),('executive','workflow.act'),
 ('executive','agents.read'),('executive','integrations.read'),('executive','governance.read'),('executive','risk.read'),
 ('executive','reports.read'),('executive','audit.read'),('executive','documents.read'),
 ('finance_manager','dashboard.read'),('finance_manager','finance.read'),('finance_manager','finance.write'),('finance_manager','finance.approve'),
 ('finance_manager','workflow.read'),('finance_manager','workflow.act'),('finance_manager','reports.read'),('finance_manager','documents.read'),('finance_manager','documents.write'),
 ('hr_manager','dashboard.read'),('hr_manager','users.read'),('hr_manager','hr.read'),('hr_manager','hr.write'),('hr_manager','hr.approve'),
 ('hr_manager','workflow.read'),('hr_manager','workflow.act'),('hr_manager','reports.read'),('hr_manager','documents.read'),('hr_manager','documents.write'),
 ('operations_manager','dashboard.read'),('operations_manager','ops.read'),('operations_manager','ops.write'),
 ('operations_manager','workflow.read'),('operations_manager','workflow.act'),('operations_manager','reports.read'),('operations_manager','documents.read'),('operations_manager','documents.write'),
 ('compliance_officer','dashboard.read'),('compliance_officer','governance.read'),('compliance_officer','governance.manage'),
 ('compliance_officer','risk.read'),('compliance_officer','risk.write'),('compliance_officer','audit.read'),
 ('compliance_officer','workflow.read'),('compliance_officer','reports.read'),('compliance_officer','documents.read'),
 ('analyst','dashboard.read'),('analyst','finance.read'),('analyst','hr.read'),('analyst','ops.read'),('analyst','risk.read'),
 ('analyst','governance.read'),('analyst','workflow.read'),('analyst','reports.read'),('analyst','reports.manage'),('analyst','agents.read'),
 ('member','dashboard.read'),('member','workflow.read'),('member','documents.read'),
 ('viewer','dashboard.read')
) as t(r, p);

-- ------------------------------------------------------- authorization core
create or replace function app.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function app.role_of(p_org uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function app.has_permission(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and (rp.permission = p_perm or rp.permission = '*'));
$$;

-- Exposed to the client for UI gating only; the database still enforces.
create or replace function public.my_permissions(p_org uuid)
returns setof text language sql stable security definer set search_path = public as $$
  select distinct x.permission from public.role_permissions x
  where x.permission <> '*' and exists (
    select 1 from public.memberships m join public.role_permissions rp on rp.role = m.role
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and (rp.permission = '*' or rp.permission = x.permission));
$$;

grant execute on function app.is_member(uuid), app.role_of(uuid), app.has_permission(uuid,text) to authenticated;

-- ------------------------------------------------------------- utilities
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function app.lock_org_id() returns trigger language plpgsql as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger organizations_touch before update on public.organizations for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger memberships_lock before update on public.memberships for each row execute function app.lock_org_id();

-- Profile row for every new auth user.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),120))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- Organization creation: the only path; caller becomes owner.
create or replace function public.create_organization(p_name text, p_slug text, p_locale text default 'en')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.organizations(name, slug, default_locale, created_by)
  values (p_name, lower(p_slug), coalesce(p_locale,'en'), auth.uid()) returning id into v_id;
  insert into public.memberships(org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;
revoke all on function public.create_organization(text,text,text) from public;
grant execute on function public.create_organization(text,text,text) to authenticated;

-- Role changes: only users.manage; only an owner may grant/revoke owner; keep >= 1 owner.
create or replace function app.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(new.org_id, old.org_id);
begin
  if auth.uid() is null then return coalesce(new, old); end if; -- service role / migrations
  -- bootstrap: the creator becomes the first owner of an organization with no members
  if tg_op = 'INSERT' and new.user_id = auth.uid()
     and exists (select 1 from public.organizations o where o.id = v_org and o.created_by = auth.uid())
     and not exists (select 1 from public.memberships where org_id = v_org) then
    return new;
  end if;
  if (tg_op <> 'INSERT' and old.role = 'owner') or (tg_op <> 'DELETE' and new.role = 'owner') then
    if app.role_of(v_org) is distinct from 'owner' then
      raise exception 'only an owner can grant or change the owner role' using errcode = '42501';
    end if;
  end if;
  if tg_op in ('UPDATE','DELETE') and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and (select count(*) from public.memberships where org_id = v_org and role = 'owner' and status = 'active') <= 1 then
    raise exception 'an organization must keep at least one active owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger memberships_guard before insert or update or delete on public.memberships
for each row execute function app.guard_membership();

-- Add a member by e-mail (user must already have signed up).
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.app_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not app.has_permission(p_org, 'users.manage') then
    raise exception 'permission denied: users.manage' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then raise exception 'no account with that e-mail' using errcode = 'P0002'; end if;
  insert into public.memberships(org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';
  return v_user;
end $$;
revoke all on function public.add_member_by_email(uuid,text,public.app_role) from public;
grant execute on function public.add_member_by_email(uuid,text,public.app_role) to authenticated;

-- Member directory (profiles + e-mail) restricted to users.read.
create or replace function public.org_members(p_org uuid)
returns table(user_id uuid, email text, full_name text, role public.app_role, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.status, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.org_id = p_org and app.has_permission(p_org, 'users.read')
  order by m.created_at;
$$;
grant execute on function public.org_members(uuid) to authenticated;
grant execute on function public.my_permissions(uuid) to authenticated;

-- ------------------------------------------------------------ audit log
create table public.audit_log (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);
create index audit_org_idx on public.audit_log(org_id, id desc);

create or replace function app.write_audit(p_org uuid, p_action text, p_table text, p_record text, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text; v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('audit:' || p_org::text));
  select hash into v_prev from public.audit_log where org_id = p_org order by id desc limit 1;
  insert into public.audit_log(org_id, actor, action, table_name, record_id, before, after, prev_hash, hash, created_at)
  values (p_org, auth.uid(), p_action, p_table, p_record, p_before, p_after, v_prev,
    encode(digest(coalesce(v_prev,'') || p_org::text || coalesce(auth.uid()::text,'') || p_action || p_table
      || coalesce(p_record,'') || coalesce(p_before::text,'') || coalesce(p_after::text,'') || v_now::text, 'sha256'),'hex'),
    v_now);
end $$;

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id text;
begin
  if tg_table_name = 'organizations' then v_org := coalesce(new.id, old.id);
  else v_org := coalesce(new.org_id, old.org_id); end if;
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'user_id', to_jsonb(old)->>'user_id');
  if tg_op = 'DELETE' and tg_table_name = 'organizations' then return old; end if;
  perform app.write_audit(v_org, lower(tg_op), tg_table_name, v_id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function app.block_audit_mutation() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = old.org_id) then
    return old; -- cascade from organization deletion
  end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
create trigger audit_append_only before update or delete on public.audit_log
for each row execute function app.block_audit_mutation();

create trigger organizations_audit after insert or update on public.organizations for each row execute function app.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function app.audit_row();

-- Chain verification, callable by auditors.
create or replace function public.verify_audit_chain(p_org uuid)
returns table(ok boolean, checked bigint, first_bad_id bigint)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_prev text := null; v_n bigint := 0; v_calc text;
begin
  if not app.has_permission(p_org, 'audit.read') then raise exception 'permission denied: audit.read' using errcode = '42501'; end if;
  for r in select * from public.audit_log where org_id = p_org order by id loop
    v_n := v_n + 1;
    v_calc := encode(digest(coalesce(v_prev,'') || r.org_id::text || coalesce(r.actor::text,'') || r.action || r.table_name
      || coalesce(r.record_id,'') || coalesce(r.before::text,'') || coalesce(r.after::text,'') || r.created_at::text, 'sha256'),'hex');
    if r.prev_hash is distinct from v_prev or r.hash <> v_calc then
      ok := false; checked := v_n; first_bad_id := r.id; return next; return;
    end if;
    v_prev := r.hash;
  end loop;
  ok := true; checked := v_n; first_bad_id := null; return next;
end $$;
grant execute on function public.verify_audit_chain(uuid) to authenticated;

-- ------------------------------------------------------------------ RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;

create policy org_select on public.organizations for select to authenticated using (app.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (app.has_permission(id, 'org.manage')) with check (app.has_permission(id, 'org.manage'));
-- no insert policy (use create_organization); no delete policy (owners delete via support process)

create policy profile_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id));
create policy profile_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy mem_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.has_permission(org_id, 'users.read'));
create policy mem_insert on public.memberships for insert to authenticated with check (app.has_permission(org_id, 'users.manage'));
create policy mem_update on public.memberships for update to authenticated
  using (app.has_permission(org_id, 'users.manage')) with check (app.has_permission(org_id, 'users.manage'));
create policy mem_delete on public.memberships for delete to authenticated using (app.has_permission(org_id, 'users.manage'));

create policy rp_select on public.role_permissions for select to authenticated using (true);

create policy audit_select on public.audit_log for select to authenticated using (app.has_permission(org_id, 'audit.read'));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on public.role_permissions from anon;
grant select on public.role_permissions to authenticated;
