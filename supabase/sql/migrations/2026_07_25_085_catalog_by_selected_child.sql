-- =============================================================================
-- 2026_07_25_085_catalog_by_selected_child.sql
-- =============================================================================
-- Round 40: the parent olympiad catalog scopes to ONE selected child.
--
-- get_my_olympiad_catalog gains p_student (default null):
--   * student caller  → own grade, as before (p_student must be NULL or self);
--   * parent + child  → the SERVER verifies the parent-child link, then returns
--     only packages covering THAT child's grade (+ legacy grade-less), with
--     my_question_count = that grade's published pool. Never trusts a client
--     grade — the grade is read from the linked student row.
--   * parent + null   → the Round-34 family union (back-compat; the web
--     storefront keeps its richer server-rendered path and narrows client-side
--     over family-scoped data).
--
-- The zero-arg signature is REPLACED by the defaulted one (zero-arg calls
-- still resolve). Rerun-safe. Backports: 015 (function), 013 (#79 signature).
-- =============================================================================

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

  -- Student → own grade (p_student may only be NULL or the caller itself).
  select array[s.grade_id] into v_grades
  from public.students s
  where s.profile_id = v_profile and s.grade_id is not null;
  v_student := found;
  if v_student and p_student is not null and p_student <> v_profile then
    raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
  end if;

  if not v_student then
    if p_student is not null then
      -- Round 40: ONE selected child — the link and the grade are resolved
      -- server-side (clients can never widen the scope or pass a grade).
      select array[s.grade_id] into v_grades
      from public.students s
      where s.profile_id = p_student and s.grade_id is not null
        and (s.created_by_parent_profile_id = v_profile
             or exists (select 1 from public.parent_student_links l
                         where l.parent_profile_id = v_profile
                           and l.student_profile_id = s.profile_id
                           and l.status = 'active'));
      if v_grades is null then
        -- Not linked (or the child has no grade): linked-but-gradeless gets an
        -- empty feed; an UNLINKED id is an authorization error.
        if exists (select 1 from public.students s
                    where s.profile_id = p_student
                      and (s.created_by_parent_profile_id = v_profile
                           or exists (select 1 from public.parent_student_links l
                                       where l.parent_profile_id = v_profile
                                         and l.student_profile_id = s.profile_id
                                         and l.status = 'active'))) then
          return;
        end if;
        raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
      end if;
    else
      -- Back-compat: no selection → union of the children's grades (Round 34).
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
    -- What the SCOPED audience would actually receive: published questions of
    -- the caller-relevant grades (all grades when the package is legacy
    -- grade-less). Student: own grade; parent: the SELECTED child's grade
    -- (Round 40) or all matching children grades when unscoped.
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
comment on function public.get_my_olympiad_catalog(uuid) is
  'Role-aware BUYABLE olympiad catalog (Round 40): a student sees only on-sale '
  'packages covering THEIR grade; a parent passing a LINKED child sees only that '
  'child''s grade (the selected child is the single source of truth — link and '
  'grade resolved server-side); a parent without a selection keeps the family '
  'union. Card data only, incl. per-grade published pool counts; never pool '
  'content. Purchases stay readable forever via olympiad_purchases.';
revoke all on function public.get_my_olympiad_catalog(uuid) from public, anon;
grant execute on function public.get_my_olympiad_catalog(uuid) to authenticated, service_role;

-- =============================================================================
-- End of 2026_07_25_085_catalog_by_selected_child.sql
-- =============================================================================
