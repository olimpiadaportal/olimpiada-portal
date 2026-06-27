-- Migration: 2026_06_27_005_tighten_content_child_rls.sql
-- Purpose: Scope question CHILD-content write (and read via these for-all policies)
--          to the owner of the parent question. Previously any holder of
--          content.create/content.edit_own could write ANY question's translations/
--          options/explanations. Now: admins, reviewers/publishers, or the user who
--          created the parent question.
-- Environment first applied: development/staging
-- Related root SQL file(s): supabase/sql/010_rls_policies.sql
-- Backport status: completed
-- Destructive change: no (policy redefinition; tightens access, no data change)
-- Rollback notes: restore the previous policies (is_admin OR content.create OR content.edit_own).
-- =============================================================================

-- question_translations -------------------------------------------------------
drop policy if exists "qtrans_write" on public.question_translations;
create policy "qtrans_write" on public.question_translations for all to authenticated
  using (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  )
  with check (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  );

-- answer_options --------------------------------------------------------------
drop policy if exists "aopt_write" on public.answer_options;
create policy "aopt_write" on public.answer_options for all to authenticated
  using (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  )
  with check (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  );

-- question_explanations -------------------------------------------------------
drop policy if exists "qexpl_write" on public.question_explanations;
create policy "qexpl_write" on public.question_explanations for all to authenticated
  using (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  )
  with check (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = public.current_profile_id())
  );

-- answer_option_translations (join through answer_options) --------------------
drop policy if exists "aopttrans_write" on public.answer_option_translations;
create policy "aopttrans_write" on public.answer_option_translations for all to authenticated
  using (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.answer_options o
               join public.questions q on q.id = o.question_id
               where o.id = option_id and q.created_by = public.current_profile_id())
  )
  with check (
    public.is_admin()
    or public.has_permission('content.review')
    or public.has_permission('content.publish')
    or exists (select 1 from public.answer_options o
               join public.questions q on q.id = o.question_id
               where o.id = option_id and q.created_by = public.current_profile_id())
  );
