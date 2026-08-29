-- =============================================================================
-- 2026_08_29_156 — THE BOARD IS ORDERED BY PERCENTAGE AGAIN, WHILE THE RANK
--                  NUMBER STAYS EARNED.
--
-- REPORTED: "some leaderboard combinations show a higher percentage below a
-- lower percentage."
--
-- IT IS NOT A CLIENT BUG. The sort key and the printed number are the SAME
-- column: get_leaderboard orders on `value` and every client renders `value`
-- straight from the RPC, in the order returned — no re-sort, no re-index, no
-- pagination (pinned from the TypeScript side by
-- web-app/src/lib/__tests__/leaderboardOrdering.test.ts).
--
-- THE MECHANISM WAS THE UNION. The result was `ranked UNION ALL prov`, and the
-- provisional block computed its sort position as
--
--     (count of ranked rows) + row_number() over (...)
--
-- an OFFSET, not a value. Every provisional row therefore landed BELOW every
-- ranked row whatever its percentage — so a provisional 94% printed under a
-- ranked 61%. It is scope- and period-relative (a board with no provisional
-- rows, or none above the last ranked row, looks perfect), which is exactly why
-- it reproduced in "some combinations" and not others.
--
-- WHAT THE PRODUCT RULE ACTUALLY REQUIRES. Root CLAUDE.md, Round 43: a student
-- is officially RANKED after `leaderboard.rank.min_attempts` completed rounds;
-- below that the result is provisional and its RANK IS WITHHELD. It says
-- nothing about sort position. Withholding a rank number and demoting a row to
-- the bottom of the page were conflated; only the first is the rule.
--
-- SO: one total order over the whole population by value, and the rank NUMBER
-- computed over the non-provisional population only (null for the rest).
-- Percentages now descend monotonically down the page and rank numbers appear
-- only where they are earned. The clients already render "—" for a null rank
-- and already badge provisional rows, so nothing on the page changes shape.
--
-- TIE-BREAKS ARE PRESERVED EXACTLY. The ranked block's four-key order
--     value desc, best_streak desc, last_points_at asc nulls last, profile_id
-- now governs the whole union. The old provisional block used a two-key subset
-- (value desc, profile_id); both end in profile_id, so the order stays total
-- and deterministic and the subset is simply absorbed by the superset.
--
-- CONSEQUENCE, DELIBERATE: p_limit now truncates the board by VALUE rather than
-- filling it with ranked rows first, so a high-percentage provisional student
-- can occupy a top slot and push a ranked student off the visible page. That is
-- what "ordered by percentage" means. The student's own standing is unaffected:
-- get_my_leaderboard_rank / get_child_leaderboard_position read the full
-- population and are not limited.
--
-- NOT CHANGED, ON PURPOSE:
--   * get_public_leaderboard — it filters `where not t.is_provisional` BEFORE
--     ranking, so the landing board contains ranked rows only and is monotonic
--     by construction. It cannot show this symptom; touching it would be churn.
--   * get_my_leaderboard_rank / get_child_leaderboard_position — both already
--     rank with `order by (case when is_provisional then null else value end)
--     desc nulls last`, i.e. among non-provisional rows only, and both already
--     return rank null for a provisional caller. Their numbers agree with the
--     new board's numbers row for row.
--   * lb_rows — untouched; eligibility and the values themselves are correct.
--
-- The migration-133 feature-flag guard is carried forward verbatim; migration
-- 133's own verification asserts on its presence in the function body.
--
-- BACKPORT: supabase/sql/011_indexes_constraints_functions_triggers.sql —
-- replace the body of get_leaderboard (the `create or replace function
-- public.get_leaderboard(...)` block, ~line 8744, and its `comment on function`
-- at ~line 8810) with the version below. lb_rows, get_my_leaderboard_rank,
-- get_child_leaderboard_position and get_public_leaderboard stay as they are.
-- Backport status: completed
-- =============================================================================
begin;

create or replace function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric, is_self boolean,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  -- MIGRATION 133 -- the `leaderboard` toggle gates the DATA, not just the menu.
  -- It was presentation-only: the UI hid while these readers kept serving, and
  -- get_public_leaderboard serves `anon`. An administrator switching a
  -- leaderboard off is usually acting on a fairness or privacy concern.
  -- Returns NO ROWS rather than raising: every caller already renders an empty
  -- board, and an exception would surface as a broken page.
  if coalesce((select enabled from public.feature_flags where key = 'leaderboard'), true) = false then
    return;
  end if;

  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    with base as (
      select * from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
    ),
    ordered as (
      -- MIGRATION 156 -- ONE ordering for ranked and provisional rows alike.
      -- This used to be two separately-ordered blocks concatenated, where the
      -- provisional block's sort position was (count of ranked rows) +
      -- row_number() -- an offset, not a value -- which pinned every provisional
      -- row below every ranked one and printed higher percentages under lower
      -- ones. Ordering and ranking are separate questions; only the RANK is
      -- withheld below min_attempts.
      select b.*,
             -- Rank number over the non-provisional population only. Partitioning
             -- on is_provisional makes the `false` partition byte-for-byte the old
             -- `rank() over (order by value desc)` applied to `where not
             -- is_provisional` (ties share a rank); the `true` partition's number
             -- is computed and discarded. lb_rows never returns a null here
             -- (students.lb_attempts_* are `not null default 0`), so there is no
             -- third partition to reason about.
             case when b.is_provisional then null
                  else rank() over (partition by b.is_provisional
                                    order by b.value desc)::int end as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b
    )
    select u.rnk,
           trim(coalesce(u.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(u.last_name), ''), 1) || '.', '')),
           u.city_name, u.district_name, u.school_name, u.grade_level,
           u.value, u.profile_id = v_me,
           u.is_provisional, u.questions, u.correct, u.attempts
    from ordered u
    where u.ord <= v_limit
    order by u.ord;
end;
$$;

comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live percentage board: ONE order by value (tie-breaks best_streak desc, '
  'last_points_at asc nulls last, profile_id) over ranked and provisional rows '
  'alike, so percentages descend monotonically. Competition rank (ties share) is '
  'computed on the unrounded value over NON-PROVISIONAL rows only; a provisional '
  'row (fewer than min_attempts rounds) keeps its place by value and returns rank '
  'NULL. Numeric ranks only; no ids leave the server.';

revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification. Structural, because the defect is structural: the offset that
-- concatenated the two blocks either exists in the body or it does not.
-- -----------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure);
begin
  -- The union offset is gone. This is the actual bug: any re-introduction of a
  -- "start provisional rows after the ranked ones" offset brings it straight back.
  if position('from base x where not x.is_provisional' in v_def) > 0 then
    raise exception '156: get_leaderboard still offsets provisional rows past the ranked block';
  end if;
  if position('union all' in lower(v_def)) > 0 then
    raise exception '156: get_leaderboard still concatenates two separately-ordered blocks';
  end if;

  -- The four-key tie-break survived intact.
  if position('order by b.value desc, b.best_streak desc' in v_def) = 0
     or position('b.last_points_at asc nulls last, b.profile_id' in v_def) = 0 then
    raise exception '156: get_leaderboard lost its tie-break keys';
  end if;

  -- The rank number is still withheld below min_attempts (product rule).
  if position('case when b.is_provisional then null' in v_def) = 0 then
    raise exception '156: get_leaderboard no longer withholds the rank of a provisional row';
  end if;

  -- Migration 133's flag guard must not have been dropped by this rewrite;
  -- 133 asserts on exactly this substring.
  if position('key = ''leaderboard''' in v_def) = 0 then
    raise exception '156: get_leaderboard lost the feature-flag guard from migration 133';
  end if;

  -- Untouched siblings, confirmed present and still provisional-free / rank-consistent.
  if position('where not t.is_provisional' in
              pg_get_functiondef('public.get_public_leaderboard(int)'::regprocedure)) = 0 then
    raise exception '156: get_public_leaderboard no longer excludes provisional rows';
  end if;

  raise notice '156: leaderboard ordered by value end to end; rank still withheld below min_attempts';
end $$;

commit;
