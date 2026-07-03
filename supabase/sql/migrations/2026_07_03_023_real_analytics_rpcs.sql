-- =============================================================================
-- 2026_07_03_023_real_analytics_rpcs.sql
-- =============================================================================
-- Round 9 (T6): REAL analytics computed from graded attempts, replacing the
-- Round-8 demo dashboard numbers. Architecture ported from the owner's UniPrep
-- reference project (on-demand PL/pgSQL aggregation RPCs, rolling p_days
-- windows, gap-filled generate_series day buckets, accuracy = correct /
-- NULLIF(answered,0), min-sample rules applied client-side) and adapted to OUR
-- schema (test_attempts / test_attempt_answers already dedupe one row per
-- (attempt, question) — UniPrep's DISTINCT ON canonical-dedup is unnecessary;
-- topics/subtopics are FK joins, not free text).
--
--   * get_child_subject_dashboard(child, subject?, days?) → jsonb
--       one round-trip powering the parent Analytics dashboard per child (+
--       optional subject filter): totals, accuracy, time spent (started_at →
--       submitted_at, clamped), last activity, 7-day activity series, daily
--       accuracy trend, per-topic rows, mistakes by topic/subtopic.
--       Callable by: admins, the linked parent, or the child itself.
--   * get_admin_platform_overview() → jsonb
--       admin-panel platform KPIs + signups/attempts trends. Admin-only.
--
-- SECURITY: SECURITY DEFINER + pinned search_path + in-body authorization
-- (RLS does not apply inside definer functions). EXECUTE revoked from anon
-- (Supabase default-privileges would otherwise grant it).
-- Backported to canonical 011 (functions) + 013 (#5 list, checks #30/#31).
-- Safe to rerun: yes (CREATE OR REPLACE).
-- =============================================================================

create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  -- COALESCE is load-bearing: current_profile_id() can be NULL (no profile),
  -- which would turn the OR-chain NULL and silently skip an un-coalesced guard.
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
  ),
  ans as (
    select a.is_correct, q.topic_id, q.subtopic_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where not is_correct) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*), 0) * 100, 1) from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      -- gap-filled last-7-days series (today inclusive)
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(tot, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) tot,
                     count(*) filter (where is_correct) cor
                from ans group by 1) t
    ),
    'per_topic', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.tot, 'correct', x.cor, 'wrong', x.tot - x.cor,
               'accuracy', round(x.cor::numeric / nullif(x.tot, 0) * 100, 1))
               order by x.tot desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, t.name as tname, count(*) tot,
                     count(*) filter (where a.is_correct) cor
                from ans a
                join public.topics t on t.id = a.topic_id
               group by a.topic_id, t.name) x
    ),
    'mistakes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.tot, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select t.name as tname,
                     coalesce(st.name, '—') as sname,
                     count(*) tot,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.subtopics st on st.id = a.subtopic_id
               group by t.name, coalesce(st.name, '—')
              having count(*) filter (where not a.is_correct) > 0
               order by count(*) filter (where not a.is_correct) desc
               limit 10) y
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int) is
  'Per-child (optionally per-subject) analytics over graded attempts in a rolling window: '
  'totals/accuracy/time/last-activity + 7-day activity, accuracy trend, per-topic rows, '
  'mistakes breakdown. Callable by admins, the linked parent, or the child (in-body check).';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------

create or replace function public.get_admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not coalesce(auth.role() = 'service_role' or public.is_admin(), false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'children_total', (select count(*) from public.students),
    'parents_total',  (select count(*) from public.parents),
    'active_children_7d', (
      select count(distinct student_profile_id) from public.test_attempts
       where submitted_at >= now() - interval '7 days'
    ),
    'attempts_30d', (
      select count(*) from public.test_attempts
       where status = 'graded' and submitted_at >= now() - interval '30 days'
    ),
    'platform_accuracy_30d', (
      select round(count(*) filter (where a.is_correct)::numeric
                   / nullif(count(*), 0) * 100, 1)
        from public.test_attempt_answers a
        join public.test_attempts ta on ta.id = a.attempt_id
       where ta.status = 'graded'
         and ta.submitted_at >= now() - interval '30 days'
    ),
    'questions_published', (
      select count(*) from public.questions
       where status = 'published' and olympiad_package_id is null
    ),
    'active_subscriptions', (
      select count(*) from public.child_subscriptions
       where status in ('trialing', 'active', 'past_due')
    ),
    'signups_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join (select created_at::date dt, count(*) n
                     from public.students group by 1) c on c.dt = d::date
    ),
    'attempts_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 13, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from public.test_attempts
                    where status = 'graded' group by 1) c on c.dt = d::date
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_admin_platform_overview() is
  'Admin-panel platform KPIs (children/parents/actives/attempts/accuracy/questions/'
  'subscriptions) + 30-day signup and 14-day attempts trends. Admin-only (in-body check).';

revoke all on function public.get_admin_platform_overview() from public, anon;
grant execute on function public.get_admin_platform_overview() to authenticated, service_role;

-- =============================================================================
-- End of 2026_07_03_023_real_analytics_rpcs.sql
-- =============================================================================
