-- =============================================================================
-- Migration 2026_07_06_035 — Audit Batch 1: DB security hotfix
-- Source: docs/CODEBASE_AUDIT_2026_07_05.md (items H1–H7, C2, M12, M14, M23,
-- M26, L12, L17). Every change here is backported to canonical 010/011/013.
-- Non-destructive except the deliberate live-duplicate cleanup before the new
-- unique index (C2). Run on dev/staging first; validation asserts at the end.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- H1 + M26 — allocate_child_unique_id: idempotent + service-role only.
-- The function was the ONLY SECURITY DEFINER RPC with no revoke block (010's
-- default privileges made it anon/authenticated-executable), and an already-
-- allocated child burned all 50 retries on the registry PK before erroring.
-- -----------------------------------------------------------------------------
create or replace function public.allocate_child_unique_id(p_student_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  tries int := 0;
begin
  -- Idempotent: a child that already holds a registry row keeps its ID.
  select child_unique_id into v_id
  from public.child_unique_ids
  where student_profile_id = p_student_profile_id;
  if v_id is not null then
    update public.students set child_unique_id = v_id
     where profile_id = p_student_profile_id
       and child_unique_id is distinct from v_id;
    return v_id;
  end if;

  loop
    tries := tries + 1;
    -- 10000000..99999999 (no leading zero), ~90M space.
    v_id := (10000000 + floor(random() * 90000000))::bigint::text;
    begin
      insert into public.child_unique_ids (child_unique_id, student_profile_id)
      values (v_id, p_student_profile_id);
      update public.students set child_unique_id = v_id where profile_id = p_student_profile_id;
      return v_id;
    exception when unique_violation then
      if tries > 50 then
        raise exception 'Could not allocate a unique child ID after 50 attempts';
      end if;
      -- random-ID collision: loop and retry
    end;
  end loop;
end;
$$;

revoke all on function public.allocate_child_unique_id(uuid) from public, anon, authenticated;
grant execute on function public.allocate_child_unique_id(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- H3 — answer_options.is_correct must never be readable by learners.
-- The old aopt_select allowed every authenticated user to read ALL columns of
-- published questions' options (answer keys). Options are served to learners
-- exclusively through the SECURITY DEFINER attempt RPCs (which strip is_correct),
-- so direct SELECT is needed only by content authors/reviewers/admins.
-- Option TEXT stays readable via answer_option_translations (not secret).
-- -----------------------------------------------------------------------------
drop policy if exists "aopt_select" on public.answer_options;
create policy "aopt_select" on public.answer_options for select to authenticated
  using (exists (
    select 1 from public.questions q where q.id = question_id
      and (q.created_by = public.current_profile_id()
           or public.is_admin() or public.has_permission('content.review'))));

-- -----------------------------------------------------------------------------
-- L12 — leaderboard rows expose student ids + points to every authenticated
-- user via using(true). Entries: own / linked parent / admin. Snapshots hold
-- rendered rows (entries_json) → admin-only until the Leaderboard plan defines
-- the pseudonymized public serving RPC. Periods/achievements catalogs stay
-- readable (no student data).
-- -----------------------------------------------------------------------------
drop policy if exists "leaderboard_entries_select" on public.leaderboard_entries;
create policy "leaderboard_entries_select" on public.leaderboard_entries for select to authenticated
  using (student_profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(student_profile_id)
         or public.is_admin());
drop policy if exists "leaderboard_snapshots_select" on public.leaderboard_snapshots;
create policy "leaderboard_snapshots_select" on public.leaderboard_snapshots for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- M23 — indexes for the admin questions list's real access patterns:
-- default order created_at desc filtered on the general pool, plus the
-- type/subtopic filters that had no support.
-- -----------------------------------------------------------------------------
create index if not exists idx_questions_pool_created
  on public.questions (olympiad_package_id, created_at desc);
create index if not exists idx_questions_type on public.questions (type_id);
create index if not exists idx_questions_subtopic on public.questions (subtopic_id);

-- -----------------------------------------------------------------------------
-- C2 (part 1) — one live subscription per child, enforced by the DB.
-- Cleanup first: if dev data ever accumulated duplicate live rows, keep the
-- newest and cancel the older ones, then add the partial unique index.
-- -----------------------------------------------------------------------------
with ranked as (
  select id, row_number() over (
           partition by student_profile_id order by created_at desc) as rn
  from public.child_subscriptions
  where status in ('trialing', 'active', 'past_due')
)
update public.child_subscriptions cs
   set status = 'canceled', updated_at = now()
  from ranked r
 where cs.id = r.id and r.rn > 1;

create unique index if not exists uq_child_subscriptions_live
  on public.child_subscriptions (student_profile_id)
  where status in ('trialing', 'active', 'past_due');

-- -----------------------------------------------------------------------------
-- C2 (part 2) + M14 — create_child_subscription:
--   * per-parent advisory lock (double-submit + sibling-rank race),
--   * refuse creation while a live subscription exists,
--   * trial only ONCE per child — a re-subscribe (after cancel/expiry) starts
--     as a paid 'active' period of one interval, never a fresh free trial.
-- Body otherwise identical to the Batch-H version (deferred 8-digit ID etc.).
-- -----------------------------------------------------------------------------
create or replace function public.create_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_q       jsonb;
  v_sub     uuid;
  v_sid     uuid;
  v_trial   int;
  v_child   text;
  v_auth    uuid;
  v_had_any boolean;
  v_status  public.subscription_status;
  v_end     timestamptz;
begin
  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  -- Serialize all subscription writes of ONE family: prevents the double-submit
  -- duplicate row and the concurrent sibling-rank race (audit C2 + M14).
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'create: child already has a live subscription'
      using errcode = 'unique_violation';
  end if;

  v_q := public.quote_child_subscription(p_student_profile_id, p_interval, p_subject_ids);

  -- Trial once per child: any prior subscription row (canceled/expired included)
  -- means no new free trial — the new plan starts as a paid period.
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
  );
  if v_had_any then
    v_trial  := 0;
    v_status := 'active';
    v_end    := now() + case p_interval
                          when 'week'  then interval '7 days'
                          when 'month' then interval '1 month'
                          else              interval '1 year'
                        end;
  else
    v_trial  := (v_q->>'trial_days')::int;
    v_status := 'trialing';
    v_end    := now() + (v_trial || ' days')::interval;
  end if;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_end end,
     now(), v_end,
     (v_q->>'base')::numeric, (v_q->>'discount_percent')::numeric,
     (v_q->>'discount')::numeric, (v_q->>'total')::numeric, 'AZN', 'none')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child has
  -- none, and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students
     set access_status = case when v_status = 'trialing' then 'trialing' else 'active' end::public.child_access_status
   where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', v_status::text, 'trial_days', v_trial,
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

revoke all on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- H7 — subject edits re-price at the LIVE sibling rank (same rule the quote
-- shows), instead of the frozen per-subscription percent. The recomputed
-- percent is stored back so the subscription row and the preview agree.
-- -----------------------------------------------------------------------------
create or replace function public.add_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  if not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active'
  ) then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects (child_subscription_id, subject_id)
  values (v_sub, p_subject_id) on conflict do nothing;

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$$;

create or replace function public.remove_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_count    int;
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, owner_parent_profile_id
    into v_sub, v_interval, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;

  select count(*) into v_count
  from public.subscription_subjects where child_subscription_id = v_sub;
  if v_count <= 1 then
    raise exception 'remove_subject: at least one subject must remain';
  end if;

  delete from public.subscription_subjects
  where child_subscription_id = v_sub and subject_id = p_subject_id;

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 15 else 20 end;

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, sibling_discount_percent = v_pct,
         discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$$;

revoke all on function public.add_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.remove_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_subscription_subject(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- H6 + C1 (lazy half) — start_practice_attempt: access is now derived from a
-- LIVE, DATE-VALID subscription COVERING THE REQUESTED SUBJECT (or giveaway /
-- free-access). The stale students.access_status flag is no longer trusted for
-- authorization (it stays as a display cache refreshed by the recompute job).
-- Rules: trialing/active = live until current_period_end; canceled keeps access
-- until the already-paid period ends; past_due (failed charge) blocks.
-- -----------------------------------------------------------------------------
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_practice: not a student'; end if;

  -- Giveaway window or a per-parent/child free-access interval grants everything;
  -- otherwise the child needs a live, date-valid subscription covering THIS subject
  -- (audit H6: one paid subject must not unlock the rest; audit C1: expiry is
  -- checked lazily against current_period_end, no job required for correctness).
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
    ) then
      raise exception 'start_practice: no active access' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  -- Random selection of published, objective, auto-gradable GENERAL questions for
  -- the subject (grade-matched when the child has a grade). Difficulty is NOT
  -- chosen. PRIVATE olympiad-package questions are excluded (olympiad_package_id IS NULL).
  with picked as (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
    order by random()
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- H5 — grade_practice_attempt: score is derived only from rows that actually
-- belong to the attempt, each question counted once. Previously the loop
-- incremented the score for any client-supplied item whose computed correctness
-- was true — even when the UPDATE matched zero rows or the same question was
-- submitted repeatedly (score forgery).
-- -----------------------------------------------------------------------------
create or replace function public.grade_practice_attempt(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_item    jsonb;
  v_qid     uuid;
  v_sel     uuid[];
  v_correct uuid[];
  v_ok      boolean;
  v_rows    int;
  v_seen    uuid[] := '{}';
  v_score   numeric := 0;
  v_max     int;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;
  if v_status <> 'in_progress' then raise exception 'attempt already submitted'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    -- Audit H5: each question counts once; ids outside the attempt are ignored
    -- (the UPDATE below matches zero rows and awards nothing).
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao where ao.question_id = v_qid and ao.is_correct;

    v_ok := (array_length(v_correct, 1) is not null)
        and (v_sel <@ v_correct) and (v_correct <@ v_sel)
        and coalesce(array_length(v_sel, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    if v_rows > 0 and v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('score', v_score, 'max', v_max,
    'results', (select coalesce(jsonb_agg(jsonb_build_object(
                  'question_id', question_id, 'is_correct', is_correct)), '[]'::jsonb)
                from public.test_attempt_answers where attempt_id = p_attempt_id));
end;
$$;

revoke all on function public.grade_practice_attempt(uuid, jsonb) from public, anon;
grant execute on function public.grade_practice_attempt(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- M12 + L17 — purchase_olympiad: a package whose event date has passed is
-- auto-archived for sale (listings archive lazily; purchasers keep lifetime
-- access), and a refunded→re-purchased row records TODAY's price and date
-- instead of silently reactivating the old figures.
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
  v_owner     uuid;
  v_price     numeric(10,2);
  v_currency  text;
  v_status    public.catalog_status;
  v_event     timestamptz;
  v_existing  uuid;
  v_ex_status text;
  v_id        uuid;
begin
  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, event_starts_at
    into v_price, v_currency, v_status, v_event
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Audit M12: past-event packages are treated as archived for sale.
  if v_status <> 'active' or (v_event is not null and v_event <= now()) then
    raise exception 'purchase: package not available' using errcode = 'check_violation';
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
    end if;
    -- Audit L17: re-buying after a refund records the CURRENT price and date.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           purchased_at = now(), updated_at = now()
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
  'Parent one-time LIFETIME purchase of an olympiad package for a child. service_role only (payment stubbed). Past-event packages are not sellable.';

revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- H4 + M12 — start_olympiad_attempt: the free-play branch filtered on
-- `catalog_status` — the enum's TYPE name, not a column — so giveaway/free-access
-- olympiad play always raised at runtime. Fixed to `status`, and past-event
-- packages are excluded from free play (lazy archive; purchasers unaffected).
-- -----------------------------------------------------------------------------
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
    -- Round 11 (migration 027): an active GIVEAWAY window opens ACTIVE-catalog
    -- packages for free. Archived packages stay purchaser-only (lifetime access);
    -- the giveaway never mints purchase rows. Round 12 (migration 033): an active
    -- per-parent/child FREE-ACCESS interval opens ACTIVE-catalog packages the same
    -- way. Audit H4: the filter previously referenced the nonexistent column
    -- catalog_status. Audit M12: past-event packages count as archived.
    if not ((public.is_giveaway_active()
             or public.is_free_access_active_for_student(v_student))
            and exists (
      select 1 from public.olympiad_packages
      where id = p_package_id and status = 'active'
        and (event_starts_at is null or event_starts_at > now())
    )) then
      raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
    end if;
  end if;

  select subject_id, questions_per_attempt into v_subject, v_n_per
  from public.olympiad_packages where id = p_package_id;
  v_n_per := coalesce(v_n_per, 25);

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, v_subject, 'olympiad', 'in_progress')
  returning id into v_attempt;

  -- PRIVATE pool: questions assigned to this package only (Batch D).
  with picked as (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
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

revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- H2 — bulk_insert_olympiad_package_questions: Admin-ONLY. The gate accepted
-- content.create, which content managers hold, so a CM could inject questions
-- into paid olympiad pools by calling the RPC directly (bypassing the panel's
-- requireAdmin). Body otherwise unchanged.
-- -----------------------------------------------------------------------------
create or replace function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb
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
begin
  -- Audit H2: olympiad pools are an Admin-only module (content managers must
  -- never manage Olympiad Preparation) — administrators only, no permission fallback.
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

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
      if v_type is null then raise exception 'unknown type %', coalesce(v_item->'meta'->>'type','(null)'); end if;

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

      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic') limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name)
          values (v_subject, v_grade, v_item->'meta'->>'topic') returning id into v_topic;
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

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) is
  'Bulk import of PRIVATE trilingual questions for one olympiad package (sets questions.olympiad_package_id, status published). Administrators only (checked internally). Not anon-executable.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Self-verification: fail the transaction loudly if any fix didn't take.
-- -----------------------------------------------------------------------------
do $$
begin
  -- H1: learners can no longer execute the ID allocator.
  if has_function_privilege('authenticated', 'public.allocate_child_unique_id(uuid)', 'execute')
     or has_function_privilege('anon', 'public.allocate_child_unique_id(uuid)', 'execute') then
    raise exception '035 verify: allocate_child_unique_id still client-executable';
  end if;
  -- H2: the olympiad bulk gate no longer accepts content.create.
  if pg_get_functiondef('public.bulk_insert_olympiad_package_questions(uuid, jsonb)'::regprocedure)
     like '%content.create%' then
    raise exception '035 verify: olympiad bulk RPC still accepts content.create';
  end if;
  -- H3: the answer-options read policy no longer opens published rows to learners.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'answer_options'
      and policyname = 'aopt_select' and qual like '%published%'
  ) then
    raise exception '035 verify: aopt_select still exposes published options';
  end if;
  -- H4: no function body references the phantom catalog_status column.
  if pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)
     like '%catalog_status = %' then
    raise exception '035 verify: start_olympiad_attempt still references catalog_status';
  end if;
  -- C2: the one-live-subscription index exists.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_child_subscriptions_live'
  ) then
    raise exception '035 verify: uq_child_subscriptions_live missing';
  end if;
  -- M23: questions indexes exist.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_questions_pool_created'
  ) then
    raise exception '035 verify: idx_questions_pool_created missing';
  end if;
end $$;

commit;
