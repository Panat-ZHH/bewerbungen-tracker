-- Parent village = the child's OWN village, watch only (Panat, 2026-11-22 19:06). Run AFTER 20261122100000_family_child_village_like_friend.sql.
-- Replaces ONLY the implementation behind the guarded wrapper public.family_child_village (wrapper, paywall guard and grants unchanged).
-- Idempotent, no table or data is touched. Rollback: supabase/rollback/20261122190000_family_child_village_full_details.down.sql.
--
-- Why: 20261122100000 made the parent view identical to the FRIEND view (pseudo ids, masked results, «Haus 1»). Panat: wrong.
-- Parents must see exactly what the child sees in /map: company, job title (Stelle), the real status (incl. Zusage/Absage),
-- location and the dates the child's house label and detail sheet show. Real ids and layouts, so roof colours and positions
-- equal the child's view. share_settings.applications no longer changes anything here (the «with/without company names»
-- option is gone): when the village is shared, the parent always sees these details, read-only.
--
-- Fields per house = exactly what the child's village (app/map + components/applications/map-application-dialog.tsx) shows:
--   id, company, position, location, status, createdAt, updatedAt, appliedAt, deadline.
-- NEVER returned: notes, salary, currency, job_url, source, job_description, match_score, cv_type, contacts, Schnupper/test
-- details, documents/CVs, wallet balance, classes, other families.
-- Privacy gate unchanged: active parent of the same family, active child, consent (_family_sharing_allowed), share_settings.village.

create or replace function public._acc_impl_family_child_village(p_child_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me(); ch public.family_members; s jsonb;
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
  return jsonb_build_object(
    'child_id', ch.user_id,
    'display_name', (select nullif(btrim(r.display_name), '') from public.user_roles r where r.user_id = ch.user_id),
    'island_count', public.map_islands_count(ch.user_id),
    -- oldest first (created_at, id): the order createApplicationMap() uses to place the houses. Real ids and raw values,
    -- exactly as the child's own app reads them (lib/application-rows.ts fromRow), so the 3D village is the same.
    'houses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'company', a.company, 'position', a.position, 'location', nullif(btrim(a.location), ''),
        'status', a.status, 'createdAt', a.created_at, 'updatedAt', a.updated_at, 'appliedAt', a.applied_at, 'deadline', a.deadline)
        order by a.created_at, a.id)
      from public.applications a where a.user_id = ch.user_id), '[]'::jsonb),
    -- house layouts (object_id 'house:<application id>' as map_shop_state returns them), only for existing houses
    'layouts', coalesce((select jsonb_agg(jsonb_build_object('id', l.object_id, 'x', l.x, 'z', l.z, 'rotation', l.rotation) order by l.object_id)
      from public.map_layouts l where l.user_id = ch.user_id
        and exists (select 1 from public.applications a where a.user_id = ch.user_id and 'house:' || a.id = l.object_id)), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'itemType', i.item_type, 'x', i.x, 'z', i.z,
        'rotation', i.rotation, 'createdAt', i.created_at) order by i.created_at, i.id)
      from public.map_items i where i.user_id = ch.user_id), '[]'::jsonb));
end;
$$;

-- The implementation stays unreachable for clients (only the guarded wrapper family_child_village is granted).
revoke all on function public._acc_impl_family_child_village(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function public._acc_impl_family_child_village(uuid) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on function public._acc_impl_family_child_village(uuid) from authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then revoke all on function public._acc_impl_family_child_village(uuid) from service_role; end if;
end $$;
