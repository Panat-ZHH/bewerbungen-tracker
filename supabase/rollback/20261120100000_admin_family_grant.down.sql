-- Rollback of supabase/migrations/20261120100000_admin_family_grant.sql: drops the three admin family functions ONLY.
-- Data stays as it is: families, family_members, school_licences rows (also those with assigned_by 'admin:…') and
-- admin_audit_log rows are NOT touched. Granted family packages keep working (app_access() reads the licence rows);
-- to end one after the rollback, set that school_licences row to status 'cancelled' by hand (service role / SQL editor).
drop function if exists public.admin_family_grant(uuid, timestamptz, text, integer, integer);
drop function if exists public.admin_family_revoke(uuid, text);
drop function if exists public.admin_family_status(uuid);
drop function if exists public._admin_family_session_ok();
