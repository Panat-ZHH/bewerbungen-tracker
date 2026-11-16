-- B2B part 3: data subject rights (DSGVO Art. 15/20, Swiss DSG Art. 25/28): "Meine Daten herunterladen".
-- Run AFTER 20261116110000_b2b_class_goals_stats.sql. Additive and idempotent.
--
-- export_my_data() returns ONE JSON document with every row in the public schema that belongs to the caller.
-- It is generated from the foreign keys to auth.users (same discovery as account_data_report in
-- 20261108000000_account_deletion.sql), so tables added later (e.g. family plans) are included automatically.
-- Credentials are redacted (calendar feed tokens, invitation tokens, push keys). Uploaded files themselves are in
-- Storage; their metadata (cvs.file_name / storage_path) is part of the export and the app offers the downloads.
--
-- Erasure already exists and is NOT duplicated here: app/api/account/delete (service role) runs
-- account_delete_prepare -> storage removal -> auth.admin.deleteUser (ON DELETE CASCADE) -> account_data_report.
-- Retention concept: docs/b2b/DATA-MODEL.md (documentation only, no automatic deletion).

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r record;
  rows_json jsonb;
  tables jsonb := '{}'::jsonb;
  redacted constant text[] := array['token', 'p256dh', 'auth'];
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  for r in
    select c.conrelid::regclass as tbl, c.conrelid::regclass::text as name,
      string_agg(format('%I = $1', a.attname), ' or ' order by a.attname) as cond
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
    group by c.conrelid
    order by 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from %s x where %s', r.tbl, r.cond)
      into rows_json using uid, redacted;
    if jsonb_array_length(rows_json) > 0 then tables := tables || jsonb_build_object(replace(r.name, 'public.', ''), rows_json); end if;
  end loop;
  return jsonb_build_object(
    'format', 'wendapply-export-v1',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = uid),
    -- Readable context: names of the people and classes the raw rows point to (only what the user can already see in the app).
    'friends', coalesce((select jsonb_agg(jsonb_build_object('display_name', o.display_name, 'status', f.status, 'since', f.created_at) order by f.created_at)
      from public.friendships f join public.user_roles o on o.user_id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
      where uid in (f.requester_id, f.addressee_id)), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('class', c.name, 'school_year', c.school_year, 'teacher', t.display_name,
        'school', s.name, 'joined_at', m.joined_at, 'share_applications', m.share_applications, 'share_status', m.share_status,
        'share_companies', m.share_companies) order by m.joined_at)
      from public.class_members m join public.classes c on c.id = m.class_id
      left join public.user_roles t on t.user_id = c.teacher_id left join public.schools s on s.id = c.school_id
      where m.student_id = uid), '[]'::jsonb),
    'tables', tables);
end;
$$;

revoke all on function public.export_my_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
