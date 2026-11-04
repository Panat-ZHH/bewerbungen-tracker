-- Read-only island view for ACCEPTED friends.
-- The map_* tables keep their "own rows only" SELECT policies and have no insert/update/delete policies or grants,
-- so a friend can never read or change them directly. Instead this SECURITY DEFINER function returns a sanitized,
-- read-only snapshot after checking: signed in, accepted friendship, and the owner's "share with friends" setting.
-- Private application data is NEVER returned: no company, position, location, notes, salary, links, deadlines.
-- Houses only carry a pseudonymous id ("h0001" ...), their creation date (for the layout order) and the status
-- (the building stage, which the friends privacy panel already lists as "Deinen Fortschritt auf der Karte").

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
    select a.id as real_id, a.status, a.created_at,
      'h' || lpad(row_number() over (order by a.created_at, a.id)::text, 4, '0') as pseudo_id
    from public.applications a where a.user_id = p_friend_id
  )
  select jsonb_build_object(
    'userId', friend.user_id,
    'displayName', friend.display_name,
    'islands', public.map_islands_count(p_friend_id),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('id', h.pseudo_id, 'status', h.status, 'createdAt', h.created_at) order by h.pseudo_id) from houses h), '[]'::jsonb),
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
