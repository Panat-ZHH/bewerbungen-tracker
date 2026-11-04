-- Islands: with enough points a user unlocks further islands connected by a fixed bridge.
-- NOT applied automatically. Needs 20260101000000_schema.sql and 20261104000001_lock_streets.sql first.
-- Keep map_island_catalog in sync with lib/islands-config.ts.

create table if not exists public.map_island_catalog (
  island_no integer primary key check (island_no >= 1),
  name text not null,
  price integer not null check (price >= 0),
  x0 integer not null, z0 integer not null, x1 integer not null, z1 integer not null,
  bridge_x0 integer, bridge_z0 integer, bridge_x1 integer, bridge_z1 integer,
  bridge_axis text check (bridge_axis in ('x', 'z')),
  check (x1 > x0 and z1 > z0)
);

insert into public.map_island_catalog (island_no, name, price, x0, z0, x1, z1, bridge_x0, bridge_z0, bridge_x1, bridge_z1, bridge_axis) values
  (1, 'Heimatinsel', 0, -10, -7, 33, 20, null, null, null, null, null),
  (2, 'Ostinsel', 600, 38, -7, 64, 21, 33, 8, 38, 11, 'x'),
  (3, 'Südinsel', 1500, 38, 27, 64, 55, 49, 21, 52, 27, 'z'),
  (4, 'Gipfelinsel', 3000, 70, 27, 96, 55, 64, 38, 70, 41, 'x')
on conflict (island_no) do update set name = excluded.name, price = excluded.price, x0 = excluded.x0, z0 = excluded.z0,
  x1 = excluded.x1, z1 = excluded.z1, bridge_x0 = excluded.bridge_x0, bridge_z0 = excluded.bridge_z0,
  bridge_x1 = excluded.bridge_x1, bridge_z1 = excluded.bridge_z1, bridge_axis = excluded.bridge_axis;

-- One row per user and unlocked island. Island 1 is implicit and free.
create table if not exists public.map_islands (
  user_id uuid not null references auth.users(id) on delete cascade,
  island_no integer not null references public.map_island_catalog(island_no) check (island_no >= 2),
  price_paid integer not null check (price_paid >= 0),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, island_no)
);

alter table public.map_island_catalog enable row level security;
alter table public.map_islands enable row level security;
revoke all on public.map_island_catalog, public.map_islands from anon, authenticated;
grant select on public.map_island_catalog, public.map_islands to authenticated;
drop policy if exists "island catalog readable" on public.map_island_catalog;
drop policy if exists "own islands" on public.map_islands;
create policy "island catalog readable" on public.map_island_catalog for select to authenticated using (true);
create policy "own islands" on public.map_islands for select to authenticated using (auth.uid() = user_id);
-- No insert/update/delete policies or grants: islands can only be unlocked through map_island_unlock().

-- Number of unlocked islands (1 = only the free first island). Islands are unlocked consecutively.
create or replace function public.map_islands_count(owner_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::integer from public.map_islands where user_id = owner_id;
$$;

-- Footprint must lie on ONE unlocked island and must not touch any bridge/landing (2 cells each side).
create or replace function public.map_area_ok(owner_id uuid, p_x integer, p_z integer, p_width integer, p_depth integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.map_island_catalog island
    where island.island_no <= public.map_islands_count(owner_id)
      and p_x >= island.x0 and p_x + p_width <= island.x1 and p_z >= island.z0
      and p_z + p_depth <= case when island.island_no = 1 then greatest(island.z1, public.map_village_depth(owner_id)) else island.z1 end
  ) and not exists (
    select 1 from public.map_island_catalog island
    where island.bridge_axis is not null
      and p_x < island.bridge_x1 + case when island.bridge_axis = 'x' then 2 else 0 end
      and p_x + p_width > island.bridge_x0 - case when island.bridge_axis = 'x' then 2 else 0 end
      and p_z < island.bridge_z1 + case when island.bridge_axis = 'z' then 2 else 0 end
      and p_z + p_depth > island.bridge_z0 - case when island.bridge_axis = 'z' then 2 else 0 end
  );
$$;

create or replace function public.map_islands_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return jsonb_build_object('unlocked', public.map_islands_count(owner_id));
end;
$$;

-- Server-side safe unlock: wallet row lock, consecutive order, price from the catalog, balance check, idempotent.
create or replace function public.map_island_unlock(p_island_no integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); island_price integer; wallet_balance integer; unlocked integer;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_island_no is null or p_island_no < 2 then raise exception 'INVALID_ISLAND'; end if;
  insert into public.map_wallets (user_id) values (owner_id) on conflict do nothing;
  select balance into wallet_balance from public.map_wallets where user_id = owner_id for update;
  unlocked := public.map_islands_count(owner_id);
  if p_island_no <= unlocked then return public.map_islands_state(); end if;
  if p_island_no <> unlocked + 1 then raise exception 'ISLAND_ORDER'; end if;
  select price into island_price from public.map_island_catalog where island_no = p_island_no;
  if island_price is null then raise exception 'INVALID_ISLAND'; end if;
  if wallet_balance < island_price then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.map_islands (user_id, island_no, price_paid) values (owner_id, p_island_no, island_price);
  update public.map_wallets set balance = balance - island_price where user_id = owner_id;
  return public.map_islands_state();
end;
$$;

-- Placement/move now check the unlocked islands instead of the fixed first-island bounds.
create or replace function public.map_shop_place(p_item_id uuid, p_x integer default null, p_z integer default null, p_rotation integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); owned public.map_items; item_width integer; item_depth integer;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.map_wallets where user_id = owner_id for update;
  select * into owned from public.map_items where id = p_item_id and user_id = owner_id;
  if not found then raise exception 'ITEM_NOT_OWNED'; end if;
  if p_rotation is null or p_rotation not between 0 and 3 or (p_x is null) <> (p_z is null) then raise exception 'INVALID_POSITION'; end if;
  if p_x is not null then
    select case when p_rotation % 2 = 0 then width else depth end,
      case when p_rotation % 2 = 0 then depth else width end
      into item_width, item_depth from public.map_shop_catalog where item_type = owned.item_type;
    if not public.map_area_ok(owner_id, p_x, p_z, item_width, item_depth) then raise exception 'INVALID_POSITION'; end if;
    if not public.map_position_free(owner_id, p_item_id::text, item_width, item_depth, p_x, p_z) then raise exception 'POSITION_OCCUPIED'; end if;
  end if;
  update public.map_items set x = p_x, z = p_z, rotation = p_rotation where id = p_item_id and user_id = owner_id;
  return public.map_shop_state();
end;
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
    or not public.map_area_ok(owner_id, p_x, p_z, object_size, object_size) then raise exception 'INVALID_POSITION'; end if;
  if not public.map_position_free(owner_id, p_object_id, object_size, object_size, p_x, p_z) then raise exception 'POSITION_OCCUPIED'; end if;
  insert into public.map_layouts(user_id, object_id, x, z, rotation) values (owner_id, p_object_id, p_x, p_z, p_rotation)
    on conflict (user_id, object_id) do update set x = excluded.x, z = excluded.z, rotation = excluded.rotation;
  return public.map_shop_state();
end;
$$;

revoke all on function public.map_islands_count(uuid), public.map_area_ok(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.map_islands_state(), public.map_island_unlock(integer) from public, anon;
grant execute on function public.map_islands_state(), public.map_island_unlock(integer) to authenticated;
revoke all on function public.map_shop_place(uuid, integer, integer, integer), public.map_move_object(text, integer, integer, integer) from public, anon;
grant execute on function public.map_shop_place(uuid, integer, integer, integer), public.map_move_object(text, integer, integer, integer) to authenticated;
