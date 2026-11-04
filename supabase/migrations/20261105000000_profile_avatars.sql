-- Profile pictures. NOT applied automatically: Panat decides when to run it.
-- Needs 20260101000000_schema.sql and 20260101000001_social.sql first. Idempotent.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_url_length;
alter table public.profiles add constraint profiles_avatar_url_length check (avatar_url is null or length(avatar_url) <= 500);

-- Public-read bucket (avatars are shown to friends and teachers); 1 MB is plenty for a 512px WebP/JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Writes only inside the caller's own <user_id>/ folder. Reads of the objects API are limited the same way;
-- the public URL (CDN) works for everybody without a policy because the bucket is public.
drop policy if exists "avatars select own folder" on storage.objects;
drop policy if exists "avatars insert own folder" on storage.objects;
drop policy if exists "avatars update own folder" on storage.objects;
drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars select own folder" on storage.objects for select to authenticated using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars insert own folder" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars update own folder" on storage.objects for update to authenticated using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars delete own folder" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Avatar URLs of people the caller may see: themself, accepted friends, and students of the caller's classes (teacher view).
-- profiles stays private (own row only); this is the only cross-user read path.
create or replace function public.social_avatars(p_user_ids uuid[])
returns table (user_id uuid, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select p.user_id, p.avatar_url
    from public.profiles p
    where p.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
      and p.avatar_url is not null
      and (
        p.user_id = uid
        or exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = uid and f.addressee_id = p.user_id) or (f.addressee_id = uid and f.requester_id = p.user_id)))
        or exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id where c.teacher_id = uid and m.student_id = p.user_id)
      )
    limit 500;
end;
$$;
revoke all on function public.social_avatars(uuid[]) from public, anon;
grant execute on function public.social_avatars(uuid[]) to authenticated;
