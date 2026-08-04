-- 097 — Admin-controlled privacy-policy metadata
--
-- WHY
-- ---
-- The privacy policy is one legal document rendered by two codebases. Its WORDS
-- are shared through the i18n catalog, but the ten values the code cannot derive
-- (effective date, hosting region, retention periods, …) were BUILD-TIME
-- constants in web-app/src/lib/privacyPolicy.ts, mirrored byte-for-byte into
-- mobile-app/src/lib/privacyPolicy.ts.
--
-- That made every correction a code change plus an app-store release. An
-- effective date is exactly the kind of fact that changes without any code
-- changing, and a stale one on a REGULATOR-FACING page is the worst kind of
-- wrong. So the eight free-text facts move into system_settings, where an
-- administrator owns them, and the compiled-in constants stay as the FALLBACK
-- (an offline phone, or a request before the row exists, still renders a
-- coherent page rather than an empty one).
--
-- TWO FIELDS DELIBERATELY DO NOT BECOME SETTINGS
-- ----------------------------------------------
-- `pushLive` and `paymentsLive` are DERIVED here instead:
--
--     push_live     := the notifications_push feature flag
--     payments_live := the resolved payment mode is 'real'
--
-- Both already have exactly one canonical switch in this database. A second,
-- free-typed admin copy could only ever contradict the first, and the failure
-- mode is a privacy policy that tells parents no push data is collected while
-- the pipeline is live. A derived value cannot drift from the thing it
-- describes. The administrator still controls both — through the flag and the
-- payment mode, which is where that control belongs.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- 1. The eight admin-owned facts.
--
-- Seeded to match the compiled-in defaults so the admin panel opens showing the
-- values the pages are ALREADY rendering, rather than blank fields that look
-- like an unconfigured feature. Empty string = "not yet known", which every
-- reader renders as a neutral "to be confirmed" chip in the reader's language.
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value_json) values
  ('privacy.effective_date',          '"04.08.2026"'::jsonb),
  ('privacy.last_updated',            '"04.08.2026"'::jsonb),
  ('privacy.website_url',             '"olympiq.ai"'::jsonb),
  ('privacy.contact_email',           '""'::jsonb),
  ('privacy.hosting_region',          '""'::jsonb),
  ('privacy.server_log_retention',    '""'::jsonb),
  ('privacy.learning_data_retention', '""'::jsonb),
  ('privacy.backup_retention',        '""'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Ship them to the mobile app through get_mobile_config().
--
-- Patched from the function's OWN live definition with one anchored string
-- insert, per the house rule in README_DATABASE_VERSIONING_WORKFLOW.md: this
-- function has been edited by migrations 091 and others, and retyping 120 lines
-- from a canonical file is how an unrelated earlier fix gets silently reverted.
-- The anchor is the LAST member of the returned object, so the new block lands
-- immediately before it and nothing else is touched.
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_src text;
  v_new text;
  -- Nested dollar-quoting so the SQL being matched keeps its own single quotes
  -- verbatim; doubling them by hand is how an anchor silently stops matching.
  v_anchor constant text := $a$    'version', coalesce(v_version, '{}'::jsonb)$a$;
  v_block  constant text := $b$    'privacy', jsonb_build_object(
        'effective_date',          coalesce((select value_json->>0 from public.system_settings where key='privacy.effective_date'), ''),
        'last_updated',            coalesce((select value_json->>0 from public.system_settings where key='privacy.last_updated'), ''),
        'website_url',             coalesce((select value_json->>0 from public.system_settings where key='privacy.website_url'), ''),
        'contact_email',           coalesce((select value_json->>0 from public.system_settings where key='privacy.contact_email'), ''),
        'hosting_region',          coalesce((select value_json->>0 from public.system_settings where key='privacy.hosting_region'), ''),
        'server_log_retention',    coalesce((select value_json->>0 from public.system_settings where key='privacy.server_log_retention'), ''),
        'learning_data_retention', coalesce((select value_json->>0 from public.system_settings where key='privacy.learning_data_retention'), ''),
        'backup_retention',        coalesce((select value_json->>0 from public.system_settings where key='privacy.backup_retention'), ''),
        -- Derived, never stored: see the header. v_flags / v_mode are already
        -- resolved above by the payment-mode and feature-flag logic.
        'push_live',               coalesce((v_flags->>'notifications_push')::boolean, false),
        -- 'real' ONLY, not `<> 'off'`. Demo and giveaway modes move no money and
        -- touch no card data, so §8 of the policy must keep describing payments
        -- in the future tense while either is on — saying otherwise would claim
        -- we process payment data that we demonstrably do not.
        'payments_live',           (v_mode = 'real')),
$b$;
begin
  v_src := pg_get_functiondef('public.get_mobile_config()'::regprocedure);

  if position($c$'privacy', jsonb_build_object$c$ in v_src) > 0 then
    raise notice '097: get_mobile_config already exposes privacy — skipping patch';
    return;
  end if;

  if position(v_anchor in v_src) = 0 then
    raise exception '097: anchor not found in get_mobile_config — the function '
                    'changed shape; re-derive the patch instead of forcing it';
  end if;

  v_new := replace(v_src, v_anchor, v_block || v_anchor);
  execute v_new;
end
$patch$;

-- create or replace preserves the ACL, but restating it keeps the migration
-- self-contained if the function is ever recreated from scratch first.
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Assertions — a migration that silently did nothing is worse than one that
--    failed, because the app keeps reading the old shape and nobody looks here.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_cfg   jsonb;
  v_count int;
begin
  select count(*) into v_count
  from public.system_settings
  where key like 'privacy.%';
  if v_count <> 8 then
    raise exception '097: expected 8 privacy.* settings, found %', v_count;
  end if;

  v_cfg := public.get_mobile_config();

  if v_cfg->'privacy' is null then
    raise exception '097: get_mobile_config() returned no privacy block';
  end if;

  if v_cfg->'privacy'->>'effective_date' <> '04.08.2026' then
    raise exception '097: effective_date did not reach the config: %',
                    v_cfg->'privacy'->>'effective_date';
  end if;

  -- The derived pair must agree with the switches they mirror, or the whole
  -- point of deriving them is lost.
  if (v_cfg->'privacy'->>'push_live')::boolean
     is distinct from (v_cfg->'flags'->>'notifications_push')::boolean then
    raise exception '097: push_live disagrees with the notifications_push flag';
  end if;

  if (v_cfg->'privacy'->>'payments_live')::boolean
     is distinct from (v_cfg->'payment'->>'mode' = 'real') then
    raise exception '097: payments_live disagrees with the payment mode';
  end if;

  raise notice '097 OK — 8 settings seeded, privacy block live, derived pair consistent';
end
$verify$;

commit;
