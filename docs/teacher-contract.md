# Teacher role – contract (orchestrator, 2026-11-06)

Base already on main: user_roles(role student|teacher, display_name, avatar_seed, email), classes(teacher_id,name,school_year,join_code),
class_members(class_id,student_id,share_applications,joined_at), RPCs class_create/list_mine/members/overview/student_applications/join/my_classes/set_sharing/leave/preview/rename/delete/remove_student/regenerate_code (see supabase/migrations/2026010100000{0,1}*, 20261104000000_class_management.sql), UI in components/classes + app/classes, role choice in app/login. Teachers never read foreign tables directly, only security-definer RPCs. Error codes are raised as exception text (FORBIDDEN, NOT_FOUND, INVALID_REQUEST, EXPIRED, ...).

New migration file: supabase/migrations/20261107000000_teacher_role.sql (idempotent, owned by the DB part). New RPCs (exact names/params; DB part may add columns but must not rename):

Role
- set_my_role(p_role text) returns void – only allowed while user has no classes and no class_members; else FORBIDDEN.
- social_my_profile() must also return role (check it does; add if not).

Classes (teacher; co-teachers have same read/manage rights except delete/co-teacher management)
- classes gets: archived boolean default false, archived_at. class_set_archived(p_class_id uuid, p_archived boolean) returns void.
- class_teachers(class_id, teacher_id, added_at); class_add_coteacher(p_class_id uuid, p_email text) returns void (owner only; target must be an existing teacher account); class_remove_coteacher(p_class_id, p_teacher_id); class_list_mine() keeps its shape and ALSO returns archived boolean, is_owner boolean (new columns appended).
- teacher_dashboard(p_inactive_days int default 14) returns jsonb:
  {"totals":{"students":n,"classes":n,"applications":n,"interviews":n,"offers":n,"placed":n,"inactive":n,"deadlines_7d":n,"hidden_students":n},
   "classes":[{"id","name","school_year","archived","is_owner","join_code","students","applications","interviews","offers","placed","inactive","hidden"}],
   "deadlines":[{"class_id","class_name","student_id","student_name","company","position","deadline"}] (next 14 days, max 20, only shared students)}
  "placed" = students with at least one application with status accepted/zusage-equivalent (check the status enum in types/ and schema; "Lehrstelle gefunden").
- teacher_class_students(p_class_id uuid, p_inactive_days int default 14) returns rows: student_id, display_name, avatar_seed, joined_at, hidden boolean, total int, status_counts jsonb, interviews int, offers int, placed boolean, last_activity timestamptz (null if hidden), inactive boolean (false if hidden), last_nudged_at timestamptz.
- class_student_applications(...) stays; add class_student_timeline(p_class_id, p_student_id) returns rows (hidden bool, application_id, company, position, status, event_date, kind) = status history of SHARED fields only (company, position, status, dates, category, location, deadline). NEVER notes, salary, contacts, documents, CV, links.

Invitations
- class_invitations(id, class_id, token unique, email nullable, max_uses nullable, uses int, expires_at, revoked bool, created_by, created_at). RLS on, no direct grants.
- class_invite_create(p_class_id uuid, p_email text default null, p_max_uses int default null, p_expires_in_days int default 14) returns table(id uuid, token text, expires_at timestamptz).
- class_invite_create_many(p_class_id uuid, p_emails text[], p_expires_in_days int default 14) returns table(email text, token text) (max 60, dedupe, validated).
- class_invite_list(p_class_id uuid) returns rows (id, token, email, max_uses, uses, expires_at, revoked, created_at); class_invite_revoke(p_invitation_id uuid) returns void.
- class_invite_preview(p_token text) returns like class_preview + valid boolean + reason text (EXPIRED|REVOKED|USED_UP|INVALID|null). class_invite_accept(p_token text) returns like class_join; increments uses; email-bound invites require matching auth email (else FORBIDDEN). Existing join_code flow (class_join/class_preview) keeps working. Invite link format: /classes/join/<code-or-token>; the join page tries token first (tokens are >=22 chars url-safe), otherwise the short code.

Consent / transparency
- class_members gets: share_status boolean (default true; per-application stage counts), share_companies boolean (default true; company names + positions), plus existing share_applications as master switch (false = teacher sees nothing but the name). Students can toggle via class_set_sharing_v2(p_class_id uuid, p_share boolean, p_companies boolean) returns void. class_my_classes() keeps shape and also returns share_companies boolean, last_nudge_at, announcements_count (appended columns).
- class_visibility_info() returns jsonb {"teacher_sees":[...labels], "teacher_never_sees":[...labels]} (static German texts) for the transparency box.

Announcements and nudges (optional but build them)
- class_announcements(id, class_id, author_id, text, created_at); class_announce(p_class_id uuid, p_text text) returns uuid (1..500 chars); class_announcement_list(p_class_id uuid) returns rows (id,text,created_at,author_name) – teacher of class OR member.
- class_nudge(p_class_id uuid, p_student_id uuid, p_message text default null) returns void; rate limited to 1 per student per 3 days (else RATE_LIMITED); student reads via my_notifications() returns rows (id, kind, class_id, class_name, message, created_at, read bool) and mark_notification_read(p_id uuid).

TypeScript: lib/teacher.ts (owned by DB part, committed EARLY on branch teacher-db so UI parts can merge/rebase or copy) exposes typed camelCase wrappers for every RPC above (same pattern as lib/classes.ts, reuse its databaseError/classErrorCode, extend ClassErrorCode with new codes). Types go into lib/teacher.ts itself, not types/index.ts.

Routes (teacher): /teacher (dashboard), /teacher/classes/[id] (class detail), /teacher/classes/[id]/students/[studentId] (read-only timeline), /teacher/onboarding (role confirm + first class). Students keep /classes and /classes/join/[code]. Role routing: after login/callback, teacher -> /teacher, student -> /dashboard; students visiting /teacher/** and teachers visiting student-only routes are redirected; nav shows teacher menu (Übersicht, Klassen, Einstellungen) for teachers.
