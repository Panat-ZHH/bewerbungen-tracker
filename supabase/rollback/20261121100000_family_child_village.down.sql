-- Rollback of supabase/migrations/20261121100000_family_child_village.sql: drops the parent village view ONLY
-- (the access-guard wrapper and its implementation). No table or data is touched.
drop function if exists public.family_child_village(uuid);
drop function if exists public._acc_impl_family_child_village(uuid);
