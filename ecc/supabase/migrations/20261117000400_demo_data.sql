-- Controlled synthetic demo data. Loads only into organizations flagged is_demo,
-- and the app only exposes it when ECC_DEMO_MODE=true.
-- All names, numbers and records below are fictional.
-- Prepared by Sara Salem. Copyright Sara Salem 2026.

create or replace function public.create_demo_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.create_organization(p_name, p_slug, 'en');
  update public.organizations set is_demo = true where id = v_id;
  perform public.load_demo_data(v_id);
  return v_id;
end $$;
revoke all on function public.create_demo_organization(text,text) from public;
grant execute on function public.create_demo_organization(text,text) to authenticated;

create or replace function public.load_demo_data(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_emp uuid; v_risk uuid; v_ctl uuid;
begin
  if not app.has_permission(p_org, 'org.manage') then raise exception 'permission denied: org.manage' using errcode = '42501'; end if;
  if not (select is_demo from public.organizations where id = p_org) then
    raise exception 'demo data can only be loaded into a demo organization' using errcode = '42501';
  end if;
  if exists (select 1 from public.fin_invoices where org_id = p_org) then return; end if;

  insert into public.fin_accounts(org_id, code, name, type) values
    (p_org,'1000','Cash at bank','asset'),(p_org,'1200','Accounts receivable','asset'),
    (p_org,'2000','Accounts payable','liability'),(p_org,'4000','Service revenue','revenue'),(p_org,'6000','Operating expenses','expense');
  insert into public.fin_invoices(org_id, number, direction, counterparty, amount, currency, due_date, status) values
    (p_org,'AP-1001','payable','[Demo] Northwind Supplies',12500,'USD',current_date + 14,'submitted'),
    (p_org,'AP-1002','payable','[Demo] Contoso Logistics',4300,'USD',current_date - 5,'submitted'),
    (p_org,'AR-2001','receivable','[Demo] Fabrikam Retail',28750,'USD',current_date + 30,'submitted'),
    (p_org,'AR-2002','receivable','[Demo] Tailspin Travel',9900,'USD',current_date - 12,'draft');
  insert into public.fin_budgets(org_id, department, period, amount, spent) values
    (p_org,'Operations','2026-Q4',150000,96000),(p_org,'People','2026-Q4',80000,41000),(p_org,'Technology','2026-Q4',120000,118500);
  insert into public.hr_employees(org_id, employee_no, full_name, department, title, hire_date) values
    (p_org,'E-001','[Demo] Layla Hassan','Finance','Controller','2022-03-01'),
    (p_org,'E-002','[Demo] Omar Fathy','Operations','Site lead','2021-07-15'),
    (p_org,'E-003','[Demo] Mona Adel','People','HR partner','2023-01-09') ;
  select id into v_emp from public.hr_employees where org_id = p_org and employee_no = 'E-002';
  insert into public.hr_leave_requests(org_id, employee_id, kind, start_date, end_date)
    values (p_org, v_emp, 'annual', current_date + 10, current_date + 14);
  insert into public.ops_assets(org_id, tag, name, location) values
    (p_org,'AST-01','[Demo] Forklift 3T','Warehouse A'),(p_org,'AST-02','[Demo] Generator 250kVA','Plant 1');
  select id into v_asset from public.ops_assets where org_id = p_org and tag = 'AST-02';
  insert into public.ops_work_orders(org_id, title, asset_id, priority, due_date) values
    (p_org,'Quarterly generator service',v_asset,'high',current_date + 3),
    (p_org,'Replace loading-bay lighting',null,'low',current_date + 20);
  insert into public.risk_register(org_id, title, category, likelihood, impact, owner_name, status) values
    (p_org,'Single supplier for critical spares','operational',4,4,'Operations lead','mitigating'),
    (p_org,'Manual journal entries without review','financial',3,5,'Controller','open');
  select id into v_risk from public.risk_register where org_id = p_org and category = 'financial' limit 1;
  insert into public.risk_controls(org_id, risk_id, title, frequency, effectiveness)
    values (p_org, v_risk, 'Second-person review of manual journals','monthly','partially_effective') returning id into v_ctl;
  insert into public.compliance_requirements(org_id, framework, reference, title, status, control_id) values
    (p_org,'ISO 27001','A.5.15','Access control policy','partial',null),
    (p_org,'SOX','ITGC-02','Change management for financial systems','not_assessed',v_ctl);
  insert into public.gov_data_assets(org_id, name, system, owner_name, classification, contains_pii, retention_days) values
    (p_org,'Employee master','HR system','People team','restricted',true,2555),
    (p_org,'Vendor master','ERP','Finance','confidential',false,3650);
  insert into public.wf_definitions(org_id, name, entity_type, initial_state, states, transitions) values
    (p_org,'Invoice approval','fin_invoices','draft',array['draft','review','approved','rejected'],
     '[{"from":"draft","to":"review","permission":"workflow.act"},
       {"from":"review","to":"approved","permission":"finance.approve","four_eyes":true},
       {"from":"review","to":"rejected","permission":"finance.approve"},
       {"from":"rejected","to":"draft","permission":"workflow.act"}]');
  insert into public.reports(org_id, name, source, group_by) values
    (p_org,'Invoices by status','fin_invoices','status'),(p_org,'Risks by category','risk_register','category');
end $$;
revoke all on function public.load_demo_data(uuid) from public;
grant execute on function public.load_demo_data(uuid) to authenticated;
