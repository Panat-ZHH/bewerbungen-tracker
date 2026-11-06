-- Defense in depth: the anon role never needs direct access to application data (the public pages only call the
-- invite_context RPC). RLS already blocks anon on these tables; this removes the table privileges as well, so a
-- future mistake (e.g. a permissive policy "to public") cannot expose private data to logged-out visitors.
-- Additive/idempotent: touches privileges only, no data, no policies. Authenticated users are unaffected.
do $$
declare t text;
begin
  foreach t in array array[
    'applications','application_documents','calendar_feeds','cvs','profiles','push_subscriptions','reminder_log','reminder_settings',
    'user_roles','friendships','class_members','classes','class_teachers','class_invitations','class_announcements','class_deadlines',
    'class_notifications','class_student_aliases','class_view_log','map_application_rewards','map_island_catalog','map_islands',
    'map_items','map_layouts','map_shop_catalog','map_wallets']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;
