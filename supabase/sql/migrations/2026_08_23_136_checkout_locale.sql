-- =============================================================================
-- 2026_08_23_136 — THE RESULT PAGE'S LANGUAGE STOPS RIDING ON THE CALLBACK URL.
--
-- WHY. We asked AzeriCard whether BACKREF is compared as an exact string against
-- the URL registered for the terminal, because every authorisation we build
-- appends `?lang=az|en|ru` to it while the bank registered the bare path. Their
-- answer (Vusal Abdullayev, 2026-08-23):
--
--     "Səhifənin hansı dildə açılmasını istəyirsinizsə LANG parametrində
--      müvafiq identikatoru göndərin (AZ / RU / EN)"
--
-- — send the language in the LANG field. We already do, and that governs the
-- language of THEIR hosted payment page. It does not answer the second use we
-- were making of the query string, and that is the one that mattered:
--
--   * the bank's page language  -> the LANG field. Already correct.
--   * OUR result page language  -> read back off `?lang=` in the callback URL.
--
-- The second is why the parameter was there at all: the callback is a CROSS-SITE
-- POST, so our `locale` cookie is SameSite-protected and never arrives with it,
-- and the result page would otherwise have to guess. Simply deleting the
-- parameter would leave every parent — Russian and English included — reading an
-- Azerbaijani result page after paying.
--
-- SO THE LANGUAGE MOVES SERVER-SIDE. The session already exists before the
-- redirect and the gateway always posts ORDER back, so the locale can be stored
-- when the checkout opens and looked up when the callback lands. That makes
-- BACKREF exactly the string the bank registered, whatever their matching rule
-- turns out to be, and it removes a dependency on the gateway echoing anything
-- at all — a query parameter is client-reachable data on a route that grants
-- access, and this replaces it with a value only our server ever wrote.
--
-- NULLABLE, defaulting to nothing: pre-136 sessions have no locale and fall back
-- to `az`, exactly the behaviour they were created under. Not added to the
-- intent-freeze trigger's column list on purpose — the locale is a rendering
-- detail, not part of what the parent authorised, and freezing it would make a
-- language change look like intent tampering.
-- =============================================================================
begin;

alter table public.checkout_sessions
  add column if not exists locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_sessions'::regclass
      and conname = 'ck_checkout_locale'
  ) then
    alter table public.checkout_sessions
      add constraint ck_checkout_locale
      check (locale is null or locale in ('az', 'en', 'ru'));
  end if;
end $$;

comment on column public.checkout_sessions.locale is
  'Migration 136: the language the parent was using when this checkout opened, so '
  'the RESULT page can be rendered in it. The callback is a cross-site POST, so '
  'the locale cookie never arrives with it; this replaces the ?lang= query '
  'parameter that used to ride on BACKREF, letting BACKREF be exactly the URL '
  'registered with the acquirer. NULL on pre-136 rows -> az, as they were built.';

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checkout_sessions'
      and column_name = 'locale'
  ) then
    raise exception '136: checkout_sessions.locale was not created';
  end if;

  -- The freeze trigger must NOT have adopted it: a parent switching language
  -- between opening a checkout and paying is not intent tampering.
  if position('locale' in pg_get_functiondef('public.fn_checkout_intent_immutable()'::regprocedure)) > 0 then
    raise exception '136: the intent-freeze trigger now pins the locale; it must not';
  end if;

  begin
    insert into public.checkout_sessions
      (owner_parent_profile_id, kind, amount, currency, status, provider,
       provider_session_id, locale)
    values (null, 'plan', 1, 'AZN', 'pending', 'azericard', 'locale-probe-136', 'klingon');
    raise exception '136: an invalid locale was accepted';
  exception
    when check_violation then null;   -- expected
    when others then null;            -- some other column refused first; fine
  end;
  delete from public.checkout_sessions where provider_session_id = 'locale-probe-136';

  raise notice '136: checkout_sessions.locale added, constrained, and not frozen';
end $$;

commit;
