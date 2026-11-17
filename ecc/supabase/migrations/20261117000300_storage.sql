-- Private documents bucket. Object paths must start with the organization id:
--   <org_id>/<module>/<file>
-- Prepared by Sara Salem. Copyright Sara Salem 2026.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400,
  array['application/pdf','image/png','image/jpeg','text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;

create or replace function app.storage_org(p_name text) returns uuid
language plpgsql immutable as $$
declare v text := split_part(p_name, '/', 1);
begin
  if v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return v::uuid; end if;
  return null;
end $$;
grant execute on function app.storage_org(text) to authenticated;

create policy docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.has_permission(app.storage_org(name), 'documents.read'));
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.has_permission(app.storage_org(name), 'documents.write'));
create policy docs_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and app.has_permission(app.storage_org(name), 'documents.write'))
  with check (bucket_id = 'documents' and app.has_permission(app.storage_org(name), 'documents.write'));
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and app.has_permission(app.storage_org(name), 'documents.write'));
