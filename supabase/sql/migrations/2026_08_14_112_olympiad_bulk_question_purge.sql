-- 112 — Bulk purge of a SELECTION of questions inside ONE olympiad package
--
-- WHY
-- ---
-- The admin panel can delete exactly one pool question at a time
-- (deleteOlympiadPackageQuestion in admin-panel/src/lib/admin/olympiad.ts), and
-- it can destroy a WHOLE grade pool or a whole package (migration 111). There is
-- nothing in between. Cleaning 40 bad rows out of a 240-question pool is
-- therefore 40 confirmed clicks — and the alternative an admin reaches for when
-- 40 clicks is too many is a psql session, which is exactly where the
-- migration-095 catastrophe came from.
--
-- WHY A NEW FUNCTION, RATHER THAN CALLING purge_question_set DIRECTLY
-- -------------------------------------------------------------------
-- purge_question_set (migration 111) already implements THE policy — unanswered
-- questions are hard-deleted, answered ones are ARCHIVED, and the split is
-- re-derived inside the DELETE so it cannot drift. It takes a bare uuid[] and it
-- is granted to service_role ONLY, deliberately: it applies that policy to
-- ANY question in the platform, with no notion of who is asking or what the ids
-- are supposed to belong to.
--
-- Handing it an admin-supplied array would mean a caller with content
-- privileges — or a forged PostgREST POST from any signed-in session, since
-- panel RPCs are called as `authenticated` — could purge arbitrary rows out of
-- the GENERAL question bank, which is not part of any olympiad package and is
-- not what the screen the click came from is about.
--
-- The scope check IS this function. Everything else it does is delegation:
--   * public.is_admin() first, because olympiad pools are an Admin-only module
--     and a Content Manager must never reach them;
--   * a hard cap on the array, because an unbounded id list posted straight at
--     a PostgREST endpoint is a denial-of-service shape;
--   * the package's own code as a confirmation token, re-compared HERE under
--     the package's row lock — the same control every other destructive RPC in
--     this family takes, and for the same stated reason: the function is granted
--     to `authenticated`, so it is a PostgREST endpoint an admin session can POST
--     directly. The dialog is not a control, the token is;
--   * every id must belong to p_package_id, or the WHOLE call is refused. Silent
--     partial skipping would be worse than a refusal: the admin ticked N boxes,
--     and quietly getting N-1 of them (with no way to tell which) is how a
--     selection bug becomes invisible;
--   * no attempt may be in flight over the selection — the same mitigation
--     olympiad_package_deletion_blocks applies, narrowed to the rows selected,
--     because that is the only window in which an answer row can appear between
--     the classification and the delete;
--   * A PURCHASED GRADE'S POOL MAY NOT BE DRIVEN BELOW ONE ATTEMPT. See below.
--   * then purge_question_set decides delete-vs-archive. ONE definition of that
--     policy, which is the whole reason 111 factored it out.
--
-- THE PURCHASE RULE, AND WHY IT IS THE SAME RULE AS 111's
-- ------------------------------------------------------
-- olympiad_grade_pool_blocks refuses to empty a purchased grade's pool with the
-- hint grade_has_purchases_purge, and its own comment says why: it "leaves a
-- lifetime purchaser with a package that raises 'pool too small' on every
-- attempt — a silent revocation of a paid entitlement dressed up as a content
-- edit". CLAUDE.md is not negotiable on this: purchasers keep lifetime access.
--
-- A bulk selection reaches that same end state in one confirmed click (filter
-- the pool by grade, tick the header box, confirm), so it has to answer to the
-- same rule. It is applied here in the only form that fits an operation whose
-- effect VARIES with the selection:
--
--     for every grade the selection touches, if that grade has any purchase,
--     the grade's PUBLISHED pool after the operation must still be at least
--     that grade's questions_per_attempt.
--
-- That is not a relaxation of 111's rule, it is the same rule stated as a
-- postcondition. 111's operation always lands the pool on ZERO, and zero is
-- below every legal questions_per_attempt (the column is CHECKed >= 1), so on
-- the operation 111 performs the two predicates give the identical answer —
-- they cannot drift apart into "one half of the panel refuses, the other
-- allows". What the postcondition ADDS is the case 111 never had to consider:
-- a partial selection that leaves the pool standing but too small to serve.
--
-- Both halves of the rule are read from ONE definition each, on purpose:
--   * olympiad_grade_purchase_count is now the ONLY place that spells out what
--     counts as a purchase (any status, plus the legacy snapshot-less rows
--     matched through the student's current grade). olympiad_grade_pool_blocks
--     was rewritten to call it, so the drift that produced this rule's gap in
--     the first place has nowhere left to start;
--   * olympiad_grade_config is the ONLY place that resolves a grade's
--     questions_per_attempt (migration 106's per-grade override, falling back to
--     the package).
-- ARCHIVING a selected row counts as leaving the pool exactly like deleting it,
-- because start_olympiad_attempt draws status = 'published' only — an archived
-- question is just as absent from the purchaser's attempt as a deleted one.
--
-- The escape hatch, when an admin really must clear a purchased pool, is the
-- one CLAUDE.md prescribes and 111 already offers: ARCHIVE the questions. That
-- is restorable, it is never blocked here, and an archived row can then be
-- deleted freely because it is no longer part of the published pool.
--
-- THE PER-ROW PATH IS THE SAME PATH
-- ---------------------------------
-- admin_delete_olympiad_pool_question exists so the panel's one-question Delete
-- button cannot be the bypass that makes all of the above decorative. It is a
-- thin wrapper — it resolves the package's own code and calls the function
-- below with a single id — so there is one body, one purchase rule and one
-- delete/archive policy for both buttons. It does add ONE behaviour of its own:
-- p_refuse_answered, which keeps the shipped per-row UX (a question with answer
-- history is REFUSED with "archive it instead" rather than silently archived).
--
-- WHAT THIS DOES NOT DO
-- ---------------------
--   * It never hard-deletes a question with attempt history — that is
--     purge_question_set's job and trg_question_delete_guard's backstop, and the
--     verify block at the bottom fails this file if that guard is not armed.
--   * It never touches a purchase, a package row or a grade target. Removing the
--     container is migration 111's operation and keeps its own confirmation.
--   * It adds NO trigger on public.questions. A blunt per-row DELETE guard there
--     would also fire on the panel's two rollback deletes (the add-grade undo and
--     the create-question undo in admin-panel/src/lib/admin/olympiad.ts), which
--     remove rows the SAME request just inserted; refusing those would strand
--     half-created content instead of protecting anybody. Enforcement therefore
--     lives where the operation is named, and BOTH panel buttons now go through
--     it.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- olympiad_grade_purchase_count : THE definition of "somebody paid for this
-- (package, grade)".
--
-- Extracted verbatim out of olympiad_grade_pool_blocks, which now calls it. Two
-- callers needed the same predicate and a second copy is how they start
-- disagreeing — which is precisely the gap this migration was rejected for.
--
-- Two properties are deliberate and must not be "tidied":
--   * ANY STATUS counts. olympiad_purchases also allows 'pending' and
--     'refunded', and purchase_olympiad re-activates a refunded row IN PLACE,
--     keeping its grade_id — so a purchase that is merely dormant today becomes
--     an active lifetime entitlement tomorrow, onto a pool that would no longer
--     be servable. remove_olympiad_package_grade's active-only predicate is
--     correct for a restorable ARCHIVE and wrong for anything irreversible.
--   * The grade_id-is-null branch is the legacy snapshot-less purchase: such a
--     purchase plays whichever pool matches the child's CURRENT grade, so that
--     child is entitled to this grade too.
-- p_grade_id IS NULL means "the whole package" — the legacy grade-less package,
-- whose questions carry no grade either.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_purchase_count(
  p_package_id uuid,
  p_grade_id   uuid
)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.olympiad_purchases pu
  where pu.olympiad_package_id = p_package_id
    and (p_grade_id is null
         or pu.grade_id = p_grade_id
         or (pu.grade_id is null and exists (
               select 1 from public.students st
               where st.profile_id = pu.student_profile_id
                 and st.grade_id = p_grade_id)));
$$;

comment on function public.olympiad_grade_purchase_count(uuid, uuid) is
  'Service-internal (migration 112): how many purchases entitle one (package, '
  'grade) — counting EVERY status, and matching legacy grade-less purchases '
  'through the student''s current grade. THE single definition of "somebody '
  'paid for this pool": olympiad_grade_pool_blocks and '
  'olympiad_pool_purchase_blocks both call it so the whole-pool and the '
  'per-selection guard can never disagree. p_grade_id NULL = the whole package.';

revoke all on function public.olympiad_grade_purchase_count(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.olympiad_grade_purchase_count(uuid, uuid) to service_role;


-- -----------------------------------------------------------------------------
-- olympiad_grade_pool_blocks : unchanged behaviour, ONE fewer copy of the
-- purchase predicate. Migration 111 created this function with the predicate
-- inline; the body below delegates it and is otherwise identical.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_pool_blocks(
  p_package_id uuid,
  p_grade_id   uuid,
  p_drop_grade boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  if coalesce(p_drop_grade, false) then
    -- A grade-less package is a legacy state, never a state an edit may
    -- produce. Same spelling as remove_olympiad_package_grade so the shipped
    -- oly2.err.lastGrade copy still applies.
    select count(*)::int into n
    from public.olympiad_package_grades where olympiad_package_id = p_package_id;
    if n <= 1 then
      v := v || jsonb_build_object('hint', 'last_grade', 'count', n);
    end if;
  end if;

  -- The purchase block. p_drop_grade only chooses which SENTENCE the admin
  -- gets: detaching removes an entitlement, while emptying the pool leaves a
  -- lifetime purchaser with a package that raises "pool too small" on every
  -- attempt — a silent revocation of a paid entitlement dressed up as a content
  -- edit. WHAT counts as a purchase is not decided here any more; that is
  -- olympiad_grade_purchase_count's job, shared with the per-selection guard.
  n := public.olympiad_grade_purchase_count(p_package_id, p_grade_id);
  if n > 0 then
    v := v || jsonb_build_object(
           'hint',
           case when coalesce(p_drop_grade, false)
                then 'grade_has_purchases' else 'grade_has_purchases_purge' end,
           'count', n);
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) is
  'Service-internal (migration 111, purchase predicate extracted in 112): the '
  'reasons one (package, grade) pool may not be purged, as a jsonb array of '
  '{hint, count}. p_drop_grade = true adds the last_grade check and reports the '
  'purchase block as grade_has_purchases; false (keep the grade, empty the '
  'pool) reports it as grade_has_purchases_purge, because emptying a purchased '
  'grade''s pool silently revokes a lifetime entitlement. The purchase count '
  'comes from olympiad_grade_purchase_count — ANY status, unlike '
  'remove_olympiad_package_grade, whose active-only predicate is correct for a '
  'restorable ARCHIVE but not for a hard delete a refunded purchase can be '
  're-activated onto.';

-- Re-issued because 112 re-creates the function above. `create or replace`
-- keeps the existing ACL, so dropping these two lines changed nothing on a
-- database that had already run 111 — and silently opened the function to anon
-- on a from-zero bootstrap. Grants belong next to every create, not once.
revoke all on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) to service_role;


-- -----------------------------------------------------------------------------
-- olympiad_pool_purchase_blocks : the SAME rule, for an operation whose effect
-- varies with the selection.
--
-- Returns one block per affected grade whose purchased pool would stop being
-- able to fill an attempt, as {hint, count, grade, remaining, required} so the
-- panel can name the grade and both numbers instead of printing "blocked".
--
-- Every selected PUBLISHED row is counted as leaving the pool, whether
-- purge_question_set will delete it or archive it: start_olympiad_attempt draws
-- status = 'published' only, so to the purchaser the two are the same absence.
-- Selected rows that are already archived change nothing and are ignored.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_pool_purchase_blocks(
  p_package_id   uuid,
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  r      record;
  v_buy  int;
  v_need int;
  v_pool int;
  v_left int;
  v_name text;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return v;
  end if;

  -- Per GRADE, because the rule is about a grade's pool becoming unservable and
  -- one selection may span several of them. `is not distinct from` throughout,
  -- so a legacy grade-less pool is one group rather than none.
  for r in
    select q.grade_id                                        as grade_id,
           count(*) filter (where q.status = 'published')::int as leaving
    from public.questions q
    where q.id = any(p_question_ids)
      and q.olympiad_package_id = p_package_id
    group by q.grade_id
  loop
    continue when r.leaving = 0;

    v_buy := public.olympiad_grade_purchase_count(p_package_id, r.grade_id);
    continue when v_buy = 0;

    select c.questions_per_attempt into v_need
    from public.olympiad_grade_config(p_package_id, r.grade_id) c;
    v_need := greatest(coalesce(v_need, 25), 1);

    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.grade_id is not distinct from r.grade_id
      and q.status = 'published';
    v_left := v_pool - r.leaving;

    if v_left < v_need then
      select g.name into v_name from public.grades g where g.id = r.grade_id;
      v := v || jsonb_build_object(
             'hint', 'grade_purchased_pool_below_attempt',
             'count', v_buy,
             'grade', coalesce(v_name, ''),
             'remaining', v_left,
             'required', v_need);
    end if;
  end loop;

  return v;
end;
$$;

comment on function public.olympiad_pool_purchase_blocks(uuid, uuid[]) is
  'Service-internal (migration 112): the grades of a SELECTION whose purchased '
  'pool would be left unable to fill one attempt, as a jsonb array of {hint '
  'grade_purchased_pool_below_attempt, count = purchases, grade, remaining, '
  'required}. The per-selection form of the rule olympiad_grade_pool_blocks '
  'applies to a whole pool — same purchase predicate '
  '(olympiad_grade_purchase_count), same per-grade requirement '
  '(olympiad_grade_config), so the two can never disagree. An ARCHIVED-instead '
  'of deleted row counts as leaving the pool: attempts draw published only.';

revoke all on function public.olympiad_pool_purchase_blocks(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.olympiad_pool_purchase_blocks(uuid, uuid[]) to service_role;


-- =============================================================================
-- THE TOKEN-LESS ARITY MUST NOT SURVIVE.
--
-- Unconditional, and BEFORE the create: a function whose signature gains a
-- parameter is a new OVERLOAD, not a replacement, and an overload that destroys
-- the same rows without a confirmation token is the bypass itself. Same
-- treatment migration 111 gave admin_delete_olympiad_grade_pool(uuid,uuid,bool).
-- =============================================================================
drop function if exists public.admin_delete_olympiad_questions(uuid, uuid[]);


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_questions : the ADMIN-FACING, package-SCOPED wrapper
-- around purge_question_set.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_questions(
  p_package_id      uuid,
  p_question_ids    uuid[],
  p_expected_code   text,
  p_refuse_answered boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_ids      uuid[] := '{}'::uuid[];
  v_gone     uuid[] := '{}'::uuid[];
  v_raw      int;
  v_foreign  int;
  v_missing  int;
  v_scope    jsonb := '[]'::jsonb;
  v_answered int;
  v_live     int;
  v_blocks   jsonb;
  v_purge    jsonb;
  v_rot      int := 0;
  v_demote   boolean := false;
begin
  -- ADMIN ONLY, AND FIRST. The grant to `authenticated` further down only makes
  -- the RPC reachable from the signed-in admin's own session; this is the gate.
  -- Olympiad pools are an Admin-only module (CLAUDE.md: Content Managers must
  -- not manage the Olympiad Preparation module), so holding content.delete is
  -- deliberately not enough.
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  v_raw := cardinality(coalesce(p_question_ids, '{}'::uuid[]));
  if v_raw = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- 500 is questions_per_attempt's own ceiling, so it is the largest selection
  -- any single attempt could ever be about. Checked on the RAW array, before any
  -- work is done on it: this is a PostgREST endpoint, and an unbounded id list
  -- would let one POST hold a lock while it unnests a million rows.
  if v_raw > 500 then
    raise exception 'admin_delete_olympiad_questions: % ids requested, the limit is 500', v_raw
      using errcode = 'check_violation',
            hint    = 'too_many_questions',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'too_many_questions', 'count', v_raw)),
                        'limit', 500)::text;
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[]) into v_ids
  from unnest(p_question_ids) as u(id)
  where u.id is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package, and pins the
  -- status this function may later demote.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_questions: package not found'
      using errcode = 'no_data_found';
  end if;

  -- THE CONFIRMATION TOKEN, compared HERE and under the lock taken above — the
  -- same control admin_delete_olympiad_grade_pool, admin_delete_olympiad_package
  -- and admin_purge_subject_questions all take. The reason is theirs verbatim:
  -- this function is granted to `authenticated`, which makes it a PostgREST
  -- endpoint any admin session can POST directly, with up to 500 questions of
  -- blast radius. A checkbox in a dialog is not a control; a value the DATABASE
  -- re-checks is. Compared before the ids are looked at so a wrong-tab mix-up
  -- fails on the cheap test.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- THE SCOPE CHECK — the reason this function exists at all.
  --
  -- SECURITY DEFINER is load-bearing here: `questions` is RLS-protected, and an
  -- id that passed only because the row was HIDDEN from the caller would be the
  -- opposite of a scope check.
  --
  -- ALL-OR-NOTHING on purpose. Skipping the strangers and purging the rest would
  -- report a number the admin cannot reconcile with the boxes they ticked, and
  -- would quietly normalise a client that sends ids from another package.
  --
  -- The two failures are COUNTED SEPARATELY because they are different
  -- accidents with different remedies. An id in another package means the client
  -- sent something it should not have — a selection bug worth hunting. An id
  -- that resolves to nothing means the row went away between the dialog opening
  -- and the click, usually because a second admin got there first — nothing is
  -- wrong with the selection, the page is simply stale. Reporting the second as
  -- the first sends the admin looking for a bug that does not exist.
  select count(*)::int into v_foreign
  from unnest(v_ids) as u(id)
  where exists (select 1 from public.questions q
                 where q.id = u.id
                   and q.olympiad_package_id is distinct from p_package_id);
  select count(*)::int into v_missing
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);
  if v_foreign > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_not_in_package',
                                             'count', v_foreign);
  end if;
  if v_missing > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_gone',
                                             'count', v_missing);
  end if;
  if jsonb_array_length(v_scope) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % of % selected id(s) are not in package %, % no longer exist',
      v_foreign, cardinality(v_ids), p_package_id, v_missing
      using errcode = 'check_violation',
            hint    = case when v_foreign > 0
                           then 'question_not_in_package' else 'question_gone' end,
            detail  = jsonb_build_object('blocks', v_scope)::text;
  end if;

  -- The per-row button's one behavioural difference (see the header): a question
  -- with answer history is REFUSED with the shipped "archive it instead"
  -- sentence rather than silently archived. The bulk path never sets this — for
  -- a 40-row selection, refusing the whole call because one row was answered is
  -- exactly the dead end purge_question_set's split exists to avoid.
  if coalesce(p_refuse_answered, false) then
    select count(distinct a.question_id)::int into v_answered
    from public.test_attempt_answers a
    where a.question_id = any(v_ids);
    if v_answered > 0 then
      raise exception 'admin_delete_olympiad_questions: % answered question(s)', v_answered
        using errcode = 'check_violation',
              hint    = 'question_has_attempts',
              detail  = jsonb_build_object(
                          'blocks', jsonb_build_array(
                            jsonb_build_object('hint', 'question_has_attempts',
                                               'count', v_answered)))::text;
    end if;
  end if;

  -- An attempt in flight over the SELECTION. Narrower than the package-wide
  -- block in olympiad_package_deletion_blocks, and narrow is right here: this is
  -- a content edit an admin may need while other grades are being played. It is
  -- still the mitigation for the one real race — an answer row can only appear
  -- through a submit RPC on an in-progress attempt, so a selection no live
  -- attempt is drawing from cannot change classification underneath the purge.
  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_ids;
  if v_live > 0 then
    raise exception 'admin_delete_olympiad_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  -- THE PURCHASE RULE. Delegated whole, for the reason spelled out in the file
  -- header: a second, hand-written copy of "what counts as a purchase" here is
  -- exactly how this operation came to bypass the one migration 111 already
  -- enforced. Every blocked grade travels in DETAIL with its own counts, so the
  -- refusal names the grade instead of being a bare "not allowed".
  v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % purchased grade pool(s) would fall below one attempt',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = 'grade_purchased_pool_below_attempt',
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DELEGATED, never re-implemented: unanswered rows go, answered rows are
  -- archived, and the split is re-derived inside the statement that removes
  -- them. A second copy of that policy here is the drift migration 111 factored
  -- this helper out to prevent.
  v_purge := public.purge_question_set(v_ids);

  -- Which of the selection actually went. purge_question_set reports COUNTS, not
  -- ids, and the survivors are the archived ones — so "gone" is decidable
  -- exactly, and only, by asking which ids no longer resolve.
  select coalesce(array_agg(u.id), '{}'::uuid[]) into v_gone
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);

  -- olympiad_question_rotations.seen_question_ids would keep naming rows that no
  -- longer exist, which makes a re-uploaded pool look partly consumed to that
  -- student and can hand them a short attempt. The row is pure cache, so
  -- resetting it is free — and only the students whose cycle actually touched a
  -- removed id are reset, unlike the grade-pool path which empties the pool
  -- wholesale and can drop every rotation for the grade.
  if cardinality(v_gone) > 0 then
    delete from public.olympiad_question_rotations
     where olympiad_package_id = p_package_id
       and seen_question_ids && v_gone;
    get diagnostics v_rot = row_count;
  end if;

  -- Same auto-demotion admin_delete_olympiad_grade_pool performs, and for the
  -- same reason: leaving an ACTIVE package whose pool can no longer fill an
  -- attempt means the next child to open it gets a runtime failure at attempt
  -- start instead of a closed listing. It stays reachable even with the purchase
  -- rule above, because a grade nobody bought can still be emptied.
  if v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not: the
      -- guard returns early for any row whose new.status is not 'active'. That
      -- early return is what the whole demotion rests on — do not "simplify" it
      -- by suppressing the trigger.
    end if;
  end if;

  -- `deleted` / `archived` are purge_question_set's own spelling, and
  -- `orphaned_media_ids` is the key afterOlympiadDestructiveCall() in
  -- admin-panel/src/lib/admin/olympiad.ts already sweeps from Storage. A second
  -- name for the same array would be two things to keep in step, so there is
  -- exactly one.
  return jsonb_build_object(
    'package_id', p_package_id,
    'requested', cardinality(v_ids),
    'deleted', (v_purge->>'deleted')::int,
    'archived', (v_purge->>'archived')::int,
    'retained', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'reset_rotations', v_rot,
    'package_demoted', v_demote,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean) is
  'Admin-only (migration 112): purges a SELECTION of questions inside ONE '
  'olympiad package — unanswered deleted, answered ARCHIVED, delegated to '
  'purge_question_set so the policy has one definition. Exists to be the SCOPE '
  'CHECK that purge_question_set (service_role-only, bare uuid[]) cannot '
  'perform: is_admin() first, at most 500 ids, p_expected_code must equal the '
  'package code (confirmation_mismatch), and the WHOLE call is refused if any id '
  'is outside the package (question_not_in_package) or no longer exists '
  '(question_gone) — partial silent skipping would hide a wrong selection. Also '
  'refuses while an olympiad attempt is drawing from the selection '
  '(live_attempts) and when a PURCHASED grade''s published pool would be left '
  'unable to fill one attempt (grade_purchased_pool_below_attempt, via '
  'olympiad_pool_purchase_blocks — the per-selection form of the rule '
  'olympiad_grade_pool_blocks applies to a whole pool). p_refuse_answered is the '
  'per-row button''s variant: refuse (question_has_attempts) instead of '
  'archiving. Resets the rotation rows that named a removed question and demotes '
  'an ACTIVE package whose pool can no longer fill an attempt. Returns '
  '{requested, deleted, archived, retained, already_archived, '
  'repaired_practice_sets, reset_rotations, package_demoted, orphaned_media_ids, '
  'media_truncated}.';


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_pool_question : the panel's ONE-question Delete button.
--
-- A thin wrapper, on purpose. Before migration 112 that button was a bare
-- `.delete()` from the panel, which is why it never answered to the purchase
-- rule; giving it its own guarded body would have made a second copy of every
-- rule above, so it makes none — it resolves the package's own code and calls
-- the function above with a single id.
--
-- It takes no token of its own and does not need one. The token exists to bound
-- the blast radius of a direct POST at a 500-id endpoint; this call names ONE
-- row, that row is proved to be inside the named package before anything
-- happens, and the purchase rule is evaluated exactly for a single-row delete.
-- Looping it cannot walk a purchased pool below one attempt: every individual
-- call is a separate statement and each one is checked against the pool as it
-- stands at that moment.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_pool_question(
  p_package_id  uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_pool_question: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.code into v_code
  from public.olympiad_packages p where p.id = p_package_id;
  if not found then
    raise exception 'admin_delete_olympiad_pool_question: package not found'
      using errcode = 'no_data_found';
  end if;

  return public.admin_delete_olympiad_questions(
           p_package_id, array[p_question_id], v_code, true);
end;
$$;

comment on function public.admin_delete_olympiad_pool_question(uuid, uuid) is
  'Admin-only (migration 112): deletes ONE olympiad pool question through '
  'admin_delete_olympiad_questions, so the per-row button answers to the same '
  'scope, live-attempt and PURCHASED-POOL rules as the bulk one instead of '
  'being the bypass around them. Refuses a question with answer history '
  '(question_has_attempts) rather than archiving it, which is the shipped '
  'per-row behaviour. No confirmation token: it names a single row inside a '
  'package it verifies, which is what the token bounds elsewhere.';


-- =============================================================================
-- GRANTS — exactly like the migration-111 admin RPCs.
--
-- The panel calls these as the SIGNED-IN ADMIN's SSR client, not as
-- service_role, so `authenticated` is required and public.is_admin() inside the
-- functions is the real gate. purge_question_set and the two blocks helpers stay
-- service_role-only; nothing here relaxes them, and the verify block below fails
-- this file if anything did.
-- =============================================================================

revoke all on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  from public, anon;
grant execute on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  to authenticated, service_role;

revoke all on function public.admin_delete_olympiad_pool_question(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_olympiad_pool_question(uuid, uuid)
  to authenticated, service_role;


-- =============================================================================
-- VERIFY — any failure raises, which rolls this whole file back.
-- =============================================================================
do $verify$
declare
  v_sig  text := 'public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)';
  v_row  text := 'public.admin_delete_olympiad_pool_question(uuid,uuid)';
  v_buy  text := 'public.olympiad_grade_purchase_count(uuid,uuid)';
  v_blk  text := 'public.olympiad_pool_purchase_blocks(uuid,uuid[])';
  v_pool text := 'public.olympiad_grade_pool_blocks(uuid,uuid,boolean)';
  v_def  text;
  s      text;
begin
  foreach s in array array[v_sig, v_row, v_buy, v_blk, v_pool] loop
    if to_regprocedure(s) is null then
      raise exception '112: % was not created', s;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(s)) then
      raise exception '112: % is not SECURITY DEFINER', s;
    end if;
    -- An unpinned search_path on a SECURITY DEFINER function is a privilege
    -- escalation, not a style issue.
    if not (select coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public, pg_temp']
              from pg_proc p where p.oid = to_regprocedure(s)) then
      raise exception '112: % does not pin search_path', s;
    end if;
    if has_function_privilege('anon', s, 'EXECUTE') then
      raise exception '112: anon can execute %', s;
    end if;
  end loop;

  -- Admin-facing vs service-internal, stated per function rather than assumed.
  foreach s in array array[v_sig, v_row] loop
    if not has_function_privilege('authenticated', s, 'EXECUTE') then
      raise exception '112: authenticated cannot execute %', s;
    end if;
  end loop;
  foreach s in array array[v_buy, v_blk, v_pool] loop
    if has_function_privilege('authenticated', s, 'EXECUTE') then
      raise exception '112: % is reachable from a signed-in session', s;
    end if;
  end loop;

  -- THE TOKEN-LESS OVERLOAD. Postgres keeps an old signature alive when a new
  -- parameter is added, and that overload would destroy the same 500 rows with
  -- no confirmation at all.
  if to_regprocedure('public.admin_delete_olympiad_questions(uuid,uuid[])') is not null then
    raise exception '112: the token-less admin_delete_olympiad_questions(uuid,uuid[]) overload still exists';
  end if;

  -- THE INVARIANT THIS MIGRATION IS BUILT ON. purge_question_set applies the
  -- policy to ANY question in the platform and knows nothing about packages or
  -- callers; the moment it becomes reachable by a signed-in session, this
  -- wrapper's scope check is decoration.
  if to_regprocedure('public.purge_question_set(uuid[])') is null then
    raise exception '112: purge_question_set went missing';
  end if;
  if has_function_privilege('anon', 'public.purge_question_set(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purge_question_set(uuid[])', 'EXECUTE') then
    raise exception '112: purge_question_set is no longer service_role-only';
  end if;

  -- Asserted in the SHIPPED body, not only in this file, so a later hand-edit in
  -- the Dashboard SQL editor cannot quietly undo any of it.
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position('public.purge_question_set(' in v_def) = 0 then
    raise exception '112: % no longer delegates to purge_question_set', v_sig;
  end if;
  -- A second copy of the delete-vs-archive split is exactly the drift that makes
  -- one half of the platform archive answered questions while the other deletes
  -- them. The only rows this function may remove itself are rotation cache rows.
  if position('delete from public.questions' in v_def) > 0 then
    raise exception '112: % carries its own question delete instead of delegating', v_sig;
  end if;
  if position('question_not_in_package' in v_def) = 0
     or position('question_gone' in v_def) = 0 then
    raise exception '112: % lost its package scope check', v_sig;
  end if;
  if position('too_many_questions' in v_def) = 0 then
    raise exception '112: % lost its array cap', v_sig;
  end if;
  if position('public.is_admin()' in v_def) = 0 then
    raise exception '112: % lost its is_admin() gate', v_sig;
  end if;
  if position('confirmation_mismatch' in v_def) = 0 then
    raise exception '112: % lost its confirmation token', v_sig;
  end if;
  if position('public.olympiad_pool_purchase_blocks(' in v_def) = 0 then
    raise exception '112: % no longer applies the purchased-pool rule', v_sig;
  end if;

  -- ONE definition of "what counts as a purchase", asserted from both sides.
  -- 013 check 96 probes olympiad_grade_pool_blocks for the active-only predicate
  -- it must NOT carry; that probe now passes trivially because the predicate
  -- moved, so the delegation is what keeps the invariant real.
  if position('public.olympiad_grade_purchase_count(' in
                pg_get_functiondef(v_pool::regprocedure)) = 0 then
    raise exception '112: olympiad_grade_pool_blocks stopped sharing the purchase predicate';
  end if;
  if position('public.olympiad_grade_purchase_count(' in
                pg_get_functiondef(v_blk::regprocedure)) = 0 then
    raise exception '112: olympiad_pool_purchase_blocks stopped sharing the purchase predicate';
  end if;
  if position('pu.status' in pg_get_functiondef(v_buy::regprocedure)) > 0 then
    raise exception '112: olympiad_grade_purchase_count filters purchases by status';
  end if;
  -- Same for the per-grade requirement: migration 106's override is resolved in
  -- one place, and a hand-rolled coalesce here would silently ignore it.
  if position('public.olympiad_grade_config(' in
                pg_get_functiondef(v_blk::regprocedure)) = 0 then
    raise exception '112: olympiad_pool_purchase_blocks stopped using olympiad_grade_config';
  end if;

  -- The per-row wrapper must stay a wrapper. A body that grew its own delete is
  -- the bypass this function was added to remove.
  v_def := pg_get_functiondef(v_row::regprocedure);
  if position('public.admin_delete_olympiad_questions(' in v_def) = 0 then
    raise exception '112: % stopped delegating to the guarded function', v_row;
  end if;
  if position('delete from public.questions' in v_def) > 0 then
    raise exception '112: % carries its own question delete', v_row;
  end if;

  -- The backstop every destructive path in this family depends on: it is what
  -- turns a mistake in the delete/archive split into an aborted transaction
  -- rather than silently destroyed graded history.
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_question_delete_guard'
                    and tgrelid = 'public.questions'::regclass
                    and not tgisinternal and tgenabled = 'O') then
    raise exception '112: trg_question_delete_guard is missing or disabled';
  end if;

  raise notice '112 OK — olympiad bulk question purge';
end
$verify$;

commit;
