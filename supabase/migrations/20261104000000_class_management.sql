-- Round 2: class management for teachers and a consent preview for students. Run AFTER schema.sql and social.sql. Idempotent.

-- Student: look at a class before joining (so consent is informed). Reveals only name, year, teacher name.
create or replace function public.class_preview(p_code text)
returns table (class_id uuid, name text, school_year text, teacher_name text, member_count integer, already_member boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid(); c public.classes;
begin
  select * into c from public.classes x where x.join_code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  return query
    select c.id, c.name, c.school_year, t.display_name,
      (select count(*)::integer from public.class_members m where m.class_id = c.id),
      exists (select 1 from public.class_members m where m.class_id = c.id and m.student_id = uid)
    from public.user_roles t where t.user_id = c.teacher_id;
end;
$$;

-- Teacher: rename a class.
create or replace function public.class_rename(p_class_id uuid, p_name text, p_school_year text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_teacher_of(p_class_id);
  if length(btrim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'INVALID_NAME'; end if;
  update public.classes c set name = btrim(p_name), school_year = coalesce(left(btrim(p_school_year), 20), c.school_year) where c.id = p_class_id;
end;
$$;

-- Teacher: delete a class (members are released, their data was never copied).
create or replace function public.class_delete(p_class_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_teacher_of(p_class_id);
  delete from public.classes c where c.id = p_class_id;
end;
$$;

-- Teacher: remove one student from a class.
create or replace function public.class_remove_student(p_class_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_teacher_of(p_class_id);
  delete from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- Teacher: replace a leaked or old join code. Existing members stay; the old code stops working.
create or replace function public.class_regenerate_code(p_class_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  perform public._soc_teacher_of(p_class_id);
  code := public._soc_new_code('class');
  update public.classes c set join_code = code where c.id = p_class_id;
  return code;
end;
$$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('class_preview', 'class_rename', 'class_delete', 'class_remove_student', 'class_regenerate_code') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
