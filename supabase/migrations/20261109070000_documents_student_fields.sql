-- P0 part i3: "Meine Dokumente" (kinds, private bucket limits, attach to applications),
-- student profile fields, application contact fields, Berufsfelder = 13 search categories.
-- Idempotent and additive. The table public.cvs and the bucket "cvs" are kept (account deletion depends on them).

-- 1. Document kinds ---------------------------------------------------------------------------------------------
alter table public.cvs add column if not exists kind text not null default 'lebenslauf';
alter table public.cvs drop constraint if exists cvs_kind_check;
alter table public.cvs add constraint cvs_kind_check
  check (kind in ('lebenslauf', 'motivationsschreiben', 'zeugnisse', 'foto', 'sonstiges'));

-- The old signup trigger created three adult CV placeholders (Entwickler / Vertrieb / Finanz). Stop that and
-- remove the empty generated placeholders; every uploaded file stays and becomes a "Lebenslauf".
create or replace function public.create_default_cvs_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return new;
end;
$$;

delete from public.cvs
where storage_path is null
  and id like 'cv-%'
  and type in ('developer', 'sales', 'finance');

-- 2. Private bucket limits: owner-only (policy from the base schema), pdf/jpg/png, 5 MB -----------------------------
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'cvs';

drop policy if exists "authenticated users manage cv files" on storage.objects;
create policy "authenticated users manage cv files" on storage.objects
  for all to authenticated
  using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

-- 3. Documents attached to applications (owner-only) ------------------------------------------------------------
create table if not exists public.application_documents (
  application_id text not null references public.applications(id) on delete cascade,
  document_id text not null references public.cvs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (application_id, document_id)
);
create index if not exists application_documents_user_idx on public.application_documents (user_id);
create index if not exists application_documents_document_idx on public.application_documents (document_id);

alter table public.application_documents enable row level security;
grant select, insert, update, delete on public.application_documents to authenticated;
drop policy if exists "owner manages application documents" on public.application_documents;
create policy "owner manages application documents" on public.application_documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
    and exists (select 1 from public.cvs d where d.id = document_id and d.user_id = auth.uid())
  );

-- 4. Student profile fields (replace Webseite / LinkedIn in the UI; old columns stay) ---------------------------------
alter table public.profiles add column if not exists school text;
alter table public.profiles add column if not exists grade_level text;
alter table public.profiles add column if not exists desired_profession text;
alter table public.profiles drop constraint if exists profiles_student_fields_length;
alter table public.profiles add constraint profiles_student_fields_length
  check (coalesce(length(school), 0) <= 120 and coalesce(length(grade_level), 0) <= 60 and coalesce(length(desired_profession), 0) <= 120);

-- 5. Contact person per application ------------------------------------------------------------------------------
alter table public.applications add column if not exists contact_name text;
alter table public.applications add column if not exists contact_info text;

-- 6. Berufsfelder: map the old adult categories onto the 13 search categories ----------------------------------------
update public.applications set category = case category
  when 'software' then 'informatik'
  when 'sales' then 'detailhandel'
  when 'business' then 'kaufmaennisch'
  when 'finance' then 'finanz-recht'
  when 'banking' then 'finanz-recht'
  when 'consulting' then 'kaufmaennisch'
  else category end
where category in ('software', 'sales', 'business', 'finance', 'banking', 'consulting');
