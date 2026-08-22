-- =============================================================================
-- 2026_08_22_132 — A SOLUTION IS VISIBLE ONLY AFTER THE CHILD HAS EARNED IT.
--
-- `question_explanations` holds the WORKED SOLUTION for each question, and the
-- old policy let ANY signed-in user read it for ANY published question:
--
--     qexpl_select ... using (exists (select 1 from questions q
--       where q.id = question_id and (q.status = 'published' or ...)))
--
-- Supabase exposes PostgREST publicly, so a child signed in on their own account
-- could `GET /rest/v1/question_explanations?select=*` and receive every solution
-- in the bank — including the questions in tomorrow's rated daily round. A rated
-- round is one attempt per subject per day and it feeds the leaderboards, so a
-- child who reads the solutions first scores 100% knowing nothing, and no part
-- of the platform notices.
--
-- THE OLD POLICY KNEW. Its own comment read "explanations: app should reveal
-- only after result; RLS allows published/owner/admin" — the rule was written
-- down and then left to the UI to enforce, which is exactly the gap a direct API
-- call walks through.
--
-- WHAT WAS NOT LEAKED, because it matters for judging the old risk:
-- `answer_options.is_correct` was already protected (probed as a child: 0 rows).
-- Only the prose solution was exposed — which usually contains the answer, but
-- is not the structured correct-option flag.
--
-- THE RULE (owner decision, 2026-08-22): a child sees a solution ONLY for
-- questions in one of their OWN GRADED attempts. That covers daily rounds, topic
-- practice and olympiad packages alike, since all three are `test_attempts` rows.
-- Before answering, nothing.
--
-- THIS IS THE RULE get_test_review ALREADY ENFORCES — it raises `forbidden` when
-- the attempt is not the caller's and `review: attempt not graded yet` when it is
-- unfinished. The table was simply more permissive than the function that is
-- supposed to be its front door. 132 makes them agree.
--
-- WHY THE REVIEW SCREEN STILL WORKS, verified by reading it:
--   * the explanation TEXT comes from `get_test_review`, a SECURITY DEFINER RPC
--     that bypasses RLS entirely and does its own ownership + graded checks;
--   * the one direct table read on that page
--     (child/test/review/[attemptId]/page.tsx:114) selects `question_id, locale`
--     ONLY — no body — to decide whether a ru/en reader is being shown an az
--     fallback. Those questions are in the child's own graded attempt, so the new
--     predicate covers them.
--   * no PARENT surface reads explanations at all (grepped: zero hits under
--     web-app/src/app/(parent)), so no parent branch is needed. If a parent
--     result-view is ever added, it needs its own branch here — it will NOT
--     inherit one.
--
-- COST: the new branch is an EXISTS over test_attempt_answers keyed by
-- question_id (idx_answers_question) joined to test_attempts by primary key,
-- filtered on student_profile_id (idx_attempts_student). Both sides are indexed.
--
-- Self-transacting. Backported verbatim into canonical 010.
-- =============================================================================
begin;

drop policy if exists "qexpl_select" on public.question_explanations;
create policy "qexpl_select" on public.question_explanations for select to authenticated
  using (
    -- Staff and the question's own author: unchanged.
    exists (
      select 1 from public.questions q
      where q.id = question_explanations.question_id
        and (q.created_by = public.current_profile_id()
             or public.is_admin()
             or public.has_permission('content.review')))
    -- ...or the reader ANSWERED this question in an attempt of their own that
    -- has been graded. `status = 'graded'` and not 'submitted', to match
    -- get_test_review exactly: a child whose attempt is still being graded gets
    -- the same answer from both paths instead of two different ones.
    or exists (
      select 1
      from public.test_attempt_answers a
      join public.test_attempts t on t.id = a.attempt_id
      where a.question_id = question_explanations.question_id
        and t.student_profile_id = public.current_profile_id()
        and t.status = 'graded')
  );

-- -----------------------------------------------------------------------------
-- VERIFICATION — probe as a real child, before and after the boundary.
--
-- Asserting on the policy TEXT would prove only that the words are there. This
-- creates a child, becomes them, and requires that they see NOTHING; then gives
-- them a graded attempt containing one question and requires that they see
-- EXACTLY that question's explanations and no others.
-- -----------------------------------------------------------------------------
do $$
declare
  v_auth    uuid := gen_random_uuid();
  v_prof    uuid;
  v_q       uuid;
  v_other   uuid;
  v_att     uuid;
  v_before  int;
  v_mine    int;
  v_leaked  int;
begin
  -- ALIAS THE OUTER TABLE. Written as `e.question_id = id`, the bare `id`
  -- resolves to question_explanations.id -- the inner table has that column too
  -- -- so the EXISTS is self-referential, matches nothing, and the whole probe
  -- silently skips while reporting success. A verification block that tests
  -- nothing is worse than no verification block, because it reads as coverage.
  select q.id into v_q from public.questions q
   where q.status = 'published'
     and exists (select 1 from public.question_explanations e where e.question_id = q.id)
   limit 1;
  if v_q is null then
    raise notice '132: no published question with an explanation here — probe skipped';
    return;
  end if;
  select q.id into v_other from public.questions q
   where q.status = 'published' and q.id <> v_q
     and exists (select 1 from public.question_explanations e where e.question_id = q.id)
   limit 1;

  insert into auth.users (id, email) values (v_auth, 'qexpl132@olympiq.invalid');
  select id into v_prof from public.profiles where auth_user_id = v_auth;
  if v_prof is null then
    insert into public.profiles (auth_user_id, display_name, status)
    values (v_auth, 'qexpl132 probe', 'active') returning id into v_prof;
  end if;
  insert into public.students (profile_id, first_name, last_name, access_status)
  values (v_prof, 'Qexpl', 'Probe', 'active');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);

  -- BEFORE: no attempt at all. Must see nothing.
  set local role authenticated;
  select count(*) into v_before from public.question_explanations;
  reset role;
  if v_before <> 0 then
    raise exception '132: a child with NO attempts can still read % explanation row(s)', v_before;
  end if;

  -- Give them a graded attempt containing exactly one question.
  insert into public.test_attempts
    (student_profile_id, kind, status, question_ids, started_at, submitted_at, graded_at)
  values (v_prof, 'test', 'graded', array[v_q], now(), now(), now())
  returning id into v_att;
  insert into public.test_attempt_answers (attempt_id, question_id, is_correct)
  values (v_att, v_q, true);

  set local role authenticated;
  select count(*) into v_mine from public.question_explanations where question_id = v_q;
  select count(*) into v_leaked from public.question_explanations where question_id <> v_q;
  reset role;

  if v_mine = 0 then
    raise exception '132: the child CANNOT read the explanation for a question they answered — the review screen would break';
  end if;
  if v_leaked <> 0 then
    raise exception '132: the child can still read % explanation row(s) for questions they never answered', v_leaked;
  end if;

  -- Leave nothing behind.
  delete from public.test_attempt_answers where attempt_id = v_att;
  delete from public.test_attempts where id = v_att;
  delete from public.students where profile_id = v_prof;
  delete from public.profiles where id = v_prof;
  delete from auth.users where id = v_auth;

  raise notice '132: before=0 own=% others=0 — solutions are earned, not browsable', v_mine;
end $$;

commit;
