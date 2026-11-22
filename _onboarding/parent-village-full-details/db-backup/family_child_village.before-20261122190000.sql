-- Live definition of the wrapper before 20261122190000 (read-only pg_get_functiondef dump 2026-11-22, project bhwreehwirrloxagyypi). Unchanged by the migration.
CREATE OR REPLACE FUNCTION public.family_child_village(p_child_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- access guard (20261118020000_access_guards.sql); original logic: public._acc_impl_family_child_village
  perform public._assert_app_access();
  return public._acc_impl_family_child_village(p_child_id => p_child_id);
end;
$function$
