-- Security re-audit 2026-11-17: cvs.storage_path is user-writable (RLS "authenticated users own cvs" = any text in own rows).
-- Service-role code (account deletion) used to trust it, so a row could point at ANOTHER user's file
-- (<victim-uid>/doc-…/file.pdf) and the service role removed it. The server now ignores foreign paths
-- (lib/account-delete-server.ts isOwnObjectPath); this constraint keeps the column honest for every future consumer:
-- a recorded path must lie inside the owner's own folder "<user_id>/…" (the storage policy enforces the same folder
-- for uploads), without empty, "." or ".." segments.
-- ADDITIVE + idempotent: NOT VALID, so existing rows are not re-checked (no failure on legacy data); new inserts and
-- every update of a row are checked. Validate later with:  alter table public.cvs validate constraint cvs_storage_path_own_folder;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cvs_storage_path_own_folder' and conrelid = 'public.cvs'::regclass) then
    alter table public.cvs add constraint cvs_storage_path_own_folder check (
      storage_path is null or (
        user_id is not null
        and length(storage_path) <= 1024
        and split_part(storage_path, '/', 1) = user_id::text
        and storage_path ~ '^[^/]+(/[^/]+)+$'
        and storage_path !~ '(^|/)\.{1,2}(/|$)'
        and storage_path !~ '[\\[:cntrl:]]'
      )
    ) not valid;
  end if;
end $$;
