-- =============================================================================
-- 2026_08_31_163 — AN OLYMPIAD A FAMILY PAID FOR MUST NOT VANISH FROM THE APP.
--
-- REPORTED as "some olympiads are missing from the mobile parent tab, including
-- ones we bought". It was not a mobile bug. get_my_olympiad_catalog() is the
-- ONLY list the mobile parent tab renders, and its WHERE clause was:
--
--     where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
--       and (<package has no target grades>  or  <a target grade matches the caller>)
--
-- Two filters, and neither of them knows what the family OWNS.
--
-- olympiad_package_on_sale is `status = 'active' AND now() inside
-- [sale_starts_at, sale_ends_at)` (015:644-657). Migration 070 backfilled
-- `sale_ends_at := event_starts_at` wherever the window was unset, so EVERY
-- package whose event date has passed is now off-sale by construction — and an
-- admin archiving a finished package (one click in the package list) takes it
-- off sale too. Either way the row stopped being returned, and the package
-- disappeared from the parent's screen.
--
-- IT DISAPPEARED ONLY FROM THE PARENT. The child kept playing it, because
-- access is granted by can_view_olympiad_package(), whose purchase branch never
-- reads `status` (015:676-700) — lifetime access is exactly what was sold, and
-- archiving has never revoked it. The web parent page is also correct: it reads
-- purchases FIRST and widens its package query by the owned ids
-- (web-app/src/app/(parent)/olympiads/page.tsx:76-101, whose comment says why).
-- So three of the four surfaces agreed and this function was the outlier — the
-- parent was told a package they had paid for did not exist, while their child
-- was solving it.
--
-- FIX 1 — AN OWNERSHIP BRANCH. The returned set becomes
--     (on sale AND grade-eligible)  OR  (this family holds an ACTIVE purchase)
-- Ownership deliberately bypasses BOTH filters, not just the sales window: a
-- child who has been promoted a grade since the purchase no longer matches the
-- package's target grades, and the grade filter would hide the package for that
-- reason alone. Scope is the SELECTED child (or the whole family when no child
-- is passed), which mirrors the web client's narrowing rule
-- (`pkg.ownedBy.includes(child.id)`) so a sibling's purchase does not surface
-- under a child who does not own it.
--
-- FIX 2 — A GRADE-LESS CHILD LOST THE WHOLE CATALOGUE. students.grade_id is
-- NULLABLE (002:120), and the old body treated a missing grade as "return
-- nothing":
--   * a linked child with no grade hit `if v_grades is null then return`;
--   * a STUDENT with no grade was worse — `v_student := found` was set from a
--     query carrying `and s.grade_id is not null`, so the student row was not
--     found at all and the caller fell through into the PARENT branch, where
--     they looked like a parent with no children. Empty feed, wrong role,
--     silently.
-- Now a missing grade yields an EMPTY grade array rather than an early return:
-- `= any('{}')` is false, so no grade-targeted package matches, and what still
-- shows is legacy grade-less packages plus anything owned. That is precisely
-- what web does for the same child (OlympiadPurchase.tsx:443-445:
-- `pkg.gradeIds === null || pkg.ownedBy.includes(child.id) || …`). We do NOT
-- open the full catalogue to a grade-less child — showing an 11th-grade
-- olympiad to a third-grader would be a different bug, not a fix.
--
-- FIX 3 — THE ROW NOW DESCRIBES ITS OWN STATE. Two columns are added because
-- the client can no longer infer them and must not guess:
--   * is_owned    — the feed is no longer "everything here is on sale".
--   * is_on_sale  — the server's now() is authoritative (015:644-657 says so),
--                   AND it is the only thing that knows `status`. A client
--                   comparing sale_starts_at/sale_ends_at cannot see that a
--                   package was ARCHIVED inside a still-open window, which is
--                   the most common way a package leaves sale here.
-- The mobile parent tab uses them to render an owned-but-withdrawn package as
-- OWNED rather than as unavailable. It adds NO purchase affordance: that tab is
-- browse-only by owner decision (2026-08-18) and this app was rejected under
-- App Store Guideline 3.1.1 on 2026-08-31. Nothing here re-opens a buy path —
-- the function has never sold anything, it only lists.
--
-- BONUS, same read: my_question_count for an OWNED package is now counted
-- against the ENTITLED grade recorded on the purchase (olympiad_purchases
-- .grade_id), not against the child's CURRENT grade. After a grade promotion
-- those differ, the child still plays the entitled pool, and counting the
-- current grade returned 0 — the card read "0 sual" for a package with a full
-- pool. A legacy snapshot-less purchase (grade_id null) falls back to the
-- previous behaviour unchanged — the same legacy handling
-- remove_olympiad_package_grade already uses (015:1231-1237).
--
-- NOT CHANGED, on purpose: the anon-facing get_public_olympiad_packages() stays
-- on-sale-only. It is a storefront for logged-out visitors and has no family to
-- widen by.
--
-- Idempotent: drop-if-exists + create, no data touched. A re-run is a no-op.
-- The return-type change makes DROP mandatory — `create or replace` cannot add
-- a column to a RETURNS TABLE.
--
-- Environment first applied: staging
-- Related root SQL file / BACKPORT TARGET:
--          * supabase/sql/015_olympiad_preparation.sql — section 11,
--            get_my_olympiad_catalog (replace the whole function + comment +
--            grants block, lines 1027-1203)
--            Backport carries the function, its comment and its grants ONLY —
--            NOT this file's `begin;`/`commit;`. A canonical file that
--            self-transacts is what destroyed production on 2026-07-29 (root
--            CLAUDE.md), because its inner commit committed the rebuild's outer
--            transaction including the `drop schema`.
-- Backport status: pending
-- Destructive change: no. Replaces one read-only function; reads and writes no
--          rows. Rollback = re-create the previous definition from 015.
-- 013 validation: check 79 asserts the (uuid) overload exists, the () overload
--          does not, and anon has no EXECUTE. All three still hold below.
-- =============================================================================
begin;

drop function if exists public.get_my_olympiad_catalog();
drop function if exists public.get_my_olympiad_catalog(uuid);
create function public.get_my_olympiad_catalog(p_student uuid default null)
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
  my_question_count int,
  -- Migration 163. is_owned: this row may be present ONLY because the family
  -- owns it. is_on_sale: false for an archived or out-of-window package — a
  -- client can derive neither, it sees neither `status` nor the server clock.
  is_owned         boolean,
  is_on_sale       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_grades    uuid[];   -- grade targeting: which grades make a package relevant
  v_students  uuid[];   -- ownership: whose PURCHASES widen this feed
  v_grade_one uuid;
  v_student   boolean := false;
begin
  if v_profile is null then return; end if;

  -- Student caller → their own grade. The row is looked up WITHOUT the
  -- `grade_id is not null` predicate the old body used: with it, a grade-less
  -- student was "not found", v_student came out false, and the caller fell
  -- through into the parent branch and was treated as a childless parent.
  select s.grade_id into v_grade_one
  from public.students s
  where s.profile_id = v_profile;
  v_student := found;

  if v_student then
    -- A student may only ever ask about themselves.
    if p_student is not null and p_student <> v_profile then
      raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
    end if;
    v_students := array[v_profile];
    -- No grade → an EMPTY array, never an early return. `x = any('{}')` is
    -- false, so grade-targeted packages drop out while legacy grade-less and
    -- owned packages still reach them.
    v_grades := case when v_grade_one is null then '{}'::uuid[] else array[v_grade_one] end;
  else
    if p_student is not null then
      -- Round 40: ONE selected child — the link and the grade are resolved
      -- server-side (clients can never widen the scope or pass a grade).
      select array[s.profile_id], s.grade_id into v_students, v_grade_one
      from public.students s
      where s.profile_id = p_student
        and (s.created_by_parent_profile_id = v_profile
             or exists (select 1 from public.parent_student_links l
                         where l.parent_profile_id = v_profile
                           and l.student_profile_id = s.profile_id
                           and l.status = 'active'));
      -- Unchanged contract: an id this parent has no link to is an
      -- AUTHORIZATION error, not an empty feed. What changed is that a linked
      -- child WITHOUT a grade no longer lands here — the lookup above no
      -- longer requires a grade, so `found` means "linked", nothing more.
      if not found then
        raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
      end if;
      v_grades := case when v_grade_one is null then '{}'::uuid[] else array[v_grade_one] end;
    else
      -- Back-compat: no selection → the whole family (Round 34).
      select array_agg(s.profile_id) into v_students
      from public.students s
      where s.created_by_parent_profile_id = v_profile
         or exists (select 1 from public.parent_student_links l
                     where l.parent_profile_id = v_profile
                       and l.student_profile_id = s.profile_id
                       and l.status = 'active');
      -- A parent with NO children has nobody to browse for and can own nothing
      -- (purchases are per child) → graceful empty feed.
      if v_students is null then return; end if;
      select coalesce(array_agg(distinct s.grade_id), '{}'::uuid[]) into v_grades
      from public.students s
      where s.grade_id is not null
        and (s.created_by_parent_profile_id = v_profile
             or exists (select 1 from public.parent_student_links l
                         where l.parent_profile_id = v_profile
                           and l.student_profile_id = s.profile_id
                           and l.status = 'active'));
    end if;
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
    coalesce(myc.n, 0),
    coalesce(own.owned, false),
    public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
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
    -- Migration 163 — ONE read answers both ownership questions: does this
    -- family hold an ACTIVE purchase of this package (which widens the feed
    -- past the sales window AND past grade targeting), and which grade did
    -- that purchase entitle (which pool the child actually plays).
    -- SECURITY DEFINER means olympiad_purchases RLS does not apply inside this
    -- function, so the scope is pinned explicitly to v_students — ids already
    -- verified above as the caller themselves or a LINKED child.
    -- 'refunded' and 'pending' are excluded: only an active purchase is access.
    -- uq_olympiad_purchase_child makes this at most one row per child, so the
    -- LIMIT only ever bites in the unscoped family-union mode, where any of the
    -- siblings' entitlements is an equally valid answer for a shared listing.
    select true as owned, pu.grade_id as entitled_grade_id
    from public.olympiad_purchases pu
    where pu.olympiad_package_id = p.id
      and pu.status = 'active'
      and pu.student_profile_id = any(v_students)
    order by pu.grade_id nulls last
    limit 1
  ) own on true
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
    -- What the SCOPED audience would actually receive: published questions of
    -- the caller-relevant grades (all grades when the package is legacy
    -- grade-less). Student: own grade; parent: the SELECTED child's grade
    -- (Round 40) or all matching children grades when unscoped.
    -- Migration 163: an OWNED package is counted against the grade the PURCHASE
    -- entitled, not the child's current grade — after a promotion those differ
    -- and the child still plays the entitled pool, so counting the current
    -- grade reported 0 questions for a package that is full.
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
      and case
            when own.entitled_grade_id is not null
              then q.grade_id = own.entitled_grade_id
            when not exists (select 1 from public.olympiad_package_grades g2
                              where g2.olympiad_package_id = p.id)
              then true
            else q.grade_id = any(v_grades)
          end
  ) myc on true
  where
    -- Migration 163: OWNERSHIP FIRST. A package this family paid for is not a
    -- catalogue question at all — it is theirs for life, so neither the sales
    -- window nor grade targeting may remove it from their screen.
    coalesce(own.owned, false)
    or (
      public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
      and (
        not exists (select 1 from public.olympiad_package_grades g
                     where g.olympiad_package_id = p.id)         -- legacy grade-less
        or exists (select 1 from public.olympiad_package_grades g
                    where g.olympiad_package_id = p.id
                      and g.grade_id = any(v_grades))
      )
    )
  -- Live listings first, then the owned/withdrawn tail: `false` sorts before
  -- `true`, so ordering by `not on_sale` puts on-sale rows on top. Inside each
  -- group the original key is unchanged.
  order by (not public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)),
           least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc;
end;
$$;
comment on function public.get_my_olympiad_catalog(uuid) is
  'Role-aware olympiad list for a signed-in family (Round 40; widened by '
  'migration 163). Returns (on sale AND grade-eligible) OR (this family holds '
  'an ACTIVE purchase) — a package that has been archived or whose sales '
  'window closed STAYS visible to the family that bought it, because access is '
  'lifetime and can_view_olympiad_package() never revoked it. A student sees '
  'their own grade, a parent passing a LINKED child sees that child''s (link '
  'and grade resolved server-side), no selection keeps the family union. A '
  'child with NO grade keeps legacy grade-less and owned packages instead of '
  'an empty feed. is_owned / is_on_sale describe the row''s state so a client '
  'need not guess it; my_question_count counts the ENTITLED grade for an owned '
  'package. Card data only, never pool content, and never a purchase path.';
revoke all on function public.get_my_olympiad_catalog(uuid) from public, anon;
grant execute on function public.get_my_olympiad_catalog(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION. Prove the SHAPE (the overload 013 check 79 looks for, the two
-- new columns, the grants) and then prove the MOTIVATION was real by counting
-- the purchases this function was hiding.
-- -----------------------------------------------------------------------------
do $$
declare
  v_result text;
  v_def    text;
  v_hidden int;
begin
  if to_regprocedure('public.get_my_olympiad_catalog(uuid)') is null then
    raise exception '163: get_my_olympiad_catalog(uuid) missing after apply';
  end if;
  if to_regprocedure('public.get_my_olympiad_catalog()') is not null then
    raise exception '163: the zero-arg overload is back — 013 check 79 would fail';
  end if;
  if has_function_privilege('anon', 'public.get_my_olympiad_catalog(uuid)', 'EXECUTE') then
    raise exception '163: anon can execute the family catalog';
  end if;

  v_result := pg_get_function_result('public.get_my_olympiad_catalog(uuid)'::regprocedure);
  if position('is_owned' in v_result) = 0 or position('is_on_sale' in v_result) = 0 then
    raise exception '163: is_owned / is_on_sale missing from the result columns: %', v_result;
  end if;

  -- The ownership branch is the whole point of this migration; a body without
  -- it would still compile and still be wrong.
  v_def := pg_get_functiondef('public.get_my_olympiad_catalog(uuid)'::regprocedure);
  if position('olympiad_purchases' in v_def) = 0 then
    raise exception '163: the ownership branch is not in the installed body';
  end if;

  -- How many active purchases point at a package that is NOT on sale? Every
  -- one of them was a family looking at a screen that denied they owned it.
  select count(*)::int into v_hidden
  from public.olympiad_purchases pu
  join public.olympiad_packages p on p.id = pu.olympiad_package_id
  where pu.status = 'active'
    and not public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at);
  raise notice '163: catalog widened by ownership; % active purchase(s) sat on off-sale packages', v_hidden;
end;
$$;

commit;
