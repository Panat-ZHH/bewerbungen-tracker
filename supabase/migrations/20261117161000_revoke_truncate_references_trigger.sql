-- Security re-audit 3 (2026-11-17, low): Supabase's default privileges give anon/authenticated ALL on new public tables,
-- including TRUNCATE (bypasses RLS), REFERENCES and TRIGGER. The app never needs them (PostgREST/GraphQL can't issue
-- them today), so take them away from every public table as defence in depth. SELECT/INSERT/UPDATE/DELETE stay exactly
-- as they are (RLS + earlier column grants unchanged). Additive, idempotent; also runs on future re-applies.
do $$ declare t regclass; r text; begin
  for t in select c.oid::regclass from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke truncate, references, trigger on table %s from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;
