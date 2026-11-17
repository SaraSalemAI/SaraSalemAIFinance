-- RLS, tenant isolation, RBAC, workflow and audit tests.
-- Run with scripts/test-db.sh. Any failure raises and stops the script.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t;
grant usage on schema t to authenticated, anon;
create table t.results(name text, ok boolean);
grant insert on t.results to authenticated, anon;

create or replace function t.become(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text,''), false);
  execute 'set role authenticated';
end $$;
create or replace function t.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;
grant execute on function t.become(uuid), t.reset() to authenticated;

-- expect a statement to fail with a given SQLSTATE
create or replace function t.throws(p_name text, p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_code or p_code = 'any' then insert into t.results values (p_name, true); return; end if;
    raise exception 'FAIL %: expected %, got % (%)', p_name, p_code, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: expected error %, statement succeeded', p_name, p_code;
end $$;
create or replace function t.eq(p_name text, p_got bigint, p_want bigint) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_name, p_got, p_want; end if;
  insert into t.results values (p_name, true);
end $$;
grant execute on function t.throws(text,text,text), t.eq(text,bigint,bigint) to authenticated, anon;

-- fixtures (as superuser)
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-0000000000a1','owner.a@example.test'),
 ('00000000-0000-0000-0000-0000000000a2','fin.a@example.test'),
 ('00000000-0000-0000-0000-0000000000a3','viewer.a@example.test'),
 ('00000000-0000-0000-0000-0000000000a4','exec.a@example.test'),
 ('00000000-0000-0000-0000-0000000000b1','owner.b@example.test');

select t.become('00000000-0000-0000-0000-0000000000a1');
select set_config('t.org_a', public.create_organization('Org A','org-a')::text, false);
select public.add_member_by_email(current_setting('t.org_a')::uuid, 'fin.a@example.test', 'finance_manager');
select public.add_member_by_email(current_setting('t.org_a')::uuid, 'viewer.a@example.test', 'viewer');
select public.add_member_by_email(current_setting('t.org_a')::uuid, 'exec.a@example.test', 'executive');
select t.reset();

select t.become('00000000-0000-0000-0000-0000000000b1');
select set_config('t.org_b', public.create_organization('Org B','org-b')::text, false);
insert into public.fin_invoices(org_id, number, counterparty, amount) values (current_setting('t.org_b')::uuid, 'B-1', 'Supplier B', 10);
select t.reset();

-- 1. Tenant isolation
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.eq('owner A sees only own org', (select count(*) from public.organizations), 1);
select t.eq('owner A cannot read org B invoices', (select count(*) from public.fin_invoices), 0);
select t.throws('owner A cannot insert into org B',
  format('insert into public.fin_invoices(org_id, number, counterparty, amount) values (%L, ''X'', ''Y'', 1)', current_setting('t.org_b')), '42501');
update public.fin_invoices set amount = 999 where org_id = current_setting('t.org_b')::uuid;
select t.reset();
select t.eq('org B invoice untouched', (select amount::bigint from public.fin_invoices where number = 'B-1'), 10);

-- 2. No direct org creation, no self-escalation
select t.become('00000000-0000-0000-0000-0000000000a3');
select t.throws('direct org insert denied', 'insert into public.organizations(name, slug) values (''Hack'',''hack-org'')', '42501');
update public.memberships set role = 'owner' where user_id = auth.uid();  -- RLS: silently affects 0 rows
select t.reset();
select t.eq('viewer still viewer', (select count(*) from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a3' and role = 'viewer'), 1);

-- 3. RBAC: viewer cannot read finance; finance manager can write
select t.become('00000000-0000-0000-0000-0000000000a3');
select t.throws('viewer cannot write finance',
  format('insert into public.fin_invoices(org_id, number, counterparty, amount) values (%L, ''V-1'', ''X'', 1)', current_setting('t.org_a')), '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a2');
insert into public.fin_invoices(org_id, number, counterparty, amount, status)
  values (current_setting('t.org_a')::uuid, 'A-1', 'Supplier A', 500, 'submitted');
select t.eq('finance manager sees invoice', (select count(*) from public.fin_invoices), 1);
-- 4. Four-eyes: creator cannot approve own invoice
select t.throws('creator cannot approve own invoice',
  'update public.fin_invoices set status = ''approved'' where number = ''A-1''', '42501');
select t.throws('cannot insert pre-approved invoice',
  format('insert into public.fin_invoices(org_id, number, counterparty, amount, status) values (%L, ''A-2'', ''X'', 1, ''approved'')', current_setting('t.org_a')), '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a4');
update public.fin_invoices set counterparty = 'changed by exec' where number = 'A-1';
select t.reset();
select t.eq('executive (no finance.write) update is a no-op', (select count(*) from public.fin_invoices where counterparty = 'changed by exec'), 0);
select t.become('00000000-0000-0000-0000-0000000000a1');
update public.fin_invoices set status = 'approved', approved_by = '00000000-0000-0000-0000-0000000000a3' where number = 'A-1';
select t.reset();
select t.eq('owner approved, approved_by forced to actor',
  (select count(*) from public.fin_invoices where number = 'A-1' and status = 'approved' and approved_by = '00000000-0000-0000-0000-0000000000a1'), 1);
select t.become('00000000-0000-0000-0000-0000000000a2');
select t.throws('approved invoice amount frozen', 'update public.fin_invoices set amount = 1 where number = ''A-1''', '42501');
insert into public.fin_budgets(org_id, department, period, amount) values (current_setting('t.org_a')::uuid, 'Ops', '2026-Q4', 100);
select t.throws('org_id immutable',
  format('update public.fin_budgets set org_id = %L', current_setting('t.org_b')), '42501');
select t.reset();

-- 5. Workflow engine
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.throws('definition with undeclared state rejected',
  format($q$insert into public.wf_definitions(org_id, name, entity_type, initial_state, states, transitions)
    values (%L, 'Bad', 'generic', 'a', array['a','b'], '[{"from":"a","to":"z","permission":"workflow.act"}]')$q$, current_setting('t.org_a')), '23514');
insert into public.wf_definitions(org_id, name, entity_type, initial_state, states, transitions)
values (current_setting('t.org_a')::uuid, 'Invoice approval', 'fin_invoices', 'draft',
  array['draft','review','approved','rejected'],
  '[{"from":"draft","to":"review","permission":"workflow.act"},
    {"from":"review","to":"approved","permission":"finance.approve","four_eyes":true},
    {"from":"review","to":"rejected","permission":"finance.approve"}]');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a2');
select set_config('t.wf', public.wf_start((select id from public.wf_definitions limit 1), 'Approve A-1')::text, false);
select t.throws('direct state update blocked',
  format('update public.wf_instances set current_state = ''approved'' where id = %L', current_setting('t.wf')), '42501');
select t.throws('illegal transition rejected', format('select public.wf_transition(%L, ''approved'')', current_setting('t.wf')), '23514');
select public.wf_transition(current_setting('t.wf')::uuid, 'review', 'please review');
select t.throws('initiator blocked by four-eyes', format('select public.wf_transition(%L, ''approved'')', current_setting('t.wf')), '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a3');
select t.throws('viewer lacks finance.approve', format('select public.wf_transition(%L, ''approved'')', current_setting('t.wf')), '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a4');
select public.wf_transition(current_setting('t.wf')::uuid, 'approved', 'ok');
select t.reset();
select t.eq('workflow approved with 2 transitions',
  (select count(*) from public.wf_transitions where instance_id = current_setting('t.wf')::uuid), 2);
select t.eq('initiator notified', (select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a2'), 1);

-- 6. Notifications are private
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.eq('owner cannot see finance manager notifications', (select count(*) from public.notifications), 0);
select t.throws('clients cannot create notifications',
  format('insert into public.notifications(org_id, user_id, title) values (%L, auth.uid(), ''x'')', current_setting('t.org_a')), '42501');
select t.reset();

-- 7. Audit log: written by triggers, append-only, chain verifies, org-scoped
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.eq('audit rows exist for org A', (select count(*) > 5 from public.audit_log)::int, 1);
select t.eq('audit is org-scoped', (select count(*) from public.audit_log where org_id = current_setting('t.org_b')::uuid), 0);
select t.throws('audit update denied', 'update public.audit_log set action = ''x''', '42501');
select t.throws('audit delete denied', 'delete from public.audit_log', '42501');
select t.throws('audit insert denied',
  format('insert into public.audit_log(org_id, action, table_name, hash) values (%L,''x'',''y'',''z'')', current_setting('t.org_a')), '42501');
select t.eq('audit chain verifies', (select ok::int from public.verify_audit_chain(current_setting('t.org_a')::uuid)), 1);
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a3');
select t.throws('viewer cannot verify audit', format('select * from public.verify_audit_chain(%L)', current_setting('t.org_a')), '42501');
select t.reset();
-- tamper as superuser (trigger disabled) and confirm detection
alter table public.audit_log disable trigger audit_append_only;
update public.audit_log set action = 'tampered' where id = (select min(id) + 2 from public.audit_log where org_id = current_setting('t.org_a')::uuid);
alter table public.audit_log enable trigger audit_append_only;
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.eq('tampering detected', (select (not ok)::int from public.verify_audit_chain(current_setting('t.org_a')::uuid)), 1);
select t.reset();

-- 8. Owner protection
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.throws('last owner cannot be demoted',
  format('update public.memberships set role = ''admin'' where org_id = %L and user_id = auth.uid()', current_setting('t.org_a')), '23514');
select t.reset();

-- 9. Agents: inactive agent cannot run; requester cannot approve own run; results not client-writable
select t.become('00000000-0000-0000-0000-0000000000a1');
insert into public.ai_agents(org_id, name, purpose) values (current_setting('t.org_a')::uuid, 'Close assistant', 'Summarise month-end variances');
select t.throws('disabled agent cannot be run',
  format('insert into public.ai_agent_runs(org_id, agent_id, input) values (%L, (select id from public.ai_agents limit 1), ''hi'')', current_setting('t.org_a')), '23514');
update public.ai_agents set status = 'active';
insert into public.ai_agent_runs(org_id, agent_id, input, status, output) values (current_setting('t.org_a')::uuid, (select id from public.ai_agents limit 1), 'hi', 'succeeded', 'fake');
select t.eq('client cannot fake a result', (select count(*) from public.ai_agent_runs where status = 'requested' and output is null), 1);
select t.throws('requester cannot approve own run', 'update public.ai_agent_runs set status = ''approved''', '42501');
select t.throws('client cannot write output', 'update public.ai_agent_runs set output = ''x''', '42501');
select t.reset();

-- 10. Integrations: secrets cannot be stored in config
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.throws('secret in config rejected',
  format($q$insert into public.int_connections(org_id, provider, display_name, config) values (%L, 'slack', 'Slack', '{"api_key":"x"}')$q$, current_setting('t.org_a')), '23514');
select t.reset();

-- 11. Storage: path must be own org
select t.become('00000000-0000-0000-0000-0000000000a2');
insert into storage.objects(bucket_id, name) values ('documents', current_setting('t.org_a') || '/finance/a.pdf');
select t.throws('cannot upload into org B prefix',
  format('insert into storage.objects(bucket_id, name) values (''documents'', %L)', current_setting('t.org_b') || '/x.pdf'), '42501');
select t.throws('cannot upload without org prefix', 'insert into storage.objects(bucket_id, name) values (''documents'', ''loose.pdf'')', '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000b1');
select t.eq('org B owner cannot list org A documents', (select count(*) from storage.objects), 0);
select t.reset();

-- 12. Reports run under caller RLS; dashboard respects RLS
select t.become('00000000-0000-0000-0000-0000000000a2');
select t.throws('finance manager cannot create reports (no reports.manage)',
  format($q$insert into public.reports(org_id, name, source, group_by) values (%L, 'x', 'fin_invoices', 'status')$q$, current_setting('t.org_a')), '42501');
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a1');
insert into public.reports(org_id, name, source, group_by) values (current_setting('t.org_a')::uuid, 'Invoices by status', 'fin_invoices', 'status');
select t.eq('report runs', (select count(*) from public.run_report((select id from public.reports limit 1))), 1);
select t.throws('report on bad column rejected',
  format($q$select * from public.run_report((select id from public.reports limit 1)) where false; update public.reports set group_by = 'nope'; select * from public.run_report((select id from public.reports limit 1))$q$), '23514');
select t.eq('dashboard counts payables', (select (public.dashboard_kpis(current_setting('t.org_a')::uuid)->>'payables_open')::numeric::bigint), 500);
select t.reset();
select t.become('00000000-0000-0000-0000-0000000000a3');
select t.eq('viewer dashboard hides finance', (select (public.dashboard_kpis(current_setting('t.org_a')::uuid)->>'payables_open')::numeric::bigint), 0);
select t.reset();

-- 13. anon has nothing
set role anon;
select t.throws('anon cannot read organizations', 'select * from public.organizations', '42501');
reset role;

select count(*) as passed from t.results;

-- 14. Demo data only into demo orgs
select t.become('00000000-0000-0000-0000-0000000000a1');
select t.throws('demo data refused for real org', format('select public.load_demo_data(%L)', current_setting('t.org_a')), '42501');
select set_config('t.demo', public.create_demo_organization('Demo Co','demo-co')::text, false);
select t.eq('demo org seeded', (select count(*) from public.fin_invoices where org_id = current_setting('t.demo')::uuid), 4);
select t.eq('demo audit chain verifies', (select ok::int from public.verify_audit_chain(current_setting('t.demo')::uuid)), 1);
select t.reset();
select count(*) as passed_total from t.results;
