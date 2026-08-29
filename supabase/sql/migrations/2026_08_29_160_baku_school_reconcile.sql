-- =============================================================================
-- 2026_08_29_160 — BAKI SCHOOLS, RECONCILED RATHER THAN RE-IMPORTED.
--
-- Migration 159 imported 3,805 schools for every district EXCEPT Bakı and said
-- why: Bakı already had 320 rows seeded in 012, and the ministry register's 393
-- Bakı rows CANNOT be matched to them by name.
--
-- WHY NAME FAILS. The seeded rows are terse ("Bakı 54 nömrəli tam orta məktəb").
-- The ministry publishes the official name, which usually carries an honorific
-- ("Bakı şəhəri Abdulla Şaiq adına 54 nömrəli tam orta ümumtəhsil məktəbi").
-- Same building, same school, same children — 295 of them. A name-keyed import
-- inserts every one of those a second time, and Bakı's picker becomes roughly
-- 700 entries for ~340 real schools, in the one district where this platform's
-- actual students live.
--
-- WHY NUMBER ALONE ALSO FAILS. Bakı runs SEPARATE NUMBERING SERIES. The very
-- first two rows of the existing table are "1 nömrəli idman liseyi" and
-- "Bakı 1 nömrəli tam orta məktəb" — both number 1, two different institutions.
-- Joining on the number alone would fuse a sports lyceum into a general school.
--
-- SO THE KEY IS (school_number, series), where series is the kind of institution
-- — idman / internat / sanator / axşam / musiqi / incəsənət / xüsusi, or
-- "ordinary" for everything else. Lisey, məktəb-lisey and gimnaziya are NOT
-- their own series: in Bakı they carry ordinary school numbers (school 6 became
-- məktəb-lisey 6), and treating them separately would have split a school in two.
--
-- That key was verified against the live data before this file was written:
--   * on the existing 320 rows it is UNIQUE — zero collisions;
--   * 295 incoming rows match exactly one existing row;
--   * 98 match none and are genuinely new;
--   * ZERO existing rows are claimed by more than one incoming row, so no
--     rename can silently overwrite another and drop a real school.
--
-- WHAT HAPPENS TO THE 295 MATCHES: the existing row is RENAMED to the official
-- ministry name and keeps its id. Keeping the id is the whole point — students
-- reference schools by id, so a rename is invisible to them while a
-- delete-and-reinsert would strand every child attached to that school.
--
-- A rename is skipped if the new name is already taken by a DIFFERENT Bakı row,
-- which would violate uq_schools_district_name. 0 rows are affected today.
--
-- RAYONS — AND A GAP THIS FILE ALSO CLOSES. Every one of Bakı's 320 schools has
-- city_district_id NULL on production: all 320 sit in the admin panel's "Rayon
-- təyin edilməyib" review list. The backfill that was supposed to fix this,
-- migration 2026_07_12_061, is deliberately NOT part of the canonical seed
-- (012 says so itself), so a database bootstrapped from canonical never received
-- it — which is exactly how production was built. That is not cosmetic:
-- school_district_guard REQUIRES a rayon on any NEW school inserted into a city
-- that has active rayons, and Bakı has 12.
--
-- The ministry register states each school's rayon, so this migration fills it
-- for the 295 matched rows and supplies it for the 98 new ones. Where a rayon
-- is somehow ALREADY set it is left alone via coalesce, even if the ministry
-- disagrees (0 rows today): silently overwriting one official source with
-- another is how a good record becomes a guess.
--
-- WHAT IS DELIBERATELY LEFT ALONE:
--   * 25 existing rows with no ministry counterpart — 18 numbered (25, 41, 66,
--     173, 190, 199, 277, and the contiguous run 339-350) and 7 unnumbered
--     private/specialist schools. They may be closed, merged or renamed beyond
--     recognition, but this migration cannot tell which, and a school row is
--     referenced by students. They stay active; deciding their fate is an admin
--     job with a human looking at it.
--   * Fuzzy private-school merges. "Avropa Liseyi" vs "Bakı Avropa liseyi" is
--     probably one school; "Təfəkkür Liseyi" vs "Hədəf Liseyi" is definitely two.
--     Nothing here merges on similarity: a wrongly merged school is unrecoverable
--     and a visible duplicate is one admin edit. Possible pairs are NOTICEd.
--
-- Rerun-safe: the rename matches on the SEEDED name, which no longer exists
-- after a successful run, so a second run updates nothing; the insert uses
-- `on conflict (district_id, lower(name)) do nothing`. The seeded name is also
-- what makes this portable — it is identical in every environment, whereas ids
-- are minted per database by gen_random_uuid() and a hardcoded one would match
-- nothing on staging while appearing to succeed.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 012_seed_initial_data.sql — extend the note added by 158/159 to
--            name this file as the third step of the location rebuild order.
-- Backport status: completed
-- Destructive change: no rows deleted. 295 rows have their NAME updated (ids,
--          and therefore every student reference, are preserved).
-- =============================================================================
begin;

-- Fail fast rather than half-applying if Bakı is not where we think it is.
do $$
begin
  if not exists (select 1 from public.districts
                  where country_code = 'AZ' and name = 'Bak' || chr(305)) then
    raise exception '160: no Bakı district found';
  end if;
end;
$$;

create temp table _baku_rename (
  old_name      text    not null,
  new_name      text    not null,
  school_number int     not null,
  rayon         text    not null
) on commit drop;

insert into _baku_rename (old_name, new_name, school_number, rayon) values
  ('Bakı 54 nömrəli tam orta məktəb', 'Bakı şəhəri Abdulla Şaiq adına 54 nömrəli tam orta ümumtəhsil məktəbi', 54, 'Nəsimi'),
  ('Bakı 319 nömrəli tam orta məktəb', 'Bakı şəhəri 319 nömrəli tam orta ümumtəhsil məktəbi', 319, 'Qaradağ'),
  ('Bakı 243 nömrəli tam orta məktəb', 'Bakı şəhəri 243 nömrəli tam orta ümumtəhsil məktəbi', 243, 'Pirallahı'),
  ('Bakı 69 nömrəli tam orta məktəb', 'Bakı şəhəri 69 nömrəli tam orta ümumtəhsil məktəbi', 69, 'Sabunçu'),
  ('Bakı 236 nömrəli tam orta məktəb', 'Bakı şəhəri 236 nömrəli tam orta ümumtəhsil məktəbi', 236, 'Səbail'),
  ('Bakı 183 nömrəli tam orta məktəb', 'Bakı şəhəri 183 nömrəli tam orta ümumtəhsil məktəbi', 183, 'Xəzər'),
  ('Bakı 136 nömrəli tam orta məktəb', 'Bakı şəhəri Rasim Sadıqov adına 136 nömrəli tam orta ümumtəhsil məktəbi', 136, 'Xəzər'),
  ('Bakı 266 nömrəli tam orta məktəb', 'Bakı şəhəri Fəxrəddin Nəcəfov adına 266 nömrəli tam orta ümumtəhsil məktəbi', 266, 'Nəsimi'),
  ('Bakı 196 nömrəli tam orta məktəb', 'Bakı şəhəri Məzahir Bayramov adına 196 nömrəli tam orta ümumtəhsil məktəbi', 196, 'Suraxanı'),
  ('Bakı 112 nömrəli tam orta məktəb', 'Bakı şəhəri Xoşbəxt Yusifzadə adına 112 nömrəli tam orta ümumtəhsil məktəbi', 112, 'Sabunçu'),
  ('Bakı 224 nömrəli tam orta məktəb', 'Bakı şəhəri Səyavuş Muradov adına 224 nömrəli ümumi orta ümumtəhsil məktəbi', 224, 'Qaradağ'),
  ('Bakı 180 nömrəli tam orta məktəb', 'Bakı şəhəri Azər Namazov adına 180 nömrəli tam orta ümumtəhsil məktəbi', 180, 'Qaradağ'),
  ('Bakı 125 nömrəli tam orta məktəb', 'Bakı şəhəri Əfqan Əliyev adına 125 nömrəli tam orta ümumtəhsil məktəbi', 125, 'Xəzər'),
  ('Bakı 164 nömrəli tam orta məktəb', 'Bakı şəhəri Eldar Tağızadə adına 164 nömrəli tam orta ümumtəhsil məktəbi', 164, 'Nəsimi'),
  ('Bakı 317 nömrəli tam orta məktəb', 'Bakı şəhəri 317 nömrəli tam orta ümumtəhsil məktəbi', 317, 'Suraxanı'),
  ('Bakı 188 nömrəli tam orta məktəb', 'Bakı şəhəri 188 nömrəli tam orta ümumtəhsil məktəbi', 188, 'Sabunçu'),
  ('Bakı 201 nömrəli tam orta məktəb', 'Bakı şəhəri 201 nömrəli tam orta ümumtəhsil məktəbi', 201, 'Nizami'),
  ('Bakı 216 nömrəli tam orta məktəb', 'Bakı şəhəri Ramiz Qasımov adına 216 nömrəli tam orta ümumtəhsil məktəbi', 216, 'Xəzər'),
  ('Bakı 52 nömrəli tam orta məktəb', 'Bakı şəhəri Məmməd İsmayıl Cuvarlinski adına 52 nömrəli tam orta ümumtəhsil məktəbi', 52, 'Yasamal'),
  ('Bakı 135 nömrəli tam orta məktəb', 'Bakı şəhəri Əliağa Şıxlınski adına 135 nömrəli tam orta ümumtəhsil məktəbi', 135, 'Binəqədi'),
  ('Bakı 102 nömrəli tam orta məktəb', 'Bakı şəhəri Mirzə Xosrov Axundzadə adına 102 nömrəli tam orta ümumtəhsil məktəbi', 102, 'Binəqədi'),
  ('Bakı 113 nömrəli tam orta məktəb', 'Bakı şəhəri Hüseynbala Ağaverdiyev adına 113 nömrəli tam orta ümumtəhsil məktəbi', 113, 'Sabunçu'),
  ('Bakı 260 nömrəli tam orta məktəb', 'Bakı şəhəri 260 nömrəli tam orta ümumtəhsil məktəbi', 260, 'Xətai'),
  ('Bakı 154 nömrəli tam orta məktəb', 'Bakı şəhəri Albert Aqarunov adına 154 nömrəli tam orta ümumtəhsil məktəbi', 154, 'Suraxanı'),
  ('Bakı 6 nömrəli tam orta məktəb', 'Bakı şəhəri Tofiq İsmayılov adına 6 nömrəli məktəb-lisey', 6, 'Səbail'),
  ('Bakı 337 nömrəli tam orta məktəb', 'Bakı şəhəri 337 nömrəli tam orta ümumtəhsil məktəbi', 337, 'Sabunçu'),
  ('Bakı 53 nömrəli tam orta məktəb', 'Bakı şəhəri 53 nömrəli tam orta ümumtəhsil məktəbi', 53, 'Yasamal'),
  ('Bakı 229 nömrəli tam orta məktəb', 'Bakı şəhəri Yuri Kovalyov adına 229 nömrəli tam orta ümumtəhsil məktəbi', 229, 'Nizami'),
  ('Bakı 336 nömrəli tam orta məktəb', 'Bakı şəhəri 336 nömrəli tam orta ümumtəhsil məktəbi', 336, 'Yasamal'),
  ('Bakı 222 nömrəli tam orta məktəb', 'Bakı şəhəri Fəzail Qədimov adına 222 nömrəli tam orta ümumtəhsil məktəbi', 222, 'Qaradağ'),
  ('Bakı 308 nömrəli tam orta məktəb', 'Bakı şəhəri 308 nömrəli tam orta ümumtəhsil məktəbi', 308, 'Yasamal'),
  ('Bakı 296 nömrəli tam orta məktəb', 'Bakı şəhəri 296 nömrəli tam orta ümumtəhsil məktəbi', 296, 'Sabunçu'),
  ('Bakı 283 nömrəli tam orta məktəb', 'Bakı şəhəri 283 nömrəli tam orta ümumtəhsil məktəbi', 283, 'Binəqədi'),
  ('Bakı 329 nömrəli tam orta məktəb', 'Bakı şəhəri 329 nömrəli tam orta ümumtəhsil məktəbi', 329, 'Səbail'),
  ('Bakı 225 nömrəli tam orta məktəb', 'Bakı şəhəri Telman Abbasov adına 225 nömrəli tam orta ümumtəhsil məktəbi', 225, 'Yasamal'),
  ('Bakı 150 nömrəli tam orta məktəb', 'Bakı şəhəri Faiq Rzayev adına 150 nömrəli tam orta ümumtəhsil məktəbi', 150, 'Yasamal'),
  ('Bakı 37 nömrəli tam orta məktəb', 'Bakı şəhəri Məzahir Məmmədov adına 37 nömrəli tam orta ümumtəhsil məktəbi', 37, 'Nərimanov'),
  ('Bakı 310 nömrəli tam orta məktəb', 'Bakı şəhəri 310 nömrəli tam orta ümumtəhsil məktəbi', 310, 'Sabunçu'),
  ('Bakı 7 nömrəli tam orta məktəb', 'Bakı şəhəri Məmməd Rahim adına 7 nömrəli tam orta ümumtəhsil məktəbi', 7, 'Səbail'),
  ('Bakı 175 nömrəli tam orta məktəb', 'Bakı şəhəri Həzi Aslanov adına 175 nömrəli tam orta ümumtəhsil məktəbi', 175, 'Yasamal'),
  ('Bakı 322 nömrəli tam orta məktəb', 'Bakı şəhəri 322 nömrəli tam orta ümumtəhsil məktəbi', 322, 'Xəzər'),
  ('Bakı 106 nömrəli tam orta məktəb', 'Bakı şəhəri Səxavət Məhərrəmov adına 106 nömrəli tam orta ümumtəhsil məktəbi', 106, 'Qaradağ'),
  ('Bakı 233 nömrəli tam orta məktəb', 'Bakı şəhəri Cəmil Niftəliyev adına 233 nömrəli tam orta ümumtəhsil məktəbi', 233, 'Qaradağ'),
  ('Bakı 99 nömrəli tam orta məktəb', 'Bakı şəhəri Həsən Cəbrayılov adına 99 nömrəli tam orta ümumtəhsil məktəbi', 99, 'Binəqədi'),
  ('Bakı 198 nömrəli tam orta məktəb', 'Bakı şəhəri Eynulla Ağayev adına 198 nömrəli tam orta ümumtəhsil məktəbi', 198, 'Sabunçu'),
  ('Bakı 231 nömrəli tam orta məktəb', 'Bakı şəhəri Nadir Teymurov adına 231 nömrəli tam orta ümumtəhsil məktəbi', 231, 'Pirallahı'),
  ('Bakı 214 nömrəli tam orta məktəb', 'Bakı şəhəri Vüqar Sadıqov adına 214 nömrəli tam orta ümumtəhsil məktəbi', 214, 'Nizami'),
  ('Bakı 186 nömrəli tam orta məktəb', 'Bakı şəhəri 186 nömrəli tam orta ümumtəhsil məktəbi', 186, 'Pirallahı'),
  ('Bakı 84 nömrəli tam orta məktəb', 'Bakı şəhəri Aslan Muradov adına 84 nömrəli tam orta ümumtəhsil məktəbi', 84, 'Suraxanı'),
  ('Bakı 22 nömrəli tam orta məktəb', 'Bakı şəhəri Firuz Bayramov adına 22 nömrəli tam orta ümumtəhsil məktəbi', 22, 'Sabunçu'),
  ('Bakı 145 nömrəli tam orta məktəb', 'Bakı şəhəri Eldar Quliyev adına 145 nömrəli tam orta ümumtəhsil məktəbi', 145, 'Nizami'),
  ('Bakı 26 nömrəli tam orta məktəb', 'Bakı şəhəri İftixar Tağıyev adına 26 nömrəli tam orta ümumtəhsil məktəbi', 26, 'Xəzər'),
  ('Bakı 169 nömrəli tam orta məktəb', 'Bakı şəhəri Nəsimi Rzayev adına 169 nömrəli tam orta ümumtəhsil məktəbi', 169, 'Sabunçu'),
  ('Bakı 29 nömrəli tam orta məktəb', 'Bakı şəhəri Məmməd Əsədov adına 29 nömrəli tam orta ümumtəhsil məktəbi', 29, 'Xətai'),
  ('Bakı 208 nömrəli tam orta məktəb', 'Bakı şəhəri Nəriman Həmidov adına 208 nömrəli tam orta ümumtəhsil məktəbi', 208, 'Suraxanı'),
  ('Bakı 232 nömrəli tam orta məktəb', 'Bakı şəhəri Dilavər Məmmədzadə adına 232 nömrəli tam orta ümumtəhsil məktəbi', 232, 'Suraxanı'),
  ('Bakı 258 nömrəli tam orta məktəb', 'Bakı şəhəri Arif Vəliyev adına 258 nömrəli tam orta ümumtəhsil məktəbi', 258, 'Nərimanov'),
  ('Bakı 292 nömrəli tam orta məktəb', 'Bakı şəhəri 292 nömrəli tam orta ümumtəhsil məktəbi', 292, 'Xəzər'),
  ('Bakı 105 nömrəli tam orta məktəb', 'Bakı şəhəri 105 nömrəli tam orta ümumtəhsil məktəbi', 105, 'Qaradağ'),
  ('Bakı 118 nömrəli tam orta məktəb', 'Bakı şəhəri Etibar Cəfərov adına 118 nömrəli tam orta ümumtəhsil məktəbi', 118, 'Suraxanı'),
  ('Bakı 79 nömrəli tam orta məktəb', 'Bakı şəhəri Fazil İsmayılov adına 79 nömrəli tam orta ümumtəhsil məktəbi', 79, 'Suraxanı'),
  ('Bakı 172 nömrəli tam orta məktəb', 'Bakı şəhəri Süleyman Sani Axundov adına 172 nömrəli tam orta ümumtəhsil məktəbi', 172, 'Suraxanı'),
  ('Bakı 327 nömrəli tam orta məktəb', 'Bakı şəhəri 327 nömrəli tam orta ümumtəhsil məktəbi', 327, 'Suraxanı'),
  ('Bakı 74 nömrəli tam orta məktəb', 'Bakı şəhəri 74 nömrəli tam orta ümumtəhsil məktəbi', 74, 'Sabunçu'),
  ('Bakı 101 nömrəli tam orta məktəb', 'Bakı şəhəri Əmi Məmmədov adına 101 nömrəli tam orta ümumtəhsil məktəbi', 101, 'Suraxanı'),
  ('Bakı 254 nömrəli tam orta məktəb', 'Bakı şəhəri Rövşən Əliyev adına 254 nömrəli tam orta ümumtəhsil məktəbi', 254, 'Xətai'),
  ('Bakı 234 nömrəli tam orta məktəb', '“Bakı şəhəri Emin Əliyev adına 234 nömrəli tam orta ümumtəhsil məktəbi” Publik hüquqi şəxsi', 234, 'Xəzər'),
  ('Bakı 117 nömrəli tam orta məktəb', 'Bakı şəhəri Sabir Abbasov adına 117 nömrəli tam orta ümumtəhsil məktəbi', 117, 'Xəzər'),
  ('Bakı 143 nömrəli tam orta məktəb', 'Bakı şəhəri 143 nömrəli tam orta ümumtəhsil məktəbi', 143, 'Binəqədi'),
  ('Bakı 338 nömrəli tam orta məktəb', 'Bakı şəhəri 338 nömrəli tam orta ümumtəhsil məktəbi', 338, 'Sabunçu'),
  ('Bakı 36 nömrəli tam orta məktəb', 'Bakı şəhəri Novruzov qardaşları adına 36 nömrəli tam orta ümumtəhsil məktəbi', 36, 'Nərimanov'),
  ('Bakı 3 nömrəli tam orta məktəb', 'Bakı şəhəri Rüstəm Əliyev adına 3 nömrəli tam orta ümumtəhsil məktəbi', 3, 'Binəqədi'),
  ('Bakı 255 nömrəli tam orta məktəb', 'Bakı şəhəri 255 nömrəli tam orta ümumtəhsil məktəbi', 255, 'Sabunçu'),
  ('Bakı 140 nömrəli tam orta məktəb', 'Bakı şəhəri 140 nömrəli tam orta ümumtəhsil məktəbi', 140, 'Suraxanı'),
  ('Bakı 334 nömrəli tam orta məktəb', 'Bakı şəhəri 334 nömrəli tam orta ümumtəhsil məktəbi', 334, 'Xəzər'),
  ('Bakı 171 nömrəli tam orta məktəb', 'Bakı şəhəri Zaur Məmmədov adına 171 nömrəli tam orta ümumtəhsil məktəbi', 171, 'Xətai'),
  ('Bakı 328 nömrəli tam orta məktəb', 'Bakı şəhəri 328 nömrəli tam orta ümumtəhsil məktəbi', 328, 'Nizami'),
  ('Bakı 333 nömrəli tam orta məktəb', 'Bakı şəhəri 333 nömrəli tam orta ümumtəhsil məktəbi', 333, 'Binəqədi'),
  ('Bakı 71 nömrəli tam orta məktəb', 'Bakı şəhəri Elxan Misirxanov adına 71 nömrəli tam orta ümumtəhsil məktəbi', 71, 'Sabunçu'),
  ('Bakı 248 nömrəli tam orta məktəb', 'Bakı şəhəri Nizami Nərimanov adına 248 nömrəli tam orta ümumtəhsil məktəbi', 248, 'Binəqədi'),
  ('Bakı 114 nömrəli tam orta məktəb', 'Bakı şəhəri Abil Səfərov adına 114 nömrəli tam orta ümumtəhsil məktəbi', 114, 'Suraxanı'),
  ('Bakı 206 nömrəli tam orta məktəb', 'Bakı şəhəri Hatəm İskəndərov adına 206 nömrəli tam orta ümumtəhsil məktəbi', 206, 'Xəzər'),
  ('Bakı 137 nömrəli tam orta məktəb', 'Bakı şəhəri Elşən Məhərrəmov adına 137 nömrəli tam orta ümumtəhsil məktəbi', 137, 'Sabunçu'),
  ('Bakı 278 nömrəli tam orta məktəb', 'Bakı şəhəri Pərviz İsmayılov adına 278 nömrəli tam orta ümumtəhsil məktəbi', 278, 'Suraxanı'),
  ('Bakı 42 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar Əbilhəsənov adına 42 nömrəli tam orta ümumtəhsil məktəbi', 42, 'Nəsimi'),
  ('Bakı 193 nömrəli tam orta məktəb', 'Bakı şəhəri Məhəmmədhüseyn Şəhriyar adına 193 nömrəli tam orta ümumtəhsil məktəbi', 193, 'Nərimanov'),
  ('Bakı 165 nömrəli tam orta məktəb', 'Bakı şəhəri 165 nömrəli tam orta ümumtəhsil məktəbi', 165, 'Xətai'),
  ('Bakı 204 nömrəli tam orta məktəb', 'Bakı şəhəri Ələkbər Əliyev adına 204 nömrəli tam orta ümumtəhsil məktəbi', 204, 'Xətai'),
  ('Bakı 86 nömrəli tam orta məktəb', 'Bakı şəhəri Mübariz Nəcəfov adına 86 nömrəli tam orta ümumtəhsil məktəbi', 86, 'Xətai'),
  ('Bakı 31 nömrəli tam orta məktəb', 'Bakı şəhəri Aslan Ağaverdiyev adına 31 nömrəli tam orta ümumtəhsil məktəbi', 31, 'Yasamal'),
  ('Bakı 245 nömrəli tam orta məktəb', 'Bakı şəhəri 245 nömrəli tam orta ümumtəhsil məktəbi', 245, 'Xətai'),
  ('1 nömrəli idman liseyi', 'Bakı şəhəri 1 nömrəli idman liseyi', 1, 'Nizami'),
  ('Bakı 242 nömrəli tam orta məktəb', 'Bakı şəhəri 242 nömrəli tam orta ümumtəhsil məktəbi', 242, 'Nizami'),
  ('Bakı 90 nömrəli tam orta məktəb', 'Bakı şəhəri Rixard Zorge adına 90 nömrəli tam orta ümumtəhsil məktəbi', 90, 'Sabunçu'),
  ('Bakı 163 nömrəli tam orta məktəb', 'Bakı şəhəri 163 nömrəli tam orta ümumtəhsil məktəbi', 163, 'Səbail'),
  ('Bakı 138 nömrəli tam orta məktəb', 'Bakı şəhəri 138 nömrəli tam orta ümumtəhsil məktəbi', 138, 'Xətai'),
  ('Bakı 156 nömrəli tam orta məktəb', 'Bakı şəhəri 156 nömrəli tam orta ümumtəhsil məktəbi', 156, 'Xəzər'),
  ('Bakı 46 nömrəli tam orta məktəb', 'Bakı şəhəri Ağabəy Novruzbəyli adına 46 nömrəli tam orta ümumtəhsil məktəbi', 46, 'Nəsimi'),
  ('Bakı 237 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar Muradov adına 237 nömrəli tam orta ümumtəhsil məktəbi', 237, 'Xəzər'),
  ('Bakı 223 nömrəli tam orta məktəb', 'Bakı şəhəri Azad Rzayev adına 223 nömrəli tam orta ümumtəhsil məktəbi', 223, 'Qaradağ'),
  ('Bakı 24 nömrəli tam orta məktəb', 'Bakı şəhəri 24 nömrəli tam orta ümumtəhsil məktəbi', 24, 'Xətai'),
  ('Bakı 104 nömrəli tam orta məktəb', 'Bakı şəhəri Nazim Rəfiyev adına 104 nömrəli tam orta ümumtəhsil məktəbi', 104, 'Suraxanı'),
  ('Bakı 297 nömrəli tam orta məktəb', 'Bakı şəhəri 297 nömrəli tam orta ümumtəhsil məktəbi', 297, 'Binəqədi'),
  ('Bakı 306 nömrəli tam orta məktəb', 'Bakı şəhəri 306 nömrəli tam orta ümumtəhsil məktəbi', 306, 'Binəqədi'),
  ('Bakı 211 nömrəli tam orta məktəb', 'Bakı şəhəri Akif Abdullayev adına 211 nömrəli tam orta ümumtəhsil məktəbi', 211, 'Nəsimi'),
  ('Bakı 279 nömrəli tam orta məktəb', 'Bakı şəhəri 279 nömrəli tam orta ümumtəhsil məktəbi', 279, 'Suraxanı'),
  ('Bakı 5 nömrəli tam orta məktəb', 'Bakı şəhəri Samir Hacıyev adına 5 nömrəli tam orta ümumtəhsil məktəbi', 5, 'Nəsimi'),
  ('Bakı 168 nömrəli tam orta məktəb', 'Bakı şəhəri 168 nömrəli tam orta ümumtəhsil məktəbi', 168, 'Pirallahı'),
  ('Bakı 38 nömrəli tam orta məktəb', 'Bakı şəhəri Aytəkin Məmmədov adına 38 nömrəli tam orta ümumtəhsil məktəbi', 38, 'Yasamal'),
  ('Bakı 207 nömrəli tam orta məktəb', 'Bakı şəhəri Sərhəddin Yolçuyev adına 207 nömrəli tam orta ümumtəhsil məktəbi', 207, 'Nərimanov'),
  ('Bakı 9 nömrəli tam orta məktəb', 'Bakı şəhəri Namiq Məmmədov adına 9 nömrəli tam orta ümumtəhsil məktəbi', 9, 'Nəsimi'),
  ('Bakı 51 nömrəli tam orta məktəb', 'Bakı şəhəri Müşfiq və Mehman Nəbiyev qardaşları adına 51 nömrəli tam orta ümumtəhsil məktəbi', 51, 'Səbail'),
  ('Bakı 121 nömrəli tam orta məktəb', 'Bakı şəhəri Əmirəhməd Quliyev adına 121 nömrəli tam orta ümumtəhsil məktəbi', 121, 'Xəzər'),
  ('Bakı 127 nömrəli tam orta məktəb', 'Bakı şəhəri Elman Rzayev adına 127 nömrəli tam orta ümumtəhsil məktəbi', 127, 'Qaradağ'),
  ('Bakı 111 nömrəli tam orta məktəb', 'Bakı şəhəri Rövşən Nəsirov adına 111 nömrəli tam orta ümumtəhsil məktəbi', 111, 'Nəsimi'),
  ('Bakı 65 nömrəli tam orta məktəb', 'Bakı şəhəri Qəhrəman Qəhrəmanov adına 65 nömrəli tam orta ümumtəhsil məktəbi', 65, 'Suraxanı'),
  ('Bakı 8 nömrəli tam orta məktəb', 'Bakı şəhəri Kərim Kərimov adına 8 nömrəli tam orta ümumtəhsil məktəbi', 8, 'Nəsimi'),
  ('Bakı 257 nömrəli tam orta məktəb', 'Bakı şəhəri Ədalət Abbasov adına 257 nömrəli tam orta ümumtəhsil məktəbi', 257, 'Xətai'),
  ('Bakı 107 nömrəli tam orta məktəb', 'Bakı şəhəri Rasim Quliyev adına 107 nömrəli tam orta ümumtəhsil məktəbi', 107, 'Sabunçu'),
  ('Bakı 274 nömrəli tam orta məktəb', 'Bakı şəhəri Etibar Şirəliyev adına 274 nömrəli tam orta ümumtəhsil məktəbi', 274, 'Qaradağ'),
  ('Bakı 215 nömrəli tam orta məktəb', 'Bakı şəhəri 215 nömrəli tam orta ümumtəhsil məktəbi', 215, 'Sabunçu'),
  ('Bakı 178 nömrəli tam orta məktəb', 'Bakı şəhəri Dilqəm Nəbiyev adına 178 nömrəli tam orta ümumtəhsil məktəbi', 178, 'Nərimanov'),
  ('Bakı 68 nömrəli tam orta məktəb', 'Bakı şəhəri Zakir Bəhmənov adına 68 nömrəli tam orta ümumtəhsil məktəbi', 68, 'Sabunçu'),
  ('Bakı 122 nömrəli tam orta məktəb', 'Bakı şəhəri 122 nömrəli ümumi orta ümumtəhsil məktəbi', 122, 'Xəzər'),
  ('Bakı 167 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar İbrahimov adına 167 nömrəli tam orta ümumtəhsil məktəbi', 167, 'Yasamal'),
  ('Bakı 275 nömrəli tam orta məktəb', 'Bakı şəhəri Ələkbər Eyvazov adına 275 nömrəli tam orta ümumtəhsil məktəbi', 275, 'Suraxanı'),
  ('Bakı 23 nömrəli tam orta məktəb', 'Bakı şəhəri Tahir Həsənov adına 23 nömrəli tam orta ümumtəhsil məktəbi', 23, 'Nəsimi'),
  ('Bakı 133 nömrəli tam orta məktəb', 'Bakı şəhəri 133 nömrəli tam orta ümumtəhsil məktəbi', 133, 'Yasamal'),
  ('Bakı 313 nömrəli tam orta məktəb', 'Bakı şəhəri 313 nömrəli tam orta ümumtəhsil məktəbi', 313, 'Binəqədi'),
  ('Bakı 149 nömrəli tam orta məktəb', 'Bakı şəhəri Elçin Şəmiyev adına 149 nömrəli tam orta ümumtəhsil məktəbi', 149, 'Xəzər'),
  ('Bakı 130 nömrəli tam orta məktəb', 'Bakı şəhəri 130 nömrəli tam orta ümumtəhsil məktəbi', 130, 'Sabunçu'),
  ('Bakı 89 nömrəli tam orta məktəb', 'Bakı şəhəri 89 nömrəli tam orta ümumtəhsil məktəbi', 89, 'Suraxanı'),
  ('Bakı 75 nömrəli tam orta məktəb', 'Bakı şəhəri Xavər Vəliyev adına 75 nömrəli tam orta ümumtəhsil məktəbi', 75, 'Sabunçu'),
  ('Bakı 189 nömrəli tam orta məktəb', 'Bakı şəhəri 189-190 nömrəli tam orta ümumtəhsil məktəbi', 189, 'Səbail'),
  ('Bakı 162 nömrəli tam orta məktəb', 'Bakı şəhəri Etibar Əliyev adına 162 nömrəli tam orta ümumtəhsil məktəbi', 162, 'Səbail'),
  ('Bakı 309 nömrəli tam orta məktəb', 'Bakı şəhəri 309 nömrəli tam orta ümumtəhsil məktəbi', 309, 'Sabunçu'),
  ('Bakı 20 nömrəli tam orta məktəb', 'Bakı şəhəri 20 nömrəli məktəb-lisey', 20, 'Yasamal'),
  ('Bakı 60 nömrəli tam orta məktəb', 'Bakı şəhəri Paşa Nəzərov adına 60 nömrəli tam orta ümumtəhsil məktəbi', 60, 'Yasamal'),
  ('Bakı 295 nömrəli tam orta məktəb', 'Bakı şəhəri 295 nömrəli tam orta ümumtəhsil məktəbi', 295, 'Sabunçu'),
  ('Bakı 100 nömrəli tam orta məktəb', 'Bakı şəhəri Namiq Fərəczadə adına 100 nömrəli tam orta ümumtəhsil məktəbi', 100, 'Binəqədi'),
  ('Bakı 288 nömrəli tam orta məktəb', 'Bakı şəhəri Neftçi Qurban adına 288 nömrəli tam orta ümumtəhsil məktəbi', 288, 'Qaradağ'),
  ('Bakı 184 nömrəli tam orta məktəb', 'Bakı şəhəri Kamran Yaqubov adına 184 nömrəli tam orta ümumtəhsil məktəbi', 184, 'Qaradağ'),
  ('Bakı 263 nömrəli tam orta məktəb', 'Bakı şəhəri Allahverdi Xəlilov adına 263 nömrəli tam orta ümumtəhsil məktəbi', 263, 'Xətai'),
  ('Bakı 221 nömrəli tam orta məktəb', 'Bakı şəhəri 221 nömrəli tam orta ümumtəhsil məktəbi', 221, 'Xətai'),
  ('Bakı 185 nömrəli tam orta məktəb', 'Bakı şəhəri 185 nömrəli tam orta ümumtəhsil məktəbi', 185, 'Xəzər'),
  ('Bakı 179 nömrəli tam orta məktəb', 'Bakı şəhəri Qorxmaz Baxşıyev adına 179 nömrəli tam orta ümumtəhsil məktəbi', 179, 'Binəqədi'),
  ('Bakı 93 nömrəli tam orta məktəb', 'Bakı şəhəri Eldar Əliyev adına 93 nömrəli tam orta ümumtəhsil məktəbi', 93, 'Nərimanov'),
  ('Bakı 97 nömrəli tam orta məktəb', 'Bakı şəhəri Nail Salamov adına 97 nömrəli tam orta ümumtəhsil məktəbi', 97, 'Suraxanı'),
  ('Bakı 314 nömrəli tam orta məktəb', 'Bakı şəhəri 314 nömrəli tam orta ümumtəhsil məktəbi', 314, 'Binəqədi'),
  ('Bakı 159 nömrəli tam orta məktəb', 'Bakı şəhəri Poladi Saleh adına 159 nömrəli tam orta ümumtəhsil məktəbi', 159, 'Nəsimi'),
  ('Bakı 18 nömrəli tam orta məktəb', 'Bakı şəhəri Mikayıl Müşfiq adına 18 nömrəli tam orta ümumtəhsil məktəbi', 18, 'Yasamal'),
  ('Bakı 115 nömrəli tam orta məktəb', 'Bakı şəhəri Azər Məmmədov adına 115 nömrəli tam orta ümumtəhsil məktəbi', 115, 'Binəqədi'),
  ('Bakı 131 nömrəli tam orta məktəb', 'Bakı şəhəri Rasim İbrahimov adına 131 nömrəli tam orta ümumtəhsil məktəbi', 131, 'Pirallahı'),
  ('Bakı 321 nömrəli tam orta məktəb', 'Bakı şəhəri 321 nömrəli tam orta ümumtəhsil məktəbi', 321, 'Qaradağ'),
  ('Bakı 123 nömrəli tam orta məktəb', 'Bakı şəhəri Hacı Zeynalabdin Tağıyev adına 123 nömrəli tam orta ümumtəhsil məktəbi', 123, 'Xəzər'),
  ('Bakı 129 nömrəli tam orta məktəb', 'Bakı şəhəri 129 nömrəli tam orta ümumtəhsil məktəbi', 129, 'Nizami'),
  ('Bakı 241 nömrəli tam orta məktəb', 'Bakı şəhəri Ziya Ağayev adına 241 nömrəli tam orta ümumtəhsil məktəbi', 241, 'Xəzər'),
  ('Bakı 76 nömrəli tam orta məktəb', 'Bakı şəhəri Ələddin Məmmədov adına 76 nömrəli tam orta ümumtəhsil məktəbi', 76, 'Suraxanı'),
  ('Bakı 298 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar Məmmədov adına 298 nömrəli tam orta ümumtəhsil məktəbi', 298, 'Binəqədi'),
  ('Bakı 124 nömrəli tam orta məktəb', 'Bakı şəhəri Füzuli Gözəlov adına 124 nömrəli tam orta ümumtəhsil məktəbi', 124, 'Xəzər'),
  ('Bakı 152 nömrəli tam orta məktəb', 'Bakı şəhəri 152 nömrəli tam orta ümumtəhsil məktəbi', 152, 'Xətai'),
  ('Bakı 155 nömrəli tam orta məktəb', 'Bakı şəhəri Cəlal Məmmədyarov adına 155 nömrəli tam orta ümumtəhsil məktəbi', 155, 'Sabunçu'),
  ('Bakı 157 nömrəli tam orta məktəb', 'Bakı şəhəri Famil İsgəndərov adına 157 nömrəli tam orta ümumtəhsil məktəbi', 157, 'Binəqədi'),
  ('Bakı 280 nömrəli tam orta məktəb', 'Bakı şəhəri Mehdi Mehdiyev adına 280 nömrəli tam orta ümumtəhsil məktəbi', 280, 'Suraxanı'),
  ('Bakı 161 nömrəli tam orta məktəb', 'Bakı şəhəri Cəfər Cabbarlı adına 161 nömrəli tam orta ümumtəhsil məktəbi', 161, 'Yasamal'),
  ('Bakı 210 nömrəli tam orta məktəb', 'Bakı şəhəri 210 nömrəli tam orta ümumtəhsil məktəbi', 210, 'Nizami'),
  ('Bakı 27 nömrəli tam orta məktəb', 'Bakı şəhəri 27 nömrəli tam orta ümumtəhsil məktəbi', 27, 'Xətai'),
  ('Bakı 91 nömrəli tam orta məktəb', 'Bakı şəhəri 91 nömrəli tam orta ümumtəhsil məktəbi', 91, 'Səbail'),
  ('Bakı 78 nömrəli tam orta məktəb', 'Bakı şəhəri 78 nömrəli tam orta ümumtəhsil məktəbi', 78, 'Sabunçu'),
  ('Bakı 270 nömrəli tam orta məktəb', 'Bakı şəhəri Elçin Qaranzadə adına 270 nömrəli tam orta ümumtəhsil məktəbi', 270, 'Suraxanı'),
  ('Bakı 116 nömrəli tam orta məktəb', 'Bakı şəhəri Murad Hacıyev adına 116 nömrəli tam orta ümumtəhsil məktəbi', 116, 'Xətai'),
  ('Bakı 1 nömrəli tam orta məktəb', 'Bakı şəhəri Namiq Axundov adına 1 nömrəli tam orta ümumtəhsil məktəbi', 1, 'Nəsimi'),
  ('Bakı 307 nömrəli tam orta məktəb', 'Bakı şəhəri 307 nömrəli tam orta ümumtəhsil məktəbi', 307, 'Sabunçu'),
  ('Bakı 98 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar Mirzəyev adına 98 nömrəli tam orta ümumtəhsil məktəbi', 98, 'Xətai'),
  ('Bakı 48 nömrəli tam orta məktəb', 'Bakı şəhəri Ceyhun Həsənov adına 48 nömrəli tam orta ümumtəhsil məktəbi', 48, 'Xətai'),
  ('Bakı 269 nömrəli tam orta məktəb', 'Bakı şəhəri Rüfət Məmmədov adına 269 nömrəli tam orta ümumtəhsil məktəbi', 269, 'Xətai'),
  ('Bakı 265 nömrəli tam orta məktəb', 'Bakı şəhəri Miryusif Yusifov adına 265 nömrəli tam orta ümumtəhsil məktəbi', 265, 'Xətai'),
  ('Bakı 256 nömrəli tam orta məktəb', 'Bakı şəhəri Nizami Sərxanov adına 256 nömrəli tam orta ümumtəhsil məktəbi', 256, 'Xəzər'),
  ('Bakı 96 nömrəli tam orta məktəb', 'Bakı şəhəri İlqar Əliyev adına 96 nömrəli tam orta ümumtəhsil məktəbi', 96, 'Sabunçu'),
  ('Bakı 81 nömrəli tam orta məktəb', 'Bakı şəhəri 81 nömrəli tam orta ümumtəhsil məktəbi', 81, 'Sabunçu'),
  ('Bakı 323 nömrəli tam orta məktəb', 'Bakı şəhəri 323 nömrəli tam orta ümumtəhsil məktəbi', 323, 'Xəzər'),
  ('Bakı 142 nömrəli tam orta məktəb', 'Bakı şəhəri Telman İsgəndərov adına 142 nömrəli tam orta ümumtəhsil məktəbi', 142, 'Sabunçu'),
  ('Bakı 141 nömrəli tam orta məktəb', 'Bakı şəhəri Rəsul Ənnağıyev adına 141 nömrəli tam orta ümumtəhsil məktəbi', 141, 'Suraxanı'),
  ('Bakı 324 nömrəli tam orta məktəb', 'Bakı şəhəri 324 nömrəli tam orta ümumtəhsil məktəbi', 324, 'Xəzər'),
  ('Bakı 67 nömrəli tam orta məktəb', 'Bakı şəhəri 67 nömrəli tam orta ümumtəhsil məktəbi', 67, 'Sabunçu'),
  ('Bakı 238 nömrəli tam orta məktəb', 'Bakı şəhəri Namiq Həmzəyev adına 238 nömrəli tam orta ümumtəhsil məktəbi', 238, 'Nizami'),
  ('Bakı 230 nömrəli tam orta məktəb', 'Bakı şəhəri Fuad Mövludov adına 230 nömrəli tam orta ümumtəhsil məktəbi', 230, 'Xəzər'),
  ('Bakı 301 nömrəli tam orta məktəb', 'Bakı şəhəri Seymur Məmmədov adına 301 nömrəli tam orta ümumtəhsil məktəbi', 301, 'Binəqədi'),
  ('Bakı 315 nömrəli tam orta məktəb', 'Bakı şəhəri 315 nömrəli tam orta ümumtəhsil məktəbi', 315, 'Suraxanı'),
  ('Bakı 28 nömrəli tam orta məktəb', 'Bakı şəhəri 28 nömrəli tam orta ümumtəhsil məktəbi', 28, 'Sabunçu'),
  ('Bakı 209 nömrəli tam orta məktəb', 'Bakı şəhəri Kamal Məmmədov adına 209 nömrəli tam orta ümumtəhsil məktəbi', 209, 'Sabunçu'),
  ('Bakı 240 nömrəli tam orta məktəb', 'Bakı şəhəri 240 nömrəli tam orta ümumtəhsil məktəbi', 240, 'Nəsimi'),
  ('Bakı 250 nömrəli tam orta məktəb', 'Bakı şəhəri 250 nömrəli tam orta ümumtəhsil məktəbi', 250, 'Nizami'),
  ('Bakı 146 nömrəli tam orta məktəb', 'Bakı şəhəri Cavanşir Rəhimov adına 146 nömrəli tam orta ümumtəhsil məktəbi', 146, 'Suraxanı'),
  ('Bakı 273 nömrəli tam orta məktəb', 'Bakı şəhəri Etiraf Eyyubov adına 273 nömrəli tam orta ümumtəhsil məktəbi', 273, 'Qaradağ'),
  ('Bakı 55 nömrəli tam orta məktəb', 'Bakı şəhəri 55 nömrəli tam orta ümumtəhsil məktəbi', 55, 'Xətai'),
  ('Bakı 50 nömrəli tam orta məktəb', 'Bakı şəhəri Cəbrayıl Əskərov adına 50 nömrəli tam orta ümumtəhsil məktəbi', 50, 'Səbail'),
  ('Bakı 217 nömrəli tam orta məktəb', 'Bakı şəhəri Elşən Sultanov adına 217 nömrəli tam orta ümumtəhsil məktəbi', 217, 'Binəqədi'),
  ('Bakı 247 nömrəli tam orta məktəb', 'Bakı şəhəri Abdulla Rəhimov adına 247 nömrəli tam orta ümumtəhsil məktəbi', 247, 'Nəsimi'),
  ('Bakı 284 nömrəli tam orta məktəb', 'Bakı şəhəri Qamət Abbasov adına 284 nömrəli tam orta ümumtəhsil məktəbi', 284, 'Binəqədi'),
  ('Bakı 170 nömrəli tam orta məktəb', 'Bakı şəhəri 170 nömrəli tam orta ümumtəhsil məktəbi', 170, 'Sabunçu'),
  ('Bakı 12 nömrəli tam orta məktəb', 'Bakı şəhəri Kamil Əyyubov adına 12 nömrəli tam orta ümumtəhsil məktəbi', 12, 'Nizami'),
  ('Bakı 85 nömrəli tam orta məktəb', 'Bakı şəhəri Ramiq Abidov adına 85 nömrəli məktəb', 85, 'Suraxanı'),
  ('Bakı 88 nömrəli tam orta məktəb', 'Bakı şəhəri Elçin Mansurov adına 88 nömrəli tam orta ümumtəhsil məktəbi', 88, 'Xəzər'),
  ('Bakı 197 nömrəli tam orta məktəb', 'Bakı şəhəri Elman Heydərov adına 197 nömrəli tam orta ümumtəhsil məktəbi', 197, 'Qaradağ'),
  ('Bakı 39 nömrəli tam orta məktəb', 'Bakı şəhəri Rafiq Nəsrəddinov adına 39 nömrəli tam orta ümumtəhsil məktəbi', 39, 'Nərimanov'),
  ('Bakı 195 nömrəli tam orta məktəb', 'Bakı şəhəri Yusif Əliyev adına 195 nömrəli tam orta ümumtəhsil məktəbi', 195, 'Qaradağ'),
  ('Bakı 158 nömrəli tam orta məktəb', 'Bakı şəhəri 158 nömrəli tam orta ümumtəhsil məktəbi', 158, 'Yasamal'),
  ('Bakı 80 nömrəli tam orta məktəb', 'Bakı şəhəri Nazim İsmayılov adına 80 nömrəli tam orta ümumtəhsil məktəbi', 80, 'Sabunçu'),
  ('Bakı 139 nömrəli tam orta məktəb', 'Bakı şəhəri Elxan Həsənov adına 139 nömrəli tam orta ümumtəhsil məktəbi', 139, 'Qaradağ'),
  ('Bakı 320 nömrəli tam orta məktəb', 'Bakı şəhəri 320 nömrəli tam orta ümumtəhsil məktəbi', 320, 'Qaradağ'),
  ('Bakı 249 nömrəli tam orta məktəb', 'Bakı şəhəri 249 nömrəli tam orta ümumtəhsil məktəbi', 249, 'Xətai'),
  ('Bakı 285 nömrəli tam orta məktəb', 'Bakı şəhəri Bünyadəli Pələngov adına 285 nömrəli tam orta ümumtəhsil məktəbi', 285, 'Suraxanı'),
  ('Bakı 262 nömrəli tam orta məktəb', 'Bakı şəhəri 262 nömrəli tam orta ümumtəhsil məktəbi', 262, 'Xəzər'),
  ('Bakı 30 nömrəli tam orta məktəb', 'Bakı şəhəri Vahid Əzizov adına 30 nömrəli tam orta ümumtəhsil məktəbi', 30, 'Binəqədi'),
  ('Bakı 144 nömrəli tam orta məktəb', 'Bakı şəhəri Namiq Babayev adına 144 nömrəli tam orta ümumtəhsil məktəbi', 144, 'Binəqədi'),
  ('Bakı 203 nömrəli tam orta məktəb', 'Bakı şəhəri Riyad Əhmədov adına 203 nömrəli tam orta ümumtəhsil məktəbi', 203, 'Səbail'),
  ('Bakı 191 nömrəli tam orta məktəb', 'Bakı şəhəri 191 nömrəli tam orta ümumtəhsil məktəbi', 191, 'Xətai'),
  ('Bakı 151 nömrəli tam orta məktəb', 'Bakı şəhəri 151 nömrəli tam orta ümumtəhsil məktəbi', 151, 'Nəsimi'),
  ('Bakı 34 nömrəli tam orta məktəb', 'Bakı şəhəri Bəhruz Sultanov adına 34 nömrəli tam orta ümumtəhsil məktəbi', 34, 'Nərimanov'),
  ('Bakı 316 nömrəli tam orta məktəb', 'Bakı şəhəri 316 nömrəli tam orta ümumtəhsil məktəbi', 316, 'Suraxanı'),
  ('Bakı 56 nömrəli tam orta məktəb', 'Bakı şəhəri Elşad Yəhyayev adına 56 nömrəli tam orta ümumtəhsil məktəbi', 56, 'Xətai'),
  ('Bakı 128 nömrəli tam orta məktəb', 'Bakı şəhəri Nəriman Nərimanov adına 128 nömrəli tam orta ümumtəhsil məktəbi', 128, 'Sabunçu'),
  ('Bakı 109 nömrəli tam orta məktəb', 'Bakı şəhəri Rəhilə Orucova adına 109 nömrəli tam orta ümumtəhsil məktəbi', 109, 'Nizami'),
  ('Bakı 94 nömrəli tam orta məktəb', 'Bakı şəhəri 94 nömrəli tam orta ümumtəhsil məktəbi', 94, 'Sabunçu'),
  ('Bakı 82 nömrəli tam orta məktəb', 'Bakı şəhəri 82 nömrəli tam orta ümumtəhsil məktəbi', 82, 'Nərimanov'),
  ('Bakı 35 nömrəli tam orta məktəb', 'Bakı şəhəri 35 nömrəli tam orta ümumtəhsil məktəbi', 35, 'Nəsimi'),
  ('Bakı 202 nömrəli tam orta məktəb', 'Bakı şəhəri Alı Mustafayev adına 202 nömrəli tam orta ümumtəhsil məktəbi', 202, 'Nərimanov'),
  ('Bakı 58 nömrəli tam orta məktəb', 'Bakı şəhəri 58 nömrəli tam orta ümumtəhsil məktəbi', 58, 'Xətai'),
  ('Bakı 244 nömrəli tam orta məktəb', 'Bakı şəhəri Əsəd Ələskərov adına 244 nömrəli tam orta ümumtəhsil məktəbi', 244, 'Binəqədi'),
  ('Bakı 335 nömrəli tam orta məktəb', 'Bakı şəhəri 335 nömrəli tam orta ümumtəhsil məktəbi', 335, 'Binəqədi'),
  ('Bakı 251 nömrəli tam orta məktəb', 'Bakı şəhəri 251 nömrəli tam orta ümumtəhsil məktəbi', 251, 'Nizami'),
  ('Bakı 276 nömrəli tam orta məktəb', 'Bakı şəhəri 276 nömrəli tam orta ümumtəhsil məktəbi', 276, 'Binəqədi'),
  ('Bakı 192 nömrəli tam orta məktəb', 'Bakı şəhəri 192 nömrəli tam orta ümumtəhsil məktəbi', 192, 'Sabunçu'),
  ('Bakı 63 nömrəli tam orta məktəb', 'Bakı şəhəri Sədrəddin Həsənov adına 63 nömrəli tam orta ümumtəhsil məktəbi', 63, 'Xətai'),
  ('Bakı 226 nömrəli tam orta məktəb', 'Bakı şəhəri 226 nömrəli tam orta ümumtəhsil məktəbi', 226, 'Suraxanı'),
  ('Bakı 44 nömrəli tam orta məktəb', 'Bakı şəhəri Yusif Mirzəyev adına 44 nömrəli tam orta ümumtəhsil məktəbi', 44, 'Nəsimi'),
  ('Bakı 253 nömrəli tam orta məktəb', 'Bakı şəhəri Elxan İsmayılov adına 253 nömrəli tam orta ümumtəhsil məktəbi', 253, 'Qaradağ'),
  ('Bakı 32 nömrəli tam orta məktəb', 'Bakı şəhəri Məzahir Rüstəmov adına 32 nömrəli tam orta ümumtəhsil məktəbi', 32, 'Nizami'),
  ('Bakı 228 nömrəli tam orta məktəb', 'Bakı şəhəri Əliheydər Kazımov adına 228 nömrəli tam orta ümumtəhsil məktəbi', 228, 'Qaradağ'),
  ('Bakı 14 nömrəli tam orta məktəb', 'Bakı şəhəri 14 nömrəli tam orta ümumtəhsil məktəbi', 14, 'Nəsimi'),
  ('Bakı 13 nömrəli tam orta məktəb', 'Bakı şəhəri Şəfiqə Əfəndizadə adına 13 nömrəli tam orta ümumtəhsil məktəbi', 13, 'Yasamal'),
  ('Bakı 92 nömrəli tam orta məktəb', 'Bakı şəhəri 92 nömrəli tam orta ümumtəhsil məktəbi', 92, 'Xəzər'),
  ('Bakı 33 nömrəli tam orta məktəb', 'Bakı şəhəri 33 nömrəli tam orta ümumtəhsil məktəbi', 33, 'Xəzər'),
  ('Bakı 181 nömrəli tam orta məktəb', 'Bakı şəhəri 181 nömrəli tam orta ümumtəhsil məktəbi', 181, 'Xəzər'),
  ('Bakı 119 nömrəli tam orta məktəb', 'Bakı şəhəri Dərdayıl Cəbrayılov adına 119 nömrəli tam orta ümumtəhsil məktəbi', 119, 'Xəzər'),
  ('Bakı 218 nömrəli tam orta məktəb', 'Bakı şəhəri Rəşid Baxışov adına 218 nömrəli tam orta ümumtəhsil məktəbi', 218, 'Xəzər'),
  ('Bakı 282 nömrəli tam orta məktəb', 'Bakı şəhəri Nadir Əliyev adına 282 nömrəli tam orta ümumtəhsil məktəbi', 282, 'Suraxanı'),
  ('Bakı 45 nömrəli tam orta məktəb', 'Bakı şəhəri Nəriman Nərimanov adına 45 nömrəli tam orta ümumtəhsil məktəbi', 45, 'Nərimanov'),
  ('Bakı 272 nömrəli tam orta məktəb', 'Bakı şəhəri Etibar Cəlilov adına 272 nömrəli tam orta ümumtəhsil məktəbi', 272, 'Nizami'),
  ('Bakı 177 nömrəli tam orta məktəb', 'Bakı şəhəri 177 nömrəli tam orta ümumtəhsil məktəbi', 177, 'Nərimanov'),
  ('Bakı 194 nömrəli tam orta məktəb', 'Bakı şəhəri Zakir Yusifov adına 194 nömrəli tam orta ümumtəhsil məktəbi', 194, 'Xətai'),
  ('Bakı 95 nömrəli tam orta məktəb', 'Bakı şəhəri Ayaz Məhərrəmov adına 95 nömrəli tam orta ümumtəhsil məktəbi', 95, 'Xətai'),
  ('Bakı 57 nömrəli tam orta məktəb', 'Bakı şəhəri Tahir Həsənov adına 57 nömrəli tam orta ümumtəhsil məktəbi', 57, 'Nərimanov'),
  ('Bakı 21 nömrəli tam orta məktəb', 'Bakı şəhəri Eldar Məmmədov adına 21 nömrəli tam orta ümumtəhsil məktəbi', 21, 'Yasamal'),
  ('Bakı 312 nömrəli tam orta məktəb', 'Bakı şəhəri 312 nömrəli tam orta ümumtəhsil məktəbi', 312, 'Nizami'),
  ('Bakı 286 nömrəli tam orta məktəb', 'Bakı şəhəri 286 nömrəli tam orta ümumtəhsil məktəbi', 286, 'Yasamal'),
  ('Bakı 182 nömrəli tam orta məktəb', 'Bakı şəhəri 182 nömrəli tam orta ümumtəhsil məktəbi', 182, 'Binəqədi'),
  ('Bakı 64 nömrəli tam orta məktəb', 'Bakı şəhəri Zakir Əhmədov adına 64 nömrəli tam orta ümumtəhsil məktəbi', 64, 'Xətai'),
  ('Bakı 300 nömrəli tam orta məktəb', 'Bakı şəhəri Vüqar Əvəzov adına 300 nömrəli tam orta ümumtəhsil məktəbi', 300, 'Binəqədi'),
  ('Bakı 303 nömrəli tam orta məktəb', 'Bakı şəhəri 303 nömrəli ümumi orta ümumtəhsil məktəbi', 303, 'Qaradağ'),
  ('Bakı 290 nömrəli tam orta məktəb', 'Bakı şəhəri Səməd Abdullayev adına 290 nömrəli tam orta ümumtəhsil məktəbi', 290, 'Suraxanı'),
  ('Bakı 281 nömrəli tam orta məktəb', 'Bakı şəhəri Vaqif Mirzəyev adına 281 nömrəli tam orta ümumtəhsil məktəbi', 281, 'Suraxanı'),
  ('Bakı 4 nömrəli tam orta məktəb', 'Bakı şəhəri 4 nömrəli tam orta ümumtəhsil məktəb publik hüquqi şəxs', 4, 'Sabunçu'),
  ('Bakı 187 nömrəli tam orta məktəb', 'Bakı şəhəri Cəfər Cabbarlı adına 187 nömrəli tam orta ümumtəhsil məktəbi', 187, 'Sabunçu'),
  ('Bakı 148 nömrəli tam orta məktəb', 'Bakı şəhəri Akif Qambayzadə adına 148 nömrəli tam orta ümumtəhsil məktəbi', 148, 'Sabunçu'),
  ('Bakı 259 nömrəli tam orta məktəb', '“Bakı şəhəri M.Ə.Sabir adına 259 nömrəli tam orta ümumtəhsil məktəbi” publik hüquqi şəxsi', 259, 'Sabunçu'),
  ('Bakı 110 nömrəli tam orta məktəb', 'Bakı şəhəri Seyfulla Məmmədov adına 110 nömrəli tam orta ümumtəhsil məktəbi', 110, 'Qaradağ'),
  ('Bakı 294 nömrəli tam orta məktəb', 'Bakı şəhəri 294 nömrəli tam orta ümumtəhsil məktəbi', 294, 'Qaradağ'),
  ('Bakı 59 nömrəli tam orta məktəb', 'Bakı şəhəri Tahir Bağırov adına 59 nömrəli tam orta ümumtəhsil məktəbi', 59, 'Xətai'),
  ('Bakı 318 nömrəli tam orta məktəb', 'Bakı şəhəri 318 nömrəli tam orta ümumtəhsil məktəbi', 318, 'Suraxanı'),
  ('Bakı 108 nömrəli tam orta məktəb', 'Bakı şəhəri Cavid Nurməmmədov adına 108 nömrəli tam orta ümumtəhsil məktəbi', 108, 'Sabunçu'),
  ('Bakı 47 nömrəli tam orta məktəb', 'Bakı şəhəri Zaur Nudirəliyev adına 47 nömrəli tam orta ümumtəhsil məktəbi', 47, 'Nərimanov'),
  ('Bakı 326 nömrəli tam orta məktəb', 'Bakı şəhəri 326 nömrəli tam orta ümumtəhsil məktəbi', 326, 'Xəzər'),
  ('Bakı 305 nömrəli tam orta məktəb', 'Bakı şəhəri 305 nömrəli tam orta ümumtəhsil məktəbi', 305, 'Sabunçu'),
  ('Bakı 87 nömrəli tam orta məktəb', 'Bakı şəhəri 87 nömrəli tam orta ümumtəhsil məktəbi', 87, 'Suraxanı'),
  ('Bakı 17 nömrəli tam orta məktəb', 'Bakı şəhəri 17 nömrəli tam orta ümumtəhsil məktəbi', 17, 'Xətai'),
  ('Bakı 19 nömrəli tam orta məktəb', 'Bakı şəhəri Mehdi Hüseynzadə adına 19 nömrəli tam orta ümumtəhsil məktəbi', 19, 'Nəsimi'),
  ('Bakı 205 nömrəli tam orta məktəb', 'Bakı şəhəri Rövşən İmanov adına 205 nömrəli tam orta ümumtəhsil məktəbi', 205, 'Binəqədi'),
  ('Bakı 227 nömrəli tam orta məktəb', 'Bakı şəhəri 227 nömrəli tam orta ümumtəhsil məktəbi', 227, 'Nizami'),
  ('Bakı 10 nömrəli tam orta məktəb', 'Bakı şəhəri 10 nömrəli tam orta ümumtəhsil məktəbi', 10, 'Nizami'),
  ('Bakı 103 nömrəli tam orta məktəb', 'Bakı şəhəri Zakir Məmmədov adına 103 nömrəli tam orta ümumtəhsil məktəbi', 103, 'Binəqədi'),
  ('Bakı 212 nömrəli tam orta məktəb', 'Bakı şəhəri Natiq Tağıyev adına 212 nömrəli tam orta ümumtəhsil məktəbi', 212, 'Nərimanov'),
  ('Bakı 311 nömrəli tam orta məktəb', 'Bakı şəhəri 311 nömrəli tam orta ümumtəhsil məktəbi', 311, 'Sabunçu'),
  ('Bakı 271 nömrəli tam orta məktəb', 'Bakı şəhəri 271 nömrəli tam orta ümumtəhsil məktəbi', 271, 'Sabunçu'),
  ('Bakı 331 nömrəli tam orta məktəb', 'Bakı şəhəri 331 nömrəli ümumi orta ümumtəhsil məktəbi', 331, 'Qaradağ'),
  ('Bakı 235 nömrəli tam orta məktəb', 'Bakı şəhəri Yavər Əliyev adına 235 nömrəli tam orta ümumtəhsil məktəbi', 235, 'Pirallahı'),
  ('Bakı 61 nömrəli tam orta məktəb', 'Bakı şəhəri Kamil Əliyev adına 61 nömrəli tam orta ümumtəhsil məktəbi', 61, 'Nizami'),
  ('Bakı 239 nömrəli tam orta məktəb', 'Bakı şəhəri Tofiq Məmmədov adına 239 nömrəli tam orta ümumtəhsil məktəbi', 239, 'Səbail'),
  ('Bakı 293 nömrəli tam orta məktəb', 'Bakı şəhəri Əliağa Vahid adına 293 nömrəli tam orta ümumtəhsil məktəbi', 293, 'Sabunçu'),
  ('Bakı 176 nömrəli tam orta məktəb', 'Bakı şəhəri 176 nömrəli tam orta ümumtəhsil məktəbi', 176, 'Yasamal'),
  ('Bakı 120 nömrəli tam orta məktəb', 'Bakı şəhəri Nüsrət Yaqubov adına 120 nömrəli tam orta ümumtəhsil məktəbi', 120, 'Xəzər'),
  ('Bakı 153 nömrəli tam orta məktəb', 'Bakı şəhəri Mirələkbər İbrahimov adına 153 nömrəli tam orta ümumtəhsil məktəbi', 153, 'Yasamal'),
  ('Bakı 302 nömrəli tam orta məktəb', 'Bakı şəhəri Əhməd Zeynallı adına 302 nömrəli tam orta ümumtəhsil məktəbi', 302, 'Qaradağ'),
  ('Bakı 73 nömrəli tam orta məktəb', 'Bakı şəhəri 73 nömrəli tam orta ümumtəhsil məktəbi', 73, 'Nərimanov');

create temp table _baku_insert (
  name          text    not null,
  rayon         text    not null,
  school_number int,
  is_private    boolean not null
) on commit drop;

insert into _baku_insert (name, rayon, school_number, is_private) values
  ('İMSA-Maarif schools MMC', 'Nəsimi', null, true),
  ('AZMİU-nun nəzdində fizika-riyaziyyat təmayüllü lisey', 'Yasamal', null, false),
  ('Azərbaycan Milli Konservatoriyasının nəzdində incəsənət gimnaziyası', 'Yasamal', null, false),
  ('Türkiyə Diyanət Vəqfi  Bakı Türk Liseyi', 'Nəsimi', null, false),
  ('Bakı şəhəri 62 nömrəli məktəb-lisey', 'Nizami', 62, false),
  ('Bakı İstanbul Liseyi', 'Nəsimi', null, true),
  ('Bakı şəhəri 147 nömrəli texniki və humanitar fənlər liseyi', 'Yasamal', 147, false),
  ('Bakı şəhəri Fikrət Tağıyev adına 72 nömrəli məktəb-lisey', 'Sabunçu', 72, false),
  ('Təlim firması nəzdində ümumi orta ümumtəhsil məktəbi (Erudit)', 'Nərimanov', null, true),
  ('Bakı şəhəri 1 nömrəli ümumi təyinatlı internat tipli ümumtəhsil məktəbi', 'Sabunçu', 1, false),
  ('Bakı Beynəlxalq Təhsil Kompleksi', 'Yasamal', null, true),
  ('Bakı şəhəri 16 nömrəli texniki və humanitar fənlər liseyi', 'Nəsimi', 16, false),
  ('Bakı şəhəri 82 nömrəli xüsusi əyani-qiyabi tam orta ümumtəhsil məktəbi', 'Nərimanov', 82, false),
  ('Bakı şəhəri Tərlan Heybətov adına ''Vətən'' idman liseyi', 'Binəqədi', null, false),
  ('Bakı şəhəri Azad Hümbətov adına 291 nömrəli ekologiya liseyi', 'Nərimanov', 291, false),
  ('Bakı şəhəri Səttar Bəhlulzadə adına xarici dillər təmayüllü gimnaziya', 'Suraxanı', null, false),
  ('Cəmşid Naxçıvanski adına Hərbi lisey', 'Xətai', null, false),
  ('Oxbridge Academy', 'Nizami', null, true),
  ('Bakı şəhəri 2 nömrəli əyani-qiyabi tam orta ümumtəhsil məktəbi', 'Nizami', 2, false),
  ('Bakı şəhəri 267 nömrəli məktəb-lisey', 'Binəqədi', 267, false),
  ('Bakı şəhəri 5 nömrəli internat tipli xüsusi ümumtəhsil məktəbi', 'Nərimanov', 5, false),
  ('Heydər Əliyev adına Müasir Təhsil Kompleksi', 'Nəsimi', null, true),
  ('Türk Dünyası Atatürk Liseyi', 'Nəsimi', null, false),
  ('Bakı Xoreoqrafiya Akademiyası Tam orta təhsil pilləsi', 'Nəsimi', null, false),
  ('Bakı şəhəri Rizvan Pirnəzərov adına 299 nömrəli məktəb-lisey', 'Binəqədi', 299, false),
  ('Rəqəmsal Biliklər Liseyi', 'Xətai', null, false),
  ('Bakı Avropa liseyi', 'Xətai', null, false),
  ('Bakı şəhəri Emin Quliyev adına 9 nömrəli inteqrasiya təlimli internat tipli ümumtəhsil məktəbi', 'Qaradağ', 9, false),
  ('Bülbül adına orta ixtisas musiqi məktəbi', 'Səbail', null, false),
  ('Bakı şəhəri Seyid Cəfər Pişəvəri adına humanitar fənlər gimnaziyası', 'Nərimanov', null, false),
  ('Pr.Gindes adına Uşaq və Yeniyetmələr üçün Vərəm və Tənəffüs Orqanları Xəstəlikləri sanatoriyası nəzdində tam orta məktəb', 'Xəzər', null, false),
  ('Xəzər Universiteti nəzdində Dünya məktəbi', 'Binəqədi', null, true),
  ('ERA tam orta ümumtəhsil məktəbi', 'Binəqədi', null, true),
  ('“BSB” Tam Orta İnnovasiyalar Məktəbi', 'Nərimanov', null, true),
  ('UNİSER MMC-nin nəzdində tam orta ümumtəhsil məktəbi', 'Nəsimi', null, true),
  ('Bakı şəhəri Gültəkin Əsgərova adına məktəb-lisey kompleksi', 'Nərimanov', null, false),
  ('Bakı şəhəri Həbibulla Hüseynov adına 83 nömrəli məktəb-lisey', 'Binəqədi', 83, false),
  ('Bakı şəhəri 160 nömrəli Klassik gimnaziya', 'Səbail', 160, false),
  ('Bakı şəhəri İltifat Hacıyev adına ''Tərəqqi'' texniki-humanitar lisey', 'Nərimanov', null, false),
  ('Bakı şəhəri ''Zəngi'' liseyi', 'Nizami', null, false),
  ('Bakı şəhəri Həbib bəy Mahmudbəyov adına 2 nömrəli texniki-humanitar lisey', 'Səbail', 2, false),
  ('Azerbaijan British College Təhsil Kompleksi', 'Nizami', null, true),
  ('Bakı şəhəri 3 nömrəli xüsusi ümumtəhsil məktəbi', 'Nizami', 3, false),
  ('Bakı şəhəri 3 nömrəli internat tipli xüsusi ümumtəhsil məktəbi', 'Nizami', 3, false),
  ('Bakı şəhəri 70 nömrəli məktəb-lisey', 'Nizami', 70, false),
  ('Bakı şəhəri Müşfiq Orucov adına 213 nömrəli məktəb-lisey', 'Sabunçu', 213, false),
  ('Bakı şəhəri ''Ankara məktəbi'' məktəb-liseyi', 'Nərimanov', null, false),
  ('Baku Oxford School tam orta ümumtəhsil məktəbi MMC', 'Səbail', null, true),
  ('Bakı şəhəri 132-134 nömrəli Təhsil Kompleksi', 'Səbail', 132, false),
  ('Humanitar məktəb-lisey publik hüquqi şəxs', 'Xətai', null, false),
  ('LANDAU School', 'Nəsimi', null, true),
  ('Bakı şəhəri 103 nömrəli xüsusi əyani-qiyabi tam orta ümumtəhsil məktəbi', 'Xətai', 103, false),
  ('Anton Makarenko adına humanitar fənlər təmayüllü respublika gimnaziyası', 'Xəzər', null, false),
  ('Bakı şəhəri 20 nömrəli xüsusi axşam tam orta ümumtəhsil məktəbi', 'Xəzər', 20, false),
  ('Qərb Universiteti tam orta məktəb', 'Səbail', null, true),
  ('“Avropa Azərbaycan Məktəbi” Təhsil Kompleksi” MMC', 'Yasamal', null, true),
  ('Bakı şəhəri 287 nömrəli ''Zəkalar'' liseyi', 'Xətai', 287, false),
  ('Bakı Modern Təhsil Kompleksi', 'Nərimanov', null, true),
  ('Evrika liseyi', 'Nərimanov', null, true),
  ('Bakı şəhəri 11 nömrəli xüsusi ümumtəhsil məktəbi', 'Nərimanov', 11, false),
  ('Bakı şəhəri Rəfael Hüseynov adına 49 nömrəli ''İntellekt'' məktəb-liseyi', 'Səbail', 49, false),
  ('Bakı şəhəri 2 nömrəli internat tipli xüsusi ümumtəhsil məktəbi', 'Xəzər', 2, false),
  ('ADA Universiteti nəzdində ADA məktəbi', 'Nərimanov', null, false),
  ('Fizika, riyaziyyat və informatika təmayüllü respublika liseyi', 'Yasamal', null, false),
  ('Bakı şəhəri Tahir Hacıyev adına 252 nömrəli məktəb-lisey', 'Sabunçu', 252, false),
  ('Bakı şəhəri 264 nömrəli məktəb-lisey', 'Xətai', 264, false),
  ('Bakı şəhəri Faiq Rəfiyev adına 166 nömrəli məktəb-lisey', 'Qaradağ', 166, false),
  ('Bakı Dövlət Univeristetinin nəzdində ''Gənc istedadlar'' liseyi', 'Yasamal', null, false),
  ('SABİS SUN İnternational school', 'Xəzər', null, true),
  ('Bakı şəhəri İlham Məmmədov adına 261 nömrəli məktəb-lisey', 'Xətai', 261, false),
  ('Bakı şəhəri 2 nömrəli ümumi təyinatlı internat tipli ümumtəhsil məktəbi', 'Xəzər', 2, false),
  ('Dövlət Sərhəd Xidmətinin Xüsusi Məktəbi', 'Xəzər', null, false),
  ('Bakı şəhəri 246 nömrəli məktəb-lisey', 'Binəqədi', 246, false),
  ('Bakı Türk Anadolu liseyi', 'Nəsimi', null, false),
  ('Bakı şəhəri İlyas Əfəndiyev adına Elitar gimnaziya', 'Nəsimi', null, false),
  ('Respublika Olimpiya İdman liseyi', 'Sabunçu', null, false),
  ('XXI əsr Beynəlxalq Təhsil və İnnovasiya Mərkəzi MMC', 'Yasamal', null, true),
  ('Bakı Slavyan Universitetinin nəzdində məktəb-lisey kompleksi', 'Nəsimi', null, false),
  ('Bakı şəhəri 268 nömrəli xüsusi ümumtəhsil məktəbi', 'Nəsimi', 268, false),
  ('Bakı şəhəri 12 nömrəli internat tipli xüsusi ümumtəhsil məktəbi', 'Xəzər', 12, false),
  ('Hədəf Liseyi', 'Nəsimi', null, true),
  ('Bakı şəhəri 115 nömrəli xüsusi əyani-qiyabi tam orta ümumtəhsil məktəbi', 'Binəqədi', 115, false),
  ('Bakı şəhəri akademik Zərifə Əliyeva adına lisey', 'Yasamal', null, false),
  ('Bakı şəhəri Heydər Əliyev adına lisey', 'Xətai', null, false),
  ('Bakı şəhəri 11 nömrəli inteqrasiya təlimli internat tipli ümumtəhsil məktəbi', 'Sabunçu', 11, false),
  ('Kimya və biologiya təmayüllü respublika liseyi', 'Nizami', null, false),
  ('Bakı şəhəri texniki-humanitar lisey', 'Nəsimi', null, false),
  ('Bakı şəhəri Elmar Mirzəyev adına 6 nömrəli Respublika inteqrasiya təlimli internat tipli ümumtəhsil məktəbi', 'Xəzər', 6, false),
  ('Kaspi liseyi', 'Sabunçu', null, true),
  ('Bakı şəhəri 4 nömrəli internat tipli xüsusi ümumtəhsil məktəbi', 'Xəzər', 4, false),
  ('Bakı şəhəri 10 nömrəli internat tipli sanator ümumtəhsil məktəbi', 'Sabunçu', 10, false),
  ('''MİL'' Tam Orta Ümumtəhsil Məktəbi Məhdud Məsuliyyətli Cəmiyyəti', 'Nəsimi', null, true),
  ('Bakı şəhəri Süleyman Rüstəm adına xarici dillər təmayüllü gimnaziya', 'Xəzər', null, false),
  ('Bakı şəhəri Ərəstun Mahmudov adına 220 nömrəli məktəb-lisey', 'Nizami', 220, false),
  ('Nəsrəddin Tusi adına özəl ümumtəhsil  məktəbi', 'Yasamal', null, true),
  ('Bakı şəhəri 304 nömrəli tam orta ümumtəhsil məktəbi', 'Sabunçu', 304, false),
  ('Bakı şəhəri 8 nömrəli internat tipli sanator ümumtəhsil məktəbi', 'Xəzər', 8, false),
  ('The İnternational School of Azerbaijan', 'Yasamal', null, true);

-- Every rayon named on either side must resolve to one of Bakı's 12, before
-- anything is written.
do $$
declare v_bad text;
begin
  select string_agg(distinct r, ', ') into v_bad from (
    select rayon as r from _baku_rename
    union select rayon from _baku_insert
  ) t
  where not exists (
    select 1 from public.city_districts cd
    join public.districts d on d.id = cd.city_id
    where d.name = 'Bak' || chr(305) and cd.name = t.r
  );
  if v_bad is not null then
    raise exception '160: rayons not found under Bakı: %', v_bad;
  end if;
end;
$$;

-- 1) RENAME the matched rows to their official names AND fill their rayon,
--    keeping their ids. Keyed on the SEEDED name, which is identical in every
--    environment, rather than on an id, which is not. Skipped where the target
--    name already belongs to a different Bakı row.
update public.schools s
   set name             = r.new_name,
       school_number    = r.school_number,
       city_district_id = coalesce(s.city_district_id, cd.id),
       updated_at       = now()
from _baku_rename r
join public.districts d
  on d.country_code = 'AZ' and d.name = 'Bak' || chr(305)
join public.city_districts cd
  on cd.city_id = d.id and cd.name = r.rayon
where s.district_id = d.id
  and lower(s.name) = lower(r.old_name)
  and not exists (
    select 1 from public.schools x
    where x.district_id = s.district_id
      and lower(x.name) = lower(r.new_name)
      and x.id <> s.id
  );

-- 3) INSERT the genuinely new schools.
insert into public.schools (name, district_id, city_district_id, status,
                            is_private, school_number)
select t.name, d.id, cd.id, 'active', t.is_private, t.school_number
from _baku_insert t
join public.districts d on d.country_code = 'AZ' and d.name = 'Bak' || chr(305)
join public.city_districts cd on cd.city_id = d.id and cd.name = t.rayon
on conflict (district_id, lower(name)) do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_baku    int;
  v_norayon int;
  v_dupnum  text;
begin
  select count(*) into v_baku
  from public.schools s
  join public.districts d on d.id = s.district_id
  where d.name = 'Bak' || chr(305);

  -- 320 seeded + the genuinely new ones. Materially more than that means the
  -- rename half failed and the inserts duplicated instead.
  if v_baku > 460 then
    raise exception
      '160: Bakı has % schools — the rename half did not take and rows were '
      'duplicated instead', v_baku;
  end if;

  select count(*) into v_norayon
  from public.schools s
  join public.districts d on d.id = s.district_id
  where d.name = 'Bak' || chr(305) and s.city_district_id is null;

  -- A number appearing twice in the SAME series inside Bakı is the signature of
  -- a failed reconciliation. Reported, not raised: Bakı genuinely runs separate
  -- series, and this query cannot tell them apart the way the import key does.
  select string_agg(t.n::text, ', ' order by t.n) into v_dupnum
  from (
    select s.school_number as n, count(*) as c
    from public.schools s
    join public.districts d on d.id = s.district_id
    where d.name = 'Bak' || chr(305) and s.school_number is not null
    group by s.school_number having count(*) > 2
  ) t;
  if v_dupnum is not null then
    raise notice '160: school numbers appearing 3+ times in Bakı: %', v_dupnum;
  end if;

  raise notice
    '160: Bakı now has % schools, % still without a rayon', v_baku, v_norayon;
end;
$$;

commit;
