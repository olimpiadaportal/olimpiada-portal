-- =============================================================================
-- 2026_08_22_133 — THE FEATURE TOGGLES DO WHAT THEIR LABELS SAY.
--
-- The admin Settings → Features tab shows nine switches, each with a description
-- written for an administrator. An audit of all nine found the same shape
-- repeatedly: the toggle gates the UI and not the BEHAVIOUR, so the data stays
-- reachable, the job keeps running, or the money keeps moving. This migration
-- fixes the SQL half; the TypeScript half ships alongside it.
--
--   1 (MONEY) — A GIVEAWAY THAT ENDS LEAVES THE PLATFORM UNABLE TO SELL.
--       Switching `giveaway_period` on force-disables `payments` (the
--       exclusivity trigger). The window then expires LAZILY — the flag stays
--       on, `is_giveaway_active()` simply starts returning false — so the
--       resolved mode becomes `off`, NOT `real`. At that instant every family in
--       the campaign loses subject access AND nobody can buy their way back:
--       `assert_payments_enabled` raises inside `create_child_plan`, and every
--       checkout gate answers `gate.paymentsOff`. Nothing anywhere turns
--       `payments` back on — no job, no trigger. The outage is driven by the
--       CLOCK, so nobody has to make a mistake for it to happen, and it lasts
--       until an administrator happens to open Settings.
--       FIX: the trigger now RECORDS that it paused payments, and a new
--       `restore_payments_after_giveaway()` — scheduled hourly — puts the flag
--       back the moment the window is over. The campaign ends into SELLING,
--       which is what "for a limited time" means.
--
--   2 (MONEY) — "LAUNCH PROMOTION" DID NOT CONTROL THE TRIAL.
--       `quote_child_plan` read `launch_promo_config.trial_days` unconditionally
--       and never looked at the flag, so switching the toggle off stopped
--       ADVERTISING the trial on the public pricing page while the platform kept
--       granting it. The copy and the behaviour diverged in the worst direction,
--       and there is no other control anywhere — no admin editor for
--       `trial_days` exists, so the only way to end the trial was raw SQL
--       against production. The flag now zeroes the trial, and migration 126's
--       zero-day guard already routes a 0-day trial into the paid branch.
--
--   3 — `notifications` WAS NOT A MASTER SWITCH. Its description says "when off,
--       no in-app notifications are shown", but `create_notification` — the
--       single insert path — never read it. Every row was still written, the
--       admin composer still reported "sent", and the mobile inbox stayed
--       reachable; only some web surfaces hid. Enforced at the insert now, which
--       is the one place every producer passes through.
--       PRIORITY 1 IS EXEMPT, exactly as the recipient's own mute is: that level
--       is reserved for payment and security, and a platform-wide display toggle
--       must not be able to suppress "we are holding your money".
--
--   4 — `leaderboard` OFF HID THE UI AND LEFT THE RPCs SERVING, including
--       `get_public_leaderboard` to `anon`. An administrator switching a
--       leaderboard off is usually acting on a fairness or privacy concern, and
--       the rankings kept being served to anyone who asked. Both readers now
--       return NO ROWS when the flag is off — empty, never an error, because the
--       UI already handles empty and an exception would surface as a broken page.
--
--   5 — `giveaway.started_at` WAS STAMPED WITH A BARE UPDATE. If the settings row
--       was ever missing, the UPDATE matched nothing, the flag switched on, and
--       the campaign was silently INERT — `is_giveaway_active()` needs a start to
--       compare against. Now an upsert, so the row cannot be absent.
--
-- Self-transacting. Backported into canonical 011 (functions) and 016 (the job).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — the giveaway remembers what it paused, and hands it back.
-- -----------------------------------------------------------------------------
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Migration 121: the demo payment mode was DELETED. Nothing resolves it any
  -- more, so a row carrying this key must never exist again — fail loudly
  -- rather than let a dead switch reappear in the admin panel.
  if new.key = 'demo_payments' then
    raise exception 'payment mode: demo_payments was removed (migration 121)'
      using errcode = 'check_violation', hint = 'demo_payments_removed';
  end if;

  if tg_op = 'UPDATE' and old.enabled = true then
    return new;
  end if;

  -- MIGRATION 133: remember whether PAYMENTS was the thing we just switched off
  -- to make room for a giveaway. Without this the campaign ends into `off`
  -- rather than back into selling, and only a human noticing can undo it.
  if new.key = 'giveaway_period' and new.enabled then
    insert into public.system_settings (key, value_json)
    values ('payments.paused_by_giveaway',
            to_jsonb(exists (select 1 from public.feature_flags
                             where key = 'payments' and enabled)))
    on conflict (key) do update set value_json = excluded.value_json, updated_at = now();
  end if;

  update public.feature_flags
     set enabled = false, updated_at = now()
   where key in ('payments', 'giveaway_period')
     and key <> new.key
     and enabled;

  if new.key = 'giveaway_period' then
    -- MIGRATION 133: UPSERT, not a bare UPDATE. A missing settings row used to
    -- match nothing, so the flag switched on and the campaign was completely
    -- inert — is_giveaway_active() has no start date to measure from and simply
    -- returns false, with no signal anywhere that the window never began.
    insert into public.system_settings (key, value_json)
    values ('giveaway.started_at', to_jsonb(now()))
    on conflict (key) do update set value_json = excluded.value_json, updated_at = now();
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- The restore. Idempotent, safe to run every hour, and deliberately narrow: it
-- only ever re-enables payments when IT was the thing the giveaway paused.
-- -----------------------------------------------------------------------------
create or replace function public.restore_payments_after_giveaway()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag_on boolean;
  v_paused  boolean;
begin
  select enabled into v_flag_on from public.feature_flags where key = 'giveaway_period';
  -- Only act once the campaign is genuinely OVER: the flag still on but the
  -- window elapsed. A running giveaway must not be interrupted.
  if not coalesce(v_flag_on, false) or public.is_giveaway_active() then
    return false;
  end if;

  select coalesce((value_json #>> '{}')::boolean, false) into v_paused
  from public.system_settings where key = 'payments.paused_by_giveaway';

  -- Switching the giveaway flag off lets the exclusivity trigger settle; the
  -- payments flag is then set on its own so the trigger sees a normal UPDATE.
  update public.feature_flags
     set enabled = false, updated_at = now()
   where key = 'giveaway_period' and enabled;

  if coalesce(v_paused, false) then
    update public.feature_flags
       set enabled = true, updated_at = now()
     where key = 'payments' and not enabled;
  end if;

  update public.system_settings
     set value_json = to_jsonb(false), updated_at = now()
   where key = 'payments.paused_by_giveaway';

  return true;
end;
$$;

revoke all on function public.restore_payments_after_giveaway() from public, anon, authenticated;
grant execute on function public.restore_payments_after_giveaway() to service_role;

comment on function public.restore_payments_after_giveaway() is
  'Migration 133: when a giveaway window has elapsed, switch the campaign off and '
  'restore the payments flag IF the giveaway is what paused it. Without this a '
  'campaign ends into payments-off: the cohort loses access and cannot buy back.';

-- -----------------------------------------------------------------------------
-- 2 — "Launch promotion" actually governs the trial.
-- -----------------------------------------------------------------------------
create or replace function public.quote_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_rank    int;
  v_pct     numeric(5,2);
  v_missing int;
  v_count   int;
  v_base    numeric(12,2);
  v_disc    numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_items   jsonb;
  v_groups  jsonb;
  v_ivs     int;
  -- Migration 125: the two values that make this quote agree with the charge.
  v_had_any boolean;
  v_due     numeric(12,2);
begin
  select count(*) into v_count from public.plan_items_normalize(p_items);
  if v_count = 0 then raise exception 'quote: no subjects selected'; end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
  -- shape as the single-interval quote so existing mappers keep working.
  select count(*) into v_missing
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = n.subject_id
      and sp.interval = n.interval
      and sp.status = 'active');
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  -- Sibling rank = (this parent's OTHER children already on a live
  -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
  -- percent composes trivially across cycle groups.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id,
           'interval',   n.interval,
           'price',      sp.price_amount,
           'currency',   'AZN'))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  -- Per-cycle groups, each rounded with EXACTLY today's rule
  -- (discount = round(group_base * pct / 100, 2)).
  with g as (
    select n.interval as iv,
           count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt,
           'base',  g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         coalesce(sum(g.base), 0),
         coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
         count(*)::int
    into v_groups, v_base, v_disc, v_ivs
  from g;

  v_total := v_base - v_disc;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  -- MIGRATION 133 -- THE "LAUNCH PROMOTION" TOGGLE NOW MEANS SOMETHING.
  --
  -- It used to gate exactly one sentence on the public pricing page while the
  -- trial was granted regardless, so switching it OFF stopped ADVERTISING the
  -- promotion and carried on giving it away -- the copy and the behaviour
  -- diverging in the worst of the two directions. There is no other control:
  -- the admin panel has no editor for trial_days, so ending the trial meant raw
  -- SQL against production.
  --
  -- A zero trial is already safe: migration 126's guard routes trial_days = 0
  -- into the ACTIVE/paid branch instead of writing a trial that has already
  -- ended.
  if not coalesce((select enabled from public.feature_flags where key = 'launch_promo'), false) then
    v_trial := 0;
  end if;

  -- MIGRATION 125 -- audit invariant H7 (the preview and the charge are one
  -- computation). The free trial is granted ONCE PER CHILD: create_child_plan
  -- reads exactly this predicate (any prior subscription row, canceled and
  -- expired included) and sets trial_days = 0 / status = 'active' when it is
  -- true. Until now the quote did not look, so a returning child was previewed
  -- a trial they would not get, and a first-time child was previewed a "due
  -- today" of the full total that create_child_plan would not charge. The
  -- preview contradicted the charge in BOTH directions.
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);
  if v_had_any then v_trial := 0; end if;

  -- What the family owes RIGHT NOW. A trialing plan owes nothing until the
  -- trial ends -- create_child_plan runs every subject's first period to the
  -- trial end -- so this is the amount, and the ONLY amount, a checkout may be
  -- opened for.
  v_due := case when v_trial > 0 then 0 else v_total end;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '{}'::jsonb),
    'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
    'due_now', v_due,
    'mixed', coalesce(v_ivs, 0) > 1);
end;
$$;

revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon;
grant execute on function public.quote_child_plan(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3 — `notifications` becomes a real master switch.
-- -----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text default null,
  p_data            jsonb default '{}'::jsonb,
  p_channels        text[] default '{in_app}',
  p_idempotency_key text default null,
  p_priority        int default 5,
  p_action_url      text default null,
  p_category        text default null,
  p_expires_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ch    text;
  v_email boolean;
  v_push  boolean;
begin
  if p_recipient is null then return null; end if;

  -- MIGRATION 133 -- `notifications` IS A MASTER SWITCH, and this is the only
  -- place that can make it one: every producer in the platform inserts through
  -- this function. Before, the toggle hid some web surfaces while every row was
  -- still written, the admin composer still reported "sent", and the mobile
  -- inbox stayed fully reachable.
  --
  -- PRIORITY 1 IS EXEMPT, exactly as the recipient's own mute is below. That
  -- level is reserved for payment and security -- "we are holding your money
  -- and have not delivered" -- and a platform-wide DISPLAY toggle must not be
  -- able to suppress it.
  if coalesce(p_priority, 5) > 1
     and coalesce((select enabled from public.feature_flags where key = 'notifications'), true) = false then
    return null;
  end if;
  -- Respect the recipient's IN-APP preference; missing prefs = enabled.
  if coalesce((select in_app_enabled from public.notification_preferences where profile_id = p_recipient), true) = false
     and coalesce(p_priority, 5) > 1 then
    -- Priority 1 (critical: payment/security) always reaches the inbox.
    return null;
  end if;

  insert into public.notifications
    (recipient_profile_id, type, title, body, data_json, idempotency_key,
     priority, action_url, category, expires_at)
  values
    (p_recipient, p_type, left(p_title, 200), p_body,
     coalesce(p_data, '{}'::jsonb), p_idempotency_key,
     coalesce(p_priority, 5), p_action_url, p_category, p_expires_at)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;   -- deduped (already sent)

  -- Extra channels → pending deliveries, gated by global flag + user preference.
  v_email := coalesce((select email_enabled from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_email'), false);
  v_push  := coalesce((select push_enabled  from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_push'), false);

  foreach v_ch in array coalesce(p_channels, '{}')
  loop
    if v_ch = 'email' and v_email then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'email', 'pending');
    elsif v_ch = 'push' and v_push then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'push', 'pending');
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- 4a — the leaderboard toggle gates the authenticated board.
-- -----------------------------------------------------------------------------
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
    ranked as (
      select b.*,
             rank() over (order by b.value desc)::int as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b where not b.is_provisional
    ),
    prov as (
      select b.*, null::int as rnk,
             (select count(*) from base x where not x.is_provisional)
               + row_number() over (order by b.value desc, b.profile_id) as ord
      from base b where b.is_provisional
    ),
    unioned as (
      select * from ranked
      union all
      select * from prov
    )
    select u.rnk,
           trim(coalesce(u.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(u.last_name), ''), 1) || '.', '')),
           u.city_name, u.district_name, u.school_name, u.grade_level,
           u.value, u.profile_id = v_me,
           u.is_provisional, u.questions, u.correct, u.attempts
    from unioned u
    where u.ord <= v_limit
    order by u.ord;
end;
$$;

revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4b — ...and the anonymous one on the landing page.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_leaderboard(p_limit int default 10)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 10);
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

  -- Overall board = global all-time percentage; provisional (low-sample)
  -- results never appear on the public site. Names are anonymized server-side:
  -- 'Şagird XXXX' (last 4 digits of the 8-digit child id, leading zeros kept).
  return query
    select r.rnk, 'Şagird ' || coalesce(right(st.child_unique_id::text, 4), '····'),
           r.city_name, r.district_name, r.school_name, r.grade_level, r.value
    from (
      select t.*,
             rank() over (order by t.value desc)::int as rnk,
             row_number() over (order by t.value desc, t.best_streak desc,
                                t.last_points_at asc nulls last, t.profile_id) as ord
      from public.lb_rows('percent', 'global', null, 'all_time') t
      where not t.is_provisional
    ) r
    join public.students st on st.profile_id = r.profile_id
    where r.ord <= v_limit
    order by r.ord;
end;
$$;

revoke all on function public.get_public_leaderboard(int) from public;
grant execute on function public.get_public_leaderboard(int) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION — the migration proves its own claims before it commits.
-- -----------------------------------------------------------------------------
do $$
begin
  if position('launch_promo' in pg_get_functiondef('public.quote_child_plan(uuid,jsonb)'::regprocedure)) = 0 then
    raise exception '133: quote_child_plan does not honour the launch_promo flag';
  end if;
  if position('key = ''notifications''' in pg_get_functiondef(
       'public.create_notification(uuid,text,text,text,jsonb,text[],text,int,text,text,timestamptz)'::regprocedure)) = 0 then
    raise exception '133: create_notification is not gated by the notifications flag';
  end if;
  if position('key = ''leaderboard''' in pg_get_functiondef('public.get_leaderboard(text,text,uuid,text,int)'::regprocedure)) = 0
     or position('key = ''leaderboard''' in pg_get_functiondef('public.get_public_leaderboard(int)'::regprocedure)) = 0 then
    raise exception '133: a leaderboard reader is still ungated';
  end if;
  if to_regprocedure('public.restore_payments_after_giveaway()') is null then
    raise exception '133: restore_payments_after_giveaway was not created';
  end if;
  if position('paused_by_giveaway' in pg_get_functiondef('public.fn_payment_mode_exclusivity()'::regprocedure)) = 0 then
    raise exception '133: the exclusivity trigger does not record what it paused';
  end if;
  -- The grant hole this repository has shipped before.
  if has_function_privilege('anon', 'public.restore_payments_after_giveaway()', 'execute')
     or has_function_privilege('authenticated', 'public.restore_payments_after_giveaway()', 'execute') then
    raise exception '133: restore_payments_after_giveaway is executable by anon/authenticated';
  end if;
  raise notice '133: all checks passed';
end $$;

commit;
