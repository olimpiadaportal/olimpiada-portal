-- =============================================================================
-- 2026_07_23_079_olympiad_multigrade.sql
-- =============================================================================
-- Round 34 (investor): one olympiad package now targets ONE olympiad type,
-- ONE subject and MULTIPLE grades, with a SEPARATE question pool per grade.
--
--  * olympiad_package_grades  — normalized package↔grade join (backfilled from
--    the legacy single olympiad_packages.grade_id AND from the grades already
--    present on each package's pool questions, so every existing package keeps
--    working unchanged).
--  * The legacy olympiad_packages.grade_id column is KEPT and trigger-synced:
--    exactly-one-grade packages keep it populated (old readers, incl. the
--    currently-deployed mobile build, behave identically); multi-grade
--    packages carry NULL there (an old reader shows no single-grade chip
--    rather than a WRONG one).
--  * Per-grade pools reuse the existing model: pool questions were ALWAYS
--    grade-stamped (bulk import injects the package grade), so a grade's pool
--    is simply questions WHERE olympiad_package_id = P AND grade_id = G. A
--    guard trigger keeps pool questions inside the package's grade set.
--  * olympiad_purchases.grade_id — the entitlement SNAPSHOT. Children are
--    auto-promoted yearly (advance_student_grades), and access is LIFETIME:
--    the pool a child plays is the grade they were in when the parent bought,
--    never silently a different grade's questions.
--  * purchase_olympiad — rejects buying for a child whose grade the package
--    does not cover (hint package_not_for_grade) and snapshots the grade.
--  * start_olympiad_attempt — draws ONLY the entitled grade's pool.
--  * bulk_insert_olympiad_package_questions(+p_grade_id) — per-grade import,
--    per-grade creation-only guard.
--  * get_olympiad_pool_counts(+p_grade_id) — optional per-grade counts.
--  * get_public_olympiad_packages — adds grade_levels int[] (legacy single
--    grade_level/grade_label kept for existing callers).
--  * get_my_olympiad_catalog() — NEW role-aware catalog: a student sees only
--    packages covering THEIR grade; a parent only packages covering at least
--    one of their children's grades (deduped by definition). SECURITY DEFINER
--    so the filter is server-enforced, not client cosmetics.
--  * remove_olympiad_package_grade() — the ONLY way to detach a grade:
--    refuses while any purchase entitles that grade (lifetime access) and
--    ARCHIVES the grade's pool questions (never deletes).
--
-- Non-destructive: no drops of tables/columns/data. Reruns safely.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) olympiad_package_grades : package ↔ grade (normalized target set).
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_package_grades (
  olympiad_package_id uuid not null references public.olympiad_packages (id) on delete cascade,
  grade_id            uuid not null references public.grades (id) on delete restrict,
  created_at          timestamptz not null default now(),
  primary key (olympiad_package_id, grade_id)
);

comment on table public.olympiad_package_grades is
  'Grades an olympiad package targets (Round 34 multi-grade). Each targeted '
  'grade has its OWN pool: questions WHERE olympiad_package_id = P AND '
  'grade_id = G. Legacy packages were backfilled from olympiad_packages.'
  'grade_id and from their pool questions'' grades. Empty set = pre-Round-34 '
  'legacy package with no grade targeting (visible to all, whole-pool play).';

create index if not exists idx_oly_pkg_grades_grade
  on public.olympiad_package_grades (grade_id);

-- Backfill A: the legacy single grade column.
insert into public.olympiad_package_grades (olympiad_package_id, grade_id)
select p.id, p.grade_id
from public.olympiad_packages p
where p.grade_id is not null
on conflict do nothing;

-- Backfill B: grades already present on pool questions (covers legacy packages
-- whose bulk files carried their own meta.grade_level before the package grade
-- became mandatory) — guarantees every existing pool question's grade is a
-- registered target, so the guard trigger below can never reject legacy data.
insert into public.olympiad_package_grades (olympiad_package_id, grade_id)
select distinct q.olympiad_package_id, q.grade_id
from public.questions q
where q.olympiad_package_id is not null
  and q.grade_id is not null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2) Legacy-column sync: olympiad_packages.grade_id mirrors the grade set —
--    the single member when |set| = 1, NULL otherwise. Old readers (deployed
--    mobile builds, get_public_olympiad_packages legacy columns) stay correct
--    for single-grade packages and honestly grade-less for multi-grade ones.
-- -----------------------------------------------------------------------------
create or replace function public.sync_olympiad_package_legacy_grade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg   uuid := coalesce(new.olympiad_package_id, old.olympiad_package_id);
  v_grade uuid;
begin
  select case when count(*) = 1 then (array_agg(g.grade_id))[1] end
    into v_grade
  from public.olympiad_package_grades g
  where g.olympiad_package_id = v_pkg;
  update public.olympiad_packages p
     set grade_id = v_grade
   where p.id = v_pkg
     and p.grade_id is distinct from v_grade;
  return null;
end;
$$;

drop trigger if exists trg_sync_oly_legacy_grade on public.olympiad_package_grades;
create trigger trg_sync_oly_legacy_grade
  after insert or update or delete on public.olympiad_package_grades
  for each row execute function public.sync_olympiad_package_legacy_grade();

-- One-time reconciliation: packages that gained a second grade row from
-- Backfill B must drop the now-misleading single grade_id.
update public.olympiad_packages p
   set grade_id = null
 where p.grade_id is not null
   and (select count(*) from public.olympiad_package_grades g
         where g.olympiad_package_id = p.id) > 1;

-- -----------------------------------------------------------------------------
-- 3) Pool-question grade guard: a question that is PRIVATE to a package must
--    carry one of that package's target grades (when the package has any).
--    Grade-less pool rows are tolerated for legacy safety only.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_pool_grade_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.olympiad_package_id is not null and new.grade_id is not null then
    if exists (select 1 from public.olympiad_package_grades g
                where g.olympiad_package_id = new.olympiad_package_id)
       and not exists (select 1 from public.olympiad_package_grades g
                        where g.olympiad_package_id = new.olympiad_package_id
                          and g.grade_id = new.grade_id) then
      raise exception 'olympiad pool: question grade is not a target grade of the package'
        using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_olympiad_pool_grade_guard on public.questions;
create trigger trg_olympiad_pool_grade_guard
  before insert or update of olympiad_package_id, grade_id on public.questions
  for each row execute function public.olympiad_pool_grade_guard();

-- -----------------------------------------------------------------------------
-- 4) Purchase grade snapshot.
-- -----------------------------------------------------------------------------
alter table public.olympiad_purchases
  add column if not exists grade_id uuid references public.grades (id) on delete set null;

comment on column public.olympiad_purchases.grade_id is
  'Grade the entitlement was bought FOR (the child''s grade at purchase, '
  'validated against the package''s target grades). Attempts draw THIS '
  'grade''s pool, so yearly auto-promotion never re-points a lifetime '
  'purchase at a different grade''s questions. NULL = legacy purchase.';

-- Backfill: current child grade when the package targets it; else the
-- package's only target grade (legacy single-grade packages).
update public.olympiad_purchases pu
   set grade_id = s.grade_id
  from public.students s
 where pu.grade_id is null
   and s.profile_id = pu.student_profile_id
   and s.grade_id is not null
   and exists (select 1 from public.olympiad_package_grades g
                where g.olympiad_package_id = pu.olympiad_package_id
                  and g.grade_id = s.grade_id);

update public.olympiad_purchases pu
   set grade_id = g.grade_id
  from (select olympiad_package_id, (array_agg(grade_id))[1] as grade_id
          from public.olympiad_package_grades
         group by olympiad_package_id
        having count(*) = 1) g
 where pu.grade_id is null
   and g.olympiad_package_id = pu.olympiad_package_id;

-- -----------------------------------------------------------------------------
-- 5) RLS + grants for the new table. Reads follow the package's visibility
--    helper 1:1 (grade targeting is catalog data, not sensitive pool content);
--    writes are Admin-only, same as the package row.
-- -----------------------------------------------------------------------------
alter table public.olympiad_package_grades enable row level security;

drop policy if exists "oly_pkg_grades_select" on public.olympiad_package_grades;
create policy "oly_pkg_grades_select" on public.olympiad_package_grades for select
  using (public.can_view_olympiad_package(olympiad_package_id));
drop policy if exists "oly_pkg_grades_write" on public.olympiad_package_grades;
create policy "oly_pkg_grades_write" on public.olympiad_package_grades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.olympiad_package_grades to anon, authenticated, service_role;
grant insert, update, delete on public.olympiad_package_grades to authenticated;
grant all on public.olympiad_package_grades to service_role;

-- -----------------------------------------------------------------------------
-- 6) purchase_olympiad — grade validation + snapshot. Same signature.
-- -----------------------------------------------------------------------------
create or replace function public.purchase_olympiad(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_child_grade uuid;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_existing    uuid;
  v_ex_status   text;
  v_id          uuid;
begin
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Sales window (migration 070; supersedes the migration-035 event-date gate,
  -- carried over by 070's one-time sale_ends_at := event_starts_at backfill):
  -- the ONE canonical predicate — olympiad_package_on_sale, defined in 015.
  -- Off-sale = not purchasable, full stop (existing purchasers are unaffected —
  -- this guard only blocks NEW purchases).
  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'purchase: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  -- Round 34: when the package targets grades, the child's CURRENT grade must
  -- be one of them, and the purchase snapshots it (attempts draw THAT pool
  -- forever — yearly promotion never re-points a lifetime entitlement).
  -- Empty target set = legacy grade-less package: buyable by anyone (old rule).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'purchase: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT
    -- price/date — and now also the CURRENT grade entitlement.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           grade_id = coalesce(v_buy_grade, grade_id),
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider, grade_id)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none', v_buy_grade)
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active', 'existing', false);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. '
  'service_role only (payment stubbed). Migration 070: only packages passing '
  'olympiad_package_on_sale are purchasable (hint package_not_on_sale). '
  'Round 34: the child''s grade must be a package target grade (hint '
  'package_not_for_grade) and is SNAPSHOTTED on the purchase row.';

-- -----------------------------------------------------------------------------
-- 7) start_olympiad_attempt — grade-scoped pool.
-- -----------------------------------------------------------------------------
create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student    uuid := public.current_profile_id();
  v_pkg        record;
  v_duration   int;
  v_existing   record;
  v_qids       uuid[];
  v_attempt    uuid;
  v_deadline   timestamptz;
  v_grades     uuid[];
  v_buy_grade  uuid;
  v_cur_grade  uuid;
  v_pool_grade uuid;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  select grade_id into v_buy_grade
  from public.olympiad_purchases
  where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active';
  if not found then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select id, subject_id, coalesce(duration_minutes, 25) as dur_min
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  v_duration := v_pkg.dur_min * 60;

  -- Round 34: resolve WHICH grade's pool this child is entitled to.
  --   purchase snapshot → current grade → the only target grade (legacy
  --   single-grade purchases made before the snapshot column) → error.
  -- Empty target set = legacy grade-less package → whole pool (old behavior).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    select grade_id into v_cur_grade from public.students where profile_id = v_student;
    if v_buy_grade is not null and v_buy_grade = any(v_grades) then
      v_pool_grade := v_buy_grade;
    elsif v_cur_grade is not null and v_cur_grade = any(v_grades) then
      v_pool_grade := v_cur_grade;
    elsif cardinality(v_grades) = 1 then
      v_pool_grade := v_grades[1];
    else
      raise exception 'olympiad: package does not cover your grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
  end if;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'olympiad' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', coalesce(v_existing.duration_seconds, v_duration));
    end if;
    update public.test_attempts
       set status = (case when v_existing.deadline_at is null
                          then 'abandoned' else 'expired' end)::public.attempt_status,
           updated_at = now()
     where id = v_existing.id;
  end if;

  -- ALL published questions of the ENTITLED GRADE's pool, random order
  -- (migration 057: no cap; Round 34: never another grade's questions).
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and (v_pool_grade is null or q.grade_id = v_pool_grade)
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
  ) picked;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, is_rated)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, true)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids));
end;
$$;

comment on function public.start_olympiad_attempt(uuid) is
  'Child starts/resumes a TIMED, RATED olympiad attempt on a PURCHASED package. '
  'Round 34: draws ALL published questions of the ENTITLED grade''s pool only '
  '(purchase snapshot → current grade → single target; hint '
  'package_not_for_grade when uncovered). Deadline from duration_minutes.';

-- -----------------------------------------------------------------------------
-- 8) bulk_insert_olympiad_package_questions — per-grade import. The 2-arg
--    version must be DROPPED first: keeping both would make 2-arg calls
--    ambiguous against the new defaulted 3-arg signature.
-- -----------------------------------------------------------------------------
drop function if exists public.bulk_insert_olympiad_package_questions(uuid, jsonb);
drop function if exists public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid);

create function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb,
  p_grade_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_pkg_subj uuid;
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
  v_pool_grade uuid;
begin
  -- Audit H2 (migration 035): olympiad pools are an Admin-only module (content
  -- managers must never manage Olympiad Preparation) — no permission fallback.
  if v_profile is null or not public.is_admin() then
    raise exception 'bulk_insert_olympiad_package_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_olympiad_package_questions: payload must be a JSON array';
  end if;

  select subject_id into v_pkg_subj from public.olympiad_packages where id = p_package_id;
  if not found then
    raise exception 'bulk_insert_olympiad_package_questions: package not found';
  end if;

  -- Round 34: the import targets ONE grade pool. Explicit p_grade_id (the new
  -- per-grade admin flow) or the package's legacy single grade (old callers).
  v_pool_grade := coalesce(p_grade_id,
    (select grade_id from public.olympiad_packages where id = p_package_id));
  if v_pool_grade is null then
    raise exception 'bulk_insert_olympiad_package_questions: no target grade'
      using errcode = 'check_violation', hint = 'pool_grade_missing';
  end if;
  if exists (select 1 from public.olympiad_package_grades g
              where g.olympiad_package_id = p_package_id)
     and not exists (select 1 from public.olympiad_package_grades g
                      where g.olympiad_package_id = p_package_id
                        and g.grade_id = v_pool_grade) then
    raise exception 'bulk_insert_olympiad_package_questions: grade is not a package target'
      using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
  end if;

  -- CREATION-ONLY, now PER GRADE (owner item 15, migration 059 → Round 34):
  -- once THIS grade's pool holds questions, further bulk imports into it are
  -- rejected — each grade's pool is uploaded exactly once, during package
  -- creation or when the grade is first added to the package.
  if exists (select 1 from public.questions
              where olympiad_package_id = p_package_id and grade_id = v_pool_grade) then
    raise exception 'olympiad: questions can only be bulk uploaded once per grade'
      using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      -- Round 34: the TARGET GRADE is authoritative for every row — a stray
      -- meta.grade_level in the file can never leak a question into another
      -- grade's pool.
      v_grade := v_pool_grade;

      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- Module scope (migration 050): olympiad uploads live in 'olympiad' scope —
      -- a topic name matching an exam topic yields a SEPARATE olympiad-scoped row,
      -- so nothing ever surfaces inside the Exams module.
      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic')
            and scope = 'olympiad' limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name, scope)
          values (v_subject, v_grade, v_item->'meta'->>'topic', 'olympiad') returning id into v_topic;
        end if;
        if coalesce(v_item->'meta'->>'subtopic','') <> '' then
          select id into v_subtopic from public.subtopics
            where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
          if v_subtopic is null then
            insert into public.subtopics (topic_id, name)
            values (v_topic, v_item->'meta'->>'subtopic') returning id into v_subtopic;
          end if;
        end if;
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- PRIVATE + published; difficulty removed (difficulty_id null).
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale,
         olympiad_package_id, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'published', v_pl::public.content_locale,
         p_package_id, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') and coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
          insert into public.question_translations (question_id, locale, body, prompt)
          values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                  nullif(v_item->'translations'->v_loc->>'prompt',''));
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          if v_loc in ('az','en','ru') and coalesce(v_opt->'text'->>v_loc,'') <> '' then
            insert into public.answer_option_translations (option_id, locale, text)
            values (v_optid, v_loc::public.content_locale, v_opt->'text'->>v_loc);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) is
  'Bulk import of PRIVATE trilingual questions into ONE GRADE POOL of an '
  'olympiad package (Round 34). p_grade_id must be a package target grade '
  '(default: the legacy single package grade). CREATION-ONLY PER GRADE — '
  'rejected once that grade''s pool has questions. Administrators only.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9) get_olympiad_pool_counts — optional per-grade counts. Drop the 1-arg
--    version first (defaulted 2-arg would be ambiguous for existing callers).
-- -----------------------------------------------------------------------------
drop function if exists public.get_olympiad_pool_counts(uuid[]);
drop function if exists public.get_olympiad_pool_counts(uuid[], uuid);

create function public.get_olympiad_pool_counts(
  p_package_ids uuid[],
  p_grade_id    uuid default null
)
returns table (package_id uuid, question_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_package_ids is null or cardinality(p_package_ids) = 0 then
    return;
  end if;
  if cardinality(p_package_ids) > 100 then
    raise exception 'olympiad pool counts: too many package ids' using errcode = 'check_violation';
  end if;
  return query
    select q.olympiad_package_id, count(*)::int
    from public.questions q
    where q.olympiad_package_id = any(p_package_ids)
      and q.status = 'published'
      and (p_grade_id is null or q.grade_id = p_grade_id)
    group by q.olympiad_package_id;
end;
$$;
comment on function public.get_olympiad_pool_counts(uuid[], uuid) is
  'Real published pool size per olympiad package (Round 21) — Round 34 adds '
  'optional p_grade_id to count ONE grade pool (what a specific child will '
  'actually receive). Counts only; RLS-proof.';
revoke all on function public.get_olympiad_pool_counts(uuid[], uuid) from public, anon;
grant execute on function public.get_olympiad_pool_counts(uuid[], uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10) get_public_olympiad_packages — + grade_levels int[] (return type change
--     → drop + recreate; legacy single grade_level/grade_label preserved).
-- -----------------------------------------------------------------------------
drop function if exists public.get_public_olympiad_packages(int);

create function public.get_public_olympiad_packages(p_limit int default null)
returns table (
  id             uuid,
  code           text,
  title_az       text,
  title_en       text,
  title_ru       text,
  description_az text,
  description_en text,
  description_ru text,
  price_amount   numeric(10,2),
  currency       text,
  subject_code   text,
  subject_name   text,
  grade_level    int,
  grade_label    text,
  grade_levels   int[],
  sale_ends_at   timestamptz,
  event_at       timestamptz,
  question_count int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.code,
    coalesce(t_az.title, p.code)                          as title_az,
    coalesce(t_en.title, t_az.title, p.code)              as title_en,
    coalesce(t_ru.title, t_az.title, p.code)              as title_ru,
    t_az.description                                      as description_az,
    coalesce(t_en.description, t_az.description)          as description_en,
    coalesce(t_ru.description, t_az.description)          as description_ru,
    p.price_amount,
    p.currency,
    s.code                                                as subject_code,
    s.name                                                as subject_name,
    g.level::int                                          as grade_level,
    g.name                                                as grade_label,
    gl.levels                                             as grade_levels,
    p.sale_ends_at,
    p.event_starts_at                                     as event_at,
    coalesce(qc.n, 0)                                     as question_count
  from public.olympiad_packages p
  left join public.olympiad_package_translations t_az
         on t_az.olympiad_package_id = p.id and t_az.locale = 'az'
  left join public.olympiad_package_translations t_en
         on t_en.olympiad_package_id = p.id and t_en.locale = 'en'
  left join public.olympiad_package_translations t_ru
         on t_ru.olympiad_package_id = p.id and t_ru.locale = 'ru'
  left join public.subjects s on s.id = p.subject_id
  left join public.grades   g on g.id = p.grade_id
  left join lateral (
    -- Round 34: the full ordered target-grade set (NULL for legacy grade-less).
    select array_agg(gg.level::int order by gg.level) as levels
    from public.olympiad_package_grades pg
    join public.grades gg on gg.id = pg.grade_id
    where pg.olympiad_package_id = p.id
  ) gl on true
  left join lateral (
    -- get_olympiad_pool_counts parity: REAL published pool size, never the
    -- display-legacy questions_per_attempt.
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
  ) qc on true
  where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
  order by least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc
  -- Migration 072: optional cap. null/<1 = no limit (pre-072 behavior).
  limit case when p_limit is null or p_limit < 1 then null else least(p_limit, 100) end
$$;
comment on function public.get_public_olympiad_packages(int) is
  'Anon-callable catalog of PUBLICLY PURCHASABLE olympiad packages (migration '
  '070): only rows passing olympiad_package_on_sale, with trilingual texts (az '
  'fallback), price, subject/grade context, sale_ends_at, event_at and the REAL '
  'published pool count. Round 34: grade_levels int[] carries the FULL target '
  'set (legacy single grade_level/grade_label kept for old readers). Migration '
  '072: optional p_limit (null or < 1 = all rows, else capped at 100).';
revoke all on function public.get_public_olympiad_packages(int) from public;
grant execute on function public.get_public_olympiad_packages(int) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11) get_my_olympiad_catalog — role-aware, SERVER-enforced storefront filter.
--     Student: only packages covering THEIR grade. Parent: only packages
--     covering at least one of their children's grades (created-by OR active
--     link), deduped by construction; NO children → empty (nothing to buy
--     for). Legacy grade-less packages stay visible to signed-in students/
--     parents (old behavior). Returns catalog/card data ONLY — never pool
--     content. Purchases ("Olimpiadalarım") are intentionally NOT part of
--     this feed: owned packages remain accessible for life via the purchase
--     tables regardless of current grade.
-- -----------------------------------------------------------------------------
drop function if exists public.get_my_olympiad_catalog();
create function public.get_my_olympiad_catalog()
returns table (
  id               uuid,
  title_az         text,
  title_en         text,
  title_ru         text,
  description_az   text,
  description_en   text,
  description_ru   text,
  price_amount     numeric(10,2),
  currency         text,
  duration_minutes int,
  event_at         timestamptz,
  sale_starts_at   timestamptz,
  sale_ends_at     timestamptz,
  cover_bucket     text,
  cover_path       text,
  subject_code     text,
  subject_name     text,
  olympiad_type    text,
  grades           jsonb,
  my_question_count int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_grades  uuid[];
  v_student boolean := false;
begin
  if v_profile is null then return; end if;

  -- Student → own grade; otherwise parent → union of the children's grades.
  select array[s.grade_id] into v_grades
  from public.students s
  where s.profile_id = v_profile and s.grade_id is not null;
  v_student := found;

  if not v_student then
    select array_agg(distinct s.grade_id) into v_grades
    from public.students s
    where s.grade_id is not null
      and (s.created_by_parent_profile_id = v_profile
           or exists (select 1 from public.parent_student_links l
                       where l.parent_profile_id = v_profile
                         and l.student_profile_id = s.profile_id
                         and l.status = 'active'));
    -- A parent with no children has nobody to buy for → graceful empty feed.
    if v_grades is null then return; end if;
  end if;

  return query
  select
    p.id,
    coalesce(t_az.title, p.code),
    coalesce(t_en.title, t_az.title, p.code),
    coalesce(t_ru.title, t_az.title, p.code),
    t_az.description,
    coalesce(t_en.description, t_az.description),
    coalesce(t_ru.description, t_az.description),
    p.price_amount,
    p.currency,
    p.duration_minutes,
    p.event_starts_at,
    p.sale_starts_at,
    p.sale_ends_at,
    m.bucket,
    m.path,
    s.code,
    s.name,
    ot.name,
    coalesce(gj.grades, '[]'::jsonb),
    coalesce(myc.n, 0)
  from public.olympiad_packages p
  left join public.olympiad_package_translations t_az
         on t_az.olympiad_package_id = p.id and t_az.locale = 'az'
  left join public.olympiad_package_translations t_en
         on t_en.olympiad_package_id = p.id and t_en.locale = 'en'
  left join public.olympiad_package_translations t_ru
         on t_ru.olympiad_package_id = p.id and t_ru.locale = 'ru'
  left join public.subjects s on s.id = p.subject_id
  left join public.olympiad_types ot on ot.id = p.olympiad_type_id
  left join public.media_assets m on m.id = p.cover_media_id
  left join lateral (
    -- Full target set with PER-GRADE published pool counts (what each grade's
    -- child will actually receive), sorted by level.
    select jsonb_agg(jsonb_build_object(
             'grade_id', g.grade_id, 'level', gr.level, 'name', gr.name,
             'question_count', coalesce(qc.n, 0))
           order by gr.level) as grades
    from public.olympiad_package_grades g
    join public.grades gr on gr.id = g.grade_id
    left join lateral (
      select count(*)::int as n from public.questions q
      where q.olympiad_package_id = p.id and q.grade_id = g.grade_id
        and q.status = 'published'
    ) qc on true
    where g.olympiad_package_id = p.id
  ) gj on true
  left join lateral (
    -- What THIS caller's family would actually receive: published questions
    -- of the caller-relevant grades (all grades when the package is legacy
    -- grade-less). Students: own grade; parents: matching children grades.
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
      and (
        not exists (select 1 from public.olympiad_package_grades g2
                     where g2.olympiad_package_id = p.id)
        or q.grade_id = any(v_grades)
      )
  ) myc on true
  where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
    and (
      not exists (select 1 from public.olympiad_package_grades g
                   where g.olympiad_package_id = p.id)         -- legacy grade-less
      or exists (select 1 from public.olympiad_package_grades g
                  where g.olympiad_package_id = p.id
                    and g.grade_id = any(v_grades))
    )
  order by least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc;
end;
$$;
comment on function public.get_my_olympiad_catalog() is
  'Role-aware BUYABLE olympiad catalog (Round 34): a student sees only on-sale '
  'packages covering THEIR grade; a parent only those covering at least one of '
  'their children''s grades (no children → empty). Grade targeting is enforced '
  'HERE, server-side — clients cannot widen it. Card data only, incl. per-grade '
  'published pool counts; never pool content. Purchases stay readable forever '
  'via olympiad_purchases (lifetime access, independent of this feed).';
revoke all on function public.get_my_olympiad_catalog() from public, anon;
grant execute on function public.get_my_olympiad_catalog() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12) remove_olympiad_package_grade — THE grade-detach path (Admin-only).
--     Refuses while any purchase entitles that grade (lifetime access is
--     non-negotiable); otherwise ARCHIVES the grade's pool questions (rows are
--     kept — answered questions can never be hard-deleted anyway) and drops
--     the target row. The legacy-sync trigger then re-derives grade_id.
-- -----------------------------------------------------------------------------
create or replace function public.remove_olympiad_package_grade(
  p_package_id uuid,
  p_grade_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
  v_archived  int;
begin
  if not public.is_admin() then
    raise exception 'remove_olympiad_package_grade: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.olympiad_package_grades
                  where olympiad_package_id = p_package_id and grade_id = p_grade_id) then
    raise exception 'remove_olympiad_package_grade: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  -- A package must keep at least one target grade (grade-less is a legacy
  -- state, never a state an edit can produce).
  select count(*) into v_remaining from public.olympiad_package_grades
   where olympiad_package_id = p_package_id;
  if v_remaining <= 1 then
    raise exception 'remove_olympiad_package_grade: a package needs at least one grade'
      using errcode = 'check_violation', hint = 'last_grade';
  end if;

  -- Lifetime access: any purchase entitled to this grade blocks removal.
  if exists (select 1 from public.olympiad_purchases pu
              where pu.olympiad_package_id = p_package_id
                and pu.status = 'active'
                and (pu.grade_id = p_grade_id
                     -- Legacy snapshot-less purchases: the child's current
                     -- grade decides which pool they play — treat a match as
                     -- entitled to this grade.
                     or (pu.grade_id is null and exists (
                           select 1 from public.students st
                           where st.profile_id = pu.student_profile_id
                             and st.grade_id = p_grade_id)))) then
    raise exception 'remove_olympiad_package_grade: purchased entitlements exist for this grade'
      using errcode = 'check_violation', hint = 'grade_has_purchases';
  end if;

  -- Data retention: ARCHIVE the grade's pool (never delete — the DB guard
  -- forbids deleting answered questions, and archived rows stay restorable).
  update public.questions
     set status = 'archived', updated_at = now()
   where olympiad_package_id = p_package_id
     and grade_id = p_grade_id
     and status <> 'archived';
  get diagnostics v_archived = row_count;

  delete from public.olympiad_package_grades
   where olympiad_package_id = p_package_id and grade_id = p_grade_id;

  return jsonb_build_object('removed_grade', p_grade_id, 'archived_questions', v_archived);
end;
$$;
comment on function public.remove_olympiad_package_grade(uuid, uuid) is
  'Admin-only: detach a target grade from an olympiad package. Blocked while '
  'any active purchase entitles that grade (hint grade_has_purchases) or when '
  'it is the last grade (hint last_grade); otherwise the grade''s pool '
  'questions are ARCHIVED (never deleted) and the target row removed.';
revoke all on function public.remove_olympiad_package_grade(uuid, uuid) from public, anon;
grant execute on function public.remove_olympiad_package_grade(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 13) In-migration structural assertions (fail loudly on a broken apply).
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.olympiad_package_grades') is null then
    raise exception 'olympiad_package_grades missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='olympiad_purchases'
                    and column_name='grade_id') then
    raise exception 'olympiad_purchases.grade_id missing';
  end if;
  if to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb,uuid)') is null then
    raise exception 'bulk_insert_olympiad_package_questions(uuid,jsonb,uuid) missing';
  end if;
  if to_regprocedure('public.bulk_insert_olympiad_package_questions(uuid,jsonb)') is not null then
    raise exception 'legacy 2-arg bulk_insert_olympiad_package_questions still present (ambiguity)';
  end if;
  if to_regprocedure('public.get_olympiad_pool_counts(uuid[],uuid)') is null
     or to_regprocedure('public.get_olympiad_pool_counts(uuid[])') is not null then
    raise exception 'get_olympiad_pool_counts signature migration incomplete';
  end if;
  if to_regprocedure('public.get_my_olympiad_catalog()') is null then
    raise exception 'get_my_olympiad_catalog missing';
  end if;
  if to_regprocedure('public.remove_olympiad_package_grade(uuid,uuid)') is null then
    raise exception 'remove_olympiad_package_grade missing';
  end if;
  -- Backfill sanity: every package with a legacy grade_id must be a target.
  if exists (select 1 from public.olympiad_packages p
              where p.grade_id is not null
                and not exists (select 1 from public.olympiad_package_grades g
                                 where g.olympiad_package_id = p.id
                                   and g.grade_id = p.grade_id)) then
    raise exception 'backfill incomplete: package grade_id without target row';
  end if;
  -- Invariant: grade_id populated ⇔ exactly one target grade.
  if exists (select 1 from public.olympiad_packages p
              where p.grade_id is not null
                and (select count(*) from public.olympiad_package_grades g
                      where g.olympiad_package_id = p.id) <> 1) then
    raise exception 'legacy grade_id invariant violated (multi-grade package with grade_id set)';
  end if;
end $$;

commit;

-- =============================================================================
-- End of 2026_07_23_079_olympiad_multigrade.sql
-- =============================================================================
