-- =============================================================================
-- 010_rls_policies.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 010 of 013.
--
-- Responsibility : Enable Row Level Security on all application tables and define
--                  ownership/role policies.
-- Run order      : After 002-009 (all tables must exist; uses 002 helper funcs).
--                  Before 011.
-- Safe to rerun  : Yes. ENABLE RLS is idempotent. Policies use
--                  DROP POLICY IF EXISTS + CREATE POLICY (idempotent
--                  redefinition; non-data-destructive).
--
-- MODEL:
--   * is_admin() short-circuits to full access on sensitive tables.
--   * Students access only their own learning rows; parents only ACTIVE-linked
--     students (via is_parent_linked_to_student()).
--   * payment_events / system_settings / audit_logs are effectively admin-only
--     (service role bypasses RLS for server/webhook/job writes).
--
-- KNOWN LIMITATIONS (column-level concerns handled in service/view layer, noted
-- here and in STATUS.md):
--   * RLS is row-level, not column-level. Hiding answer_options.is_correct from
--     students BEFORE result, and gating question_explanations to AFTER result,
--     must be enforced by the service layer / a SECURITY DEFINER RPC / a public
--     view that omits is_correct. Recommended for a later content stage.
--   * Subscription-gating of published content is enforced server-side
--     (assertActiveSubscription); RLS here allows authenticated read of published
--     content so the gating decision stays in one place.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enable RLS on every application table.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','permissions','role_permissions','profile_roles',
    'parents','students','parent_student_links',
    'child_unique_ids','child_credentials','child_login_attempts',
    'districts','city_districts','schools','grades','subjects','topics','subtopics',
    'wallpapers','child_wallpaper_selections',
    'sticker_themes','sticker_images','child_sticker_selections',
    'question_types','difficulty_levels','olympiad_types','sources',
    'questions','question_translations','answer_options','answer_option_translations',
    'question_explanations','tests','test_questions','question_imports',
    'test_attempts','test_attempt_answers','daily_rounds','progress_snapshots',
    'leaderboard_periods','leaderboard_entries','leaderboard_snapshots',
    'achievements','student_achievements','question_analytics',
    'subscription_plans','subscriptions','payments','payment_events',
    'coupons','coupon_redemptions',
    'subjects_pricing','launch_promo_config','child_subscriptions',
    'subscription_subjects','checkout_sessions','sibling_discounts',
    'media_assets','notification_templates','notifications','notification_deliveries',
    'support_requests','audit_logs','admin_actions','content_reviews',
    'system_settings','feature_flags','site_content','free_access_intervals',
    'mobile_app_versions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Baseline role privileges (backported from
-- migrations/2026_06_27_002_role_privilege_baseline.sql).
-- RLS only governs access once the role can reach the table. The canonical schema
-- must NOT rely on Supabase's implicit default privileges (absent on a from-zero
-- rebuild), so grant them explicitly here. RLS policies below still gate the rows;
-- the authoritative-column hardening at the END of this file re-asserts the column
-- restrictions that this broad grant would otherwise loosen.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
-- (public functions are already executable by PUBLIC; no explicit grant needed.)

alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- =============================================================================
-- CORE IDENTITY & RBAC
-- =============================================================================

-- profiles ---------------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = public.current_profile_id()
    or public.is_admin()
    or public.has_permission('users.read')
    or public.is_parent_linked_to_student(id)
  );

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = public.current_profile_id() or public.is_admin())
  with check (id = public.current_profile_id() or public.is_admin());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles for delete to authenticated
  using (public.is_admin());

-- roles / permissions / role_permissions (read all auth; write admin) ----------
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','role_permissions'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated using (true);', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- profile_roles (own read; admin manage) --------------------------------------
drop policy if exists "profile_roles_select" on public.profile_roles;
create policy "profile_roles_select" on public.profile_roles for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists "profile_roles_write" on public.profile_roles;
create policy "profile_roles_write" on public.profile_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- parents (own / admin) -------------------------------------------------------
drop policy if exists "parents_select" on public.parents;
create policy "parents_select" on public.parents for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists "parents_write" on public.parents;
create policy "parents_write" on public.parents for all to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin())
  with check (profile_id = public.current_profile_id() or public.is_admin());

-- students (own / linked parent / CREATING parent / admin) --------------------
-- created_by_parent_profile_id lets the parent who created a child account read
-- and manage that child even before/without an active parent_student_links row.
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or public.has_permission('users.read')
    or public.is_parent_linked_to_student(profile_id)
    or created_by_parent_profile_id = public.current_profile_id()
  );

drop policy if exists "students_write" on public.students;
create policy "students_write" on public.students for all to authenticated
  using (
    profile_id = public.current_profile_id()
    or created_by_parent_profile_id = public.current_profile_id()
    or public.is_admin()
  )
  with check (
    profile_id = public.current_profile_id()
    or created_by_parent_profile_id = public.current_profile_id()
    or public.is_admin()
  );

-- child_unique_ids / child_credentials: admin read only. Writes go through the
-- allocate_child_unique_id() SECURITY DEFINER function / service role (both bypass
-- RLS), so there is intentionally NO write policy here.
drop policy if exists "child_unique_ids_admin" on public.child_unique_ids;
create policy "child_unique_ids_admin" on public.child_unique_ids for select to authenticated
  using (public.is_admin());
drop policy if exists "child_credentials_admin" on public.child_credentials;
create policy "child_credentials_admin" on public.child_credentials for select to authenticated
  using (public.is_admin());

-- child_login_attempts: admins may READ the lockout log (security monitoring);
-- writes are service-role only (no write policy). Table privileges + the login
-- helper functions live in 011 (backported from
-- migrations/2026_06_28_008_child_account_provisioning.sql).
drop policy if exists "child_login_attempts_admin_select" on public.child_login_attempts;
create policy "child_login_attempts_admin_select" on public.child_login_attempts for select to authenticated
  using (public.is_admin());

-- parent_student_links (parent/student involved / admin) ----------------------
drop policy if exists "psl_select" on public.parent_student_links;
create policy "psl_select" on public.parent_student_links for select to authenticated
  using (
    parent_profile_id = public.current_profile_id()
    or student_profile_id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists "psl_insert" on public.parent_student_links;
create policy "psl_insert" on public.parent_student_links for insert to authenticated
  with check (parent_profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists "psl_update" on public.parent_student_links;
create policy "psl_update" on public.parent_student_links for update to authenticated
  using (parent_profile_id = public.current_profile_id() or public.is_admin())
  with check (parent_profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists "psl_delete" on public.parent_student_links;
create policy "psl_delete" on public.parent_student_links for delete to authenticated
  using (parent_profile_id = public.current_profile_id() or public.is_admin());

-- =============================================================================
-- ACADEMIC TAXONOMY (public read; admin write)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['districts','schools','grades','subjects','topics','subtopics'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select using (true);', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- city_districts (migration 053): intra-city rayons — public read; admin write.
drop policy if exists city_districts_read on public.city_districts;
create policy city_districts_read on public.city_districts
  for select to anon, authenticated using (true);

drop policy if exists city_districts_admin_write on public.city_districts;
create policy city_districts_admin_write on public.city_districts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- wallpapers: active catalog readable by authenticated; admin write.
drop policy if exists "wallpapers_select" on public.wallpapers;
create policy "wallpapers_select" on public.wallpapers for select to authenticated
  using (status = 'active' or public.is_admin());
drop policy if exists "wallpapers_write" on public.wallpapers;
create policy "wallpapers_write" on public.wallpapers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- child_wallpaper_selections: child manages own; parent (linked or creator)/admin read.
drop policy if exists "cws_select" on public.child_wallpaper_selections;
create policy "cws_select" on public.child_wallpaper_selections for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
  );
drop policy if exists "cws_write" on public.child_wallpaper_selections;
create policy "cws_write" on public.child_wallpaper_selections for all to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin())
  with check (student_profile_id = public.current_profile_id() or public.is_admin());

-- -----------------------------------------------------------------------------
-- Character Sticker themes (Round 11, migration 026).
-- -----------------------------------------------------------------------------
-- sticker_themes: ENABLED catalog readable by authenticated; admin sees all + writes.
drop policy if exists "sticker_themes_select" on public.sticker_themes;
create policy "sticker_themes_select" on public.sticker_themes for select to authenticated
  using (is_enabled or public.is_admin());
drop policy if exists "sticker_themes_write" on public.sticker_themes;
create policy "sticker_themes_write" on public.sticker_themes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- sticker_images: readable when their theme is visible; admin writes.
drop policy if exists "sticker_images_select" on public.sticker_images;
create policy "sticker_images_select" on public.sticker_images for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.sticker_themes t
               where t.id = theme_id and t.is_enabled)
  );
drop policy if exists "sticker_images_write" on public.sticker_images;
create policy "sticker_images_write" on public.sticker_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- child_sticker_selections: child manages own row and may only pick ENABLED
-- themes; parent (linked or creator)/admin read.
drop policy if exists "css_select" on public.child_sticker_selections;
create policy "css_select" on public.child_sticker_selections for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
  );
drop policy if exists "css_write" on public.child_sticker_selections;
create policy "css_write" on public.child_sticker_selections for all to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin())
  with check (
    (student_profile_id = public.current_profile_id() or public.is_admin())
    and exists (select 1 from public.sticker_themes t
                where t.id = theme_id and (t.is_enabled or public.is_admin()))
  );

-- =============================================================================
-- CONTENT CONFIG CATALOGS (read authenticated; admin write)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['question_types','difficulty_levels','olympiad_types','sources'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated using (true);', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- =============================================================================
-- QUESTIONS & TESTS
-- =============================================================================

-- questions: published readable by authenticated; drafts by owner/reviewer/admin
drop policy if exists "questions_select" on public.questions;
create policy "questions_select" on public.questions for select to authenticated
  using (
    status = 'published'
    or created_by = public.current_profile_id()
    or public.is_admin()
    or public.has_permission('content.review')
  );

drop policy if exists "questions_insert" on public.questions;
create policy "questions_insert" on public.questions for insert to authenticated
  with check (
    public.is_admin()
    or (public.has_permission('content.create') and created_by = public.current_profile_id())
  );

drop policy if exists "questions_update" on public.questions;
create policy "questions_update" on public.questions for update to authenticated
  using (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or (created_by = public.current_profile_id() and public.has_permission('content.edit_own'))
  )
  with check (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or (created_by = public.current_profile_id() and public.has_permission('content.edit_own'))
  );

drop policy if exists "questions_delete" on public.questions;
create policy "questions_delete" on public.questions for delete to authenticated
  using (public.is_admin());

-- question child tables: visibility follows the parent question.
-- (Helper predicate inlined per table.)
-- question_translations / answer_options / answer_option_translations / question_explanations
drop policy if exists "qtrans_select" on public.question_translations;
create policy "qtrans_select" on public.question_translations for select to authenticated
  using (exists (
    select 1 from public.questions q where q.id = question_id
      and (q.status = 'published' or q.created_by = public.current_profile_id()
           or public.is_admin() or public.has_permission('content.review'))));
-- Child content writes are scoped to the OWNER of the parent question
-- (backported from migrations/2026_06_27_005_tighten_content_child_rls.sql).
drop policy if exists "qtrans_write" on public.question_translations;
create policy "qtrans_write" on public.question_translations for all to authenticated
  using (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()))
  with check (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()));

-- Audit H3 (migration 035): answer_options carries is_correct (the answer key),
-- so learners must NEVER read rows directly — options reach students only via
-- the SECURITY DEFINER attempt RPCs, which strip is_correct. Direct SELECT is
-- for content authors (own questions), reviewers and admins only. Option TEXT
-- stays readable via answer_option_translations (not secret).
drop policy if exists "aopt_select" on public.answer_options;
create policy "aopt_select" on public.answer_options for select to authenticated
  using (exists (
    select 1 from public.questions q where q.id = question_id
      and (q.created_by = public.current_profile_id()
           or public.is_admin() or public.has_permission('content.review'))));
drop policy if exists "aopt_write" on public.answer_options;
create policy "aopt_write" on public.answer_options for all to authenticated
  using (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()))
  with check (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()));

drop policy if exists "aopttrans_select" on public.answer_option_translations;
create policy "aopttrans_select" on public.answer_option_translations for select to authenticated
  using (exists (
    select 1 from public.answer_options o join public.questions q on q.id = o.question_id
    where o.id = option_id
      and (q.status = 'published' or q.created_by = public.current_profile_id()
           or public.is_admin() or public.has_permission('content.review'))));
drop policy if exists "aopttrans_write" on public.answer_option_translations;
create policy "aopttrans_write" on public.answer_option_translations for all to authenticated
  using (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.answer_options o join public.questions q on q.id = o.question_id
                    where o.id = option_id and q.created_by = public.current_profile_id()))
  with check (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.answer_options o join public.questions q on q.id = o.question_id
                    where o.id = option_id and q.created_by = public.current_profile_id()));

-- explanations: app should reveal only after result; RLS allows published/owner/admin.
drop policy if exists "qexpl_select" on public.question_explanations;
create policy "qexpl_select" on public.question_explanations for select to authenticated
  using (exists (
    select 1 from public.questions q where q.id = question_id
      and (q.status = 'published' or q.created_by = public.current_profile_id()
           or public.is_admin() or public.has_permission('content.review'))));
drop policy if exists "qexpl_write" on public.question_explanations;
create policy "qexpl_write" on public.question_explanations for all to authenticated
  using (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()))
  with check (public.is_admin() or public.has_permission('content.review') or public.has_permission('content.publish')
         or exists (select 1 from public.questions q where q.id = question_id and q.created_by = public.current_profile_id()));

-- tests: published readable; managed by admin/content.
drop policy if exists "tests_select" on public.tests;
create policy "tests_select" on public.tests for select to authenticated
  using (status = 'published' or created_by = public.current_profile_id()
         or public.is_admin() or public.has_permission('content.review') or public.has_permission('tests.manage'));
drop policy if exists "tests_write" on public.tests;
create policy "tests_write" on public.tests for all to authenticated
  using (public.is_admin() or public.has_permission('tests.manage'))
  with check (public.is_admin() or public.has_permission('tests.manage'));

drop policy if exists "test_questions_select" on public.test_questions;
create policy "test_questions_select" on public.test_questions for select to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id
    and (t.status = 'published' or t.created_by = public.current_profile_id()
         or public.is_admin() or public.has_permission('tests.manage'))));
drop policy if exists "test_questions_write" on public.test_questions;
create policy "test_questions_write" on public.test_questions for all to authenticated
  using (public.is_admin() or public.has_permission('tests.manage'))
  with check (public.is_admin() or public.has_permission('tests.manage'));

-- question_imports: importer/admin read only. Writes happen exclusively via the
-- bulk_insert_questions() SECURITY DEFINER function / service role (both bypass
-- RLS); there is intentionally NO write policy here. Table privileges live in 011.
-- Backported from migrations/2026_06_28_009_bulk_question_import.sql.
drop policy if exists "question_imports_select" on public.question_imports;
create policy "question_imports_select" on public.question_imports for select to authenticated
  using (imported_by = public.current_profile_id() or public.is_admin());

-- =============================================================================
-- LEARNING ACTIVITY (student-owned; parent linked; admin)
-- =============================================================================

drop policy if exists "attempts_select" on public.test_attempts;
create policy "attempts_select" on public.test_attempts for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());
drop policy if exists "attempts_insert" on public.test_attempts;
create policy "attempts_insert" on public.test_attempts for insert to authenticated
  with check (student_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "attempts_update" on public.test_attempts;
create policy "attempts_update" on public.test_attempts for update to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin())
  with check (student_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "attempts_delete" on public.test_attempts;
create policy "attempts_delete" on public.test_attempts for delete to authenticated
  using (public.is_admin());

-- answers: visibility/writes follow the owning attempt.
drop policy if exists "answers_select" on public.test_attempt_answers;
create policy "answers_select" on public.test_attempt_answers for select to authenticated
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id
    and (a.student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(a.student_profile_id)
         or public.is_admin())));
drop policy if exists "answers_write" on public.test_attempt_answers;
create policy "answers_write" on public.test_attempt_answers for all to authenticated
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id
    and (a.student_profile_id = public.current_profile_id() or public.is_admin())))
  with check (exists (select 1 from public.test_attempts a where a.id = attempt_id
    and (a.student_profile_id = public.current_profile_id() or public.is_admin())));

-- daily_rounds (migration 056): students/parents never read rounds directly
-- (the attempt RPCs serve content); admins may inspect. No client write path.
drop policy if exists daily_rounds_admin_read on public.daily_rounds;
create policy daily_rounds_admin_read on public.daily_rounds
  for select to authenticated using (public.is_admin());

-- progress snapshots: own/parent/admin read; writes admin/service only.
drop policy if exists "snap_select" on public.progress_snapshots;
create policy "snap_select" on public.progress_snapshots for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());
drop policy if exists "snap_write" on public.progress_snapshots;
create policy "snap_write" on public.progress_snapshots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- LEADERBOARD & ANALYTICS
-- =============================================================================
-- Periods + achievements are catalogs (no student data) → world-readable.
-- Entries/snapshots carry student ids + points (audit L12, migration 035):
-- entries are own/parent/admin; snapshots (rendered entries_json) admin-only
-- until the Leaderboard plan ships its pseudonymized public serving RPC.
do $$
declare t text;
begin
  foreach t in array array['leaderboard_periods','leaderboard_entries','leaderboard_snapshots','achievements'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;
create policy "leaderboard_periods_select" on public.leaderboard_periods
  for select to authenticated using (true);
create policy "achievements_select" on public.achievements
  for select to authenticated using (true);
create policy "leaderboard_entries_select" on public.leaderboard_entries
  for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());
create policy "leaderboard_snapshots_select" on public.leaderboard_snapshots
  for select to authenticated using (public.is_admin());

-- student_achievements: own/parent/admin read; admin/service write.
drop policy if exists "stach_select" on public.student_achievements;
create policy "stach_select" on public.student_achievements for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());
drop policy if exists "stach_write" on public.student_achievements;
create policy "stach_write" on public.student_achievements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- question_analytics: admin / analytics permission read; admin/service write.
drop policy if exists "qanalytics_select" on public.question_analytics;
create policy "qanalytics_select" on public.question_analytics for select to authenticated
  using (public.is_admin() or public.has_permission('analytics.read_admin'));
drop policy if exists "qanalytics_write" on public.question_analytics;
create policy "qanalytics_write" on public.question_analytics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- SUBSCRIPTIONS & PAYMENTS
-- =============================================================================

-- subscription_plans: public active read; admin write.
drop policy if exists "plans_select" on public.subscription_plans;
create policy "plans_select" on public.subscription_plans for select
  using (status = 'active' or public.is_admin());
drop policy if exists "plans_write" on public.subscription_plans;
create policy "plans_write" on public.subscription_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- subscriptions: owner / linked-student / admin read; admin+service write.
drop policy if exists "subs_select" on public.subscriptions;
create policy "subs_select" on public.subscriptions for select to authenticated
  using (owner_profile_id = public.current_profile_id()
         or student_profile_id = public.current_profile_id()
         or (student_profile_id is not null and public.is_parent_linked_to_student(student_profile_id))
         or public.is_admin()
         or public.has_permission('subscriptions.manage'));
drop policy if exists "subs_write" on public.subscriptions;
create policy "subs_write" on public.subscriptions for all to authenticated
  using (public.is_admin() or public.has_permission('subscriptions.manage'))
  with check (public.is_admin() or public.has_permission('subscriptions.manage'));

-- payments: owner / admin / payments.read; admin+service write.
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin() or public.has_permission('payments.read'));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

-- payment_events: admin only (service role bypasses RLS for webhook writes).
drop policy if exists "payment_events_admin" on public.payment_events;
create policy "payment_events_admin" on public.payment_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- coupons: admin only (validation/redemption performed by service role).
drop policy if exists "coupons_admin" on public.coupons;
create policy "coupons_admin" on public.coupons for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

-- coupon_redemptions: owner / admin read; admin+service write.
drop policy if exists "coupon_redemptions_select" on public.coupon_redemptions;
create policy "coupon_redemptions_select" on public.coupon_redemptions for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "coupon_redemptions_write" on public.coupon_redemptions;
create policy "coupon_redemptions_write" on public.coupon_redemptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- CHILD-BASED SUBSCRIPTIONS & SUBJECT PRICING (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
-- -----------------------------------------------------------------------------

-- Pricing + promo config: readable (public pricing page); admin write.
drop policy if exists "subjects_pricing_select" on public.subjects_pricing;
create policy "subjects_pricing_select" on public.subjects_pricing for select
  using (status = 'active' or public.is_admin());
drop policy if exists "subjects_pricing_write" on public.subjects_pricing;
create policy "subjects_pricing_write" on public.subjects_pricing for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "launch_promo_select" on public.launch_promo_config;
create policy "launch_promo_select" on public.launch_promo_config for select using (true);
drop policy if exists "launch_promo_write" on public.launch_promo_config;
create policy "launch_promo_write" on public.launch_promo_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- child_subscriptions: owner parent + the child read; writes ADMIN/SERVICE ONLY
-- (activation is webhook/service-role; clients never set price/discount/status).
drop policy if exists "child_subs_select" on public.child_subscriptions;
create policy "child_subs_select" on public.child_subscriptions for select to authenticated
  using (
    owner_parent_profile_id = public.current_profile_id()
    or student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  );
drop policy if exists "child_subs_write" on public.child_subscriptions;
create policy "child_subs_write" on public.child_subscriptions for all to authenticated
  using (public.is_admin() or public.has_permission('subscriptions.manage'))
  with check (public.is_admin() or public.has_permission('subscriptions.manage'));

-- subscription_subjects: visibility follows the parent subscription; writes admin/service.
drop policy if exists "sub_subjects_select" on public.subscription_subjects;
create policy "sub_subjects_select" on public.subscription_subjects for select to authenticated
  using (exists (
    select 1 from public.child_subscriptions cs where cs.id = child_subscription_id
      and (cs.owner_parent_profile_id = public.current_profile_id()
           or cs.student_profile_id = public.current_profile_id()
           or public.is_parent_linked_to_student(cs.student_profile_id)
           or public.is_admin())));
drop policy if exists "sub_subjects_write" on public.subscription_subjects;
create policy "sub_subjects_write" on public.subscription_subjects for all to authenticated
  using (public.is_admin() or public.has_permission('subscriptions.manage'))
  with check (public.is_admin() or public.has_permission('subscriptions.manage'));

-- checkout_sessions + sibling_discounts: owner reads; writes admin/service only.
drop policy if exists "checkout_select" on public.checkout_sessions;
create policy "checkout_select" on public.checkout_sessions for select to authenticated
  using (owner_parent_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "checkout_write" on public.checkout_sessions;
create policy "checkout_write" on public.checkout_sessions for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

drop policy if exists "sibling_discounts_select" on public.sibling_discounts;
create policy "sibling_discounts_select" on public.sibling_discounts for select to authenticated
  using (owner_parent_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "sibling_discounts_write" on public.sibling_discounts;
create policy "sibling_discounts_write" on public.sibling_discounts for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

-- =============================================================================
-- NOTIFICATIONS, SUPPORT, AUDIT, CONTENT REVIEW, MEDIA, SETTINGS
-- =============================================================================

-- notifications: recipient read + mark-read; admin/notifier send.
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select to authenticated
  using (recipient_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update to authenticated
  using (recipient_profile_id = public.current_profile_id() or public.is_admin())
  with check (recipient_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications for insert to authenticated
  with check (public.is_admin());
drop policy if exists "notif_delete" on public.notifications;
create policy "notif_delete" on public.notifications for delete to authenticated
  using (public.is_admin());

-- notification_templates / notification_deliveries: admin only.
drop policy if exists "ntemplates_admin" on public.notification_templates;
create policy "ntemplates_admin" on public.notification_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "ndeliveries_admin" on public.notification_deliveries;
create policy "ndeliveries_admin" on public.notification_deliveries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- support_requests: owner read/create; admin/support manage.
drop policy if exists "support_select" on public.support_requests;
create policy "support_select" on public.support_requests for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "support_insert" on public.support_requests;
create policy "support_insert" on public.support_requests for insert to authenticated
  with check (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "support_update" on public.support_requests;
create policy "support_update" on public.support_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_logs: admin read only. No client insert/update/delete policies → all
-- non-admin writes denied. Writes happen via SECURITY DEFINER triggers (011) or
-- the service role (both bypass RLS). This preserves append-only intent.
drop policy if exists "audit_select" on public.audit_logs;
create policy "audit_select" on public.audit_logs for select to authenticated
  using (public.is_admin() or public.has_permission('audit.read'));

-- admin_actions: admin only.
drop policy if exists "admin_actions_admin" on public.admin_actions;
create policy "admin_actions_admin" on public.admin_actions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- content_reviews: submitter/reviewer/admin.
drop policy if exists "creviews_select" on public.content_reviews;
create policy "creviews_select" on public.content_reviews for select to authenticated
  using (submitted_by = public.current_profile_id() or reviewer_id = public.current_profile_id()
         or public.is_admin() or public.has_permission('content.review'));
drop policy if exists "creviews_write" on public.content_reviews;
create policy "creviews_write" on public.content_reviews for all to authenticated
  using (public.is_admin() or public.has_permission('content.review')
         or submitted_by = public.current_profile_id())
  with check (public.is_admin() or public.has_permission('content.review')
         or submitted_by = public.current_profile_id());

-- media_assets: public-visibility or owner or admin read; owner/content write.
drop policy if exists "media_select" on public.media_assets;
create policy "media_select" on public.media_assets for select to authenticated
  using (visibility = 'public' or owner_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "media_insert" on public.media_assets;
create policy "media_insert" on public.media_assets for insert to authenticated
  with check (owner_profile_id = public.current_profile_id() or public.is_admin()
              or public.has_permission('content.create'));
drop policy if exists "media_update" on public.media_assets;
create policy "media_update" on public.media_assets for update to authenticated
  using (owner_profile_id = public.current_profile_id() or public.is_admin())
  with check (owner_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "media_delete" on public.media_assets;
create policy "media_delete" on public.media_assets for delete to authenticated
  using (owner_profile_id = public.current_profile_id() or public.is_admin());

-- system_settings / feature_flags: admin only.
drop policy if exists "settings_admin" on public.system_settings;
create policy "settings_admin" on public.system_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "flags_admin" on public.feature_flags;
create policy "flags_admin" on public.feature_flags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- site_content: admin only (web-app reads it via the service-role client, which
-- bypasses RLS, so no public read policy is needed). (Round 12 / migration 031.)
drop policy if exists "site_content_admin" on public.site_content;
create policy "site_content_admin" on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- mobile_app_versions: admin only. The mobile app reads it ONLY through the
-- anon-callable whitelist RPC get_mobile_config() in 011. (Stage M1 / migration 045.)
drop policy if exists "mobile_app_versions_admin" on public.mobile_app_versions;
create policy "mobile_app_versions_admin" on public.mobile_app_versions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- free_access_intervals: admin only. Parents/children never read this table
-- directly — scoped reads go through the SECURITY DEFINER helpers in 011
-- (current_parent_free_access / my_free_access_active). (Round 12 / migration 033.)
drop policy if exists "fai_admin" on public.free_access_intervals;
create policy "fai_admin" on public.free_access_intervals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- COLUMN-LEVEL PRIVILEGE HARDENING (authoritative grading / progress columns)
-- =============================================================================
-- RLS is row-level, not column-level: a row-write policy that lets a learner
-- write their own attempt would also let them forge score/is_correct via a direct
-- PostgREST write. To close that, we remove table-level INSERT/UPDATE on these
-- tables from anon + authenticated and grant back ONLY the columns a learner
-- may legitimately set. The protected columns
--   test_attempts.{score, max_score, status, submitted_at, graded_at}
--   test_attempt_answers.{is_correct, points_awarded}
-- therefore become writable ONLY by the service_role (TestService) or a
-- SECURITY DEFINER grading RPC — the intended path.
--
-- Notes:
--   * Supabase grants ALL on public tables to anon/authenticated/service_role by
--     default, so REVOKE here is the operative step; REVOKE of a privilege not
--     held is a harmless no-op.
--   * service_role and postgres are intentionally NOT revoked (server writes).
--   * This also applies to admins acting through the normal authenticated client:
--     grading/regrade and status transitions are privileged SERVER operations
--     (service_role / RPC), consistent with the architecture. The row-level write
--     policies above are kept as defense-in-depth and intent documentation.
--   * A column-level GRANT cannot constrain a role that still holds table-level
--     INSERT/UPDATE, so the table-level privilege is REVOKEd first, then the
--     allowed columns are GRANTed.
--   * SELECT and DELETE are unchanged (DELETE stays gated by the RLS policies).

-- test_attempts: learner may only START an attempt; everything authoritative
-- (score/max_score/status/submitted_at/graded_at) is service-only.
revoke insert, update on public.test_attempts from anon, authenticated;
grant  insert (test_id, student_profile_id) on public.test_attempts to authenticated;

-- test_attempt_answers: learner may record their OWN answer choices/text/timing;
-- is_correct / points_awarded are service-only (grading).
revoke insert, update on public.test_attempt_answers from anon, authenticated;
grant  insert (attempt_id, question_id, selected_option_ids, answer_text, time_spent_ms)
  on public.test_attempt_answers to authenticated;
grant  update (selected_option_ids, answer_text, time_spent_ms)
  on public.test_attempt_answers to authenticated;


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Read-own/parent/admin; NO client write path on either table.
-- -----------------------------------------------------------------------------
alter table public.student_points_ledger enable row level security;
alter table public.student_activity_days enable row level security;

drop policy if exists spl_select on public.student_points_ledger;
create policy spl_select on public.student_points_ledger for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());

drop policy if exists sad_select on public.student_activity_days;
create policy sad_select on public.student_activity_days for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());

--


-- -----------------------------------------------------------------------------
-- LEADERBOARD SEASONS (backported from migrations/2026_07_07_041)
-- Seasons: admin-only select; writes via service-role RPCs.
-- -----------------------------------------------------------------------------
alter table public.leaderboard_seasons enable row level security;
drop policy if exists lseasons_admin on public.leaderboard_seasons;
create policy lseasons_admin on public.leaderboard_seasons for select to authenticated
  using (public.is_admin());   -- writes go through the service-role RPCs below


-- -----------------------------------------------------------------------------
-- NOTIFICATIONS ENGINE (backported from migrations/2026_07_07_042)
-- notifications no-forge hardening + admin_notifications/prefs/push_tokens RLS.
-- -----------------------------------------------------------------------------
-- notifications: NO client insert/update; select own/admin; delete own/admin.
drop policy if exists "notif_insert" on public.notifications;   -- DEFINER RPCs only
drop policy if exists "notif_update" on public.notifications;   -- mark-read via RPC only
drop policy if exists "notif_delete" on public.notifications;
create policy "notif_delete" on public.notifications for delete to authenticated
  using (recipient_profile_id = public.current_profile_id() or public.is_admin());
-- notif_select (recipient or admin) is kept as-is.

alter table public.admin_notifications enable row level security;
drop policy if exists "adminnotif_select" on public.admin_notifications;
create policy "adminnotif_select" on public.admin_notifications for select to authenticated
  using (public.is_admin() or public.has_permission('notifications.send'));
-- writes only via admin_send_notification (DEFINER) → no client write policy.

alter table public.notification_preferences enable row level security;
drop policy if exists "notifprefs_select" on public.notification_preferences;
create policy "notifprefs_select" on public.notification_preferences for select to authenticated
  using (profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(profile_id) or public.is_admin());
-- writes via set_notification_preferences (DEFINER) → no client write policy.

alter table public.push_tokens enable row level security;
drop policy if exists "pushtokens_own" on public.push_tokens;
create policy "pushtokens_own" on public.push_tokens for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "pushtokens_del" on public.push_tokens;
create policy "pushtokens_del" on public.push_tokens for delete to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
-- writes via upsert_push_token (DEFINER) → no client write policy.

-- -----------------------------------------------------------------------------
-- Realtime (migration 043): the in-app notification center subscribes to
-- per-user INSERTs on public.notifications. Guarded — the supabase_realtime
-- publication exists only on Supabase (not on the local from-zero PG), and
-- re-adding a table is a no-op.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- =============================================================================
-- End of 010_rls_policies.sql
-- =============================================================================
