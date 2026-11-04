-- Streets (object ids 'street:x:z') are fixed. Do not apply without Panat's go-ahead.
-- Existing street rows in map_layouts are kept but ignored; streets always use the default grid position.

create or replace function public.map_village_objects(owner_id uuid)
returns table (id text, item_type text, x integer, z integer, rotation integer)
language sql stable security definer set search_path = '' as $$
  with ordered as (
    select applications.id, row_number() over (order by created_at, applications.id) - 1 as index
    from public.applications where user_id = owner_id
  ), houses as (
    select 'house:' || ordered.id as id, index,
      floor((390 + (index % 3) * 320 + case when (index / 3) % 2 = 0 then -12 else 12 end - 700) / 48.0)::integer - 2 as x,
      floor(((index / 3) * 360 + case index % 3 when 0 then -12 when 1 then 24 else -24 end) / 48.0)::integer - 2 as z
    from ordered
  ), roads as (
    select -4 as x, coordinate as z from generate_series(-6, public.map_village_depth(owner_id) - 1) coordinate
    union
    select coordinate, floor(3.5 + row * 7.5)::integer from generate_series(0, greatest(1, ((select count(*) from ordered) + 2) / 3)::integer - 1) row cross join generate_series(-10, 14) coordinate
    union
    select houses.x + 2, coordinate from houses cross join lateral generate_series(houses.z + 5, floor(3.5 + (houses.index / 3) * 7.5)::integer - 1) coordinate
  ), defaults as (
    select houses.id, 'house'::text as item_type, houses.x, houses.z from houses
    union all
    select 'street:' || roads.x || ':' || roads.z, 'street', roads.x, roads.z from roads
      where not exists (select 1 from houses where roads.x < houses.x + 5 and roads.x + 1 > houses.x and roads.z < houses.z + 5 and roads.z + 1 > houses.z)
      and not (roads.x < -1 and roads.x + 1 > -5 and roads.z < -3 and roads.z + 1 > -6)
  )
  select defaults.id, defaults.item_type, case when defaults.item_type = 'street' then defaults.x else coalesce(layout.x, defaults.x) end, case when defaults.item_type = 'street' then defaults.z else coalesce(layout.z, defaults.z) end, case when defaults.item_type = 'street' then 0 else coalesce(layout.rotation, 0) end
  from defaults left join public.map_layouts layout on layout.user_id = owner_id and layout.object_id = defaults.id;
$$;

create or replace function public.map_move_object(p_object_id text, p_x integer, p_z integer, p_rotation integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); object_type text; object_size integer;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_object_id like 'street:%' then raise exception 'STREET_LOCKED'; end if;
  insert into public.map_wallets(user_id) values (owner_id) on conflict do nothing;
  perform 1 from public.map_wallets where user_id = owner_id for update;
  select item_type into object_type from public.map_village_objects(owner_id) where id = p_object_id;
  if object_type is null then raise exception 'ITEM_NOT_OWNED'; end if;
  object_size := case when object_type = 'house' then 5 else 1 end;
  if p_x is null or p_z is null or p_rotation is null or p_rotation not between 0 and 3
    or p_x < -10 or p_z < -7 or p_x + object_size > 33 or p_z + object_size > public.map_village_depth(owner_id) then raise exception 'INVALID_POSITION'; end if;
  if not public.map_position_free(owner_id, p_object_id, object_size, object_size, p_x, p_z) then raise exception 'POSITION_OCCUPIED'; end if;
  insert into public.map_layouts(user_id, object_id, x, z, rotation) values (owner_id, p_object_id, p_x, p_z, p_rotation)
    on conflict (user_id, object_id) do update set x = excluded.x, z = excluded.z, rotation = excluded.rotation;
  return public.map_shop_state();
end;
$$;


create or replace function public.map_layouts_lock_streets()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.object_id like 'street:%' then raise exception 'STREET_LOCKED'; end if;
  return new;
end;
$$;

drop trigger if exists map_layouts_lock_streets on public.map_layouts;
create trigger map_layouts_lock_streets before insert or update on public.map_layouts
  for each row execute function public.map_layouts_lock_streets();

revoke all on function public.map_village_objects(uuid) from public, anon, authenticated;
revoke all on function public.map_move_object(text, integer, integer, integer) from public, anon;
grant execute on function public.map_move_object(text, integer, integer, integer) to authenticated;
