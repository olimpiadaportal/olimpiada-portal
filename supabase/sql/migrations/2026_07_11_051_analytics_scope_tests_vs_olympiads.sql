-- =============================================================================
-- 2026_07_11_051_analytics_scope_tests_vs_olympiads.sql
-- Owner-reported: parent analytics mixes OLYMPIAD attempts into the Subjects
-- view. Since migration 047 olympiad attempts run on the shared test engine
-- (test_attempts.kind = 'olympiad'), and the dashboard's graded-attempts CTE
-- had NO kind filter — olympiad results silently inflated subject analytics.
--
-- Fix: get_child_subject_dashboard grows p_scope ('tests' default | 'olympiads').
--   * tests      -> kind <> 'olympiad'  (regular test/practice/daily attempts)
--   * olympiads  -> kind =  'olympiad'  (a separate analytics tab in the UI)
--   * unknown values coerce to 'tests' (never raise — old callers keep working)
--   * result gains 'scope' plus 'per_package' (olympiad-package breakdown via
--     the attempt questions' olympiad_package_id; '[]' under tests scope).
-- Adding a defaulted 4th parameter changes the function identity, so the 3-arg
-- version is DROPPED and this one re-granted. Existing named-args callers (web
-- + mobile pass p_student_profile_id/p_subject_id/p_days) resolve to the new
-- function with the default scope and are automatically olympiad-free.
--
-- Backport: 011 (get_child_subject_dashboard). Validation: 013 #60.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

drop function if exists public.get_child_subject_dashboard(uuid, uuid, int);

create function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30,
  p_scope text default 'tests'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_scope text := case when p_scope = 'olympiads' then 'olympiads' else 'tests' end;
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student_profile_id)
    or public.current_profile_id() = p_student_profile_id
  , false) then
    raise exception 'not allowed';
  end if;

  with graded as (
    select ta.id, ta.submitted_at,
           least(greatest(coalesce(
             extract(epoch from (ta.submitted_at - ta.started_at)) / 60.0, 0), 0), 180)
             as minutes_spent
      from public.test_attempts ta
     where ta.student_profile_id = p_student_profile_id
       and ta.status = 'graded'
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
       -- Module scope (migration 051): olympiad attempts never mix into the
       -- Subjects analytics and vice versa.
       and ((v_scope = 'olympiads' and ta.kind = 'olympiad')
         or (v_scope = 'tests' and ta.kind <> 'olympiad'))
  ),
  ans as (
    -- answered = a non-empty stored selection; empty/NULL selection = skipped.
    select a.attempt_id, a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, q.olympiad_package_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'scope', v_scope,
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'answered',  (select count(*) filter (where answered) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where answered and not is_correct) from ans),
      'skipped',   (select count(*) filter (where not answered) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*) filter (where answered), 0) * 100, 1)
                      from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only; days with zero answered
      -- are omitted (skipped-only days would otherwise chart as 0% wrongly).
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(answ, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) filter (where answered) answ,
                     count(*) filter (where is_correct) cor
                from ans group by 1
              having count(*) filter (where answered) > 0) t
    ),
    'per_topic', (
      -- topics with zero answered questions are excluded: strongest/weakest
      -- selection must never rank a topic nobody actually answered.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, t.name as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
               group by a.topic_id, t.name
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select t.name as tname,
                     coalesce(st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.subtopics st on st.id = a.subtopic_id
               group by t.name, coalesce(st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    ),
    'per_package', (
      -- Olympiad scope only: per-package breakdown through the attempt questions'
      -- private-pool link. Title is the az translation (the UI may re-localize
      -- from its own catalog); '[]' under tests scope.
      select coalesce(jsonb_agg(jsonb_build_object(
               'package_id', z.pkg, 'title', z.title,
               'attempts', z.att, 'answered', z.answ, 'correct', z.cor,
               'wrong', z.answ - z.cor, 'skipped', z.skp,
               'accuracy', round(z.cor::numeric / nullif(z.answ, 0) * 100, 1))
               order by z.att desc, z.title), '[]'::jsonb)
        from (select a.olympiad_package_id as pkg,
                     coalesce((select tr.title from public.olympiad_package_translations tr
                                where tr.olympiad_package_id = a.olympiad_package_id
                                  and tr.locale = 'az' limit 1), '—') as title,
                     count(distinct a.attempt_id) att,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
               where v_scope = 'olympiads' and a.olympiad_package_id is not null
               group by a.olympiad_package_id) z
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int, text) is
  'Per-child analytics over graded attempts in a rolling window, module-scoped '
  '(migration 051): p_scope tests (default; kind<>olympiad) or olympiads (kind=olympiad, '
  'adds per_package). Answer states separated (046): wrong counts only answered-and-'
  'incorrect; accuracy uses answered as denominator. Callable by admins, the linked '
  'parent, or the child.';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int, text)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int, text)
  to authenticated, service_role;

-- ---- self-verify --------------------------------------------------------------------
do $$
declare
  v_tests jsonb;
  v_oly   jsonb;
  v_student uuid;
begin
  -- Exactly one version must remain (PostgREST would reject an ambiguous overload).
  if (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_child_subject_dashboard') <> 1 then
    raise exception 'get_child_subject_dashboard must have exactly one signature';
  end if;

  -- Impersonate the service role for the in-body authorization check (psql
  -- runs as the DB owner, which carries no JWT claims).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_student := coalesce((select profile_id from public.students limit 1), gen_random_uuid());

  select public.get_child_subject_dashboard(v_student, null, 30) into v_tests;
  select public.get_child_subject_dashboard(v_student, null, 30, 'olympiads') into v_oly;

  if (v_tests->>'scope') <> 'tests' or (v_oly->>'scope') <> 'olympiads' then
    raise exception 'scope echo wrong: % / %', v_tests->>'scope', v_oly->>'scope';
  end if;
  if jsonb_typeof(v_oly->'per_package') <> 'array' then
    raise exception 'per_package missing from olympiad scope';
  end if;
  if v_tests->'per_package' <> '[]'::jsonb then
    raise exception 'tests scope must not carry per_package rows';
  end if;
  -- Separation invariant: the two scopes partition graded attempts.
  if coalesce((v_tests->'totals'->>'attempts')::int, 0)
     + coalesce((v_oly->'totals'->>'attempts')::int, 0)
     <> (select count(*) from public.test_attempts ta
          where ta.student_profile_id = v_student and ta.status = 'graded'
            and ta.submitted_at >= now() - interval '30 days') then
    raise exception 'tests+olympiads attempts do not partition the graded set';
  end if;
  raise notice 'analytics scope self-verify PASS (tests % / olympiads % attempts).',
    v_tests->'totals'->>'attempts', v_oly->'totals'->>'attempts';
end $$;

commit;
