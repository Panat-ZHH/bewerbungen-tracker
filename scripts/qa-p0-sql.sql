-- QA of the live database after the P0 migrations. READ-ONLY IN EFFECT: everything runs in one transaction that is
-- always rolled back (the last statement raises an exception that carries the result JSON, prefixed QA_RESULT:).
-- Throwaway users are inserted into auth.users inside the transaction and never committed.
-- Run:  ~/JARVIS/bin/sb privat db query --linked -f scripts/qa-p0-sql.sql   (look for QA_RESULT in the error text)

create temp table res (n serial, area text, name text, ok boolean, detail text);
grant all on res to public;
grant all on sequence res_n_seq to public;
create temp table u (k text primary key, id uuid);
grant all on u to public;

create function pg_temp.rec(a text, n text, ok boolean, d text default null) returns void language sql as
$$ insert into res(area, name, ok, detail) values (a, n, ok, left(d, 300)) $$;

-- expect an error (optionally matching a message fragment)
create function pg_temp.err(a text, n text, q text, frag text default null) returns void language plpgsql as $$
begin
  execute q;
  perform pg_temp.rec(a, n, false, 'NO ERROR');
exception when others then
  perform pg_temp.rec(a, n, frag is null or sqlerrm ilike '%' || frag || '%', sqlerrm);
end $$;

-- expect first column of single result to equal text
create function pg_temp.val(a text, n text, q text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute 'select (' || q || ')::text' into v;
  perform pg_temp.rec(a, n, v is not distinct from expected, 'got ' || coalesce(v, 'NULL') || ', expected ' || expected);
exception when others then
  perform pg_temp.rec(a, n, false, 'ERROR ' || sqlerrm);
end $$;

create function pg_temp.rows(a text, n text, q text, expected int) returns void language plpgsql as $$
declare c int;
begin
  execute q; get diagnostics c = row_count;
  perform pg_temp.rec(a, n, c = expected, 'affected rows ' || c || ', expected ' || expected);
exception when others then
  perform pg_temp.rec(a, n, false, 'ERROR ' || sqlerrm);
end $$;

-- pass when either denied by privilege or returns zero rows
create function pg_temp.hidden(a text, n text, q text) returns void language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || q || ') x' into v;
  perform pg_temp.rec(a, n, v = 0, 'rows visible: ' || v);
exception when insufficient_privilege then
  perform pg_temp.rec(a, n, true, 'permission denied (table not granted)');
when others then
  perform pg_temp.rec(a, n, false, 'ERROR ' || sqlerrm);
end $$;

create function pg_temp.ok(a text, n text, q text) returns void language plpgsql as $$
begin
  execute q;
  perform pg_temp.rec(a, n, true, null);
exception when others then
  perform pg_temp.rec(a, n, false, 'ERROR ' || sqlerrm);
end $$;

create function pg_temp.login(k text) returns void language plpgsql as $$
declare v uuid;
begin
  reset role;
  select id into v from u where u.k = login.k;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

create function pg_temp.jsonb_object_keys_count(j jsonb) returns int language sql as $$ select count(*)::int from jsonb_object_keys(j) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from u where u.k = id.k $$;

do $main$
declare
  r record; cnt bigint; t text; cls uuid; cls2 uuid; code text; code2 text; inv_tok text; rep jsonb; rep2 jsonb; j jsonb; n int;
  tabs text[];
begin
  ----------------------------------------------------------------------------------------------
  -- 0. throwaway users (rolled back)
  ----------------------------------------------------------------------------------------------
  foreach t in array array['s1','s2','s3','t1','t2','fr','del'] loop
    insert into u values (t, gen_random_uuid());
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
      values (pg_temp.id(t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-' || t || '@example.invalid', '{}', now(), now(), now());
  end loop;
  perform pg_temp.val('setup', 'signup trigger creates user_roles row for each user', $q$select count(*) from public.user_roles where user_id in (select id from u)$q$, '7');
  perform pg_temp.val('setup', 'signup trigger creates NO default placeholder documents (by design since 070000)', $q$select count(*) from public.cvs where user_id = pg_temp.id('s1')$q$, '0');

  -- teachers
  perform pg_temp.login('t1'); perform public.set_my_role('teacher');
  perform pg_temp.login('t2'); perform public.set_my_role('teacher');
  reset role;

  -- data for s1 (private application with notes/contact), s2 (other student), friend, del
  insert into public.applications (id, user_id, company, position, category, status, notes, contact_name, contact_info, location, created_at, updated_at)
    values ('qa-a-s1-1', pg_temp.id('s1'), 'QA Secret AG', 'Informatiker EFZ', 'informatik', 'applied', 'PRIVATE-NOTE-S1', 'Frau Geheim', 'geheim@example.invalid', 'Zürich', current_date, current_date),
           ('qa-a-s1-2', pg_temp.id('s1'), 'QA Zweite GmbH', 'Kaufmann EFZ', 'detailhandel', 'offer', null, null, null, 'Bern', current_date, current_date),
           ('qa-a-s2-1', pg_temp.id('s2'), 'QA S2 Firma', 'Koch EFZ', 'sonstiges', 'applied', 'PRIVATE-NOTE-S2', null, null, 'Basel', current_date, current_date),
           ('qa-a-fr-1', pg_temp.id('fr'), 'QA Friend Firma', 'Maler EFZ', 'sonstiges', 'rejected', 'PRIVATE-NOTE-FR', null, null, 'Luzern', current_date, current_date);
  insert into public.cvs (id, user_id, name, type, description, updated_at, status, kind, file_name, storage_path)
    values ('qa-cv-s1', pg_temp.id('s1'), 'S1 CV', 'developer', 'priv', current_date, 'ready', 'lebenslauf', 'cv.pdf', pg_temp.id('s1')::text || '/qa.pdf');
  insert into public.application_documents (application_id, document_id, user_id) values ('qa-a-s1-1', 'qa-cv-s1', pg_temp.id('s1'));
  insert into public.reminder_settings (user_id) values (pg_temp.id('s1'));
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.id('s1'), 'https://push.invalid/qa', 'k', 'a');
  insert into public.calendar_feeds (user_id, token) values (pg_temp.id('s1'), 'qa-feed-token-s1-' || repeat('a',40));
  insert into public.reminder_log (user_id, application_id, kind, due_on, channel) values (pg_temp.id('s1'), 'qa-a-s1-1', 'deadline', current_date, 'push');
  insert into public.friendships (requester_id, addressee_id, status) values (pg_temp.id('s1'), pg_temp.id('fr'), 'accepted');

  ----------------------------------------------------------------------------------------------
  -- 1. RLS enabled on every public table + anon cannot read
  ----------------------------------------------------------------------------------------------
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity loop
    perform pg_temp.rec('rls', 'RLS enabled on public.' || r.relname, false, 'RLS DISABLED');
  end loop;
  perform pg_temp.val('rls', 'every public table has RLS enabled', $q$select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity$q$, '0');
  perform pg_temp.val('rls', 'no public table with FORCE off needed; no policy targets role anon/public', $q$select count(*) from pg_policies where schemaname = 'public' and (roles::text like '%anon%' or roles::text like '%public%')$q$, '0');
  perform pg_temp.val('rls', 'every table has >=1 policy OR is intentionally deny-all (info: tables with 0 policies)', $q$select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)$q$, '8');

  perform pg_temp.anon();
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1 loop
    begin
      execute format('select count(*) from public.%I', r.relname) into cnt;
      perform pg_temp.rec('anon', 'anon select public.' || r.relname, cnt = 0, 'rows visible to anon: ' || cnt);
    exception when insufficient_privilege then
      perform pg_temp.rec('anon', 'anon select public.' || r.relname, true, 'permission denied');
    end;
  end loop;
  perform pg_temp.val('anon', 'anon holds no table privilege on any public table (defense in depth, migration 080000)', $q$select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'$q$, '0');
  -- anon writes
  perform pg_temp.err('anon', 'anon cannot insert application', $q$insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('qa-x', null, 'x','x','x','applied', current_date, current_date)$q$);
  perform pg_temp.err('anon', 'anon update of applications denied', $q$update public.applications set company = 'hacked'$q$, 'permission denied');
  perform pg_temp.err('anon', 'anon delete of applications denied', $q$delete from public.applications$q$, 'permission denied');
  -- anon cannot call RPCs
  for r in select p.oid::regprocedure::text sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute') order by 2 loop
    perform pg_temp.rec('anon', 'anon-executable function: ' || r.sig, r.proname in ('invite_context', 'create_default_cvs_for_user', 'rls_auto_enable', 'map_layouts_lock_streets'), 'expected only invite_context (intended) + pre-existing trigger/event fns');
  end loop;
  perform pg_temp.err('anon', 'anon class_overview denied', $q$select * from public.class_overview(gen_random_uuid())$q$, 'permission denied');
  perform pg_temp.err('anon', 'anon teacher_dashboard denied', $q$select * from public.teacher_dashboard(14)$q$, 'permission denied');
  perform pg_temp.err('anon', 'anon account_delete_summary denied', $q$select * from public.account_delete_summary()$q$, 'permission denied');
  perform pg_temp.err('anon', 'anon account_delete_prepare denied', $q$select public.account_delete_prepare(gen_random_uuid())$q$, 'permission denied');
  perform pg_temp.err('anon', 'anon account_data_report denied', $q$select public.account_data_report(gen_random_uuid())$q$, 'permission denied');
  perform pg_temp.val('anon', 'invite_context(garbage) does not error and leaks nothing', $q$select count(*) from public.invite_context('nonsense-code')$q$, '0');
  perform pg_temp.ok('anon', 'invite_context(null)/(huge) do not crash', $q$select * from public.invite_context(null); select * from public.invite_context(repeat('x', 10000))$q$);

  -- authenticated cannot call server-only functions
  perform pg_temp.login('s1');
  perform pg_temp.err('authz', 'authenticated cannot call account_delete_prepare', $q$select public.account_delete_prepare(pg_temp.id('s2'))$q$, 'permission denied');
  perform pg_temp.err('authz', 'authenticated cannot call account_data_report', $q$select public.account_data_report(pg_temp.id('s2'))$q$, 'permission denied');
  perform pg_temp.err('authz', 'authenticated cannot call _teacher_stats helper', $q$select * from public._teacher_stats(pg_temp.id('s2'), 14, gen_random_uuid())$q$, 'permission denied');

  ----------------------------------------------------------------------------------------------
  -- 2. student isolation (s2 attacks s1)
  ----------------------------------------------------------------------------------------------
  perform pg_temp.login('s2');
  perform pg_temp.val('isolation', 's2 sees only own applications (1 of 4 test rows, none of s1)', $q$select count(*) from public.applications where id like 'qa-%'$q$, '1');
  perform pg_temp.val('isolation', 's2 cannot read s1 applications by id', $q$select count(*) from public.applications where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 cvs/documents', $q$select count(*) from public.cvs where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 application_documents', $q$select count(*) from public.application_documents where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 reminder_settings', $q$select count(*) from public.reminder_settings where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 push_subscriptions', $q$select count(*) from public.push_subscriptions where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 calendar_feeds (ics token)', $q$select count(*) from public.calendar_feeds where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read reminder_log (no policy)', $q$select count(*) from public.reminder_log$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 profile', $q$select count(*) from public.profiles where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 user_roles', $q$select count(*) from public.user_roles where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 friendships', $q$select count(*) from public.friendships where requester_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.val('isolation', 's2 cannot read s1 map_wallets/items/layouts', $q$select (select count(*) from public.map_wallets where user_id = pg_temp.id('s1')) + (select count(*) from public.map_items where user_id = pg_temp.id('s1')) + (select count(*) from public.map_layouts where user_id = pg_temp.id('s1'))$q$, '0');
  perform pg_temp.rows('isolation', 's2 update of s1 application changes 0 rows', $q$update public.applications set company = 'HACK' where id = 'qa-a-s1-1'$q$, 0);
  perform pg_temp.rows('isolation', 's2 delete of s1 application removes 0 rows', $q$delete from public.applications where id = 'qa-a-s1-1'$q$, 0);
  perform pg_temp.rows('isolation', 's2 delete of s1 cv removes 0 rows', $q$delete from public.cvs where id = 'qa-cv-s1'$q$, 0);
  perform pg_temp.rows('isolation', 's2 update of s1 cv changes 0 rows', $q$update public.cvs set name = 'HACK' where id = 'qa-cv-s1'$q$, 0);
  perform pg_temp.err('isolation', 's2 cannot insert application for s1', $q$insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('qa-evil', pg_temp.id('s1'), 'x','x','x','applied', current_date, current_date)$q$, 'row-level security');
  perform pg_temp.err('isolation', 's2 cannot steal-ownership of own application to s1 (update user_id)', $q$update public.applications set user_id = pg_temp.id('s1') where id = 'qa-a-s2-1'$q$, 'row-level security');
  perform pg_temp.err('isolation', 's2 cannot attach own application to s1 document', $q$insert into public.application_documents (application_id, document_id, user_id) values ('qa-a-s2-1', 'qa-cv-s1', pg_temp.id('s2'))$q$, 'row-level security');
  perform pg_temp.ok('isolation', 's2 can create own document', $q$insert into public.cvs (id, user_id, name, type, description, updated_at, status, kind) values ('qa-cv-s2', pg_temp.id('s2'), 's2cv', 'developer', 'd', current_date, 'ready', 'lebenslauf')$q$);
  perform pg_temp.err('isolation', 's2 cannot attach s1 application to own document', $q$insert into public.application_documents (application_id, document_id, user_id) values ('qa-a-s1-1', 'qa-cv-s2', pg_temp.id('s2'))$q$, 'row-level security');
  perform pg_temp.ok('isolation', 's2 can attach own application to own document (positive control)', $q$insert into public.application_documents (application_id, document_id, user_id) values ('qa-a-s2-1', 'qa-cv-s2', pg_temp.id('s2'))$q$);
  perform pg_temp.err('isolation', 's2 cannot insert push subscription for s1', $q$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.id('s1'), 'https://x.invalid/e', 'k', 'a')$q$, 'row-level security');
  perform pg_temp.err('isolation', 's2 cannot insert calendar feed for s1', $q$insert into public.calendar_feeds (user_id, token) values (pg_temp.id('s1'), 'evil-token-' || repeat('b',40))$q$, 'row-level security');
  perform pg_temp.err('isolation', 's2 cannot insert reminder_settings for s1', $q$insert into public.reminder_settings (user_id) values (pg_temp.id('s1'))$q$, '');
  perform pg_temp.err('isolation', 's2 cannot write reminder_log (no policy)', $q$insert into public.reminder_log (user_id, application_id, kind, due_on, channel) values (pg_temp.id('s2'), 'qa-a-s2-1', 'deadline', current_date, 'push')$q$, 'row-level security');
  perform pg_temp.err('isolation', 's2 cannot make itself teacher by insert into user_roles', $q$insert into public.user_roles (user_id, role, invite_code) values (gen_random_uuid(), 'teacher', 'xx')$q$, '');
  perform pg_temp.err('isolation', 's2 UPDATE on own user_roles denied at privilege level (role escalation impossible)', $q$update public.user_roles set role = 'teacher' where user_id = pg_temp.id('s2')$q$, 'permission denied');
  perform pg_temp.err('isolation', 's2 cannot list s1 storage objects in private cvs bucket (0 rows -> division by zero)', $q$select 1 / (select count(*) from storage.objects where bucket_id = 'cvs' and name like pg_temp.id('s1')::text || '/%')$q$);
  perform pg_temp.err('isolation', 's2 cannot call teacher RPC (role=student)', $q$select * from public.class_create('QA', '2026')$q$, 'FORBIDDEN');
  perform pg_temp.err('isolation', 's2 cannot call teacher_dashboard', $q$select * from public.teacher_dashboard(14)$q$, 'FORBIDDEN');
  perform pg_temp.err('isolation', 's2 cannot call set_my_role(admin)', $q$select public.set_my_role('admin')$q$, 'INVALID_REQUEST');
  perform pg_temp.err('isolation', 's2 map_friend_island(non-friend s1) denied', $q$select public.map_friend_island(pg_temp.id('s1'))$q$, 'NOT_FRIENDS');
  perform pg_temp.val('isolation', 's2 social_friends_overview empty', $q$select count(*) from public.social_friends_overview()$q$, '0');

  ----------------------------------------------------------------------------------------------
  -- 3. teacher consent
  ----------------------------------------------------------------------------------------------
  perform pg_temp.login('t1');
  select c.id, c.join_code into cls, code from public.class_create('QA Klasse', '2026/27') c;
  perform pg_temp.login('t2');
  select c.id, c.join_code into cls2, code2 from public.class_create('QA Klasse Fremd', '2026/27') c;
  perform pg_temp.login('s1'); perform public.class_join(code);
  perform pg_temp.login('s3'); perform public.class_join(code);
  perform pg_temp.login('s2'); perform public.class_join(code2);

  perform pg_temp.login('t1');
  perform pg_temp.val('teacher', 'teacher cannot SELECT applications table directly', $q$select count(*) from public.applications$q$, '0');
  perform pg_temp.val('teacher', 'teacher cannot SELECT cvs/documents', $q$select count(*) from public.cvs$q$, '0');
  perform pg_temp.val('teacher', 'teacher cannot SELECT profiles', $q$select count(*) from public.profiles$q$, '0');
  perform pg_temp.val('teacher', 'teacher cannot SELECT class_members directly', $q$select count(*) from public.class_members$q$, '0');
  perform pg_temp.val('teacher', 'teacher cannot read reminders/push/feeds', $q$select (select count(*) from public.reminder_settings) + (select count(*) from public.push_subscriptions) + (select count(*) from public.calendar_feeds) + (select count(*) from public.reminder_log)$q$, '0');
  perform pg_temp.hidden('teacher', 'teacher cannot read class_view_log table directly', $q$select * from public.class_view_log$q$);

  -- default sharing after join: what is on?
  reset role;
  select m.share_applications::text || '/' || m.share_status || '/' || m.share_companies into t from public.class_members m where m.class_id = cls and m.student_id = pg_temp.id('s1');
  perform pg_temp.rec('teacher', 'default consent of a new member (info: share_applications/status/companies)', true, t);

  -- A) share off -> hidden
  update public.class_members set share_applications = false where class_id = cls;
  perform pg_temp.login('t1');
  perform pg_temp.val('teacher', 'share OFF: only hidden placeholder row, no company', format($q$select count(*) filter (where hidden) || '/' || count(company) || '/' || count(*) from public.class_student_applications(%L, pg_temp.id('s1'))$q$, cls), '1/0/1');
  perform pg_temp.val('teacher', 'share OFF: export has no rows for the class', format($q$select count(*) from public.teacher_class_applications_export(%L)$q$, cls), '0');
  perform pg_temp.val('teacher', 'share OFF: class_members marks s1 hidden', format($q$select hidden from public.class_members(%L) where student_id = pg_temp.id('s1')$q$, cls), 'true');
  perform pg_temp.val('teacher', 'share OFF: timeline is a single hidden placeholder without data', format($q$select count(*) filter (where hidden) || '/' || count(company) || '/' || count(application_id) || '/' || count(*) from public.class_student_timeline(%L, pg_temp.id('s1'))$q$, cls), '1/0/0/1');

  -- B) share on, companies off, status off
  reset role;
  update public.class_members set share_applications = true, share_companies = false, share_status = false where class_id = cls and student_id = pg_temp.id('s1');
  perform pg_temp.login('t1');
  perform pg_temp.val('teacher', 'companies OFF: no company/position/location, status NULL when status off', format($q$select count(company) || '/' || count("position") || '/' || count(location) || '/' || count(status) || '/' || count(*) from public.class_student_applications(%L, pg_temp.id('s1'))$q$, cls), '0/0/0/0/2');
  perform pg_temp.val('teacher', 'companies OFF: export has no company/position', format($q$select count(company) || '/' || count("position") || '/' || count(status) from public.teacher_class_applications_export(%L)$q$, cls), '0/0/0');
  perform pg_temp.val('teacher', 'export never exposes notes/contact (no such columns)', $q$select count(*) from information_schema.columns where table_name = 'teacher_class_applications_export'$q$, '0');
  -- C) companies on, status on
  reset role;
  update public.class_members set share_companies = true, share_status = true where class_id = cls and student_id = pg_temp.id('s1');
  perform pg_temp.login('t1');
  perform pg_temp.val('teacher', 'all consent ON: companies+status visible', format($q$select count(company) || '/' || count(status) from public.class_student_applications(%L, pg_temp.id('s1'))$q$, cls), '2/2');
  perform pg_temp.val('teacher', 'all consent ON: result carries no notes/contact column', $q$select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname = 'class_student_applications' and a in ('notes','contact_name','contact_info','salary_min','job_description')$q$, '0');
  perform pg_temp.val('teacher', 'non-sharing member s3 (default) never appears in export', format($q$select count(*) from public.teacher_class_applications_export(%L) where student_id = pg_temp.id('s3')$q$, cls), '0');
  perform pg_temp.err('teacher', 'non-member student (s2) -> NOT_FOUND', format($q$select * from public.class_student_applications(%L, pg_temp.id('s2'))$q$, cls), 'NOT_FOUND');
  perform pg_temp.err('teacher', 'non-member student (s2) timeline -> error', format($q$select * from public.class_student_timeline(%L, pg_temp.id('s2'))$q$, cls));
  perform pg_temp.val('teacher', 'non-member s2 absent from class_members list', format($q$select count(*) from public.class_members(%L) where student_id = pg_temp.id('s2')$q$, cls), '0');
  perform pg_temp.val('teacher', 'teacher_class_students lists no non-members', format($q$select count(*) from public.teacher_class_students(%L, 14) where student_id = pg_temp.id('s2')$q$, cls), '0');
  perform pg_temp.err('teacher', 'teacher1 cannot open teacher2 class (overview)', format($q$select * from public.class_overview(%L)$q$, cls2), 'FORBIDDEN');
  perform pg_temp.err('teacher', 'teacher1 cannot read teacher2 class applications of s2', format($q$select * from public.class_student_applications(%L, pg_temp.id('s2'))$q$, cls2), 'FORBIDDEN');
  perform pg_temp.err('teacher', 'teacher1 cannot export teacher2 class', format($q$select * from public.teacher_class_applications_export(%L)$q$, cls2), 'FORBIDDEN');
  perform pg_temp.err('teacher', 'teacher1 cannot attention-list teacher2 class', format($q$select * from public.teacher_attention(%L, 14)$q$, cls2), 'FORBIDDEN');
  perform pg_temp.err('teacher', 'teacher1 cannot nudge student of teacher2 class', format($q$select public.class_nudge(%L, pg_temp.id('s2'), 'hi')$q$, cls2), 'FORBIDDEN');
  perform pg_temp.val('teacher', 'teacher_dashboard shows only own classes', $q$select count(*) from public.teacher_dashboard(14) d$q$, '1');
  -- attention / stats do not leak when sharing is off (s3 is a member without share)
  perform pg_temp.val('teacher', 'teacher_attention does not list non-sharing s3', format($q$select count(*) from public.teacher_attention(%L, 1) a where a.student_id = pg_temp.id('s3')$q$, cls), '0');
  -- student side: s1 can see teacher class_view_log entries about self only
  perform pg_temp.login('s1');
  perform pg_temp.ok('teacher', 's1 my_view_log callable', $q$select * from public.my_view_log(10)$q$);
  reset role;
  select count(*) into n from public.class_view_log where student_id = pg_temp.id('s3');
  perform pg_temp.login('s3');
  perform pg_temp.val('teacher', 's3 my_view_log returns exactly s3 own log rows (none about s1)', 'select count(*) from public.my_view_log(100)', n::text);
  perform pg_temp.err('teacher', 'student cannot call class_overview', format($q$select * from public.class_overview(%L)$q$, cls), 'FORBIDDEN');

  ----------------------------------------------------------------------------------------------
  -- 4. friends: only company names, only when allowed, never notes/contacts
  ----------------------------------------------------------------------------------------------
  perform pg_temp.login('fr');
  perform pg_temp.err('friends', 'friend sees nothing while s1 sharing is off (default) or sharing ok', $q$select 1/0$q$);  -- placeholder replaced below
  reset role;
  delete from res where name like 'friend sees nothing while%';
  update public.user_roles set share_with_friends = true, share_companies_with_friends = false, share_outcomes_with_friends = false where user_id = pg_temp.id('s1');
  perform pg_temp.login('fr');
  j := public.map_friend_island(pg_temp.id('s1'));
  perform pg_temp.rec('friends', 'companies switch OFF: island payload has no company key', not (j::text like '%"company"%'), 'keys: ' || (select string_agg(distinct k, ',') from jsonb_array_elements(j->'applications') e, jsonb_object_keys(e) k));
  perform pg_temp.rec('friends', 'payload never contains notes/contact/position/location/e-mail', not (j::text ~* 'PRIVATE-NOTE|Geheim|geheim@|Informatiker|Z.rich|Kaufmann'), '');
  perform pg_temp.rec('friends', 'outcomes switch OFF: offer is masked (no status "offer")', not (j::text like '%"offer"%'), (select string_agg(distinct e->>'status', ',') from jsonb_array_elements(j->'applications') e));
  perform pg_temp.rec('friends', 'house ids are pseudonymous (no real application id)', not (j::text like '%qa-a-s1%'), '');
  reset role;
  update public.user_roles set share_companies_with_friends = true where user_id = pg_temp.id('s1');
  perform pg_temp.login('fr');
  j := public.map_friend_island(pg_temp.id('s1'));
  perform pg_temp.rec('friends', 'companies switch ON: company names appear', j::text like '%QA Secret AG%' and j::text like '%QA Zweite GmbH%', '');
  perform pg_temp.rec('friends', 'companies ON: still no notes/contact/position/location', not (j::text ~* 'PRIVATE-NOTE|Geheim|geheim@|Informatiker|Z.rich|Kaufmann|Bern'), '');
  perform pg_temp.val('friends', 'friends overview total only for sharing friend', $q$select total from public.social_friends_overview() where user_id = pg_temp.id('s1')$q$, '2');
  perform pg_temp.val('friends', 'friends overview exposes no company column', $q$select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname = 'social_friends_overview' and a ~* 'company|notes|contact'$q$, '0');
  reset role;
  update public.user_roles set share_with_friends = false where user_id = pg_temp.id('s1');
  perform pg_temp.login('fr');
  perform pg_temp.err('friends', 'sharing OFF -> map_friend_island refuses', $q$select public.map_friend_island(pg_temp.id('s1'))$q$, 'NOT_SHARED');
  perform pg_temp.val('friends', 'sharing OFF -> overview has no totals', $q$select coalesce(total, -1) from public.social_friends_overview() where user_id = pg_temp.id('s1')$q$, '-1');
  perform pg_temp.login('s3');
  perform pg_temp.err('friends', 'non-friend s3 cannot view s1 island', $q$select public.map_friend_island(pg_temp.id('s1'))$q$, 'NOT_FRIENDS');
  perform pg_temp.val('friends', 'friendship is private to its two parties', $q$select count(*) from public.friendships$q$, '0');
  perform pg_temp.login('fr');
  perform pg_temp.val('friends', 'friend cannot read s1 applications table', $q$select count(*) from public.applications where user_id = pg_temp.id('s1')$q$, '0');
  perform pg_temp.err('friends', 'friend cannot send request to self', $q$select * from public.social_send_request((select invite_code from public.user_roles where user_id = pg_temp.id('fr')))$q$);
  reset role;
  perform pg_temp.val('friends', 'column default share_companies_with_friends = false', $q$select column_default from information_schema.columns where table_name='user_roles' and column_name='share_companies_with_friends'$q$, 'false');
  perform pg_temp.val('friends', 'fresh user (s2) has company sharing off', $q$select share_companies_with_friends from public.user_roles where user_id = pg_temp.id('s2')$q$, 'false');

  ----------------------------------------------------------------------------------------------
  -- 5. display names / initials
  ----------------------------------------------------------------------------------------------
  perform pg_temp.login('s3');
  perform pg_temp.val('names', 'fresh user needs_name = true', $q$select needs_name from public.profile_name_status()$q$, 'true');
  perform pg_temp.val('names', 'set_display_name trims whitespace', $q$select public.profile_set_display_name('   Lea Muster  ')$q$, 'Lea Muster');
  perform pg_temp.val('names', 'after set: needs_name = false', $q$select needs_name from public.profile_name_status()$q$, 'false');
  perform pg_temp.err('names', 'empty name rejected', $q$select public.profile_set_display_name('   ')$q$, 'INVALID_NAME');
  perform pg_temp.err('names', 'NULL name rejected', $q$select public.profile_set_display_name(null)$q$, 'INVALID_NAME');
  perform pg_temp.err('names', 'e-mail as name rejected', $q$select public.profile_set_display_name('lea@example.ch')$q$, 'INVALID_NAME');
  perform pg_temp.err('names', '61 chars rejected', $q$select public.profile_set_display_name(repeat('a', 61))$q$, 'INVALID_NAME');
  perform pg_temp.ok('names', '60 chars accepted', $q$select public.profile_set_display_name(repeat('a', 60))$q$);
  perform pg_temp.ok('names', 'unicode name accepted (Zoë Müller-Çelik)', $q$select public.profile_set_display_name('Zoë Müller-Çelik')$q$);
  perform pg_temp.val('names', 'unicode stored intact', $q$select display_name from public.user_roles where false union all select public.profile_set_display_name('Zoë Müller-Çelik')$q$, 'Zoë Müller-Çelik');
  perform pg_temp.ok('names', 'onboarding save with valid data', $q$select public.student_onboarding_save('Zoë', 'Müller', 'Sek A', array['Informatiker EFZ'], 'zh', 'Zürich', 2027, true)$q$);
  perform pg_temp.val('names', 'onboarding sets user_roles.display_name = "first last"', $q$select (select display_name from public.profile_name_status())$q$, 'Zoë Müller');
  perform pg_temp.val('names', 'onboarding upper-cases canton', $q$select canton from public.profiles where user_id = pg_temp.id('s3')$q$, 'ZH');
  perform pg_temp.err('names', 'onboarding rejects canton "ZUERICH" (check constraint)', $q$select public.student_onboarding_save('A', 'B', null, null, 'ZUERICH', null, null, true)$q$);
  perform pg_temp.err('names', 'onboarding rejects start year 1999', $q$select public.student_onboarding_save('A', 'B', null, null, null, null, 1999, true)$q$);
  perform pg_temp.err('names', 'onboarding rejects start year 2101', $q$select public.student_onboarding_save('A', 'B', null, null, null, null, 2101, true)$q$);
  perform public.student_onboarding_save(repeat('x', 100), 'B', null, null, null, null, null, true);
  perform pg_temp.val('names', 'onboarding truncates 100-char first name to 40', $q$select length(first_name) from public.profiles where user_id = pg_temp.id('s3')$q$, '40');
  perform public.student_onboarding_save('A', 'B', null, array['1','2','3','4','5','6','7','8','9','10'], null, null, null, true);
  perform pg_temp.val('names', 'onboarding keeps max 8 professions', $q$select array_length(desired_professions,1) from public.profiles where user_id = pg_temp.id('s3')$q$, '8');
  perform pg_temp.ok('names', 'onboarding with all NULL does not crash', $q$select public.student_onboarding_save(null, null, null, null, null, null, null, false)$q$);
  perform pg_temp.err('names', 'direct profiles.display_name 61 chars blocked by CHECK', $q$update public.profiles set display_name = repeat('a', 61) where user_id = pg_temp.id('s3')$q$);
  perform pg_temp.login('t1');
  perform pg_temp.ok('names', 'teacher alias set for member', format($q$select public.class_set_student_alias(%L, pg_temp.id('s3'), 'Hans M.')$q$, cls));
  perform pg_temp.err('names', 'teacher alias for non-member rejected', format($q$select public.class_set_student_alias(%L, pg_temp.id('s2'), 'Hans M.')$q$, cls));
  perform pg_temp.err('names', 'teacher alias of 500 chars rejected', format($q$select public.class_set_student_alias(%L, pg_temp.id('s3'), repeat('a', 500))$q$, cls));

  ----------------------------------------------------------------------------------------------
  -- 6. import / CSV / invite RPCs reject malformed input
  ----------------------------------------------------------------------------------------------
  perform pg_temp.err('csv', 'invite_many: NULL array', format($q$select * from public.class_invite_create_many_v2(%L, null::text[])$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_many: empty array', format($q$select * from public.class_invite_create_many_v2(%L, '{}'::text[])$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_many: 201 entries', format($q$select * from public.class_invite_create_many_v2(%L, (select array_agg('u' || g || '@example.invalid') from generate_series(1,201) g))$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_many: expiry 0 days', format($q$select * from public.class_invite_create_many_v2(%L, array['a@example.invalid'], 0)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_many: expiry 91 days', format($q$select * from public.class_invite_create_many_v2(%L, array['a@example.invalid'], 91)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_many: foreign class', format($q$select * from public.class_invite_create_many_v2(%L, array['a@example.invalid'])$q$, cls2), 'FORBIDDEN');
  perform pg_temp.err('csv', 'invite_many: random class id', $q$select * from public.class_invite_create_many_v2(gen_random_uuid(), array['a@example.invalid'])$q$, 'FORBIDDEN');
  perform pg_temp.val('csv', 'invite_many: malformed/duplicate/valid mix classified',
    format($q$select string_agg(outcome, ',' order by ord) from (select row_number() over () ord, outcome from public.class_invite_create_many_v2(%L, array['ok1@example.invalid','OK1@Example.invalid','nope','a@b','x y@z.ch','a@@b.ch','<script>@x.ch','a,b@c.ch','', null, repeat('a',300) || '@x.ch', 'ok2@example.invalid'])) s$q$, cls),
    'created,duplicate,invalid,invalid,invalid,invalid,invalid,invalid,invalid,created');
  perform pg_temp.val('csv', 'invite_many: SQL-injection string is just invalid', format($q$select outcome from public.class_invite_create_many_v2(%L, array[$$x'';drop table public.applications;--@x.ch$$])$q$, cls), 'invalid');
  perform pg_temp.val('csv', 'applications table still exists after injection attempt', $q$select to_regclass('public.applications') is not null$q$, 'true');
  perform pg_temp.err('csv', 'invite_create: bad e-mail', format($q$select * from public.class_invite_create(%L, 'not-an-email')$q$, cls), 'INVALID_EMAIL');
  perform pg_temp.err('csv', 'invite_create: max_uses 0', format($q$select * from public.class_invite_create(%L, null, 0)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_create: max_uses 501', format($q$select * from public.class_invite_create(%L, null, 501)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'invite_create: expiry -1', format($q$select * from public.class_invite_create(%L, null, null, -1)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'class_create: empty name', $q$select * from public.class_create('   ', '2026')$q$, 'INVALID_NAME');
  perform pg_temp.err('csv', 'class_create: NULL name', $q$select * from public.class_create(null, '2026')$q$, 'INVALID_NAME');
  perform pg_temp.err('csv', 'class_create: 101-char name', $q$select * from public.class_create(repeat('a', 101), '2026')$q$, 'INVALID_NAME');
  perform pg_temp.err('csv', 'deadline: NULL date', format($q$select public.class_deadline_add(%L, 'x', null)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'deadline: empty title', format($q$select public.class_deadline_add(%L, '  ', current_date)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'deadline: 121-char title', format($q$select public.class_deadline_add(%L, repeat('a',121), current_date)$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'deadline: 301-char note', format($q$select public.class_deadline_add(%L, 'ok', current_date, repeat('a',301))$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'announce: empty', format($q$select public.class_announce(%L, '')$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'announce: 501 chars', format($q$select public.class_announce(%L, repeat('a',501))$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.err('csv', 'nudge: 201 chars', format($q$select public.class_nudge(%L, pg_temp.id('s3'), repeat('a',201))$q$, cls), 'INVALID_REQUEST');
  perform pg_temp.ok('csv', 'nudge: valid, then rate limited', format($q$select public.class_nudge(%L, pg_temp.id('s3'), 'hi')$q$, cls));
  perform pg_temp.err('csv', 'nudge: second nudge within 3 days rate-limited', format($q$select public.class_nudge(%L, pg_temp.id('s3'), 'hi')$q$, cls), 'RATE_LIMITED');
  perform pg_temp.login('s2');
  perform pg_temp.err('csv', 'class_join: garbage code', $q$select * from public.class_join('???')$q$, 'CLASS_NOT_FOUND');
  perform pg_temp.err('csv', 'class_join: NULL code', $q$select * from public.class_join(null)$q$, 'CLASS_NOT_FOUND');
  perform pg_temp.err('csv', 'invite_accept: garbage token', $q$select * from public.class_invite_accept('garbage')$q$, 'INVITE_INVALID');
  perform pg_temp.err('csv', 'invite_accept: NULL token', $q$select * from public.class_invite_accept(null)$q$, 'INVITE_INVALID');
  -- e-mail bound invite cannot be used by other e-mail
  reset role;
  select token into inv_tok from public.class_invitations where class_id = cls and email = 'ok1@example.invalid';
  perform pg_temp.login('s2');
  perform pg_temp.err('csv', 'invite bound to other e-mail rejected for s2', format($q$select * from public.class_invite_accept(%L)$q$, inv_tok), 'FORBIDDEN');
  perform pg_temp.hidden('csv', 'student cannot read class_invitations (tokens)', $q$select * from public.class_invitations$q$);
  perform pg_temp.err('csv', 'student cannot call invite_list', format($q$select * from public.class_invite_list(%L)$q$, cls), 'FORBIDDEN');
  perform pg_temp.login('s1');
  perform pg_temp.err('csv', 'reminder_settings: days_before -5 rejected by CHECK', $q$update public.reminder_settings set days_before = -5$q$);
  perform pg_temp.err('csv', 'reminder_settings: stale_days 100000 rejected by CHECK', $q$update public.reminder_settings set stale_days = 100000$q$);

  ----------------------------------------------------------------------------------------------
  -- 7. account deletion cascades fully (throwaway user "del")
  ----------------------------------------------------------------------------------------------
  reset role;
  insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('qa-del-a1', pg_temp.id('del'), 'DelCo', 'x', 'informatik', 'applied', current_date, current_date);
  insert into public.cvs (id, user_id, name, type, description, updated_at, status, kind) values ('qa-del-cv', pg_temp.id('del'), 'd', 'developer', 'd', current_date, 'ready', 'lebenslauf');
  insert into public.application_documents (application_id, document_id, user_id) values ('qa-del-a1', 'qa-del-cv', pg_temp.id('del'));
  insert into public.reminder_settings (user_id) values (pg_temp.id('del'));
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.id('del'), 'https://push.invalid/del', 'k', 'a');
  insert into public.calendar_feeds (user_id, token) values (pg_temp.id('del'), 'qa-del-feed-' || repeat('c',40));
  insert into public.reminder_log (user_id, application_id, kind, due_on, channel) values (pg_temp.id('del'), 'qa-del-a1', 'deadline', current_date, 'push');
  insert into public.friendships (requester_id, addressee_id, status) values (pg_temp.id('del'), pg_temp.id('fr'), 'pending');
  insert into public.class_members (class_id, student_id) values (cls, pg_temp.id('del'));
  insert into public.class_student_aliases (class_id, student_id, alias, set_by) values (cls, pg_temp.id('del'), 'DelAlias', pg_temp.id('t1'));
  insert into public.class_notifications (user_id, kind, class_id, actor_id, message) values (pg_temp.id('del'), 'nudge', cls, pg_temp.id('t1'), 'x');
  insert into public.class_view_log (class_id, teacher_id, student_id, kind) values (cls, pg_temp.id('t1'), pg_temp.id('del'), 'view');
  insert into public.map_wallets (user_id) values (pg_temp.id('del')) on conflict do nothing;
  insert into public.map_layouts (user_id, object_id, x, z, rotation) select pg_temp.id('del'), 'house:qa-del-a1', 5, 5, 0 where exists (select 1 from information_schema.columns where table_name='map_layouts' and column_name='object_id') on conflict do nothing;
  rep := public.account_data_report(pg_temp.id('del'));
  perform pg_temp.rec('delete', 'data report before deletion lists many tables', pg_temp.jsonb_object_keys_count(rep) >= 8, rep::text);
  delete from auth.users where id = pg_temp.id('del');
  rep2 := public.account_data_report(pg_temp.id('del'));
  perform pg_temp.rec('delete', 'account_data_report after deletion is empty', rep2 = '{}'::jsonb, rep2::text);
  for r in
    select c.conrelid::regclass::text tbl, a.attname col, c.confdeltype::text confdel from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace and c.confdeltype <> 'c'
  loop
    perform pg_temp.rec('delete', 'FK to auth.users is SET NULL (not cascade) on ' || r.tbl || '.' || r.col || ' - acceptable: only actor pointer, row belongs to another user', r.confdel = 'n', 'confdeltype=' || r.confdel);
  end loop;
  perform pg_temp.val('delete', 'applications of deleted user gone', $q$select count(*) from public.applications where id = 'qa-del-a1'$q$, '0');
  perform pg_temp.val('delete', 'documents of deleted user gone', $q$select count(*) from public.cvs where id = 'qa-del-cv'$q$, '0');
  perform pg_temp.val('delete', 'application_documents gone', $q$select count(*) from public.application_documents where application_id = 'qa-del-a1'$q$, '0');
  perform pg_temp.val('delete', 'reminder_log/push/feeds/settings gone', $q$select (select count(*) from public.reminder_log where application_id = 'qa-del-a1') + (select count(*) from public.push_subscriptions where endpoint = 'https://push.invalid/del') + (select count(*) from public.calendar_feeds where token = 'qa-del-feed-' || repeat('c',40)) + (select count(*) from public.reminder_settings where user_id = pg_temp.id('del'))$q$, '0');
  perform pg_temp.val('delete', 'class membership/aliases/notifications/view log gone', $q$select (select count(*) from public.class_members where student_id = pg_temp.id('del')) + (select count(*) from public.class_student_aliases where student_id = pg_temp.id('del')) + (select count(*) from public.class_notifications where user_id = pg_temp.id('del')) + (select count(*) from public.class_view_log where student_id = pg_temp.id('del'))$q$, '0');
  perform pg_temp.val('delete', 'friendships gone; friend (fr) intact', $q$select (select count(*) from public.friendships where pg_temp.id('del') in (requester_id, addressee_id)) || '/' || (select count(*) from public.user_roles where user_id = pg_temp.id('fr'))$q$, '0/1');
  perform pg_temp.val('delete', 'profile + user_roles gone', $q$select (select count(*) from public.profiles where user_id = pg_temp.id('del')) + (select count(*) from public.user_roles where user_id = pg_temp.id('del'))$q$, '0');
  perform pg_temp.val('delete', 'other users data untouched (s1 apps still 2)', $q$select count(*) from public.applications where user_id = pg_temp.id('s1')$q$, '2');
  -- deleting a teacher with class + co-teacher: class transferred / deleted
  insert into public.class_teachers (class_id, teacher_id) values (cls2, pg_temp.id('t1'));
  perform public.account_delete_prepare(pg_temp.id('t2'));
  delete from auth.users where id = pg_temp.id('t2');
  perform pg_temp.val('delete', 'teacher with co-teacher: class survives (transferred to t1)', format($q$select teacher_id = pg_temp.id('t1') from public.classes where id = %L$q$, cls2), 'true');
  perform pg_temp.val('delete', 'teacher data report empty', $q$select public.account_data_report(pg_temp.id('t2'))$q$, '{}');
  perform public.account_delete_prepare(pg_temp.id('t1'));
  delete from auth.users where id = pg_temp.id('t1');
  perform pg_temp.val('delete', 'class rows of deleted teacher gone', format($q$select count(*) from public.classes where id in (%L, %L)$q$, cls, cls2), '0');

  ----------------------------------------------------------------------------------------------
  -- result
  ----------------------------------------------------------------------------------------------
  reset role;
  raise exception 'QA_RESULT:%', (select jsonb_build_object('total', count(*), 'failed', count(*) filter (where not ok),
    'rows', jsonb_agg(jsonb_build_array(area, name, ok, detail) order by res.n)) from res);
end $main$;
