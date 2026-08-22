-- =============================================================================
-- 2026_08_22_130 — MANUAL RENEWAL: THREE WARNINGS, THEN ACCESS STOPS.
--
-- THE PRODUCT CHANGE BEHIND THIS. The bank has told us they will NOT enable
-- card-on-file / recurring at launch (ticket AZCDF-100303) — it is a paid
-- capability on their side and they are not carrying that cost for a new
-- merchant. So for the foreseeable future EVERY RENEWAL IS AN ACT A PARENT
-- PERFORMS BY HAND, and nothing in the platform can charge them.
--
-- That inverts what the expiry notice is FOR. It used to be a courtesy telling a
-- parent that a charge was coming. It is now the ONLY thing standing between a
-- family and the silent loss of access they are still paying attention to. A
-- notice that arrives once, five minutes after they stopped reading, is not
-- enough for something that cannot recover itself.
--
-- WHAT WAS THERE, AND WHY IT COULD ONLY EVER FIRE ONCE. The old
-- notify_expiring_subscriptions keyed its idempotency on
-- `subexp:<subscription>:<period_end>`. The job runs daily and the key does not
-- move, so the FIRST day the period came inside the three-day window produced a
-- notification and every day after it was silently deduped by
-- create_notification's `on conflict (idempotency_key) do nothing`. One warning
-- per period, ever. That was defensible when a card was going to be charged
-- automatically; it is not defensible now.
--
-- THE CHAIN: three calendar days out, two days out, one day out. The key gains
-- the day bucket, so each rung lands exactly once. Nothing else is needed to
-- make "only if they have not renewed yet" work: renewing MOVES
-- current_period_end, which both drops the row out of the window and changes the
-- key, so a renewed subject goes quiet by construction rather than by a flag
-- somebody has to remember to clear.
--
-- ONE NOTIFICATION PER CHILD PER RUNG, NOT PER SUBJECT. Subjects are billed on
-- their own cycles (migration 118), so a family with four subjects ending the
-- same day would get twelve notifications over three days under a per-subject
-- design. They are grouped by (subscription, end date) and the subjects are
-- NAMED IN THE BODY, which is both kinder and more useful — the parent needs to
-- know what lapses, not to receive it four times.
--
-- WHOLE CALENDAR DAYS, not 24-hour multiples. `ceil(epoch/86400)` makes the rung
-- depend on what time of day the job happens to run, so a period ending at 09:00
-- and a job at 04:00 would skip a rung. Subtracting date_trunc'd dates is what a
-- parent means by "three days before".
--
-- PRIORITY ESCALATES 3 -> 2 -> 1, AND THE LAST ONE OVERRIDES A MUTE. Priority 1
-- is the level create_notification refuses to let a recipient silence, and it is
-- reserved for payment and security. Overriding somebody's preference is a
-- strong thing to do and it is done exactly once, on the final warning, because
-- the alternative is a parent who muted notifications months ago losing their
-- child's paid access with no warning at all and no way to have known. The
-- first two rungs respect the preference completely.
--
-- THE COPY IS A FACT, NOT A CALL TO ACTION — this is a STORE-COMPLIANCE
-- constraint, not a style choice. These rows render inside the mobile apps,
-- which are purchase-silent BY ARCHITECTURE (docs/STORE_PAYMENTS_COMPLIANCE.md
-- §4/§5). So the body carries NO price, NO purchase verb, NO destination and NO
-- URL — "manage it on your web account" is specifically the wrong form (audit
-- finding I6). It says what will happen and when. A parent who bought the
-- subscription knows where they bought it; an App Store reviewer reading the
-- notification centre sees a statement of fact.
--
-- AZ-ONLY, deliberately, and consistent with every other DB-emitted notice.
-- notification_templates is the ADMIN COMPOSER's reference text, not a render
-- path: the notifications table carries literal title/body and the clients show
-- those verbatim. profiles.preferred_locale is never written by web-app or
-- mobile-app, so branching on it would be a trilingual gesture that ships one
-- language anyway. (Recorded as a real product gap, not fixed here.)
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

create or replace function public.notify_expiring_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_name     text;
  v_subjects text;
  v_when     text;
  v_title    text;
  v_body     text;
  v_prio     int;
  v_sent     uuid;
  v_n        int := 0;
begin
  for v_row in
    select cs.id,
           cs.owner_parent_profile_id,
           cs.student_profile_id,
           ss.current_period_end::date                                     as end_date,
           (ss.current_period_end::date - now()::date)                     as days_left,
           s.first_name,
           s.last_name,
           string_agg(distinct coalesce(nullif(btrim(subj.name), ''), '—'), ', ')
             as subject_names
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s              on s.profile_id = cs.student_profile_id
    left join public.subjects subj      on subj.id = ss.subject_id
    where cs.status in ('trialing', 'active')
      -- A subject the parent has ALREADY chosen to drop is not lapsing, it is
      -- ending on purpose. Warning about it would be nagging.
      and ss.remove_at is null
      and ss.current_period_end is not null
      -- WHOLE CALENDAR DAYS. See the header: an epoch-based rung depends on what
      -- time the cron happens to fire and can skip a step entirely.
      and (ss.current_period_end::date - now()::date) in (3, 2, 1)
      and cs.owner_parent_profile_id is not null
    group by cs.id, cs.owner_parent_profile_id, cs.student_profile_id,
             ss.current_period_end::date, s.first_name, s.last_name
  loop
    v_name := coalesce(
      nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''),
      'övladınız');
    v_subjects := coalesce(nullif(btrim(v_row.subject_names), ''), 'abunəlik');
    v_when := to_char(v_row.end_date, 'DD.MM.YYYY');

    -- Three rungs, three sentences. Each states WHAT ends, WHEN, and that
    -- nothing renews it automatically. None names a price, a place or an action.
    if v_row.days_left = 3 then
      v_prio  := 3;
      v_title := 'Abunə 3 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir.';
    elsif v_row.days_left = 2 then
      v_prio  := 2;
      v_title := 'Abunə 2 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir; uzadılmasa, giriş həmin tarixdə dayanacaq.';
    else
      -- The last one a parent will get. Priority 1 reaches an inbox that has
      -- been muted, because there is no fourth chance and nothing charges a card.
      v_prio  := 1;
      v_title := 'Son xəbərdarlıq: abunə sabah bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi sabah — ' || v_when ||
                 ' — başa çatır. Uzadılmadığı təqdirdə həmin gün giriş dayanacaq.';
    end if;

    -- COUNT WHAT WAS ACTUALLY SENT, not what was considered. create_notification
    -- returns NULL when its `on conflict (idempotency_key) do nothing` discards a
    -- duplicate, and the old code `perform`ed it and incremented regardless -- so
    -- a run that sent nothing still reported one per candidate row. Nothing reads
    -- this number today, which is exactly how a lying counter survives until the
    -- day somebody debugging a missing reminder trusts it.
    select public.create_notification(
      v_row.owner_parent_profile_id,
      'subject_expiring',
      v_title,
      v_body,
      jsonb_build_object(
        'child_name', v_name,
        'student_profile_id', v_row.student_profile_id,
        'subjects', v_subjects,
        'days', v_row.days_left,
        'ends_on', v_when,
        'subscription_id', v_row.id),
      array['in_app'],
      -- THE DAY BUCKET IS WHAT MAKES THE CHAIN WORK. Without it the second and
      -- third warnings collide with the first on `on conflict (idempotency_key)
      -- do nothing` and are silently discarded — which is exactly what the old
      -- key did. period_end stays in the key so a RENEWED subject starts a fresh
      -- series rather than being permanently muted by the old one.
      'subexp:' || v_row.id::text || ':' || v_row.end_date::text || ':d' || v_row.days_left::text,
      v_prio,
      -- A RELATIVE path. §5 forbids opening an external https URL from
      -- notification content; the mobile client allowlists relative routes.
      '/subscription',
      'billing',
      null) into v_sent;
    if v_sent is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions() to service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION — the migration proves its own claims before it commits.
-- -----------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.notify_expiring_subscriptions()'::regprocedure);
  v_code text;
  v_banned text;
begin
  if position('in (3, 2, 1)' in v_def) = 0 then
    raise exception '130: the three-rung window is missing';
  end if;
  if position(':d'' || v_row.days_left' in v_def) = 0 then
    raise exception '130: the idempotency key does not carry the day bucket — rungs 2 and 1 would be deduped away';
  end if;
  if position('now()::date' in v_def) = 0 then
    raise exception '130: rungs are not computed in whole calendar days';
  end if;
  if position('if v_sent is not null then' in v_def) = 0 then
    raise exception '130: the return value counts candidates rather than notifications actually sent';
  end if;

  -- STORE COMPLIANCE, asserted in the database as well as in the test suite:
  -- these bodies render inside a purchase-silent app.
  --
  -- COMMENTS ARE STRIPPED FIRST, and that is not a loophole — it is the only way
  -- the check can be honest. pg_get_functiondef returns the WHOLE definition,
  -- and the comment three lines above this one explains the rule by naming the
  -- thing it forbids ("an external https URL"). Scanning the raw text made this
  -- migration fail on its own explanation of why it passes. Same lesson as the
  -- source-reading tests in web-app: match on CODE, because comments quote the
  -- very tokens they exist to warn about. The em-dashes in the copy are U+2014,
  -- not `--`, so no notification text is eaten by this.
  v_code := regexp_replace(v_def, '--[^
]*', '', 'g');
  foreach v_banned in array array['AZN', 'olympiq.ai', 'http', 'Abunə ol', 'ödəniş edin', 'satın']
  loop
    if position(lower(v_banned) in lower(v_code)) > 0 then
      raise exception '130: notification copy contains a forbidden token (%) — see STORE_PAYMENTS_COMPLIANCE §5', v_banned;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.notify_expiring_subscriptions()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_expiring_subscriptions()', 'execute') then
    raise exception '130: notify_expiring_subscriptions is executable by anon/authenticated';
  end if;
  raise notice '130: all checks passed';
end $$;

commit;
