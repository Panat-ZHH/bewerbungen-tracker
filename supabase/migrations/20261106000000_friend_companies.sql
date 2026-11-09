-- Friends may see WHICH COMPANIES a user applied to on the friend island (company name only, nothing else).
-- Enforced on the server: the applications table keeps its "own rows only" RLS, friends never select raw rows.
-- map_friend_island (SECURITY DEFINER) still checks: signed in, ACCEPTED friendship, owner's share_with_friends,
-- and now additionally the owner's share_companies_with_friends switch (default on, can be turned off).
-- Per house it returns only: pseudonymous id, building status (as before), createdAt (layout order) and, if shared,
-- the trimmed company name (max. 80 chars). NEVER: position, location, dates, salary, notes, links, contacts, documents.

alter table public.user_roles add column if not exists share_companies_with_friends boolean not null default true;

create or replace function public.social_get_share_companies()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); value boolean;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.share_companies_with_friends into value from public.user_roles r where r.user_id = uid;
  return coalesce(value, true);
end;
$$;

create or replace function public.social_set_share_companies(p_share boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_share is null then raise exception 'INVALID_VALUE'; end if;
  update public.user_roles r set share_companies_with_friends = p_share where r.user_id = uid;
  return p_share;
end;
$$;

revoke all on function public.social_get_share_companies() from public, anon;
revoke all on function public.social_set_share_companies(boolean) from public, anon;
grant execute on function public.social_get_share_companies() to authenticated;
grant execute on function public.social_set_share_companies(boolean) to authenticated;

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
    select a.id as real_id, a.status, a.created_at, left(btrim(a.company), 80) as company,
      'h' || lpad(row_number() over (order by a.created_at, a.id)::text, 4, '0') as pseudo_id
    from public.applications a where a.user_id = p_friend_id
  )
  select jsonb_build_object(
    'userId', friend.user_id,
    'displayName', friend.display_name,
    'islands', public.map_islands_count(p_friend_id),
    'companiesShared', friend.share_companies_with_friends,
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
