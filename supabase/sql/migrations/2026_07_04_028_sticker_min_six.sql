-- =============================================================================
-- 2026_07_04_028_sticker_min_six.sql
-- Round 11 follow-up — raise the Character Sticker minimum from 5 to 6.
--
-- A theme may now be ENABLED only with >= 6 images, and an enabled theme may not
-- drop below 6. This mirrors the child-facing layer which shows EXACTLY 6 unique
-- stickers (3 per side), so every enabled theme is guaranteed to have enough
-- distinct images to fill the arrangement without repeats.
--
-- Only the two guard functions change (the threshold 5 -> 6); tables, RLS,
-- storage and FKs are untouched. Backport: both functions -> canonical 011;
-- validation #36 updated to assert the new threshold in the function body.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

create or replace function public.fn_sticker_theme_enable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if new.is_enabled and not coalesce(old.is_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = new.id;
    if v_count < 6 then
      raise exception 'sticker theme needs at least 6 images to be enabled (has %)', v_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_sticker_image_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_enabled boolean; v_count int;
begin
  select is_enabled into v_enabled from public.sticker_themes where id = old.theme_id;
  if coalesce(v_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = old.theme_id;
    if v_count - 1 < 6 then
      raise exception 'an enabled sticker theme must keep at least 6 images — disable the theme first'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

commit;

-- =============================================================================
-- End of 2026_07_04_028_sticker_min_six.sql
-- =============================================================================
