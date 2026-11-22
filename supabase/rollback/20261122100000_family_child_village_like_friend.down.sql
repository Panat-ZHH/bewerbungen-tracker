-- Rollback of supabase/migrations/20261122100000_family_child_village_like_friend.sql: restores the implementation of
-- 20261121100000_family_child_village.sql (real application ids, real statuses). Wrapper and grants are not touched.
create or replace function public._acc_impl_family_child_village(p_child_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me(); ch public.family_members; s jsonb; show_companies boolean;
begin
  if me.role <> 'parent' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into ch from public.family_members x
    where x.family_id = me.family_id and x.user_id = p_child_id and x.role = 'child' and x.status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
  s := ch.share_settings;
  if not public._family_sharing_allowed(ch) then
    raise exception 'NOT_SHARED' using detail = case when ch.consent_status = 'withdrawn'
        then 'Die Einwilligung für das Teilen wurde zurückgezogen.'
        else 'Das Teilen startet, sobald du als Elternteil eingewilligt hast.' end,
      hint = case when ch.consent_status = 'withdrawn' then 'consent_withdrawn' else 'consent_pending' end;
  end if;
  if not coalesce((s ->> 'village')::boolean, false) then
    raise exception 'NOT_SHARED' using detail = 'Dein Kind teilt sein Dorf gerade nicht.', hint = 'village_off';
  end if;
  show_companies := coalesce((s ->> 'applications')::boolean, false);
  return jsonb_build_object(
    'child_id', ch.user_id,
    'display_name', (select nullif(btrim(r.display_name), '') from public.user_roles r where r.user_id = ch.user_id),
    'island_count', public.map_islands_count(ch.user_id),
    'show_companies', show_companies,
    -- oldest first (created_at, id): the same order createApplicationMap() uses to place the houses
    'houses', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status,
        'company', case when show_companies then nullif(left(btrim(a.company), 80), '') end) order by a.created_at, a.id)
      from public.applications a where a.user_id = ch.user_id), '[]'::jsonb),
    -- house layouts only (object_id 'house:<application id>' as map_shop_state returns them), only for existing houses
    'layouts', coalesce((select jsonb_agg(jsonb_build_object('id', l.object_id, 'x', l.x, 'z', l.z, 'rotation', l.rotation) order by l.object_id)
      from public.map_layouts l where l.user_id = ch.user_id
        and exists (select 1 from public.applications a where a.user_id = ch.user_id and 'house:' || a.id = l.object_id)), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'itemType', i.item_type, 'x', i.x, 'z', i.z,
        'rotation', i.rotation, 'createdAt', i.created_at) order by i.created_at, i.id)
      from public.map_items i where i.user_id = ch.user_id), '[]'::jsonb));
end;
$$;
revoke all on function public._acc_impl_family_child_village(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function public._acc_impl_family_child_village(uuid) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on function public._acc_impl_family_child_village(uuid) from authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then revoke all on function public._acc_impl_family_child_village(uuid) from service_role; end if;
end $$;
