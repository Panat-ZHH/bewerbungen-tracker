-- Part f-names (P0 items 6, 7, 8): real names, consent = real switches, notices. Additive and idempotent.

-- ---------- 6: names ----------
-- Same statement as part c (add column if not exists), so both can be applied in any order.
alter table public.profiles add column if not exists display_name text;
-- Self-declared age band for consent defaults: null = not told, true = under 16, false = 16 or older.
alter table public.user_roles add column if not exists under_16 boolean;

-- Teacher-only alias for a student (e.g. a clear name when the student signed up with a nickname). Never shown to other students.
create table if not exists public.class_student_aliases (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  alias text not null check (length(alias) between 1 and 60),
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
alter table public.class_student_aliases enable row level security;
revoke all on public.class_student_aliases from anon, authenticated;

-- Set my own shown name. Writes the name that teachers and friends see (user_roles) and mirrors it into profiles.
create or replace function public.profile_set_display_name(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nm text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(nm) not between 1 and 60 or nm ~ '@' then raise exception 'INVALID_NAME'; end if;
  perform public._soc_ensure(uid);
  update public.user_roles r set display_name = nm where r.user_id = uid;
  update public.profiles p set display_name = nm where p.user_id = uid;
  return nm;
end;
$$;

-- Does the signed-in user still need to give a real name? (empty, "Nutzer" or just the e-mail prefix from sign-up)
create or replace function public.profile_name_status()
returns table (display_name text, needs_name boolean, under_16 boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public._soc_ensure(uid);
  return query
    select r.display_name,
      (btrim(r.display_name) = '' or lower(btrim(r.display_name)) = 'nutzer'
        or lower(btrim(r.display_name)) = lower(split_part(coalesce(r.email, ''), '@', 1))),
      r.under_16
    from public.user_roles r where r.user_id = uid;
end;
$$;

create or replace function public.profile_set_under_16(p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public._soc_ensure(uid);
  update public.user_roles r set under_16 = p_value where r.user_id = uid;
end;
$$;

-- Teacher: set or clear (empty text) an alias for a student of this class.
create or replace function public.class_set_student_alias(p_class_id uuid, p_student_id uuid, p_alias text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_teacher_of(p_class_id); a text := btrim(coalesce(p_alias, ''));
begin
  if not exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id) then raise exception 'NOT_FOUND'; end if;
  if a = '' then
    delete from public.class_student_aliases x where x.class_id = p_class_id and x.student_id = p_student_id;
    return;
  end if;
  if length(a) > 60 then raise exception 'INVALID_NAME'; end if;
  insert into public.class_student_aliases (class_id, student_id, alias, set_by) values (p_class_id, p_student_id, a, uid)
    on conflict (class_id, student_id) do update set alias = excluded.alias, set_by = excluded.set_by, updated_at = now();
end;
$$;

-- Teacher: all aliases of a class (client shows alias first, then the real name).
create or replace function public.class_student_aliases(p_class_id uuid)
returns table (student_id uuid, alias text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query select x.student_id, x.alias from public.class_student_aliases x where x.class_id = p_class_id;
end;
$$;

-- ---------- 7: consent ----------
-- Decision: sharing with the teacher is OFF by default. It only starts ON for students who said they are 16 or older
-- (user_roles.under_16 = false); under 16 or unknown stays OFF until the student switches it on in the join dialog.
-- A trigger keeps this independent of which RPC inserts the membership. Existing memberships are not changed.
create or replace function public._class_member_default_sharing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles r where r.user_id = new.student_id and r.under_16 = false) then
    new.share_applications := false;
    new.share_status := false;
    new.share_companies := false;
  end if;
  return new;
end;
$$;
drop trigger if exists class_members_default_sharing on public.class_members;
create trigger class_members_default_sharing before insert on public.class_members
  for each row execute function public._class_member_default_sharing();

-- The consent text, one sentence per real switch (names match the switches in the app):
--   Fortschritt teilen = share_applications, Status zeigen = share_status, Firmen zeigen = share_companies.
create or replace function public.class_visibility_info()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'teacher_sees', jsonb_build_array(
      'Immer: deinen Namen und dein Profilbild, solange du in der Klasse bist',
      'Mit «Fortschritt teilen»: wie viele Bewerbungen du hast, wann du zuletzt aktiv warst sowie Bewerbungsdatum und Frist',
      'Mit «Status zeigen»: den Stand jeder Bewerbung (z. B. beworben, Gespräch, Zusage)',
      'Mit «Firmen zeigen»: Firma, Stelle und Ort jeder Bewerbung'),
    'teacher_never_sees', jsonb_build_array(
      'Deine Notizen',
      'Dokumente, Lebenslauf und Zeugnisse',
      'Kontaktpersonen und Links zu Stellenanzeigen',
      'Gehaltsangaben',
      'Deine E-Mail-Adresse',
      'Alles, was du nicht freigegeben hast: ohne «Fortschritt teilen» sieht deine Lehrperson nur deinen Namen'));
$$;

-- ---------- grants ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('profile_set_display_name', 'profile_name_status', 'profile_set_under_16', 'class_set_student_alias', 'class_student_aliases', 'class_visibility_info', '_class_member_default_sharing') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f::text not like '\_class%' then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;
end $$;
