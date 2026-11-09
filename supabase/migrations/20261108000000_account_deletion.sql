-- Account deletion (right to erasure).
-- Server flow (app/api/account/delete, service role): account_delete_prepare -> storage objects -> auth.admin.deleteUser.
-- Everything else is removed by ON DELETE CASCADE from auth.users. This migration (idempotent):
--  1. makes sure EVERY public foreign key to auth.users cascades (NOT NULL column) or nulls (nullable column),
--  2. account_delete_summary(): what will be deleted, shown to the signed-in user in the confirmation dialog,
--  3. account_delete_prepare(uid): hands classes over to a co-teacher when there is one (service role only),
--  4. account_data_report(uid): row counts per table for a user, used to prove that nothing is left (service role only).

-- 1. No dangling foreign keys: anything referencing auth.users must not block (or survive) the deletion.
do $$
declare r record; v_cols text; v_notnull boolean;
begin
  for r in
    select c.oid, c.conname, c.conrelid::regclass as tbl, c.conkey, c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public' and c.confdeltype not in ('c', 'n')
  loop
    select string_agg(quote_ident(a.attname), ', '), bool_and(a.attnotnull) into v_cols, v_notnull
    from pg_attribute a where a.attrelid = r.tbl and a.attnum = any (r.conkey);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%s) references auth.users(id) on delete %s',
                   r.tbl, r.conname, v_cols, case when v_notnull then 'cascade' else 'set null' end);
  end loop;
end $$;

-- 2. Summary for the confirmation dialog (own data only).
create or replace function public.account_delete_summary()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_role text;
begin
  if uid is null then raise exception 'FORBIDDEN'; end if;
  select role into v_role from public.user_roles where user_id = uid;
  return jsonb_build_object(
    'role', coalesce(v_role, 'student'),
    'applications', (select count(*) from public.applications where user_id = uid),
    'documents', (select count(*) from public.cvs where user_id = uid),
    'friends', (select count(*) from public.friendships where requester_id = uid or addressee_id = uid),
    'classes_joined', (select count(*) from public.class_members where student_id = uid),
    'classes_owned', (select count(*) from public.classes where teacher_id = uid),
    'students_in_owned_classes', (select count(*) from public.class_members m join public.classes c on c.id = m.class_id where c.teacher_id = uid)
  );
end $$;
revoke all on function public.account_delete_summary() from public, anon;
grant execute on function public.account_delete_summary() to authenticated;

-- 3. Teachers: a class with a co-teacher is handed to the co-teacher (the students keep their class), every other class
-- is deleted with the account (students stay in the app with all their own data, only the membership goes).
-- class_teachers only exists once the teacher role is deployed, hence the dynamic SQL.
create or replace function public.account_delete_prepare(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_transferred int := 0; v_deleted int := 0; r record; v_new uuid;
begin
  if p_user_id is null then raise exception 'INVALID_REQUEST'; end if;
  if to_regclass('public.class_teachers') is not null then
    for r in select id from public.classes where teacher_id = p_user_id loop
      execute 'select teacher_id from public.class_teachers where class_id = $1 and teacher_id <> $2 order by added_at limit 1'
        into v_new using r.id, p_user_id;
      if v_new is not null then
        update public.classes set teacher_id = v_new where id = r.id;
        execute 'delete from public.class_teachers where class_id = $1 and teacher_id = $2' using r.id, v_new;
        v_transferred := v_transferred + 1;
      end if;
    end loop;
  end if;
  select count(*) into v_deleted from public.classes where teacher_id = p_user_id;
  return jsonb_build_object('classes_transferred', v_transferred, 'classes_deleted', v_deleted);
end $$;
revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;

-- 4. Proof of erasure: rows that still point at this user, per table (every public column that references auth.users,
-- plus user_roles / profiles style tables are covered because they reference auth.users as well).
create or replace function public.account_data_report(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_count bigint; v_out jsonb := '{}'::jsonb;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_count using p_user_id;
    if v_count > 0 then v_out := v_out || jsonb_build_object(r.tbl || '.' || r.col, v_count); end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.account_data_report(uuid) from public, anon, authenticated;

-- Only the server (service role) may call the two admin functions.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.account_delete_prepare(uuid) to service_role;
    grant execute on function public.account_data_report(uuid) to service_role;
  end if;
end $$;
