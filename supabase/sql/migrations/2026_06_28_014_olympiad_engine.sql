-- Migration: 2026_06_28_014_olympiad_engine.sql
-- Purpose: Stage 14 (Olimpiada Preparation) — parent one-time LIFETIME purchase +
--          child olympiad attempts (25 random from the package's curated pool,
--          reusing get_/grade_practice_attempt). Real charge is provider-specific
--          and stubbed (purchase is marked active immediately) until a provider is
--          chosen. purchase_olympiad is service-role (parent action authorizes the
--          parent); start_olympiad_attempt is the authenticated child (purchase-gated).
-- Environment first applied: development/staging
-- Related root SQL file(s): 011 (functions), 013 (validation).
-- Backport status: completed (canonical 011 + 013 #22; from-zero rebuild = 22/22 PASS)
-- Destructive change: no (additive functions)
-- Rollback notes: drop purchase_olympiad(), start_olympiad_attempt().
-- =============================================================================

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
  v_owner    uuid;
  v_price    numeric(10,2);
  v_currency text;
  v_status   public.catalog_status;
  v_existing uuid;
  v_id       uuid;
begin
  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status into v_price, v_currency, v_status
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  if v_status <> 'active' then
    raise exception 'purchase: package not available' using errcode = 'check_violation';
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id into v_existing from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    update public.olympiad_purchases
       set status = 'active', purchased_at = coalesce(purchased_at, now()), updated_at = now()
     where id = v_existing;
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none')
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active', 'existing', false);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. service_role only (payment stubbed).';

create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_subject uuid;
  v_n_per   int;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  select subject_id, questions_per_attempt into v_subject, v_n_per
  from public.olympiad_packages where id = p_package_id;
  v_n_per := coalesce(v_n_per, 25);

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, v_subject, 'olympiad', 'in_progress')
  returning id into v_attempt;

  with picked as (
    select q.id
    from public.olympiad_package_questions opq
    join public.questions q on q.id = opq.question_id
    where opq.olympiad_package_id = p_package_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit greatest(1, v_n_per)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- =============================================================================
-- End of 2026_06_28_014_olympiad_engine.sql
-- =============================================================================
