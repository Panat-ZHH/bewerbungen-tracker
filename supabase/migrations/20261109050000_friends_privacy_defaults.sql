-- Friends privacy defaults (UX review item 13): no comparison pressure, results only for me.
-- 1) Company names on the friend island are OFF by default (opt-in). Existing rows are switched off ONCE
--    (guard: only while the column default is still "true"), so re-running never overrides a later user choice.
-- 2) New switch share_outcomes_with_friends (default OFF): Zusagen / Absagen / Rückzüge are masked server-side
--    for friends, both on the island (building stage) and in the friends overview (status counts).
--    Masked statuses are reported as 'applied'. Whitelist: saved, preparing, applied, interview, final_interview.
-- Enforcement is in SECURITY DEFINER functions only; applications keeps its "own rows only" RLS.

do $$
begin
  if exists (
    select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.user_roles'::regclass and a.attname = 'share_companies_with_friends' and pg_get_expr(d.adbin, d.adrelid) = 'true'
  ) then
    update public.user_roles set share_companies_with_friends = false;
    alter table public.user_roles alter column share_companies_with_friends set default false;
  end if;
end $$;

alter table public.user_roles add column if not exists share_outcomes_with_friends boolean not null default false;

create or replace function public.social_get_share_companies()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); value boolean;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.share_companies_with_friends into value from public.user_roles r where r.user_id = uid;
  return coalesce(value, false);
end;
$$;

create or replace function public.social_get_share_outcomes()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); value boolean;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.share_outcomes_with_friends into value from public.user_roles r where r.user_id = uid;
  return coalesce(value, false);
end;
$$;

create or replace function public.social_set_share_outcomes(p_share boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_share is null then raise exception 'INVALID_VALUE'; end if;
  update public.user_roles r set share_outcomes_with_friends = p_share where r.user_id = uid;
  return p_share;
end;
$$;

-- Friend-facing status: results are hidden unless the owner opted in.
create or replace function public._soc_friend_status(p_status text, p_share_outcomes boolean)
returns text language sql immutable set search_path = '' as $$
  select case when p_share_outcomes or p_status in ('saved', 'preparing', 'applied', 'interview', 'final_interview') then p_status else 'applied' end;
$$;

create or replace function public._soc_status_counts_friend(p_user uuid, p_share_outcomes boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
  from (select public._soc_friend_status(a.status, p_share_outcomes) as status, count(*)::integer as n
        from public.applications a where a.user_id = p_user group by 1) s;
$$;

revoke all on function public.social_get_share_outcomes() from public, anon;
revoke all on function public.social_set_share_outcomes(boolean) from public, anon;
revoke all on function public._soc_friend_status(text, boolean) from public, anon, authenticated;
revoke all on function public._soc_status_counts_friend(uuid, boolean) from public, anon, authenticated;
grant execute on function public.social_get_share_outcomes() to authenticated;
grant execute on function public.social_set_share_outcomes(boolean) to authenticated;

create or replace function public.social_friends_overview()
returns table (user_id uuid, display_name text, avatar_seed text, shared boolean, total integer, status_counts jsonb, map_points_earned integer, map_items integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select r.user_id, r.display_name, r.avatar_seed, r.share_with_friends,
      case when r.share_with_friends then (select count(*)::integer from public.applications a where a.user_id = r.user_id) end,
      case when r.share_with_friends then public._soc_status_counts_friend(r.user_id, r.share_outcomes_with_friends) end,
      case when r.share_with_friends then coalesce((select w.earned from public.map_wallets w where w.user_id = r.user_id), 0) end,
      case when r.share_with_friends then (select count(*)::integer from public.map_items i where i.user_id = r.user_id) end
    from public.friendships f
    join public.user_roles r on r.user_id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and uid in (f.requester_id, f.addressee_id)
    order by r.display_name, r.user_id;
end;
$$;

create or replace function public.map_friend_island(p_friend_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  friend public.user_roles;
  result jsonb;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_friend_id is null or p_friend_id = viewer then raise exception 'NOT_FRIENDS'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = viewer and f.addressee_id = p_friend_id) or (f.requester_id = p_friend_id and f.addressee_id = viewer))
  ) then raise exception 'NOT_FRIENDS'; end if;
  select * into friend from public.user_roles where user_id = p_friend_id;
  if not found then raise exception 'NOT_FRIENDS'; end if;
  if not friend.share_with_friends then raise exception 'NOT_SHARED'; end if;

  with houses as (
    select a.id as real_id, public._soc_friend_status(a.status, friend.share_outcomes_with_friends) as status, a.created_at, left(btrim(a.company), 80) as company,
      'h' || lpad(row_number() over (order by a.created_at, a.id)::text, 4, '0') as pseudo_id
    from public.applications a where a.user_id = p_friend_id
  )
  select jsonb_build_object(
    'userId', friend.user_id,
    'displayName', friend.display_name,
    'islands', public.map_islands_count(p_friend_id),
    'companiesShared', friend.share_companies_with_friends,
    'outcomesShared', friend.share_outcomes_with_friends,
    'applications', coalesce((select jsonb_agg(
        jsonb_build_object('id', h.pseudo_id, 'status', h.status, 'createdAt', h.created_at)
        || case when friend.share_companies_with_friends and h.company <> '' then jsonb_build_object('company', h.company) else '{}'::jsonb end
        order by h.pseudo_id) from houses h), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'itemType', i.item_type, 'x', i.x, 'z', i.z, 'rotation', i.rotation, 'createdAt', i.created_at) order by i.created_at, i.id)
      from public.map_items i where i.user_id = p_friend_id), '[]'::jsonb),
    'layouts', coalesce((select jsonb_agg(jsonb_build_object('id', 'house:' || h.pseudo_id, 'x', l.x, 'z', l.z, 'rotation', l.rotation) order by h.pseudo_id)
      from public.map_layouts l join houses h on 'house:' || h.real_id = l.object_id where l.user_id = p_friend_id), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.map_friend_island(uuid) from public, anon;
grant execute on function public.map_friend_island(uuid) to authenticated;
