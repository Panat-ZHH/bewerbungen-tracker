create table if not exists public.applications (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  company text not null,
  position text not null,
  location text,
  job_url text,
  source text,
  category text not null,
  salary_min numeric,
  salary_max numeric,
  currency text,
  deadline date,
  status text not null,
  match_score numeric,
  applied_at date,
  created_at date not null,
  updated_at date not null,
  cv_type text,
  job_description text,
  notes text
);

create table if not exists public.profiles (
  id text primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  location text,
  website text,
  linkedin text
);

create table if not exists public.cvs (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  description text not null,
  updated_at date not null,
  status text not null,
  file_name text,
  storage_path text,
  file_type text,
  file_size bigint
);

alter table public.cvs add column if not exists file_name text;
alter table public.cvs add column if not exists storage_path text;
alter table public.cvs add column if not exists file_type text;
alter table public.cvs add column if not exists file_size bigint;

alter table public.applications add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.cvs add column if not exists user_id uuid references auth.users(id) on delete cascade;

create or replace function public.create_default_cvs_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cvs (id, user_id, name, type, description, updated_at, status)
  values
    ('cv-' || new.id::text || '-developer', new.id, 'Entwickler-Lebenslauf', 'developer', 'Softwareentwicklung', current_date, 'Draft'),
    ('cv-' || new.id::text || '-sales', new.id, 'Vertrieb-Lebenslauf', 'sales', 'Business Development / Vertrieb', current_date, 'Draft'),
    ('cv-' || new.id::text || '-finance', new.id, 'Finanz-Lebenslauf', 'finance', 'Finanzen / Banking', current_date, 'Draft')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_default_cvs_after_signup on auth.users;
create trigger create_default_cvs_after_signup
  after insert on auth.users
  for each row execute function public.create_default_cvs_for_user();

insert into public.cvs (id, user_id, name, type, description, updated_at, status)
select 'cv-' || users.id::text || '-' || templates.type,
       users.id,
       templates.name,
       templates.type,
       templates.description,
       current_date,
       'Draft'
from auth.users as users
cross join (values
  ('developer', 'Entwickler-Lebenslauf', 'Softwareentwicklung'),
  ('sales', 'Vertrieb-Lebenslauf', 'Business Development / Vertrieb'),
  ('finance', 'Finanz-Lebenslauf', 'Finanzen / Banking')
) as templates(type, name, description)
on conflict (id) do nothing;

alter table public.applications enable row level security;
alter table public.profiles enable row level security;
alter table public.cvs enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.cvs to authenticated;

drop policy if exists "local prototype applications access" on public.applications;
drop policy if exists "local prototype profiles access" on public.profiles;
drop policy if exists "local prototype cvs access" on public.cvs;
drop policy if exists "authenticated users own applications" on public.applications;
drop policy if exists "authenticated users own profiles" on public.profiles;
drop policy if exists "authenticated users own cvs" on public.cvs;
create policy "authenticated users own applications" on public.applications for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authenticated users own profiles" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authenticated users own cvs" on public.cvs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false) on conflict (id) do nothing;
drop policy if exists "authenticated users manage cv files" on storage.objects;
create policy "authenticated users manage cv files" on storage.objects for all to authenticated using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create table if not exists public.map_shop_catalog (
  item_type text primary key,
  price integer not null check (price > 0),
  width integer not null check (width > 0),
  depth integer not null check (depth > 0)
);

insert into public.map_shop_catalog (item_type, price, width, depth) values
  ('road', 20, 1, 1), ('flowers', 30, 1, 1), ('tree', 40, 1, 1),
  ('bench', 50, 2, 1), ('fountain', 150, 2, 2), ('amusement_park', 500, 4, 4)
on conflict (item_type) do update set price = excluded.price, width = excluded.width, depth = excluded.depth;

create table if not exists public.map_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  earned integer not null default 0 check (earned >= 0)
);

create table if not exists public.map_application_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, application_id)
);

create table if not exists public.map_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null references public.map_shop_catalog(item_type),
  price_paid integer not null check (price_paid > 0),
  x integer,
  z integer,
  rotation integer not null default 0 check (rotation between 0 and 3),
  created_at timestamptz not null default now(),
  check ((x is null) = (z is null))
);

alter table public.map_shop_catalog enable row level security;
alter table public.map_wallets enable row level security;
alter table public.map_application_rewards enable row level security;
alter table public.map_items enable row level security;
revoke all on public.map_shop_catalog, public.map_wallets, public.map_application_rewards, public.map_items from anon, authenticated;
grant select on public.map_shop_catalog, public.map_wallets, public.map_application_rewards, public.map_items to authenticated;
drop policy if exists "map catalog readable" on public.map_shop_catalog;
drop policy if exists "own map wallet" on public.map_wallets;
drop policy if exists "own application rewards" on public.map_application_rewards;
drop policy if exists "own map items" on public.map_items;
create policy "map catalog readable" on public.map_shop_catalog for select to authenticated using (true);
create policy "own map wallet" on public.map_wallets for select to authenticated using (auth.uid() = user_id);
create policy "own application rewards" on public.map_application_rewards for select to authenticated using (auth.uid() = user_id);
create policy "own map items" on public.map_items for select to authenticated using (auth.uid() = user_id);

create or replace function public.reward_submitted_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rewarded text;
begin
  if new.user_id is null or not (new.applied_at is not null or new.status in ('applied', 'interview', 'final_interview', 'offer', 'rejected')) then
    return new;
  end if;
  insert into public.map_application_rewards (user_id, application_id) values (new.user_id, new.id)
    on conflict do nothing returning application_id into rewarded;
  if rewarded is not null then
    insert into public.map_wallets (user_id, balance, earned) values (new.user_id, 100, 100)
      on conflict (user_id) do update set balance = public.map_wallets.balance + 100, earned = public.map_wallets.earned + 100;
  end if;
  return new;
end;
$$;

drop trigger if exists reward_submitted_application on public.applications;
create trigger reward_submitted_application after insert or update on public.applications
  for each row execute function public.reward_submitted_application();

with rewards as (
  insert into public.map_application_rewards (user_id, application_id)
  select user_id, id from public.applications
  where user_id is not null and (applied_at is not null or status in ('applied', 'interview', 'final_interview', 'offer', 'rejected'))
  on conflict do nothing returning user_id
)
insert into public.map_wallets (user_id, balance, earned)
select user_id, (count(*) * 100)::integer, (count(*) * 100)::integer from rewards group by user_id
on conflict (user_id) do update set balance = public.map_wallets.balance + excluded.balance, earned = public.map_wallets.earned + excluded.earned;

create table if not exists public.map_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id text not null,
  x integer not null,
  z integer not null,
  rotation integer not null default 0 check (rotation between 0 and 3),
  primary key (user_id, object_id)
);
alter table public.map_layouts enable row level security;
revoke all on public.map_layouts from anon, authenticated;
grant select on public.map_layouts to authenticated;
drop policy if exists "own map layouts" on public.map_layouts;
create policy "own map layouts" on public.map_layouts for select to authenticated using (auth.uid() = user_id);

create or replace function public.map_village_depth(owner_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(20, ceil(greatest(900, ((count(*) + 2) / 3) * 360 + 280) / 48.0)::integer - 5)
  from public.applications where user_id = owner_id;
$$;

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
  select defaults.id, defaults.item_type, coalesce(layout.x, defaults.x), coalesce(layout.z, defaults.z), coalesce(layout.rotation, 0)
  from defaults left join public.map_layouts layout on layout.user_id = owner_id and layout.object_id = defaults.id;
$$;

create or replace function public.map_position_free(owner_id uuid, moving_id text, item_width integer, item_depth integer, position_x integer, position_z integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select not (position_x < -1 and position_x + item_width > -5 and position_z < -3 and position_z + item_depth > -6)
    and not exists (
      select 1 from public.map_village_objects(owner_id) object
      where object.id <> moving_id
        and position_x < object.x + case when object.item_type = 'house' then 5 else 1 end
        and position_x + item_width > object.x
        and position_z < object.z + case when object.item_type = 'house' then 5 else 1 end
        and position_z + item_depth > object.z
    ) and not exists (
      select 1 from public.map_items item join public.map_shop_catalog catalog on catalog.item_type = item.item_type
      where item.user_id = owner_id and item.id::text <> moving_id and item.x is not null
        and position_x < item.x + case when item.rotation % 2 = 0 then catalog.width else catalog.depth end
        and position_x + item_width > item.x
        and position_z < item.z + case when item.rotation % 2 = 0 then catalog.depth else catalog.width end
        and position_z + item_depth > item.z
    );
$$;

create or replace function public.map_shop_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.map_wallets (user_id) values (owner_id) on conflict do nothing;
  select jsonb_build_object(
    'balance', wallet.balance, 'earned', wallet.earned, 'rewardCount', wallet.earned / 100,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', item.id, 'itemType', item.item_type,
      'x', item.x, 'z', item.z, 'rotation', item.rotation, 'createdAt', item.created_at) order by item.created_at, item.id)
      from public.map_items item where item.user_id = owner_id), '[]'::jsonb),
    'layouts', coalesce((select jsonb_agg(jsonb_build_object('id', object_id, 'x', x, 'z', z, 'rotation', rotation) order by object_id)
      from public.map_layouts where user_id = owner_id), '[]'::jsonb)
  ) into result from public.map_wallets wallet where wallet.user_id = owner_id;
  return result;
end;
$$;

create or replace function public.map_shop_buy(p_item_type text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); item_price integer; wallet_balance integer;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  insert into public.map_wallets (user_id) values (owner_id) on conflict do nothing;
  select balance into wallet_balance from public.map_wallets where user_id = owner_id for update;
  if exists (select 1 from public.map_items where id = p_request_id) then
    if not exists (select 1 from public.map_items where id = p_request_id and user_id = owner_id and item_type = p_item_type) then
      raise exception 'INVALID_REQUEST';
    end if;
    return public.map_shop_state();
  end if;
  select price into item_price from public.map_shop_catalog where item_type = p_item_type;
  if item_price is null then raise exception 'INVALID_ITEM'; end if;
  if wallet_balance < item_price then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.map_items (id, user_id, item_type, price_paid) values (p_request_id, owner_id, p_item_type, item_price);
  update public.map_wallets set balance = balance - item_price where user_id = owner_id;
  return public.map_shop_state();
end;
$$;

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
    if p_x < -10 or p_z < -7 or p_x + item_width > 33 or p_z + item_depth > public.map_village_depth(owner_id) then raise exception 'INVALID_POSITION'; end if;
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

revoke all on function public.reward_submitted_application() from public, anon, authenticated;
revoke all on function public.map_shop_state(), public.map_shop_buy(text, uuid), public.map_shop_place(uuid, integer, integer, integer) from public, anon;
grant execute on function public.map_shop_state(), public.map_shop_buy(text, uuid), public.map_shop_place(uuid, integer, integer, integer) to authenticated;
revoke all on function public.map_village_depth(uuid), public.map_village_objects(uuid), public.map_position_free(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.map_move_object(text, integer, integer, integer) from public, anon;
grant execute on function public.map_move_object(text, integer, integer, integer) to authenticated;
