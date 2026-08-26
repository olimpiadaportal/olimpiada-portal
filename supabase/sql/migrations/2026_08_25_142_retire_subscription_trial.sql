-- =============================================================================
-- 2026_08_25_142 — ONE TRIAL, NOT TWO.
--
-- The platform now has a 1-day PRE-PURCHASE Free Trial (migrations 139-141): the
-- parent picks up to two subjects, gets 24 hours, and pays nothing. That
-- replaces the older idea of a trial attached to a SUBSCRIPTION, which is what
-- `launch_promo_config.trial_days` still configures — 7 days at the time of
-- writing.
--
-- WHY BOTH CANNOT STAND. They stack. A parent would take the 1-day trial, then
-- buy a plan and receive a further 7 free days on top, so the first charge lands
-- eight days after the family started using the product. Worse, the two are
-- invisible to each other: nothing in `quote_child_plan` knows a pre-purchase
-- trial was already consumed, and nothing in `activate_free_trial` knows a
-- subscription trial is waiting.
--
-- WHY NOBODY HAS NOTICED. The `launch_promo` feature flag is ON in production
-- and migration 133 makes it ZERO the trial outright, so `trial_days = 7` has
-- been inert. The stacking would have appeared the day that flag was turned off
-- — which is exactly the kind of trap that surfaces during a launch, when
-- nobody has time for it.
--
-- WHAT THIS CHANGES FOR A PARENT. Nothing today (the flag already zeroes it).
-- When `launch_promo` is eventually turned off, the first charge is taken at
-- purchase rather than a week later.
--
-- REVERSIBLE. This is one UPDATE of one row. If the owner later wants a
-- subscription trial back, set the value and decide THEN how it composes with
-- the pre-purchase trial — do not let both apply by default.
--
-- The UI needs no change: AddChildWizard already renders its trial line behind
-- `quote.trial_days > 0 && quote.dueNow === 0`, so a zero simply hides it. That
-- guard was written when migration 133 introduced the same possibility.
--
-- Self-transacting. `launch_promo_config` is DATA, not schema, so there is
-- nothing to backport into a canonical file.
-- =============================================================================
begin;

update public.launch_promo_config
   set trial_days = 0,
       updated_at = now()
 where id = 1
   and trial_days <> 0;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_days int;
  v_trials int;
begin
  select trial_days into v_days from public.launch_promo_config where id = 1;
  if coalesce(v_days, 0) <> 0 then
    raise exception '142: the subscription trial is still % days', v_days;
  end if;

  -- The pre-purchase trial must actually exist before its predecessor is
  -- retired, or this migration would leave the platform with NO trial at all.
  if to_regclass('public.free_trials') is null
     or to_regprocedure('public.activate_free_trial(uuid,uuid,uuid[],text)') is null then
    raise exception '142: migration 140 must be applied first — refusing to retire the only trial';
  end if;

  select count(*) into v_trials from public.free_trials;
  raise notice '142: subscription trial retired; the 1-day pre-purchase trial is the only one (% activated so far)', v_trials;
end $$;

commit;
