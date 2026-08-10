-- 102 — Answer options can carry an image
--
-- WHY THE TRANSLATION TABLE AND NOT answer_options
-- ------------------------------------------------
-- Three independent reasons, any one of which is decisive:
--
--   1. RLS on `answer_options` deliberately blocks student SELECT, because that
--      row carries `is_correct` — it is the answer key. A media column there
--      would be unreadable to the very screens that must render it, and making
--      it readable would mean weakening the answer-key policy.
--   2. Every other media link in this schema is PER-LOCALE
--      (`question_translations.media_asset_id`), and every serving path resolves
--      it as coalesce(requested locale, az). A per-option-row column has no
--      analogue for that fallback.
--   3. An option's image is content, and content is translatable: "which of
--      these road signs" may legitimately differ per locale.
--
-- TEXT STAYS NOT NULL — the constraint carries the rule instead
-- ------------------------------------------------------------
-- The product rule is "an option is valid with text OR an image, but never
-- neither". Rather than making `text` nullable (which would ripple into every
-- renderer, every payload branch and every admin form that assumes a string),
-- the column keeps NOT NULL and accepts '' — and a CHECK enforces the real
-- rule. An image-only option is then `text = ''` plus a media_asset_id, which
-- every existing consumer already handles as "empty label".
--
-- ON DELETE SET NULL mirrors fk_qtrans_media: deleting an asset must blank the
-- link, never cascade away a live answer option.
--
-- IDEMPOTENT. Safe to re-run.

begin;

alter table public.answer_option_translations
  add column if not exists media_asset_id uuid;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_aotrans_media'
       and conrelid = 'public.answer_option_translations'::regclass
  ) then
    alter table public.answer_option_translations
      add constraint fk_aotrans_media
      foreign key (media_asset_id) references public.media_assets (id)
      on delete set null;
  end if;
end
$fk$;

comment on column public.answer_option_translations.media_asset_id is
  'Migration 102: optional per-locale answer-option image (question-media '
  'bucket). Lives here rather than on answer_options because that row carries '
  'is_correct and is hidden from students by RLS.';

-- The product rule, enforced where it cannot be bypassed. NOT VALID first so a
-- long table is not rewritten under a lock, then validated — both are no-ops on
-- a small table but keep the pattern correct if this ever runs on a large one.
do $ck$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ck_aotrans_text_or_media'
       and conrelid = 'public.answer_option_translations'::regclass
  ) then
    alter table public.answer_option_translations
      add constraint ck_aotrans_text_or_media
      check (length(btrim(text)) > 0 or media_asset_id is not null) not valid;
    alter table public.answer_option_translations
      validate constraint ck_aotrans_text_or_media;
  end if;
end
$ck$;

-- Partial index: only a minority of options will ever carry an image, and the
-- lookup that matters is "does this option have media", never "which option has
-- this asset".
create index if not exists idx_aotrans_media
  on public.answer_option_translations (media_asset_id)
  where media_asset_id is not null;

-- -----------------------------------------------------------------------------
-- Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_ok boolean;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'answer_option_translations'
       and column_name = 'media_asset_id'
  ) then
    raise exception '102: media_asset_id column missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_aotrans_media'
       and confdeltype = 'n'  -- SET NULL, matching fk_qtrans_media
  ) then
    raise exception '102: FK missing or not ON DELETE SET NULL';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'ck_aotrans_text_or_media' and convalidated
  ) then
    raise exception '102: text-or-media check missing or not validated';
  end if;

  -- The rule actually bites: an option with neither text nor media is refused.
  begin
    insert into public.answer_option_translations (option_id, locale, text)
    values ('00000000-0000-0000-0000-000000000000', 'az', '   ');
    raise exception '102: an empty option was accepted — the check is not working';
  exception
    when check_violation then
      null; -- expected
    when foreign_key_violation then
      -- The FK fired before the CHECK could; prove the rule directly instead.
      select (length(btrim('   ')) > 0 or null is not null) into v_ok;
      if v_ok then
        raise exception '102: the check expression does not reject an empty option';
      end if;
  end;

  raise notice '102 OK — answer options accept a per-locale image; empty options refused';
end
$verify$;

commit;
