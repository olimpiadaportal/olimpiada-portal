-- =============================================================================
-- 2026_07_03_021_round8_olympiad_event_date_wallpaper_presets.sql
-- =============================================================================
-- Investor Review Round 8:
--   1) olympiad_packages.event_starts_at (nullable timestamptz) — the student
--      "Olimpiadalar" tab shows a "planned olympiads" section with a date/time
--      per card; the admin package form sets it. NULL = undated ("planned").
--   2) Playful gradient wallpaper PRESETS for the student background selector
--      (child-friendly themes: racing / space / ocean / jungle / candy / night
--      drive). Stored as kind='solid_color' rows whose `value` is a CSS
--      gradient string — both the picker swatches (style background) and the
--      arena background (`--wp` inside the background shorthand) accept any
--      CSS background value, so gradients are drop-in. No trademarked
--      characters — original, generic themes only.
--
-- Backported to canonical: 015 (column), 012 (preset seeds), 013 (check #29).
-- Safe to rerun: yes (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =============================================================================

alter table public.olympiad_packages
  add column if not exists event_starts_at timestamptz;

comment on column public.olympiad_packages.event_starts_at is
  'Planned event date/time shown on the student "Olimpiadalar" tab (NULL = undated/planned).';

insert into public.wallpapers (code, name, kind, value, status) values
  ('preset_race',
   'Sürət yarışı',
   'solid_color',
   'linear-gradient(135deg, #b31217 0%, #e52d27 45%, #ff8a00 100%)',
   'active'),
  ('preset_space',
   'Kosmos',
   'solid_color',
   'radial-gradient(1000px 500px at 80% 0%, rgba(124,58,237,0.55), transparent 60%), linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #24243e 100%)',
   'active'),
  ('preset_ocean',
   'Okean',
   'solid_color',
   'linear-gradient(160deg, #0077b6 0%, #00b4d8 55%, #90e0ef 100%)',
   'active'),
  ('preset_jungle',
   'Cəngəllik',
   'solid_color',
   'linear-gradient(150deg, #134e13 0%, #2e8b57 55%, #a8e063 100%)',
   'active'),
  ('preset_candy',
   'Şirniyyat',
   'solid_color',
   'linear-gradient(135deg, #ff6fb5 0%, #ffa8d5 50%, #ffe29f 100%)',
   'active'),
  ('preset_night_drive',
   'Gecə yarışı',
   'solid_color',
   'radial-gradient(900px 420px at 15% 110%, rgba(196,255,0,0.28), transparent 55%), linear-gradient(150deg, #0a0e1a 0%, #16213e 60%, #0f3460 100%)',
   'active')
on conflict (code) do nothing;

-- =============================================================================
-- End of 2026_07_03_021_round8_olympiad_event_date_wallpaper_presets.sql
-- =============================================================================
