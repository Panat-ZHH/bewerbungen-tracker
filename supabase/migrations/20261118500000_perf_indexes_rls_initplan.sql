-- Perf round 2026-11-17 (branch perf). ADDITIVE, no data change, no change of who may see or write what.
--
-- 1) Indexes on the per-user columns the app filters by and on every foreign key that had none (Supabase advisor
--    "unindexed_foreign_keys"). Today the tables are tiny (applications 74 rows), but every page filters by user_id and
--    deleting a user cascades through these columns: without an index each of them is a full table scan once schools come in.
create index if not exists applications_user_updated_idx on public.applications (user_id, updated_at desc);
create index if not exists cvs_user_updated_idx on public.cvs (user_id, updated_at desc);
create index if not exists map_items_user_idx on public.map_items (user_id);
create index if not exists map_items_item_type_idx on public.map_items (item_type);
create index if not exists map_islands_island_no_idx on public.map_islands (island_no);
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists class_invitations_created_by_idx on public.class_invitations (created_by);
create index if not exists class_announcements_author_idx on public.class_announcements (author_id);
create index if not exists class_notifications_actor_idx on public.class_notifications (actor_id);
create index if not exists class_student_aliases_student_idx on public.class_student_aliases (student_id);
create index if not exists class_student_aliases_set_by_idx on public.class_student_aliases (set_by);
create index if not exists class_deadlines_created_by_idx on public.class_deadlines (created_by);
create index if not exists class_view_log_teacher_idx on public.class_view_log (teacher_id);
create index if not exists class_goals_created_by_idx on public.class_goals (created_by);
create index if not exists families_created_by_idx on public.families (created_by);
create index if not exists family_members_consent_by_idx on public.family_members (consent_by);
create index if not exists family_invites_created_by_idx on public.family_invites (created_by);
create index if not exists family_invites_used_by_idx on public.family_invites (used_by);
create index if not exists waitlist_requests_user_idx on public.waitlist_requests (user_id);
create index if not exists billing_customers_created_by_idx on public.billing_customers (created_by);
create index if not exists billing_subscriptions_licence_idx on public.billing_subscriptions (licence_id);
create index if not exists school_teachers_added_by_idx on public.school_teachers (added_by);

-- 2) RLS "initplan" (Supabase advisor "auth_rls_initplan"): a bare auth.uid() in a policy is evaluated for EVERY row,
--    (select auth.uid()) once per statement. Same value, same rule, so the semantics are identical.
--    Done at apply time on the CURRENT policy text (not a copy of it), so a policy changed by an earlier migration of the
--    same release (free-forever, admin-security) keeps that change; only the bare auth.uid() calls are wrapped.
--    Idempotent: Postgres prints a wrapped call as "( SELECT auth.uid() AS uid)", which the pattern skips.
do $perf$
declare
  r record;
  bare constant text := '(?<!SELECT )auth\.uid\(\)';
  stmt text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ bare or coalesce(with_check, '') ~ bare)
  loop
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if r.qual is not null then
      stmt := stmt || format(' using (%s)', regexp_replace(r.qual, bare, '(select auth.uid())', 'g'));
    end if;
    if r.with_check is not null then
      stmt := stmt || format(' with check (%s)', regexp_replace(r.with_check, bare, '(select auth.uid())', 'g'));
    end if;
    execute stmt;
  end loop;
end
$perf$;
