-- =============================================================================
-- 2026_08_22_135 — THE GIVEAWAY SITS ON TOP OF PAYMENTS, IT NO LONGER REPLACES
--                  THEM (owner decision, 2026-08-22).
--
-- THE OLD MODEL AND THE CONTRADICTION IT CREATED. `payments` and
-- `giveaway_period` were MUTUALLY EXCLUSIVE: switching the campaign on
-- force-disabled payments. But a campaign only ever made SUBJECT ACCESS free —
-- olympiad packages have always been bought, and `startOlympiadPayment` blocks
-- only mode `off`. So during a campaign the admin panel displayed
-- **"Payments: OFF" while olympiad purchases were still reaching the bank and
-- charging real cards.** The most important toggle in the panel was telling the
-- operator something untrue about money.
--
-- THE NEW MODEL, which resolves it without touching the olympiad rail:
--
--   payments OFF                      -> mode 'off'.  Nothing new can be bought.
--                                        A campaign CANNOT be started.
--   payments ON,  giveaway OFF        -> mode 'real'. Everything charges normally.
--   payments ON,  giveaway ON+running -> mode 'giveaway'. SUBSCRIPTIONS are free;
--                                        olympiad packages still charge, and the
--                                        panel now says "Payments: ON", which is
--                                        the truth.
--
-- So the two flags stop being alternatives and become a BASE and a MODIFIER.
-- `payments` answers "is the payment rail open at all"; `giveaway_period`
-- answers "are subscriptions free right now". A modifier cannot run without its
-- base, which is the one new rule this migration enforces.
--
-- WHAT FOLLOWS FROM IT, and why this is simpler than what it replaces:
--
--   * A CAMPAIGN NOW ENDS BY ITSELF, with nothing to repair. Migration 133 had
--     to record what the campaign had paused and hand it back on a schedule,
--     because the window elapsing left the platform in `off` — unable to sell,
--     with the whole cohort locked out. Payments are never switched off now, so
--     the window elapsing simply moves the resolved mode from 'giveaway' to
--     'real'. `restore_payments_after_giveaway()` and its hourly job are
--     therefore RETIRED here rather than left as dead machinery that flips
--     flags nobody is watching. Nothing is lost: no campaign has ever run on
--     production (`giveaway.started_at` has never been stamped), so there is no
--     legacy paused state for it to have repaired.
--
--   * OLYMPIAD PACKAGES ARE UNCHANGED, deliberately (owner, 2026-08-22): they
--     are always bought, and once bought they are the family's forever whether
--     they were paid for or comped. A campaign never covered them and still
--     does not.
--
--   * TURNING PAYMENTS OFF ENDS A RUNNING CAMPAIGN. The alternative — refusing
--     the change — would trap an operator who needs the kill switch during an
--     incident, and the kill switch must always win. This cascade is the only
--     way the two flags can disagree, so it is handled explicitly instead of
--     being left to produce a state no resolver expects.
--
-- Self-transacting. Backported into canonical 011 and 016.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — the dependency replaces the exclusivity.
-- -----------------------------------------------------------------------------
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payments_on boolean;
begin
  -- Migration 121: the demo payment mode was DELETED. Nothing resolves it any
  -- more, so a row carrying this key must never exist again — fail loudly
  -- rather than let a dead switch reappear in the admin panel.
  if new.key = 'demo_payments' then
    raise exception 'payment mode: demo_payments was removed (migration 121)'
      using errcode = 'check_violation', hint = 'demo_payments_removed';
  end if;

  -- MIGRATION 135: a campaign is a MODIFIER on an open payment rail, not an
  -- alternative to one. Free subscriptions still need the rail available for
  -- everything a campaign does NOT cover — olympiad packages — and an operator
  -- must never see "Payments: OFF" while cards are being charged.
  if new.key = 'giveaway_period' and new.enabled then
    select coalesce(enabled, false) into v_payments_on
      from public.feature_flags where key = 'payments';
    if not coalesce(v_payments_on, false) then
      raise exception 'payment mode: a giveaway needs payments to be on'
        using errcode = 'check_violation', hint = 'giveaway_requires_payments';
    end if;
  end if;

  -- THE KILL SWITCH ALWAYS WINS. Turning payments off during a campaign ends the
  -- campaign rather than being refused: an operator reaching for the kill switch
  -- in an incident must not be blocked by a promotion, and leaving the campaign
  -- on with no rail beneath it is a state no resolver expects.
  if new.key = 'payments' and not new.enabled then
    update public.feature_flags
       set enabled = false, updated_at = now()
     where key = 'giveaway_period' and enabled;
  end if;

  if new.key = 'giveaway_period' and new.enabled then
    -- UPSERT, not a bare UPDATE (migration 133). A missing settings row matched
    -- nothing, so the flag switched on and the campaign was silently INERT:
    -- is_giveaway_active() has no start date to measure from.
    insert into public.system_settings (key, value_json)
    values ('giveaway.started_at', to_jsonb(now()))
    on conflict (key) do update set value_json = excluded.value_json, updated_at = now();
  end if;

  return new;
end;
$$;

-- THE TRIGGER ITSELF HAS TO BE WIDENED, and this is not cosmetic. Its WHEN
-- clause was
--     new.key = 'demo_payments'
--     OR (new.enabled = true AND new.key in ('payments','giveaway_period'))
-- so it fired ONLY when a flag was switched ON — correct for the old model,
-- where the only job was to force the sibling off. Under the new rules the
-- important moment is payments being switched OFF, which that clause skips
-- entirely: the cascade below would never have run and a campaign would have
-- kept resolving with no rail beneath it. Caught by this migration's own
-- verification block rather than in production.
drop trigger if exists trg_payment_mode_exclusivity on public.feature_flags;
create trigger trg_payment_mode_exclusivity
  after insert or update of enabled on public.feature_flags
  for each row
  when (new.key = 'demo_payments'
        or new.key in ('payments', 'giveaway_period'))
  execute function public.fn_payment_mode_exclusivity();

-- -----------------------------------------------------------------------------
-- 2 — a campaign resolves only while the rail is open.
--
-- Belt and braces with the trigger above: the trigger stops the pair being
-- created, this stops any pair that somehow exists from resolving to a mode that
-- gives access away with no rail behind it.
-- -----------------------------------------------------------------------------
create or replace function public.current_payment_mode()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags      jsonb;
  v_real       boolean;
  v_gvw_flag   boolean;
  v_gvw_active boolean := false;
  v_gvw_days   int := 0;
  v_gvw_start  timestamptz;
  v_setting    jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
    from public.feature_flags
   where key in ('payments', 'giveaway_period');

  v_real     := coalesce((v_flags ->> 'payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags ->> 'giveaway_period')::boolean, false);

  select value_json into v_setting from public.system_settings
   where key = 'giveaway.duration_days';
  if v_setting is not null then
    begin
      v_gvw_days := floor((v_setting #>> '{}')::numeric)::int;
    exception when others then
      v_gvw_days := 0;
    end;
  end if;

  select value_json into v_setting from public.system_settings
   where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;

  -- MIGRATION 135: `v_real and` is the whole change. A campaign is a modifier on
  -- an open rail; without the rail there is no campaign, only 'off'.
  if v_real and v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_active := now() < v_gvw_start + make_interval(days => v_gvw_days);
  end if;

  return case
    when v_gvw_active then 'giveaway'
    when v_real       then 'real'
    else 'off'
  end;
end;
$$;

revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3 — retire the repair machinery the old model needed.
--
-- Dropped rather than left inert: a scheduled job that rewrites feature flags is
-- not something to leave lying around once the condition it repaired can no
-- longer occur. No campaign has ever run on production, so there is no paused
-- state it could still be owed.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname = 'olympiq_restore_payments_after_giveaway';
    raise notice '135: unscheduled olympiq_restore_payments_after_giveaway.';
  end if;
end $$;

drop function if exists public.restore_payments_after_giveaway();
delete from public.system_settings where key = 'payments.paused_by_giveaway';

-- -----------------------------------------------------------------------------
-- VERIFICATION — assert the new rule by exercising it, not by reading the text.
-- -----------------------------------------------------------------------------
do $$
declare
  v_pay_was boolean;
  v_gvw_was boolean;
  v_refused boolean := false;
  v_mode    text;
begin
  select enabled into v_pay_was from public.feature_flags where key = 'payments';
  select enabled into v_gvw_was from public.feature_flags where key = 'giveaway_period';

  -- A campaign must be refused while the rail is closed.
  update public.feature_flags set enabled = false where key = 'giveaway_period';
  update public.feature_flags set enabled = false where key = 'payments';
  begin
    update public.feature_flags set enabled = true where key = 'giveaway_period';
  exception when check_violation then
    v_refused := true;
  end;
  if not v_refused then
    raise exception '135: a giveaway was allowed to start with payments off';
  end if;

  -- With the rail open, BOTH may be on at once — the whole point of the change.
  update public.feature_flags set enabled = true where key = 'payments';
  update public.system_settings set value_json = to_jsonb(30) where key = 'giveaway.duration_days';
  update public.feature_flags set enabled = true where key = 'giveaway_period';
  if not (select enabled from public.feature_flags where key = 'payments') then
    raise exception '135: starting a campaign still switched payments off';
  end if;
  v_mode := public.current_payment_mode();
  if v_mode <> 'giveaway' then
    raise exception '135: expected mode giveaway with both flags on, got %', v_mode;
  end if;

  -- The kill switch wins and takes the campaign with it.
  update public.feature_flags set enabled = false where key = 'payments';
  if (select enabled from public.feature_flags where key = 'giveaway_period') then
    raise exception '135: turning payments off left a campaign running';
  end if;
  if public.current_payment_mode() <> 'off' then
    raise exception '135: payments off did not resolve to off';
  end if;

  -- Put the flags back exactly as they were found.
  update public.feature_flags set enabled = coalesce(v_pay_was, false) where key = 'payments';
  update public.feature_flags set enabled = coalesce(v_gvw_was, false) where key = 'giveaway_period';
  raise notice '135: giveaway requires payments; both may run together; kill switch wins';
end $$;

commit;
