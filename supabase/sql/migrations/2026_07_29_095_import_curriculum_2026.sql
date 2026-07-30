-- =============================================================================
-- 2026_07_29_095_import_curriculum_2026.sql
-- =============================================================================
-- Migration: 2026_07_29_095_import_curriculum_2026.sql
-- Purpose: Import the 2026 national curriculum tree — 260 topics and 1077
--          subtopics across grades 1..11 — into public.topics / public.subtopics
--          with the correct school term (Rüb 1..4), replacing the tree that
--          migration 094 purged.
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/003_academic_taxonomy.sql (table
--          definitions — UNCHANGED by this file) and
--          supabase/sql/012_seed_initial_data.sql (the canonical seed file).
--          BACKPORT TARGET: 012. This migration is pure seed data and adds no
--          schema object, so the backport is "012 must be able to produce the
--          same tree from zero". The main session decides whether to inline the
--          1077 rows into 012 or to have 012 reference this file; either way a
--          from-zero rebuild must end with the same 260/1077 tree.
-- Backport status: pending
-- Destructive change: no — inserts only; existing rows are matched and updated
--          in place, never deleted.
-- Rollback notes: delete the rows this file created:
--            delete from public.subtopics s using public.topics t
--             where s.topic_id = t.id and t.scope = 'exam';
--            delete from public.topics where scope = 'exam';
--          Safe ONLY while no questions have been authored against them
--          (questions.topic_id / .subtopic_id are ON DELETE SET NULL, so a
--          later rollback would silently strip taxonomy off live questions).
--
-- -----------------------------------------------------------------------------
-- SOURCE OF THE DATA
-- -----------------------------------------------------------------------------
-- supabase/seed/curriculum_2026.json — 1077 rows extracted and verified by the
-- main session from
--   docs/investor/Kurikulum_movzu_alt_movzu_rub_bolgusu_1-11.docx
-- Row shape: { grade:int 1..11, subject:string(AZ name), term:int 1..4,
--              topic:string, subtopic:string }.
-- Verified properties of the source: 260 distinct (grade, subject, topic);
-- 1077 distinct (grade, subject, topic, subtopic); every topic maps to exactly
-- ONE term (0 topics span two terms); no apostrophe or backslash in any name.
--
-- -----------------------------------------------------------------------------
-- HOW THE DATA TRAVELS INTO SQL — and why
-- -----------------------------------------------------------------------------
-- A generated `INSERT ... VALUES` block into a TEMPORARY staging table.
-- Rejected alternatives and the reason:
--   * a jsonb literal — one 178 KB unbreakable line; a reviewer cannot diff it,
--     a typo cannot be located, and every column has to be re-cast out of text;
--   * \copy / COPY FROM a file — needs a file that travels with the SQL, so the
--     migration stops being self-contained and cannot run in the Supabase SQL
--     editor;
--   * direct INSERT into topics/subtopics — the tree is relational (subtopics
--     need their parent's id) so the flat source has to be staged and grouped
--     somewhere regardless; staging makes the grouping, the assertions and the
--     rerun-matching all readable SQL.
-- The staging table is `ON COMMIT DROP`, so the file leaves nothing behind.
-- Each VALUES row carries an explicit `seq` = its 1-based position in the JSON
-- (the curriculum's own teaching order); order_index is derived from it with
-- window functions rather than relying on VALUES row order, which SQL does not
-- guarantee.
--
-- -----------------------------------------------------------------------------
-- SUBJECT MAPPING (decided by the main session)
-- -----------------------------------------------------------------------------
-- The source document names the science strand differently per grade. The
-- mapping below uses ONLY subjects that already exist in public.subjects, so it
-- creates no new sellable product and is reversible:
--     Riyaziyyat    -> 'math'
--     İnformatika   -> 'informatics'
--     İngilis dili  -> 'english'
--     Məntiq        -> 'az_language'   (the row's NAME is already "Məntiq")
--     Fizika        -> 'fizika'
--     Həyat bilgisi -> 'elm'
--     Təbiət        -> 'elm'
--     Biologiya     -> 'elm'
--     Kimya         -> 'elm'
-- Four document subjects collapse into 'elm'. That was checked against the
-- source before authoring: after the mapping there are still exactly 260
-- distinct (grade, subject_code, topic) keys, zero topic-name collisions
-- between the collapsed subjects, and no topic acquires a second term. The
-- mapping is applied in the VALUES block itself (subject_code, not the document
-- name) so the target is explicit on every single row and a reviewer can grep
-- it.
--
-- The mapping is enforced, never assumed: step I2 raises if any subject_code or
-- grade level in the staged data is missing from the database. Nothing is
-- skipped silently.
--
-- -----------------------------------------------------------------------------
-- WHAT IS SET ON EACH ROW
-- -----------------------------------------------------------------------------
--   topics.scope       = 'exam'  — the general test bank / Exams surfaces, which
--                        is what the daily-round engine draws from. 'olympiad'
--                        scope is created ONLY by olympiad package bulk uploads
--                        and must never be produced here.
--   topics.status      = 'active'
--   topics.term        = the curriculum's Rüb. draw_daily_questions() filters
--                        `q.term <= current_academic_term()`, and
--                        question_term_guard() forces every bank question's
--                        term to equal its topic's term — so this column is what
--                        makes the cumulative daily pool work.
--   topics.order_index = 0-based teaching order within (grade, subject).
--   subtopics.term     = copied from the parent topic. trg_subtopic_term_guard
--                        would inherit it from a NULL, but it is set explicitly
--                        so the guard VALIDATES the value instead of supplying
--                        it — a mismatch becomes a loud failure.
--   subtopics.order_index = 0-based order within the topic.
--
-- TRANSLATIONS: none required. public.topics and public.subtopics carry a single
-- `name` column and there is no topics_translations / subtopics_translations
-- table in the schema (verified against the live catalog). Topic names are the
-- ministry's Azerbaijani curriculum wording and are stored as authored. Content
-- translation tables exist only for question bodies
-- (question_translations / answer_option_translations / question_explanations),
-- which this migration does not touch.
--
-- -----------------------------------------------------------------------------
-- RERUN SAFETY
-- -----------------------------------------------------------------------------
-- There is no unique constraint on topics (subject_id, grade_id, name), so this
-- file cannot lean on ON CONFLICT and does NOT add one (that would be a schema
-- change needing its own backport). Instead:
--   * topics are matched on (subject_id, grade_id, name) restricted to
--     scope = 'exam' — an identically named 'olympiad' topic is never touched;
--   * subtopics are matched on (topic_id, name);
--   * missing rows are inserted, existing rows have term / order_index / status
--     brought back in line;
--   * step I4 refuses to continue if the match key is ambiguous (duplicate exam
--     topics or duplicate subtopic names under one topic), because a silent
--     fan-out would double the tree.
-- A second run therefore inserts 0 rows and still passes every assertion.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- I1. Stage the source rows.
-- -----------------------------------------------------------------------------
-- Temp tables live for the SESSION, not the statement: drop first so pasting
-- this file twice into one psql/SQL-editor session cannot fail on "relation
-- already exists". ON COMMIT DROP still clears them on a normal run.
drop table if exists _curriculum_2026;
drop table if exists _curriculum_2026_topics;
drop table if exists _curriculum_2026_subtopics;

create temporary table _curriculum_2026 (
  seq           integer  not null,
  grade_level   smallint not null,
  subject_code  text     not null,
  term          smallint not null,
  topic_name    text     not null,
  subtopic_name text     not null
) on commit drop;

insert into _curriculum_2026
  (seq, grade_level, subject_code, term, topic_name, subtopic_name)
values
  (1, 1, 'math', 1, 'Ədədlər və hesab əməlləri', '“Say” və “ədəd” anlayışları'),
  (2, 1, 'math', 1, 'Ədədlər və hesab əməlləri', '100 dairəsində sayma'),
  (3, 1, 'math', 1, 'Ədədlər və hesab əməlləri', '100 dairəsində ədədlərin oxunması və yazılması'),
  (4, 1, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədəd oxu'),
  (5, 1, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədlərin müqayisəsi və sıralanması'),
  (6, 1, 'math', 1, 'Ədədlər və hesab əməlləri', 'Toplama və çıxma əməlləri'),
  (7, 1, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', '20 dairəsində toplama və çıxma'),
  (8, 1, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə məsələlərin həlli'),
  (9, 1, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə ədədi ifadələr'),
  (10, 1, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Bərabərsizlik və tənlik haqqında ilkin təsəvvür'),
  (11, 1, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Müəyyən əlamətlərə görə dəyişikliklər'),
  (12, 1, 'math', 3, 'Həndəsə və ölçmə', 'Əşyanın yeri və hərəkət istiqaməti'),
  (13, 1, 'math', 3, 'Həndəsə və ölçmə', 'Əşyaların qruplaşdırılması'),
  (14, 1, 'math', 3, 'Həndəsə və ölçmə', 'Müstəvi fiqurlar'),
  (15, 1, 'math', 3, 'Həndəsə və ölçmə', 'Fəza fiqurları'),
  (16, 1, 'math', 3, 'Həndəsə və ölçmə', 'Uzunluq'),
  (17, 1, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Kütlə'),
  (18, 1, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Tutum'),
  (19, 1, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Zaman'),
  (20, 1, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Pul və alış-veriş'),
  (21, 1, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Məlumatların toplanması, təsviri və təhlili'),
  (22, 1, 'elm', 1, 'Canlılar və insan', 'İnsan orqanizmində əsas orqanların yeri, quruluşu və funksiyaları'),
  (23, 1, 'elm', 1, 'Canlılar və insan', 'Cansız və canlı varlıqlar'),
  (24, 1, 'elm', 1, 'Canlılar və insan', 'Hərəkət'),
  (25, 1, 'elm', 1, 'Canlılar və insan', 'Böyümə'),
  (26, 1, 'elm', 1, 'Canlılar və insan', 'Çoxalma'),
  (27, 1, 'elm', 1, 'Canlılar və insan', 'Tənəffüs'),
  (28, 1, 'elm', 2, 'Maddələr və materiallar', 'Qidalanma'),
  (29, 1, 'elm', 2, 'Maddələr və materiallar', 'İnsan və heyvanların yaşaması üçün zəruri ehtiyaclar'),
  (30, 1, 'elm', 2, 'Maddələr və materiallar', 'Bitkilərin yaşaması üçün zəruri ehtiyaclar'),
  (31, 1, 'elm', 2, 'Maddələr və materiallar', 'Materiallar'),
  (32, 1, 'elm', 2, 'Maddələr və materiallar', 'Kağız, parça, taxta, plastik, metal və şüşə'),
  (33, 1, 'elm', 2, 'Maddələr və materiallar', 'Materialların xassələri'),
  (34, 1, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Bərk, yumşaq, su keçirən, su keçirməyən, parlaq, ağır və yüngül materiallar'),
  (35, 1, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Dartma və itələmə'),
  (36, 1, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Cisimlərin hərəkəti'),
  (37, 1, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Səsin yaranması və yayılması'),
  (38, 1, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Hava şəraiti və fəsillər'),
  (39, 1, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Gigiyena qaydaları'),
  (40, 1, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Sağlam qidalanma'),
  (41, 1, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Fiziki aktivlik'),
  (42, 1, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Məişət və gündəlik fəaliyyət zamanı təhlükəsizlik'),
  (43, 1, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Fövqəladə hadisələr zamanı təhlükəsizlik'),
  (44, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Məlumat, xəbər və informasiya'),
  (45, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın vizual, səs, qoxu, dad və taktil növləri'),
  (46, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın saxlanması və ötürülməsi'),
  (47, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüter və digər elektron cihazlar'),
  (48, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Sistem bloku'),
  (49, 1, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Monitor'),
  (50, 1, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Klaviatura'),
  (51, 1, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Siçan'),
  (52, 1, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter otağında davranış və texniki təhlükəsizlik'),
  (53, 1, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Düzgün oturuş və müntəzəm fasilə'),
  (54, 1, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'İş masası və onun elementləri'),
  (55, 1, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Proqram və proqram simgəsi'),
  (56, 1, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Qrafik redaktor'),
  (57, 1, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Sadə şəkillər və həndəsi fiqurlar'),
  (58, 1, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Mətn redaktoru'),
  (59, 1, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Hərflərin və sözlərin yazılması'),
  (60, 1, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Hadisələr və hərəkətlər ardıcıllığı'),
  (61, 1, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Addım-addım göstərişlər'),
  (62, 1, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İcraçı və icraçının komandaları'),
  (63, 1, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', '“İrəli”, “geri”, “sağa” və “sola” komandaları'),
  (64, 1, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Şəbəkə və internet'),
  (65, 1, 'english', 1, 'Dinləyib-anlama', 'Sadə müraciətlərin başa düşülməsi'),
  (66, 1, 'english', 1, 'Dinləyib-anlama', 'Adı eşidilən əşyaların şəkillərdə seçilməsi'),
  (67, 1, 'english', 1, 'Dinləyib-anlama', 'Əşyaların əlamətlərinə görə fərqləndirilməsi'),
  (68, 1, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Səs və səs birləşmələrinin təkrarı'),
  (69, 1, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Sadə sözlərin tələffüzü'),
  (70, 1, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Söz birləşmələri və sadə cümlələrin tələffüzü'),
  (71, 1, 'english', 3, 'Oxu və mətnlə iş', 'Şəkildəki əşyaların və ətrafdakıların adlandırılması'),
  (72, 1, 'english', 3, 'Oxu və mətnlə iş', 'Əşyaların həcminin və rənginin ifadə edilməsi'),
  (73, 1, 'english', 4, 'Yazı və dil qaydaları', 'Əşyaların sadə sözlərlə təsviri'),
  (74, 1, 'english', 4, 'Yazı və dil qaydaları', 'Sadə nitq etiketlərindən istifadə'),
  (75, 1, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Əşyaların əlamətlərinə görə qruplaşdırılması'),
  (76, 1, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Oxşar və fərqli əlamətlər'),
  (77, 1, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Əşyanın yerinin müəyyən edilməsi'),
  (78, 1, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Hərəkət istiqamətləri'),
  (79, 1, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Ədədi və şəkilli ardıcıllıqlar'),
  (80, 1, 'az_language', 3, 'Alqoritmik düşüncə', 'Hadisələrin ardıcıllığı'),
  (81, 1, 'az_language', 3, 'Alqoritmik düşüncə', 'Addım-addım göstərişlər'),
  (82, 1, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Sadə icraçı komandaları'),
  (83, 1, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Müəyyən əlamətlərə görə dəyişikliklərin müəyyən edilməsi'),
  (84, 2, 'math', 1, 'Ədədlər və hesab əməlləri', '100 dairəsində ədədlər'),
  (85, 2, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədlərin oxunması, yazılması və sıralanması'),
  (86, 2, 'math', 1, 'Ədədlər və hesab əməlləri', '100 dairəsində toplama və çıxma'),
  (87, 2, 'math', 1, 'Ədədlər və hesab əməlləri', 'Vurma əməlinin mənası'),
  (88, 2, 'math', 1, 'Ədədlər və hesab əməlləri', 'Bölmə əməlinin mənası'),
  (89, 2, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Vurma və bölmənin modelləşdirilməsi'),
  (90, 2, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Hesab əməllərinin məsələlərdə tətbiqi'),
  (91, 2, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Ədədi ifadələr'),
  (92, 2, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Ədədi ifadələrin müqayisəsi'),
  (93, 2, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Tənlik haqqında ilkin təsəvvür'),
  (94, 2, 'math', 3, 'Həndəsə və ölçmə', 'Kəmiyyətlər arasındakı əlaqə'),
  (95, 2, 'math', 3, 'Həndəsə və ölçmə', 'Müstəvi fiqurlar'),
  (96, 2, 'math', 3, 'Həndəsə və ölçmə', 'Fəza fiqurları'),
  (97, 2, 'math', 3, 'Həndəsə və ölçmə', 'Uzunluq'),
  (98, 2, 'math', 3, 'Həndəsə və ölçmə', 'Kütlə'),
  (99, 2, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Tutum'),
  (100, 2, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Vaxt və keçən zaman'),
  (101, 2, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Pul və alış-veriş'),
  (102, 2, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Məlumatların toplanması, təsviri və təhlili'),
  (103, 2, 'elm', 1, 'Canlılar və insan', 'Canlılarda əsas orqanların yeri və quruluşu'),
  (104, 2, 'elm', 1, 'Canlılar və insan', 'Hüceyrə, toxuma, orqan və orqanlar sistemi haqqında ilkin təsəvvür'),
  (105, 2, 'elm', 1, 'Canlılar və insan', 'Heyvanların bədən hissələri'),
  (106, 2, 'elm', 1, 'Canlılar və insan', 'Heyvanların xarici bədən örtükləri'),
  (107, 2, 'elm', 1, 'Canlılar və insan', 'Heyvanların çoxalması və böyüməsi'),
  (108, 2, 'elm', 2, 'Maddələr və materiallar', 'Bitkilərin əsas hissələri'),
  (109, 2, 'elm', 2, 'Maddələr və materiallar', 'Materialların xassələri və istifadə sahələri'),
  (110, 2, 'elm', 2, 'Maddələr və materiallar', 'Enerjinin müxtəlif növləri'),
  (111, 2, 'elm', 2, 'Maddələr və materiallar', 'Enerji çevrilmələri'),
  (112, 2, 'elm', 2, 'Maddələr və materiallar', 'İşığın yaranması və yayılması'),
  (113, 2, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Canlıların ətraf mühitlə qarşılıqlı əlaqəsi'),
  (114, 2, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Ekosistem haqqında ilkin təsəvvür'),
  (115, 2, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Günəş sistemi'),
  (116, 2, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Planetlərin Günəşə nəzərən mövqeyi'),
  (117, 2, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Gigiyena'),
  (118, 2, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Sağlam qidalanma'),
  (119, 2, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Fiziki aktivlik'),
  (120, 2, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Elektrik cihazlarından təhlükəsiz istifadə'),
  (121, 2, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Fövqəladə hadisələr zamanı təhlükəsizlik'),
  (122, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Mətn, cədvəl, şəkil və diaqram'),
  (123, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın saxlanması, ötürülməsi və emalı'),
  (124, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Rebus, şəkil və şərti işarələr'),
  (125, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kodlaşdırılmış informasiyanın oxunması'),
  (126, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Masaüstü kompüter'),
  (127, 2, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Dizüstü kompüter'),
  (128, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Planşet və smartfon'),
  (129, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüterin işə salınması və söndürülməsi'),
  (130, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Fayl və qovluq'),
  (131, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Proqram pəncərəsi və onun elementləri'),
  (132, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Qrafik redaktorda şəkillərin hazırlanması'),
  (133, 2, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Mətnin sadə formatlaşdırılması'),
  (134, 2, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Şrift, şriftin ölçüsü və rəngi'),
  (135, 2, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Obyektin sözlə təqdim edilməsi'),
  (136, 2, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Oxşar və fərqli əlamətlər'),
  (137, 2, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Hərəkətlər və göstərişlər ardıcıllığı'),
  (138, 2, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Alqoritm'),
  (139, 2, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Xətti alqoritm'),
  (140, 2, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Budaqlanan alqoritm'),
  (141, 2, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqramdakı yanlışlıqların müəyyən edilməsi'),
  (142, 2, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İnformasiya texnologiyalarının tətbiq sahələri'),
  (143, 2, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Verilənlərin ehtiyat üzünün yaradılması'),
  (144, 2, 'english', 1, 'Dinləyib-anlama', 'Müraciətlərin başa düşülməsi'),
  (145, 2, 'english', 1, 'Dinləyib-anlama', 'Əşya və hadisələrin şəkillərdə seçilməsi'),
  (146, 2, 'english', 1, 'Dinləyib-anlama', 'Əşya və hadisələrin əlamətlərinə görə fərqləndirilməsi'),
  (147, 2, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Söz və söz birləşmələrinin tələffüzü'),
  (148, 2, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Sadə cümlələrin tələffüzü'),
  (149, 2, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Ailə və məktəblə bağlı sözlər'),
  (150, 2, 'english', 3, 'Oxu və mətnlə iş', 'Əşyaların forma və kəmiyyətinin ifadə edilməsi'),
  (151, 2, 'english', 3, 'Oxu və mətnlə iş', 'Əşya və hadisələrin təsviri'),
  (152, 2, 'english', 4, 'Yazı və dil qaydaları', 'Sadə nitq etiketləri'),
  (153, 2, 'english', 4, 'Yazı və dil qaydaları', 'Hərf elementlərinin düzgün yazılması'),
  (154, 2, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Əşyaların oxşar və fərqli əlamətlərə görə müqayisəsi'),
  (155, 2, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Obyektlərin təsnif edilməsi'),
  (156, 2, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Şəkil və işarələrin mənasının müəyyən edilməsi'),
  (157, 2, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Ardıcıllıqların qurulması'),
  (158, 2, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məqsədə çatmaq üçün göstərişlər ardıcıllığı'),
  (159, 2, 'az_language', 3, 'Alqoritmik düşüncə', 'Xətti alqoritm'),
  (160, 2, 'az_language', 3, 'Alqoritmik düşüncə', 'Budaqlanan alqoritm'),
  (161, 2, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Müxtəlif həll yollarının müqayisəsi'),
  (162, 2, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Alqoritmdə yanlışlığın müəyyən edilməsi və düzəldilməsi'),
  (163, 3, 'math', 1, 'Ədədlər və hesab əməlləri', '10 000 dairəsində ədədlər'),
  (164, 3, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədlərin oxunması, yazılması və sıralanması'),
  (165, 3, 'math', 1, 'Ədədlər və hesab əməlləri', '1 000 dairəsində hesab əməlləri'),
  (166, 3, 'math', 1, 'Ədədlər və hesab əməlləri', 'Hesab əməllərinin xassələri'),
  (167, 3, 'math', 1, 'Ədədlər və hesab əməlləri', 'Hesab əməlləri arasındakı əlaqə'),
  (168, 3, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kəsr anlayışı'),
  (169, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Kəsrlərin modelləşdirilməsi və müqayisəsi'),
  (170, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Riyazi ifadə'),
  (171, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Tənlik'),
  (172, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə tənliklərin həlli'),
  (173, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə funksional asılılıqlar'),
  (174, 3, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Düz xətlərin qarşılıqlı vəziyyəti'),
  (175, 3, 'math', 3, 'Həndəsə və ölçmə', 'Müstəvi fiqurların təsnifatı'),
  (176, 3, 'math', 3, 'Həndəsə və ölçmə', 'Simmetriya'),
  (177, 3, 'math', 3, 'Həndəsə və ölçmə', 'Sürüşmə'),
  (178, 3, 'math', 3, 'Həndəsə və ölçmə', 'Fəza fiqurları'),
  (179, 3, 'math', 3, 'Həndəsə və ölçmə', 'Perimetr'),
  (180, 3, 'math', 3, 'Həndəsə və ölçmə', 'Sahə'),
  (181, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Uzunluq, kütlə və tutum'),
  (182, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Zaman'),
  (183, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Qiymət, miqdar və məbləğ'),
  (184, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Büdcə, gəlir, xərc və qazanc'),
  (185, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Məlumatların toplanması, təsviri və təhlili'),
  (186, 3, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', '“Ola bilməz”, “ola bilər”, “mütləq” və “yəqin ki” hadisələri'),
  (187, 3, 'elm', 1, 'Canlılar və insan', 'Canlılara xas həyati proseslər'),
  (188, 3, 'elm', 1, 'Canlılar və insan', 'Tənəffüs'),
  (189, 3, 'elm', 1, 'Canlılar və insan', 'Qidalanma'),
  (190, 3, 'elm', 1, 'Canlılar və insan', 'Hərəkət'),
  (191, 3, 'elm', 1, 'Canlılar və insan', 'Böyümə və çoxalma'),
  (192, 3, 'elm', 1, 'Canlılar və insan', 'Ürəyin əsas funksiyası'),
  (193, 3, 'elm', 2, 'Maddələr və materiallar', 'Ağciyərin əsas funksiyası'),
  (194, 3, 'elm', 2, 'Maddələr və materiallar', 'Mədənin əsas funksiyası'),
  (195, 3, 'elm', 2, 'Maddələr və materiallar', 'Beynin əsas funksiyası'),
  (196, 3, 'elm', 2, 'Maddələr və materiallar', 'Sümük və əzələlərin əsas funksiyaları'),
  (197, 3, 'elm', 2, 'Maddələr və materiallar', 'Fosillər'),
  (198, 3, 'elm', 2, 'Maddələr və materiallar', 'Materialların xassələri'),
  (199, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Materialların istifadə sahələri'),
  (200, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Enerjinin müxtəlif növləri'),
  (201, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Enerji çevrilmələri'),
  (202, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'İşığın yayılması'),
  (203, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Günəş, Yer və Ay'),
  (204, 3, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Günəş sistemindəki cisimlərin hərəkəti'),
  (205, 3, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Gecə və gündüz'),
  (206, 3, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Sağlam qidalanma'),
  (207, 3, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Şəxsi gigiyena'),
  (208, 3, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Dişlərin qorunması'),
  (209, 3, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Məişət və fövqəladə hadisələr zamanı təhlükəsizlik'),
  (210, 3, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiya mənbəyi və informasiya qəbuledicisi'),
  (211, 3, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın ötürülmə üsulları'),
  (212, 3, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kütləvi informasiya vasitələri'),
  (213, 3, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kod, kodlaşdırma və dekodlaşdırma'),
  (214, 3, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüterin giriş qurğuları'),
  (215, 3, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüterin çıxış qurğuları'),
  (216, 3, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Fayl və qovluqlar üzərində əməliyyatlar'),
  (217, 3, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Baş menyu, proqram menyusu və kontekst menyusu'),
  (218, 3, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Qrafik redaktorda mürəkkəb şəkillər'),
  (219, 3, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Mətn sənədinin yaradılması və redaktəsi'),
  (220, 3, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Səs redaktoru və səs faylı'),
  (221, 3, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Obyektin qrafik formada təqdim edilməsi'),
  (222, 3, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Təkrarlardan istifadə edilən alqoritmlər'),
  (223, 3, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Parçalanma — dekompozisiya'),
  (224, 3, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Məntiqi məsələlərin həll alqoritmi'),
  (225, 3, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İnternet və brauzer'),
  (226, 3, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Sayt və elektron poçt'),
  (227, 3, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İstifadəçi adı və parol'),
  (228, 3, 'english', 1, 'Dinləyib-anlama', 'Tapşırıq xarakterli müraciətlərin başa düşülməsi'),
  (229, 3, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətn üzrə sadə tapşırıqlar'),
  (230, 3, 'english', 1, 'Dinləyib-anlama', 'Nitq etiketlərinin fərqləndirilməsi'),
  (231, 3, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Kiçikhəcmli nitq nümunələrinin tələffüzü'),
  (232, 3, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Cümlələrin düzgün intonasiya ilə tələffüzü'),
  (233, 3, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mənzil və yaşayış yeri ilə bağlı sözlər'),
  (234, 3, 'english', 3, 'Oxu və mətnlə iş', 'Əşyaların keyfiyyəti, görünüşü və məkanı'),
  (235, 3, 'english', 3, 'Oxu və mətnlə iş', 'Şəkil və situasiyaların təsviri'),
  (236, 3, 'english', 3, 'Oxu və mətnlə iş', 'Hərf, hərf birləşməsi və sözlərin oxunması'),
  (237, 3, 'english', 4, 'Yazı və dil qaydaları', 'Kiçikhəcmli mətnlərin oxunması'),
  (238, 3, 'english', 4, 'Yazı və dil qaydaları', 'Hərf, söz və sadə cümlələrin yazılması'),
  (239, 3, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Məlumatların sıralanması və qruplaşdırılması'),
  (240, 3, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Kəsrlərin modelləşdirilməsi və müqayisəsi'),
  (241, 3, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Sadə funksional asılılıqlar'),
  (242, 3, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Simmetriya və sürüşmə'),
  (243, 3, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Mümkün və mümkün olmayan hadisələr'),
  (244, 3, 'az_language', 3, 'Alqoritmik düşüncə', 'Təkrarlanan ardıcıllıqlar'),
  (245, 3, 'az_language', 3, 'Alqoritmik düşüncə', 'Məsələnin daha sadə hissələrə bölünməsi'),
  (246, 3, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Məntiqi məsələnin həll alqoritmi'),
  (247, 3, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Verilən məlumatdan nəticə çıxarılması'),
  (248, 4, 'math', 1, 'Ədədlər və hesab əməlləri', '1 000 000 dairəsində ədədlər'),
  (249, 4, 'math', 1, 'Ədədlər və hesab əməlləri', 'Mərtəbə və sinif'),
  (250, 4, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədlərin sıralanması və yuvarlaqlaşdırılması'),
  (251, 4, 'math', 1, 'Ədədlər və hesab əməlləri', 'Hesab əməllərinin xassələri'),
  (252, 4, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kəsrlərin müqayisəsi, toplanması və çıxılması'),
  (253, 4, 'math', 1, 'Ədədlər və hesab əməlləri', 'Onluq kəsr'),
  (254, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Onluq kəsrlərin müqayisəsi'),
  (255, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Onluq kəsrlərin toplanması və çıxılması'),
  (256, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Riyazi ifadələr'),
  (257, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Ədədi ifadələrin müqayisəsi'),
  (258, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə tənliklər'),
  (259, 4, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə funksional asılılıqlar'),
  (260, 4, 'math', 3, 'Həndəsə və ölçmə', 'Nöqtə, düz xətt və şüa'),
  (261, 4, 'math', 3, 'Həndəsə və ölçmə', 'Bucaq və çevrə'),
  (262, 4, 'math', 3, 'Həndəsə və ölçmə', 'Koordinat şəbəkəsi'),
  (263, 4, 'math', 3, 'Həndəsə və ölçmə', 'Fiqurların çevrilməsi'),
  (264, 4, 'math', 3, 'Həndəsə və ölçmə', 'Fəza fiqurları'),
  (265, 4, 'math', 3, 'Həndəsə və ölçmə', 'Ölçü vahidləri arasında çevirmələr'),
  (266, 4, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Perimetr və sahə düsturları'),
  (267, 4, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Həcm'),
  (268, 4, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Kuboidin həcmi'),
  (269, 4, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Vaxt və müddət'),
  (270, 4, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Məlumatların toplanması, təsviri və təhlili'),
  (271, 4, 'elm', 1, 'Canlılar və insan', 'Heyvanların inkişaf dövrü'),
  (272, 4, 'elm', 1, 'Canlılar və insan', 'Toyuğun inkişaf dövrü'),
  (273, 4, 'elm', 1, 'Canlılar və insan', 'Kəpənəyin inkişaf dövrü'),
  (274, 4, 'elm', 1, 'Canlılar və insan', 'Canlıların böyüməsi və çoxalması'),
  (275, 4, 'elm', 1, 'Canlılar və insan', 'Valideynlərdən yeni nəslə keçən əlamətlər'),
  (276, 4, 'elm', 1, 'Canlılar və insan', 'Çiçəkli və çiçəksiz bitkilər'),
  (277, 4, 'elm', 2, 'Maddələr və materiallar', 'Çiçəyin əsas hissələri'),
  (278, 4, 'elm', 2, 'Maddələr və materiallar', 'Erkəkcik, dişicik, ləçək və kasa yarpağı'),
  (279, 4, 'elm', 2, 'Maddələr və materiallar', 'Çiçəyin hissələrinin funksiyaları'),
  (280, 4, 'elm', 2, 'Maddələr və materiallar', 'Çiçəkli bitkinin həyat dövrü'),
  (281, 4, 'elm', 2, 'Maddələr və materiallar', 'Toxum, cücərti və cavan bitki'),
  (282, 4, 'elm', 2, 'Maddələr və materiallar', 'Toxumların cücərməsi'),
  (283, 4, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Tozlanma'),
  (284, 4, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Meyvə və toxumun yaranması'),
  (285, 4, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Maddənin halları'),
  (286, 4, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Bərk, maye və qaz'),
  (287, 4, 'elm', 3, 'Qüvvə, enerji, Yer və kosmos', 'Ərimə, donma, buxarlanma və kondensasiya'),
  (288, 4, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Maddələrin kütləsi və həcmi'),
  (289, 4, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Dartma və itələmə'),
  (290, 4, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Toxunma ilə və toxunma olmadan təsir'),
  (291, 4, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Gigiyena və sağlamlığın qorunması'),
  (292, 4, 'elm', 4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Təhlükəsizlik qaydaları'),
  (293, 4, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın müxtəlif formalarda təqdim edilməsi'),
  (294, 4, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kağız, maqnit və optik informasiya daşıyıcıları'),
  (295, 4, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Bulud saxlama vasitələri'),
  (296, 4, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlərin cədvəl və diaqramla təqdim edilməsi'),
  (297, 4, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüter qurğuları'),
  (298, 4, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Fayl və qovluqların idarə edilməsi'),
  (299, 4, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Təqdimat proqramı'),
  (300, 4, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Elektron cədvəl proqramı'),
  (301, 4, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Mətn, qrafika və təqdimat materialları'),
  (302, 4, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Formallaşdırma və modelləşdirmə'),
  (303, 4, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Alqoritmlərin söz, işarə və blok-sxemlə təqdim edilməsi'),
  (304, 4, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Xətti və budaqlanan alqoritmlər'),
  (305, 4, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Proqramlaşdırma mühitində icraçı'),
  (306, 4, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Elektron poçt'),
  (307, 4, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Şəxsi məlumatlar'),
  (308, 4, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Ziyanverici proqramlar'),
  (309, 4, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Spam və internet fırıldaqçılığı'),
  (310, 4, 'english', 1, 'Dinləyib-anlama', 'Kiçikhəcmli sadə mətnlərin dinlənilməsi'),
  (311, 4, 'english', 1, 'Dinləyib-anlama', 'Sinifdaxili müraciətlərin başa düşülməsi'),
  (312, 4, 'english', 1, 'Dinləyib-anlama', 'Mətn üzrə sualların tərtib edilməsi'),
  (313, 4, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətndə yeni sözlərin müəyyən edilməsi'),
  (314, 4, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Cümlələrin və nitq etiketlərinin düzgün tələffüzü'),
  (315, 4, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Zaman və məkan anlayışları'),
  (316, 4, 'english', 3, 'Oxu və mətnlə iş', 'Əşya, hadisə və situasiyaların təsviri'),
  (317, 4, 'english', 3, 'Oxu və mətnlə iş', 'Əşya və hadisələrə münasibət bildirilməsi'),
  (318, 4, 'english', 3, 'Oxu və mətnlə iş', 'Sualvermə bacarığı'),
  (319, 4, 'english', 4, 'Yazı və dil qaydaları', 'Kiçikhəcmli mətnlərin düzgün və sürətli oxunması'),
  (320, 4, 'english', 4, 'Yazı və dil qaydaları', 'Sadə cümlələrin yazılması'),
  (321, 4, 'english', 4, 'Yazı və dil qaydaları', 'Kiçikhəcmli mətnlərin yazılması'),
  (322, 4, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Ədədi və həndəsi qanunauyğunluqlar'),
  (323, 4, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Sadə funksional asılılıqlar'),
  (324, 4, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Koordinat şəbəkəsi'),
  (325, 4, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Simmetriya, sürüşmə və digər çevrilmələr'),
  (326, 4, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Cədvəl və diaqramların təhlili'),
  (327, 4, 'az_language', 3, 'Alqoritmik düşüncə', 'Alqoritmin söz və işarələrlə təqdim edilməsi'),
  (328, 4, 'az_language', 3, 'Alqoritmik düşüncə', 'Xətti və budaqlanan alqoritmlər'),
  (329, 4, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Şəxsi məlumatla açıq məlumatın fərqləndirilməsi'),
  (330, 4, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'İnternet məlumatlarına tənqidi yanaşma'),
  (331, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Trilyon dairəsində natural ədədlər'),
  (332, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədlərin mərtəbə qiyməti'),
  (333, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Natural ədədlərin sıralanması və yuvarlaqlaşdırılması'),
  (334, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Natural ədədlər üzərində hesab əməlləri'),
  (335, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Adi kəsrlər'),
  (336, 5, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kəsrlərin müqayisəsi'),
  (337, 5, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Kəsrlər üzərində əməllər'),
  (338, 5, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Onluq kəsrlər'),
  (339, 5, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Onluq kəsrlər üzərində əməllər'),
  (340, 5, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Faiz'),
  (341, 5, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Riyazi ifadələr'),
  (342, 5, 'math', 3, 'Həndəsə və ölçmə', 'Dəyişənin verilmiş qiymətində ifadənin qiyməti'),
  (343, 5, 'math', 3, 'Həndəsə və ölçmə', 'Sadə bərabərsizliklər'),
  (344, 5, 'math', 3, 'Həndəsə və ölçmə', 'Sadə tənliklər'),
  (345, 5, 'math', 3, 'Həndəsə və ölçmə', 'Funksional asılılıqlar'),
  (346, 5, 'math', 3, 'Həndəsə və ölçmə', 'Bucaqların təsnifatı'),
  (347, 5, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Bucağın tənböləni'),
  (348, 5, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Həndəsi qurmalar'),
  (349, 5, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Müstəvi fiqurların sahəsi'),
  (350, 5, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəza fiqurlarının səthinin sahəsi və həcmi'),
  (351, 5, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Məlumatların toplanması, təsviri və təhlili'),
  (352, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'İnsan orqanizminin təşkilolunma səviyyələri'),
  (353, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'Hüceyrə, toxuma, orqan, orqanlar sistemi və orqanizm'),
  (354, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'Orqanlar sistemlərinin quruluş və funksiyaları'),
  (355, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'Canlıların ümumi xüsusiyyətləri'),
  (356, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'Onurğalı və onurğasız heyvanlar'),
  (357, 5, 'elm', 1, 'Canlılar və həyat prosesləri', 'Buğumayaqlılar, hörümçəkkimilər və molyusklar'),
  (358, 5, 'elm', 2, 'Maddələr və onların xassələri', 'Çiçəkli və çiçəksiz bitkilər'),
  (359, 5, 'elm', 2, 'Maddələr və onların xassələri', 'Maddənin üç halı'),
  (360, 5, 'elm', 2, 'Maddələr və onların xassələri', 'Zərrəcik modeli'),
  (361, 5, 'elm', 2, 'Maddələr və onların xassələri', 'Bərk, maye və qazların xarakterik xassələri'),
  (362, 5, 'elm', 2, 'Maddələr və onların xassələri', 'Hal çevrilmələri'),
  (363, 5, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Fiziki və kimyəvi hadisələr'),
  (364, 5, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Saf maddələr və qarışıqlar'),
  (365, 5, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Qarışıqların ayrılması'),
  (366, 5, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Enerji növləri və enerji mənbələri'),
  (367, 5, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Enerji çevrilmələri'),
  (368, 5, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Canlıların ətraf mühitlə qarşılıqlı əlaqəsi'),
  (369, 5, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Təbii fəlakətlər'),
  (370, 5, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'İnsan fəaliyyətinin ətraf mühitə təsiri'),
  (371, 5, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ətraf mühitin qorunması'),
  (372, 5, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Təbii ehtiyatlardan səmərəli istifadə'),
  (373, 5, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın xassələri'),
  (374, 5, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Tamlıq, aktuallıq, anlaşıqlılıq, obyektivlik və etibarlılıq'),
  (375, 5, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın toplanması və emalı'),
  (376, 5, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlər yığını'),
  (377, 5, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüter qurğuları və onların təyinatı'),
  (378, 5, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Sistem proqram təminatı'),
  (379, 5, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Tətbiqi proqram təminatı'),
  (380, 5, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Mətn, qrafika və multimedia'),
  (381, 5, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Elektron cədvəllər'),
  (382, 5, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Formallaşdırma və modelləşdirmə'),
  (383, 5, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Alqoritmlərin təqdimetmə üsulları'),
  (384, 5, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Sadə proqramlaşdırma'),
  (385, 5, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Veb-sayt və sayt konstruktoru'),
  (386, 5, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İnternet bağlantısı'),
  (387, 5, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Elektron poçt və qoşma fayl'),
  (388, 5, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Biometrik təhlükəsizlik'),
  (389, 5, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Şəxsi məlumatların mühafizəsi'),
  (390, 5, 'english', 1, 'Dinləyib-anlama', 'Sadə sualların cavablandırılması'),
  (391, 5, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətndə yeni söz və ifadələrin seçilməsi'),
  (392, 5, 'english', 1, 'Dinləyib-anlama', 'Yeni söz və ifadələrdən istifadə'),
  (393, 5, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Kiçikhəcmli dialoqlar'),
  (394, 5, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Kiçikhəcmli mətnlərin danışılması'),
  (395, 5, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Söz və ifadələrin seçilməsi və qruplaşdırılması'),
  (396, 5, 'english', 3, 'Oxu və mətnlə iş', 'Mətnin bütöv hissələrinin fərqləndirilməsi'),
  (397, 5, 'english', 3, 'Oxu və mətnlə iş', 'Mətn üzrə sualların cavablandırılması'),
  (398, 5, 'english', 3, 'Oxu və mətnlə iş', 'Sözlərin məna və qrammatik cəhətdən əlaqələndirilməsi'),
  (399, 5, 'english', 4, 'Yazı və dil qaydaları', 'Sadə cümlələrin qurulması'),
  (400, 5, 'english', 4, 'Yazı və dil qaydaları', 'Böyük və kiçik hərflərin yazılışı'),
  (401, 5, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Natural ədədlər üzrə qanunauyğunluqlar'),
  (402, 5, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Kəsr və onluq kəsrlərin müqayisəsi'),
  (403, 5, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Faiz məsələləri'),
  (404, 5, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Dəyişənli ifadələr'),
  (405, 5, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Sadə tənlik və bərabərsizliklər'),
  (406, 5, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Funksional asılılıqlar'),
  (407, 5, 'az_language', 3, 'Alqoritmik düşüncə', 'Bucaqların təsnifatı'),
  (408, 5, 'az_language', 3, 'Alqoritmik düşüncə', 'Məlumatların qruplaşdırılması və təhlili'),
  (409, 5, 'az_language', 3, 'Alqoritmik düşüncə', 'Formallaşdırma və modelləşdirmə'),
  (410, 5, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Məsələnin alqoritm şəklində təqdim edilməsi'),
  (411, 5, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'İnformasiya mənbəyinin etibarlılığının qiymətləndirilməsi'),
  (412, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Sadə və mürəkkəb ədədlər'),
  (413, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Natural ədədin sadə vuruqlara ayrılması'),
  (414, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ən böyük ortaq bölən'),
  (415, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ən kiçik ortaq bölünən'),
  (416, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Tam ədədlər'),
  (417, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Tam ədədlər üzərində əməllər'),
  (418, 6, 'math', 1, 'Ədədlər və hesab əməlləri', 'Nisbət'),
  (419, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Tənasüb'),
  (420, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Düz mütənasiblik'),
  (421, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Tərs mütənasiblik'),
  (422, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Faiz'),
  (423, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Riyazi ifadələr'),
  (424, 6, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə tənliklər və bərabərsizliklər'),
  (425, 6, 'math', 3, 'Həndəsə və ölçmə', 'Çoxluq anlayışı'),
  (426, 6, 'math', 3, 'Həndəsə və ölçmə', 'Çoxluqlar arasındakı münasibətlər'),
  (427, 6, 'math', 3, 'Həndəsə və ölçmə', 'Bucaqlar'),
  (428, 6, 'math', 3, 'Həndəsə və ölçmə', 'Üçbucaqlar'),
  (429, 6, 'math', 3, 'Həndəsə və ölçmə', 'Üçbucaqların konqruyentliyi'),
  (430, 6, 'math', 3, 'Həndəsə və ölçmə', 'Həndəsi qurmalar'),
  (431, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Perimetr və sahə'),
  (432, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Dekart koordinat sistemi'),
  (433, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Simmetriya və sürüşmə'),
  (434, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəza fiqurlarının səthinin sahəsi və həcmi'),
  (435, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Statistik məlumatlar'),
  (436, 6, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Elementar hadisənin ehtimalı'),
  (437, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Canlılarda əsas orqanların quruluş və funksiyaları'),
  (438, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Tənəffüs sistemi'),
  (439, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Qan dövranı sistemi'),
  (440, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Ağciyərlərdə qazlar mübadiləsi'),
  (441, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Yoluxucu xəstəliklər'),
  (442, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Xəstəliklərin ötürülməsi və qarşısının alınması'),
  (443, 6, 'elm', 1, 'Canlılar və həyat prosesləri', 'Bakteriyalar'),
  (444, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Viruslar'),
  (445, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Göbələklər'),
  (446, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Maddələrin fiziki xüsusiyyətləri'),
  (447, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Saf maddələr və qarışıqlar'),
  (448, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Cismə təsir edən qüvvə'),
  (449, 6, 'elm', 2, 'Maddələr və onların xassələri', 'Qüvvənin cismin hərəkətinə təsiri'),
  (450, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'İstilik enerjisi'),
  (451, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'İstilik enerjisinin ötürülməsi'),
  (452, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Elektrik dövrəsi'),
  (453, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Sadə dövrə elementləri'),
  (454, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Elektrik dövrəsində enerji çevrilmələri'),
  (455, 6, 'elm', 3, 'Enerji, qüvvə və Yer sistemləri', 'Səsin yaranması və yayılması'),
  (456, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ekosistemlər'),
  (457, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Canlılar və ətraf mühit arasındakı əlaqə'),
  (458, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'İnsan fəaliyyətinin ətraf mühitə təsiri'),
  (459, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Süxur və torpaqlar'),
  (460, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Hava şəraitinin süxur və torpağa təsiri'),
  (461, 6, 'elm', 4, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Günəş sistemindəki cisimlərin hərəkəti'),
  (462, 6, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Mətnin kodlaşdırılması'),
  (463, 6, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'ASCII və Unicode'),
  (464, 6, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İkilik say sistemi'),
  (465, 6, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlər yığını'),
  (466, 6, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüter yaddaşı və informasiya daşıyıcıları'),
  (467, 6, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter şəbəkələri'),
  (468, 6, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Əməliyyat sistemi'),
  (469, 6, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Antivirus proqramları'),
  (470, 6, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Elektron cədvəllər'),
  (471, 6, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Formallaşdırma və modelləşdirmə'),
  (472, 6, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Şərt və mürəkkəb şərt'),
  (473, 6, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Budaqlanma'),
  (474, 6, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Dövr'),
  (475, 6, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Prosedur və funksiya'),
  (476, 6, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Veb-saytın strukturu'),
  (477, 6, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İnformasiya təhlükəsizliyi'),
  (478, 6, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Parol və giriş məlumatlarının qorunması'),
  (479, 6, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətndə yeni informasiyanın müəyyən edilməsi'),
  (480, 6, 'english', 1, 'Dinləyib-anlama', 'Söz və ifadələrin leksik-semantik mənası'),
  (481, 6, 'english', 1, 'Dinləyib-anlama', 'Yeni sözlərin mövzuya uyğun işlədilməsi'),
  (482, 6, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müxtəlif mövzulu dialoqlar'),
  (483, 6, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mövzu üzrə fikirlərin ifadə edilməsi'),
  (484, 6, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətnin giriş, əsas hissə və nəticəyə ayrılması'),
  (485, 6, 'english', 3, 'Oxu və mətnlə iş', 'Mətn üzrə sualların hazırlanması'),
  (486, 6, 'english', 3, 'Oxu və mətnlə iş', 'Kiçikhəcmli mətnlərin yazılması'),
  (487, 6, 'english', 3, 'Oxu və mətnlə iş', 'Orfoqrafiya qaydaları'),
  (488, 6, 'english', 4, 'Yazı və dil qaydaları', 'Məktub'),
  (489, 6, 'english', 4, 'Yazı və dil qaydaları', 'Elan'),
  (490, 6, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Sadə və mürəkkəb ədədlərin fərqləndirilməsi'),
  (491, 6, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Ədədin sadə vuruqlara ayrılması'),
  (492, 6, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Nisbət və tənasüb'),
  (493, 6, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Düz və tərs mütənasiblik'),
  (494, 6, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Çoxluqlar və onlar arasındakı münasibətlər'),
  (495, 6, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Koordinat sistemi'),
  (496, 6, 'az_language', 3, 'Alqoritmik düşüncə', 'Elementar hadisənin ehtimalı'),
  (497, 6, 'az_language', 3, 'Alqoritmik düşüncə', 'İkilik say sistemi'),
  (498, 6, 'az_language', 3, 'Alqoritmik düşüncə', 'Şərt və mürəkkəb şərt'),
  (499, 6, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Budaqlanan və dövrü alqoritmlər'),
  (500, 6, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Prosedur və funksiya'),
  (501, 6, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Verilənlərin məntiqi qruplaşdırılması'),
  (502, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Rasional ədədlər'),
  (503, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Rasional ədədlərin müqayisəsi və sıralanması'),
  (504, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Rasional ədədlər üzərində əməllər'),
  (505, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Çoxhədlilər'),
  (506, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Çoxhədlilərin toplanması, çıxılması və vurulması'),
  (507, 7, 'math', 1, 'Ədədlər və hesab əməlləri', 'Xətti tənlik'),
  (508, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Xətti tənliklər sistemi'),
  (509, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Sadə bərabərsizlik'),
  (510, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Xətti funksiya'),
  (511, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Düz xətlə çevrənin qarşılıqlı vəziyyəti'),
  (512, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'İki çevrənin qarşılıqlı vəziyyəti'),
  (513, 7, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Çevrədə bucaqlar'),
  (514, 7, 'math', 3, 'Həndəsə və ölçmə', 'Qövsün uzunluğu'),
  (515, 7, 'math', 3, 'Həndəsə və ölçmə', 'Dairə sektorunun sahəsi'),
  (516, 7, 'math', 3, 'Həndəsə və ölçmə', 'Dördbucaqlı və üçbucaqların xassələri'),
  (517, 7, 'math', 3, 'Həndəsə və ölçmə', 'Düz xəttin tənliyi'),
  (518, 7, 'math', 3, 'Həndəsə və ölçmə', 'Hərəkətə dair məsələlər'),
  (519, 7, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Həndəsi qurmalar'),
  (520, 7, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəza fiqurlarının səthinin sahəsi və həcmi'),
  (521, 7, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Statistik məlumatlar'),
  (522, 7, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Nəzəri və eksperimental ehtimal'),
  (523, 7, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Tamamlayıcı hadisələr'),
  (524, 7, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Fiziki kəmiyyətlər'),
  (525, 7, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Əsas və törəmə vahidlər'),
  (526, 7, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Beynəlxalq Vahidlər Sistemi'),
  (527, 7, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Kütlə, uzunluq, zaman, həcm, sürət və sıxlıq'),
  (528, 7, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Ölçü cihazları və şkala'),
  (529, 7, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Ölçmədə dəqiqlik və xəta'),
  (530, 7, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Skalyar və vektorial kəmiyyətlər'),
  (531, 7, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Mexaniki hərəkət'),
  (532, 7, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Yol, yerdəyişmə və sürət'),
  (533, 7, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Orta sürət'),
  (534, 7, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektrostatik sahə'),
  (535, 7, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektrik yükü'),
  (536, 7, 'fizika', 3, 'İstilik, dalğalar və optika', 'Sabit elektrik cərəyanı'),
  (537, 7, 'fizika', 3, 'İstilik, dalğalar və optika', 'Maqnit hadisələri'),
  (538, 7, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Mexaniki dalğalar'),
  (539, 7, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Atom modeli'),
  (540, 7, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Elektrik keçiriciliyi'),
  (541, 7, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Radioaktiv çevrilmələr və nüvə reaksiyaları'),
  (542, 7, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Kimyəvi elementlər'),
  (543, 7, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Elementlərin işarəsi və adı'),
  (544, 7, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Bioelementlər'),
  (545, 7, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Metallar və qeyri-metallar'),
  (546, 7, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Allotropiya və allotropik şəkildəyişmələr'),
  (547, 7, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Saf maddə'),
  (548, 7, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Kimyəvi birləşmə'),
  (549, 7, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Qarışıq'),
  (550, 7, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Atom və molekul'),
  (551, 7, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Homogen və heterogen qarışıqlar'),
  (552, 7, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Emulsiya və suspenziya'),
  (553, 7, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Həllolma'),
  (554, 7, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Doymuş və doymamış məhlullar'),
  (555, 7, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Qarışıqların ayrılma üsulları'),
  (556, 7, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Distillə, buxarlandırma, xromatoqrafiya, süzmə və maqnitlə ayırma'),
  (557, 7, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Kimyəvi reaksiyaların əlamətləri'),
  (558, 7, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Ekzotermik və endotermik reaksiyalar'),
  (559, 7, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Turşular və qələvilər'),
  (560, 7, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Atomun quruluşu'),
  (561, 7, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'İonların əmələ gəlməsi'),
  (562, 7, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Canlı orqanizmlərin ümumi xüsusiyyətləri'),
  (563, 7, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Hüceyrənin quruluşu'),
  (564, 7, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Hüceyrə strukturlarının funksiyaları'),
  (565, 7, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Mikroskop'),
  (566, 7, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Hüceyrə, toxuma, orqan və orqanlar sistemi'),
  (567, 7, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Çoxhüceyrəli orqanizmlərin təşkil səviyyələri'),
  (568, 7, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Çiçəkli bitkilərin əsas orqanları'),
  (569, 7, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Kök, gövdə, yarpaq, çiçək, meyvə və toxum'),
  (570, 7, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Kök və kök sistemləri'),
  (571, 7, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Yarpağın morfoloji xüsusiyyətləri'),
  (572, 7, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Gövdənin morfoloji xüsusiyyətləri'),
  (573, 7, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Onurğalı və onurğasız heyvanlar'),
  (574, 7, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Bitkilərin həyat dövrü və böyüməsi'),
  (575, 7, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Çiçəyin quruluşu'),
  (576, 7, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ekosistemlər'),
  (577, 7, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Qida zənciri və canlıların qarşılıqlı əlaqəsi'),
  (578, 7, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Canlıların müxtəlifliyi'),
  (579, 7, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Sağlam həyat tərzi'),
  (580, 7, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Rastr və vektor qrafikası'),
  (581, 7, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Rəng modelləri'),
  (582, 7, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Onaltılıq say sistemi'),
  (583, 7, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Cədvəl informasiya modelləri'),
  (584, 7, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter qurğuları və multimedia qurğuları'),
  (585, 7, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Əməliyyat sistemi'),
  (586, 7, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Elektron cədvəllərdə riyazi funksiyalar'),
  (587, 7, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Verilənlər bazası'),
  (588, 7, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Verilənlər bazasında cədvəl, sahə və yazı'),
  (589, 7, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Mülahizə və məntiqi ifadə'),
  (590, 7, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Alqoritmlərin qurulması'),
  (591, 7, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqramlaşdırmada dəyişənlər və şərtlər'),
  (592, 7, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Şəbəkə və internet təhlükəsizliyi'),
  (593, 7, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Müəlliflik hüququ və rəqəmsal davranış'),
  (594, 7, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətndə əsas fikrin müəyyən edilməsi'),
  (595, 7, 'english', 1, 'Dinləyib-anlama', 'Müraciətlərə uyğun tapşırıqların icrası'),
  (596, 7, 'english', 1, 'Dinləyib-anlama', 'Nitq modelləri'),
  (597, 7, 'english', 1, 'Dinləyib-anlama', 'Dialoqlarda nitq etiketləri'),
  (598, 7, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Fikrin müxtəlif formalarda ifadə edilməsi'),
  (599, 7, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Sözlərin morfoloji xüsusiyyətlərinə görə qruplaşdırılması'),
  (600, 7, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətnin ton, temp, ritm və fasilə ilə oxunması'),
  (601, 7, 'english', 3, 'Oxu və mətnlə iş', 'Mətn hissələri arasındakı məntiqi ardıcıllıq'),
  (602, 7, 'english', 3, 'Oxu və mətnlə iş', 'Mətnin əsas fikri'),
  (603, 7, 'english', 3, 'Oxu və mətnlə iş', 'Mövzu üzrə yazılı fikir'),
  (604, 7, 'english', 4, 'Yazı və dil qaydaları', 'Əşya və hadisələrin təsviri'),
  (605, 7, 'english', 4, 'Yazı və dil qaydaları', 'Afişa'),
  (606, 7, 'english', 4, 'Yazı və dil qaydaları', 'Dəvətnamə'),
  (607, 7, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Rasional ədədlərlə mühakimə'),
  (608, 7, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Xətti tənlik və tənliklər sistemi'),
  (609, 7, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Xətti funksiya və qrafik'),
  (610, 7, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Mülahizə və doğruluq qiyməti'),
  (611, 7, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məntiqi ifadələr'),
  (612, 7, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məlumatların cədvəl modeli'),
  (613, 7, 'az_language', 3, 'Alqoritmik düşüncə', 'Hadisənin nəzəri və eksperimental ehtimalı'),
  (614, 7, 'az_language', 3, 'Alqoritmik düşüncə', 'Tamamlayıcı hadisələr'),
  (615, 7, 'az_language', 3, 'Alqoritmik düşüncə', 'Məsələnin altməsələlərə bölünməsi'),
  (616, 7, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Verilmiş şərtlər əsasında nəticə çıxarılması'),
  (617, 7, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Alqoritmin düzgünlüyünün yoxlanılması'),
  (618, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kvadrat kök'),
  (619, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'İrrasional ədədlər'),
  (620, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'Həqiqi ədədlər'),
  (621, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'Tam üstlü qüvvət'),
  (622, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'Hesabi kvadrat kök'),
  (623, 8, 'math', 1, 'Ədədlər və hesab əməlləri', 'Rasional ifadələr'),
  (624, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Rasional ifadələr üzərində əməllər'),
  (625, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Kvadrat tənlik'),
  (626, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Rasional tənlik'),
  (627, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Bərabərsizliklər'),
  (628, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Funksiya və funksional asılılıq'),
  (629, 8, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Düzbucaqlı üçbucaq'),
  (630, 8, 'math', 3, 'Həndəsə və ölçmə', 'Pifaqor teoremi'),
  (631, 8, 'math', 3, 'Həndəsə və ölçmə', 'Müstəvi fiqurların sahəsi'),
  (632, 8, 'math', 3, 'Həndəsə və ölçmə', 'Oxşar fiqurlar və üçbucaqların oxşarlığı'),
  (633, 8, 'math', 3, 'Həndəsə və ölçmə', 'Kəsən və vətərin xassələri'),
  (634, 8, 'math', 3, 'Həndəsə və ölçmə', 'Dairə seqmentinin sahəsi'),
  (635, 8, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Triqonometrik nisbətlər'),
  (636, 8, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Koordinat həndəsəsi'),
  (637, 8, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəza fiqurlarının səthinin sahəsi və həcmi'),
  (638, 8, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Statistik məlumatlar'),
  (639, 8, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Asılı olmayan hadisələrin ehtimalı'),
  (640, 8, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Qüvvə və əvəzləyici qüvvə'),
  (641, 8, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Nyuton qanunları'),
  (642, 8, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Ağırlıq qüvvəsi'),
  (643, 8, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Elastiklik qüvvəsi'),
  (644, 8, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Sürtünmə qüvvəsi'),
  (645, 8, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Mexaniki iş'),
  (646, 8, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Mexaniki enerji'),
  (647, 8, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Güc'),
  (648, 8, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Təzyiq'),
  (649, 8, 'fizika', 3, 'İstilik, dalğalar və optika', 'Maye və qazlarda təzyiq'),
  (650, 8, 'fizika', 3, 'İstilik, dalğalar və optika', 'Molekulyar kinetik nəzəriyyə'),
  (651, 8, 'fizika', 3, 'İstilik, dalğalar və optika', 'Maddənin zərrəcik quruluşu'),
  (652, 8, 'fizika', 3, 'İstilik, dalğalar və optika', 'Daxili enerji'),
  (653, 8, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'İstilikvermə'),
  (654, 8, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'İstilikkeçirmə, konveksiya və şüalanma'),
  (655, 8, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Enerjinin saxlanması qanunu'),
  (656, 8, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Mexaniki dalğalar'),
  (657, 8, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Kimyəvi reaksiyaların təsnifatı'),
  (658, 8, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Reaksiya tənliklərinin əmsallaşdırılması'),
  (659, 8, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Kimyəvi reaksiyaların sürəti'),
  (660, 8, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Reaksiya sürətinə təsir edən amillər'),
  (661, 8, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Turşular'),
  (662, 8, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Əsaslar'),
  (663, 8, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Oksidlər'),
  (664, 8, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Duzlar'),
  (665, 8, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Neytrallaşma reaksiyası'),
  (666, 8, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Atomun quruluşu'),
  (667, 8, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'İonların əmələ gəlməsi'),
  (668, 8, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Kimyəvi rabitə'),
  (669, 8, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'İon və kovalent rabitə'),
  (670, 8, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Maddələrin quruluşu və xassələri'),
  (671, 8, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Bioloji molekullar'),
  (672, 8, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Karbohidratlar'),
  (673, 8, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Lipidlər'),
  (674, 8, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Zülallar'),
  (675, 8, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Nuklein turşuları'),
  (676, 8, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Maddələrin daşınma mexanizmi'),
  (677, 8, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Qida maddələri və qidalanma'),
  (678, 8, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Həzm sistemi'),
  (679, 8, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Qazlar mübadiləsi'),
  (680, 8, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Tənəffüs'),
  (681, 8, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Bitkilərdə maddələrin daşınması'),
  (682, 8, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'İnsanda və heyvanlarda qan dövranı'),
  (683, 8, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Ürək və qan damarları'),
  (684, 8, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Heyvanların həyat dövrü və böyüməsi'),
  (685, 8, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'İnsanın çoxalması və inkişafı'),
  (686, 8, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Xəstəliklər və immunitet'),
  (687, 8, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Həyat tərzi və xroniki xəstəliklər'),
  (688, 8, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Səs və videonun kodlaşdırılması'),
  (689, 8, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Say sistemləri'),
  (690, 8, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlər bazası və verilənlər bazası cədvəlləri'),
  (691, 8, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Elektron cədvəllərdə məntiqi funksiyalar'),
  (692, 8, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Virtual reallıq'),
  (693, 8, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Artırılmış reallıq'),
  (694, 8, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kriptoqrafiyanın əsasları'),
  (695, 8, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Mülahizə'),
  (696, 8, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'VƏ, VƏYA və DEYİL məntiqi əməlləri'),
  (697, 8, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Doğruluq cədvəlləri'),
  (698, 8, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Ağac informasiya modelləri'),
  (699, 8, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Alqoritmlərdə şərt və dövr'),
  (700, 8, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqramlaşdırmada siyahılar və verilənlər'),
  (701, 8, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'İnformasiya təhlükəsizliyi'),
  (702, 8, 'english', 1, 'Dinləyib-anlama', 'Müraciətlərə uyğun tapşırıqların ardıcıl icrası'),
  (703, 8, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətnin hissələrə ayrılması'),
  (704, 8, 'english', 1, 'Dinləyib-anlama', 'Fikrin müxtəlif cümlə konstruksiyaları ilə ifadəsi'),
  (705, 8, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müzakirələrdə iştirak'),
  (706, 8, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Fikirlərin məntiqi ardıcıllıqla ifadəsi'),
  (707, 8, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Söz və ifadələrin qrammatik-semantik xüsusiyyətləri'),
  (708, 8, 'english', 3, 'Oxu və mətnlə iş', 'Cümlələrin məqsəd və intonasiyaya görə oxunması'),
  (709, 8, 'english', 3, 'Oxu və mətnlə iş', 'Mətn planının hazırlanması'),
  (710, 8, 'english', 3, 'Oxu və mətnlə iş', 'Əsas fakt və hadisələrin seçilməsi və qruplaşdırılması'),
  (711, 8, 'english', 4, 'Yazı və dil qaydaları', 'Məlumat xarakterli mətn'),
  (712, 8, 'english', 4, 'Yazı və dil qaydaları', 'Anket formalarının doldurulması'),
  (713, 8, 'english', 4, 'Yazı və dil qaydaları', 'Durğu işarələri'),
  (714, 8, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Həqiqi ədədlərin təsnifatı'),
  (715, 8, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Kvadrat tənlik və bərabərsizliklər'),
  (716, 8, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Funksional asılılıq'),
  (717, 8, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Səbəb və nəticə əlaqələri'),
  (718, 8, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məntiqi mülahizələr'),
  (719, 8, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'VƏ, VƏYA və DEYİL əməlləri'),
  (720, 8, 'az_language', 3, 'Alqoritmik düşüncə', 'Doğruluq cədvəlləri'),
  (721, 8, 'az_language', 3, 'Alqoritmik düşüncə', 'Ağac modelləri'),
  (722, 8, 'az_language', 3, 'Alqoritmik düşüncə', 'Asılı və asılı olmayan hadisələr'),
  (723, 8, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Mümkün variantların sistemli müəyyən edilməsi'),
  (724, 8, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Şərtli və dövrü alqoritmlər'),
  (725, 9, 'math', 1, 'Ədədlər və hesab əməlləri', 'Həqiqi ədədlər çoxluğunda əməllər'),
  (726, 9, 'math', 1, 'Ədədlər və hesab əməlləri', 'n-ci dərəcədən kök'),
  (727, 9, 'math', 1, 'Ədədlər və hesab əməlləri', 'Rasional üstlü qüvvət'),
  (728, 9, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ardıcıllıq'),
  (729, 9, 'math', 1, 'Ədədlər və hesab əməlləri', 'Ədədi silsilə'),
  (730, 9, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Həndəsi silsilə'),
  (731, 9, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Tənliklərin qurulması və həlli'),
  (732, 9, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Kvadrat bərabərsizliklər'),
  (733, 9, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Rasional bərabərsizliklər'),
  (734, 9, 'math', 3, 'Həndəsə və ölçmə', 'Funksiyanın qrafiki'),
  (735, 9, 'math', 3, 'Həndəsə və ölçmə', 'Çoxbucaqlılar'),
  (736, 9, 'math', 3, 'Həndəsə və ölçmə', 'Çevrənin tənliyi'),
  (737, 9, 'math', 3, 'Həndəsə və ölçmə', 'Müstəvidə vektorlar'),
  (738, 9, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəza fiqurlarının səthinin sahəsi və həcmi'),
  (739, 9, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Statistik məlumatlar'),
  (740, 9, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Şərti ehtimal'),
  (741, 9, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Asılı hadisələrin ehtimalı'),
  (742, 9, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Fiziki kəmiyyətlər və onların ölçülməsi'),
  (743, 9, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Ölçmələr və hesablamalar'),
  (744, 9, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Eksperimentin planlaşdırılması və icrası'),
  (745, 9, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Elektrik dövrəsi'),
  (746, 9, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Elektrik müqaviməti'),
  (747, 9, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Dövrə elementlərinin müqaviməti'),
  (748, 9, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektrik və maqnit sahələrinin qarşılıqlı təsiri'),
  (749, 9, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektromaqnit hadisələri'),
  (750, 9, 'fizika', 3, 'İstilik, dalğalar və optika', 'İşığın yayılması'),
  (751, 9, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'İşığın əks olunması'),
  (752, 9, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'İşığın sınması'),
  (753, 9, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Linzalar və optik hadisələr'),
  (754, 9, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Metallar'),
  (755, 9, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Qeyri-metallar'),
  (756, 9, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Metalların və qeyri-metalların xassələri'),
  (757, 9, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Üzvi birləşmələrin quruluşu'),
  (758, 9, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Üzvi birləşmələrin xassələri və tətbiqi'),
  (759, 9, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Mol anlayışı'),
  (760, 9, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Molyar kütlə'),
  (761, 9, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Maddə miqdarı'),
  (762, 9, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Kimyəvi reaksiyalarda maddə miqdarının hesablanması'),
  (763, 9, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Reaksiyaya daxil olan və alınan maddələrin miqdarı'),
  (764, 9, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Fotosintez'),
  (765, 9, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Tənəffüs'),
  (766, 9, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'İnsan və heyvanlarda ifrazat'),
  (767, 9, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Böyrəklərin fəaliyyəti'),
  (768, 9, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Sümük sistemi'),
  (769, 9, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Əzələ sistemi'),
  (770, 9, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Nəzarət və tənzimləmə'),
  (771, 9, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Sinir və hormonal tənzimləmə'),
  (772, 9, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'DNT və irsiyyət'),
  (773, 9, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Hüceyrə bölünməsi'),
  (774, 9, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Mitoz və meyoz'),
  (775, 9, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'İnsan fəaliyyətinin ətraf mühitə təsiri'),
  (776, 9, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Modifikasiya dəyişkənliyi'),
  (777, 9, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Təbii seçmə'),
  (778, 9, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Həyat tərzi və xroniki xəstəliklər'),
  (779, 9, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın həcmi'),
  (780, 9, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın ötürülmə sürəti'),
  (781, 9, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlər bazasında axtarış'),
  (782, 9, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Verilənlərin çeşidlənməsi və süzgəcdən keçirilməsi'),
  (783, 9, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüter komponentləri'),
  (784, 9, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter şəbəkəsi və şəbəkə protokolları'),
  (785, 9, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Qraf informasiya modeli'),
  (786, 9, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Qonşuluq siyahısı və qonşuluq matrisi'),
  (787, 9, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Ən qısa yol alqoritmləri'),
  (788, 9, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Deykstra alqoritmi'),
  (789, 9, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'A* alqoritmi'),
  (790, 9, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Süni intellekt'),
  (791, 9, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Ekspert sistemləri'),
  (792, 9, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Bulanıq məntiq'),
  (793, 9, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Maşın öyrənməsi'),
  (794, 9, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Veb-səhifələrin CSS vasitəsilə tərtibatı'),
  (795, 9, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Veb-saytın etibarlılığının qiymətləndirilməsi'),
  (796, 9, 'english', 1, 'Dinləyib-anlama', 'Müraciətdə ifadə olunan fikrə münasibət'),
  (797, 9, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətnin şərhi'),
  (798, 9, 'english', 1, 'Dinləyib-anlama', 'Fikrin müxtəlif nitq vahidləri ilə ifadəsi'),
  (799, 9, 'english', 1, 'Dinləyib-anlama', 'Təbiət, cəmiyyət, ailə və məktəb mövzularında müzakirə'),
  (800, 9, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müqayisə aparmaqla fikrin izahı'),
  (801, 9, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Söz və ifadələrin qrammatik-semantik xüsusiyyətləri'),
  (802, 9, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətnin məntiqi ardıcıllıqla danışılması'),
  (803, 9, 'english', 3, 'Oxu və mətnlə iş', 'Oxunan mətnə münasibət'),
  (804, 9, 'english', 3, 'Oxu və mətnlə iş', 'İnşa'),
  (805, 9, 'english', 3, 'Oxu və mətnlə iş', 'Esse'),
  (806, 9, 'english', 4, 'Yazı və dil qaydaları', 'Hekayə'),
  (807, 9, 'english', 4, 'Yazı və dil qaydaları', 'Ərizə'),
  (808, 9, 'english', 4, 'Yazı və dil qaydaları', 'Tərcümeyi-hal'),
  (809, 9, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Ardıcıllıqlar və silsilələr'),
  (810, 9, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Funksiyanın qrafiki'),
  (811, 9, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Zəruri və kafi şərtlər'),
  (812, 9, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Şərti ehtimal'),
  (813, 9, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Asılı hadisələr'),
  (814, 9, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Qraf və şəbəkə modelləri'),
  (815, 9, 'az_language', 3, 'Alqoritmik düşüncə', 'Ən qısa yol məsələləri'),
  (816, 9, 'az_language', 3, 'Alqoritmik düşüncə', 'Optimal həll'),
  (817, 9, 'az_language', 3, 'Alqoritmik düşüncə', 'Süni intellektdə mülahizə'),
  (818, 9, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Bulanıq məntiq'),
  (819, 9, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Məlumat mənbələrinin etibarlılığının müqayisəsi'),
  (820, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Çoxluqlar üzərində əməllər'),
  (821, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Toplama və vurma prinsipləri'),
  (822, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Birləşmələr'),
  (823, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Permutasiya'),
  (824, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Yerləşmə'),
  (825, 10, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kombinasiya'),
  (826, 10, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Həqiqi üstlü qüvvət'),
  (827, 10, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Loqarifm'),
  (828, 10, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Ədədi arqumentin triqonometrik funksiyaları'),
  (829, 10, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Triqonometrik eyniliklər'),
  (830, 10, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Triqonometrik çevirmə və toplama düsturları'),
  (831, 10, 'math', 3, 'Həndəsə və ölçmə', 'Funksiya və funksiyanın xassələri'),
  (832, 10, 'math', 3, 'Həndəsə və ölçmə', 'Triqonometrik funksiyaların qrafikləri'),
  (833, 10, 'math', 3, 'Həndəsə və ölçmə', 'Üstlü funksiya'),
  (834, 10, 'math', 3, 'Həndəsə və ölçmə', 'Loqarifmik funksiya'),
  (835, 10, 'math', 3, 'Həndəsə və ölçmə', 'Tənlik və bərabərsizliklər'),
  (836, 10, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəzada nöqtə, düz xətt və müstəvi'),
  (837, 10, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Çoxüzlülər'),
  (838, 10, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Çoxüzlülərin səthinin sahəsi və həcmi'),
  (839, 10, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Statistik məlumatlar'),
  (840, 10, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Ehtimala aid məsələlər'),
  (841, 10, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Kinematika'),
  (842, 10, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Düzxətli bərabərsürətli və dəyişənsürətli hərəkət'),
  (843, 10, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Hərəkət tənlikləri'),
  (844, 10, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Dinamika'),
  (845, 10, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Nyuton qanunları'),
  (846, 10, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'İmpuls'),
  (847, 10, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'İmpulsun saxlanması qanunu'),
  (848, 10, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Mexaniki iş, enerji və güc'),
  (849, 10, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Mexaniki enerjinin saxlanması'),
  (850, 10, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Təzyiq'),
  (851, 10, 'fizika', 3, 'İstilik, dalğalar və optika', 'Qaz tənlikləri və qaz qanunları'),
  (852, 10, 'fizika', 3, 'İstilik, dalğalar və optika', 'İdeal qaz'),
  (853, 10, 'fizika', 3, 'İstilik, dalğalar və optika', 'Termodinamikanın birinci qanunu'),
  (854, 10, 'fizika', 3, 'İstilik, dalğalar və optika', 'Termodinamikanın ikinci qanunu'),
  (855, 10, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Mexaniki rəqslər'),
  (856, 10, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Superpozisiya prinsipi'),
  (857, 10, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Atom və nüvə modeli'),
  (858, 10, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Radioaktiv çevrilmələr və nüvə reaksiyaları'),
  (859, 10, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Keçid metalları'),
  (860, 10, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Elektron konfiqurasiya'),
  (861, 10, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Keçid metallarının xassələri'),
  (862, 10, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Molekulların quruluşu'),
  (863, 10, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Molekuldaxili rabitələr'),
  (864, 10, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Molekullararası qarşılıqlı təsir qüvvələri'),
  (865, 10, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Qaz zərrəciklərinin hərəkəti'),
  (866, 10, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Qazlara aid hesablamalar'),
  (867, 10, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Məhlullar'),
  (868, 10, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Məhlulun qatılığı'),
  (869, 10, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Məhlullara aid hesablamalar'),
  (870, 10, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Reaksiyanın sürəti'),
  (871, 10, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Reaksiya sürətinə təsir edən amillər'),
  (872, 10, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Kimyəvi tarazlıq'),
  (873, 10, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Tarazlıq sabiti'),
  (874, 10, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Hüceyrə biologiyası'),
  (875, 10, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Mikroskopiya'),
  (876, 10, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Eukariot və prokariot hüceyrələr'),
  (877, 10, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Bioloji molekulların strukturu'),
  (878, 10, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Fermentlər — enzimlər'),
  (879, 10, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Hüceyrə membranı'),
  (880, 10, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Diffuziya, osmos və aktiv nəql'),
  (881, 10, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'İrsiyyət qanunauyğunluqları'),
  (882, 10, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Gen ekspressiyası'),
  (883, 10, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Zülal sintezi'),
  (884, 10, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'İrsi dəyişkənlik'),
  (885, 10, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Ekosistemlərin təhlili'),
  (886, 10, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Bioloji müxtəliflik'),
  (887, 10, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Bioloji müxtəlifliyin mühafizəsi'),
  (888, 10, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Populyasiyada dəyişkənliyin genetik əsasları'),
  (889, 10, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Yoluxucu xəstəliklər'),
  (890, 10, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'İmmunitet mexanizmi'),
  (891, 10, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Aktiv və passiv immunitet'),
  (892, 10, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Peyvənd'),
  (893, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Rastr informasiyanın kodlaşdırılması'),
  (894, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Rəng dərinliyi və RGB'),
  (895, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Səs və videoinformasiyanın həcmi'),
  (896, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Relyasiyalı verilənlər bazası'),
  (897, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'SQL'),
  (898, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'CREATE, INSERT, UPDATE və DELETE sorğuları'),
  (899, 10, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Kompüterlərin nəsilləri'),
  (900, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter şəbəkəsinin layihələndirilməsi'),
  (901, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Tətbiqi, sistem və aparat təminatı'),
  (902, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Kompüter modeli'),
  (903, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Məntiq cəbri'),
  (904, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Məntiqi ifadələr və doğruluq cədvəli'),
  (905, 10, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Blok-sxem və psevdokod'),
  (906, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Seçməli və qabarcıqlı çeşidləmə'),
  (907, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Alqoritmin effektivliyi və korrektliyi'),
  (908, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Abstraksiya'),
  (909, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Lokal, qlobal və formal dəyişənlər'),
  (910, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Sətir, siyahı, massiv, stek, növbə və lüğət'),
  (911, 10, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Fayllarla iş'),
  (912, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Verilənlər bazasının proqramlaşdırılması'),
  (913, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Qrafik kitabxanalar'),
  (914, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Rekursiya'),
  (915, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'JavaScript və interaktiv veb-səhifələr'),
  (916, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Elektron hökumət'),
  (917, 10, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Haker hücumları və kibercinayətkarlıq'),
  (918, 10, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən nitqin məzmununun izahı'),
  (919, 10, 'english', 1, 'Dinləyib-anlama', 'Fakt və hadisələrin qruplaşdırılması'),
  (920, 10, 'english', 1, 'Dinləyib-anlama', 'Ümumiləşdirmə'),
  (921, 10, 'english', 1, 'Dinləyib-anlama', 'Fakt və hadisələrin şərhi'),
  (922, 10, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müxtəlif mövqeli fikirlərə münasibət'),
  (923, 10, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Yeni ifadə və terminlərin mənası'),
  (924, 10, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətnin məzmununa uyğun intonasiya'),
  (925, 10, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müxtəlif üslublu mətnlərin fərqləndirilməsi'),
  (926, 10, 'english', 3, 'Oxu və mətnlə iş', 'Fakt və hadisələrin təhlili'),
  (927, 10, 'english', 3, 'Oxu və mətnlə iş', 'Yazının redaktə edilməsi'),
  (928, 10, 'english', 3, 'Oxu və mətnlə iş', 'Mülahizə'),
  (929, 10, 'english', 4, 'Yazı və dil qaydaları', 'Cümlə və abzasların əlaqələndirilməsi'),
  (930, 10, 'english', 4, 'Yazı və dil qaydaları', 'Hesabat'),
  (931, 10, 'english', 4, 'Yazı və dil qaydaları', 'Çıxış'),
  (932, 10, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Çoxluqlar cəbri'),
  (933, 10, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Sayma prinsipləri'),
  (934, 10, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Permutasiya və kombinasiya'),
  (935, 10, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Triqonometrik eyniliklərin əsaslandırılması'),
  (936, 10, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Funksiyaların müqayisəsi'),
  (937, 10, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məntiq cəbri və doğruluq cədvəlləri'),
  (938, 10, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Məntiqi ifadələrin sadələşdirilməsi'),
  (939, 10, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Blok-sxem və psevdokod'),
  (940, 10, 'az_language', 3, 'Alqoritmik düşüncə', 'Çeşidləmə alqoritmləri'),
  (941, 10, 'az_language', 3, 'Alqoritmik düşüncə', 'Alqoritmin korrektliyi'),
  (942, 10, 'az_language', 3, 'Alqoritmik düşüncə', 'Alqoritmin effektivliyi'),
  (943, 10, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Abstraksiya'),
  (944, 10, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Rekursiv düşüncə'),
  (945, 10, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'SQL sorğularında məntiqi şərtlər'),
  (946, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kompleks ədəd'),
  (947, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Xəyali vahid'),
  (948, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kompleks ədədin cəbri şəkli'),
  (949, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kompleks ədədin həndəsi təsviri'),
  (950, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Qoşma kompleks ədədlər'),
  (951, 11, 'math', 1, 'Ədədlər və hesab əməlləri', 'Kompleks ədədin modulu'),
  (952, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Çoxhədlilərin kökləri'),
  (953, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Funksiyanın limiti'),
  (954, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Funksiyanın kəsilməzliyi'),
  (955, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Limitin xassələri'),
  (956, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Törəmə'),
  (957, 11, 'math', 2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Törəmənin həndəsi və fiziki mənası'),
  (958, 11, 'math', 3, 'Həndəsə və ölçmə', 'Funksiyanın ekstremumları'),
  (959, 11, 'math', 3, 'Həndəsə və ölçmə', 'Funksiyanın qrafikinin araşdırılması'),
  (960, 11, 'math', 3, 'Həndəsə və ölçmə', 'İbtidai funksiya'),
  (961, 11, 'math', 3, 'Həndəsə və ölçmə', 'Müəyyən və qeyri-müəyyən inteqral'),
  (962, 11, 'math', 3, 'Həndəsə və ölçmə', 'Nyuton–Leybnis düsturu'),
  (963, 11, 'math', 3, 'Həndəsə və ölçmə', 'Fəza koordinat sistemi'),
  (964, 11, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fəzada vektorlar'),
  (965, 11, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fırlanma cisimləri'),
  (966, 11, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Silindr, konus və kürə'),
  (967, 11, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Fırlanma cisimlərinin səthinin sahəsi və həcmi'),
  (968, 11, 'math', 4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Tam ehtimal düsturu'),
  (969, 11, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Elektrik sahəsi'),
  (970, 11, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Elektrik sahəsinin intensivliyi'),
  (971, 11, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Elektrik potensialı və potensiallar fərqi'),
  (972, 11, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Kondensator'),
  (973, 11, 'fizika', 1, 'Fiziki kəmiyyətlər və mexanika', 'Elektrik tutumu'),
  (974, 11, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Kondensatorların birləşdirilməsi'),
  (975, 11, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Sabit cərəyan dövrələri'),
  (976, 11, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Yarımkeçiricilər'),
  (977, 11, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Yarımkeçirici cihazlar'),
  (978, 11, 'fizika', 2, 'Elektrik və maqnit hadisələri', 'Elektromaqnit sahəsinin yüklü zərrəciyə təsiri'),
  (979, 11, 'fizika', 3, 'İstilik, dalğalar və optika', 'Lorens qüvvəsi'),
  (980, 11, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektromaqnit induksiyası'),
  (981, 11, 'fizika', 3, 'İstilik, dalğalar və optika', 'Faradey qanunu'),
  (982, 11, 'fizika', 3, 'İstilik, dalğalar və optika', 'Elektromaqnit rəqsləri'),
  (983, 11, 'fizika', 3, 'İstilik, dalğalar və optika', 'Kvant fizikası'),
  (984, 11, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Fotoeffekt'),
  (985, 11, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Foton'),
  (986, 11, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Astrofizika'),
  (987, 11, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Ulduzlar və qalaktikalar'),
  (988, 11, 'fizika', 4, 'Atom, nüvə və müasir fizika', 'Kosmologiya'),
  (989, 11, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Karbohidrogenlər'),
  (990, 11, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Alkanlar'),
  (991, 11, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Alkenlər'),
  (992, 11, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Alkinlər'),
  (993, 11, 'elm', 1, 'Maddələr, elementlər və quruluş', 'Tsikloalkanlar'),
  (994, 11, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Aromatik karbohidrogenlər'),
  (995, 11, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Karbohidrogenlərin adlandırılması və reaksiyaları'),
  (996, 11, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Oksigenli üzvi birləşmələr'),
  (997, 11, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Spirtlər'),
  (998, 11, 'elm', 2, 'Kimyəvi reaksiyalar və hesablamalar', 'Aldehid və ketonlar'),
  (999, 11, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Karbon turşuları və mürəkkəb efirlər'),
  (1000, 11, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Polimerlər'),
  (1001, 11, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Polimerlərin xassələri və tətbiqi'),
  (1002, 11, 'elm', 3, 'Birləşmələr, məhlullar və xassələr', 'Elektrolitik dissosiasiya'),
  (1003, 11, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Hidroliz'),
  (1004, 11, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Oksidləşmə-reduksiya reaksiyaları'),
  (1005, 11, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Elektroliz'),
  (1006, 11, 'elm', 4, 'Üzvi kimya və tətbiqi proseslər', 'Elektrolizə aid hesablamalar'),
  (1007, 11, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Energetik mübadilə'),
  (1008, 11, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'ATF'),
  (1009, 11, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Qlikoliz'),
  (1010, 11, 'elm', 1, 'Hüceyrə və təşkil səviyyələri', 'Hüceyrə tənəffüsü'),
  (1011, 11, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Fotosintezin işıq və qaranlıq mərhələləri'),
  (1012, 11, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Nəzarət və tənzimləmə mexanizmləri'),
  (1013, 11, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Biotexnologiya'),
  (1014, 11, 'elm', 2, 'Orqanizmlərdə həyat prosesləri', 'Gen mühəndisliyi'),
  (1015, 11, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Heyvan və bitkilərin klonlaşdırılması'),
  (1016, 11, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Ətraf mühitin mühafizəsi'),
  (1017, 11, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Təbii seçmə və təkamül'),
  (1018, 11, 'elm', 3, 'İrsiyyət, çoxalma və inkişaf', 'Süni seçmə'),
  (1019, 11, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Dərmanlar'),
  (1020, 11, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Antibiotiklər'),
  (1021, 11, 'elm', 4, 'Ekologiya, sağlamlıq və biotexnologiya', 'Dərmanlardan düzgün istifadə'),
  (1022, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'İnformasiyanın miqdarı'),
  (1023, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Məzmun və əlifba yanaşması'),
  (1024, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Hartli və Şennon düsturları'),
  (1025, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Ədədi orta'),
  (1026, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Median'),
  (1027, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Moda'),
  (1028, 11, 'informatics', 1, 'İnformasiya və kompüter sistemləri', 'Ağıllı ev'),
  (1029, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Ağıllı şəhər'),
  (1030, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Əşyaların interneti'),
  (1031, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Sensorlar və NFC'),
  (1032, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Robot sistemləri'),
  (1033, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Əməliyyat sistemlərinin təsnifatı'),
  (1034, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Reqressiya modeli'),
  (1035, 11, 'informatics', 2, 'Rəqəmsal alətlər, media və verilənlər', 'Trend əyrisi'),
  (1036, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'İkilik axtarış'),
  (1037, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Öncə-dərinliyinə axtarış — DFS'),
  (1038, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Öncə-eninə axtarış — BFS'),
  (1039, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Proqramın təhlili və layihələndirilməsi'),
  (1040, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Proqram təminatı layihəsi'),
  (1041, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Proqram təminatının sənədləşdirilməsi'),
  (1042, 11, 'informatics', 3, 'Alqoritmlər və proqramlaşdırma', 'Obyekt-yönlü proqramlaşdırma'),
  (1043, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Sinif, obyekt, xassə və metod'),
  (1044, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Veb-server, domen və hostinq'),
  (1045, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Veb-saytın qiymətləndirilməsi'),
  (1046, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqram kodunun keyfiyyəti'),
  (1047, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqramlaşdırma dillərinin müqayisəsi'),
  (1048, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Kriptovalyuta'),
  (1049, 11, 'informatics', 4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Proqram təminatı piratçılığı və müəlliflik hüququ'),
  (1050, 11, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən məlumat üzrə təqdimat'),
  (1051, 11, 'english', 1, 'Dinləyib-anlama', 'Dinlənilən mətnin qiymətləndirilməsi'),
  (1052, 11, 'english', 1, 'Dinləyib-anlama', 'Fakt və hadisələrə münasibət'),
  (1053, 11, 'english', 1, 'Dinləyib-anlama', 'Müxtəlif mövqeli fikirlərin ümumiləşdirilməsi'),
  (1054, 11, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Əsaslandırılmış nitq'),
  (1055, 11, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Yeni ifadə və terminlərin kontekstə uyğun mənası'),
  (1056, 11, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Müxtəlif üslublu mətnlərin düzgün oxunması'),
  (1057, 11, 'english', 2, 'Danışma və qarşılıqlı ünsiyyət', 'Mətnlərin məzmununun şərhi'),
  (1058, 11, 'english', 3, 'Oxu və mətnlə iş', 'Fakt və hadisələrin real həyatla əlaqələndirilməsi'),
  (1059, 11, 'english', 3, 'Oxu və mətnlə iş', 'Özünün və başqasının yazısının təkmilləşdirilməsi'),
  (1060, 11, 'english', 3, 'Oxu və mətnlə iş', 'Müxtəlif üslublu yazılar'),
  (1061, 11, 'english', 4, 'Yazı və dil qaydaları', 'Orfoqrafiya, qrammatika və durğu işarələri'),
  (1062, 11, 'english', 4, 'Yazı və dil qaydaları', 'Layihə'),
  (1063, 11, 'english', 4, 'Yazı və dil qaydaları', 'Təqdimat'),
  (1064, 11, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Kompleks ədədlər üzərində mühakimə'),
  (1065, 11, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Çoxhədlinin köklərinin araşdırılması'),
  (1066, 11, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Limit və sonsuz proseslər'),
  (1067, 11, 'az_language', 1, 'Təsnifat və qanunauyğunluqlar', 'Törəmə vasitəsilə funksiyanın araşdırılması'),
  (1068, 11, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Ekstremum və optimallaşdırma'),
  (1069, 11, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Ehtimal və statistik nəticəçıxarma'),
  (1070, 11, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'Reqressiya və proqnozlaşdırma'),
  (1071, 11, 'az_language', 2, 'Əlaqələr və modelləşdirmə', 'İkilik axtarış'),
  (1072, 11, 'az_language', 3, 'Alqoritmik düşüncə', 'DFS və BFS alqoritmləri'),
  (1073, 11, 'az_language', 3, 'Alqoritmik düşüncə', 'Alqoritmlərin müqayisəsi'),
  (1074, 11, 'az_language', 3, 'Alqoritmik düşüncə', 'Proqram kodunun korrektliyi və keyfiyyəti'),
  (1075, 11, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Obyekt-yönlü düşüncə'),
  (1076, 11, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Məlumatlardan etik istifadə'),
  (1077, 11, 'az_language', 4, 'Məntiqi nəticə və problem həlli', 'Müəlliflik hüququ və rəqəmsal məsuliyyət');

-- -----------------------------------------------------------------------------
-- I2. Assert the staged payload and its references. Fail LOUDLY, never skip.
-- -----------------------------------------------------------------------------
do $$
declare
  v_rows      int;
  v_topics    int;
  v_subtopics int;
  v_missing   text;
begin
  select count(*) into v_rows from _curriculum_2026;
  select count(*) into v_topics
    from (select distinct grade_level, subject_code, topic_name from _curriculum_2026) t;
  select count(*) into v_subtopics
    from (select distinct grade_level, subject_code, topic_name, subtopic_name
            from _curriculum_2026) s;

  -- Shape of the payload: catches a truncated or double-pasted VALUES block
  -- before a single row is written to a real table.
  if v_rows <> 1077 then
    raise exception 'curriculum import: staged % row(s), expected 1077 — the VALUES block is not intact', v_rows;
  end if;
  if v_topics <> 260 then
    raise exception 'curriculum import: staged % distinct topic(s), expected 260', v_topics;
  end if;
  if v_subtopics <> 1077 then
    raise exception 'curriculum import: staged % distinct subtopic(s), expected 1077', v_subtopics;
  end if;

  -- Every topic must sit in exactly one term (the guarantee the whole term
  -- model rests on, and the reason the admin form keeps term DERIVED).
  select string_agg(format('%s/%s/%s', grade_level, subject_code, topic_name), '; ')
    into v_missing
  from (
    select grade_level, subject_code, topic_name
    from _curriculum_2026
    group by 1, 2, 3
    having count(distinct term) > 1
  ) x;
  if v_missing is not null then
    raise exception 'curriculum import: topic(s) span more than one term: %', v_missing;
  end if;

  -- Referenced subjects must all exist. NEVER skip a row silently.
  select string_agg(distinct c.subject_code, ', ') into v_missing
  from _curriculum_2026 c
  where not exists (select 1 from public.subjects s where s.code = c.subject_code);
  if v_missing is not null then
    raise exception
      'curriculum import: subject code(s) missing from public.subjects: %. '
      'Create them (or fix the mapping) before importing — importing a partial '
      'curriculum is worse than importing none.', v_missing;
  end if;

  -- Referenced grade levels must all exist.
  select string_agg(distinct c.grade_level::text, ', ') into v_missing
  from _curriculum_2026 c
  where not exists (select 1 from public.grades g where g.level = c.grade_level);
  if v_missing is not null then
    raise exception 'curriculum import: grade level(s) missing from public.grades: %', v_missing;
  end if;

  raise notice 'I2  staged payload verified: % rows / % topics / % subtopics; all subjects and grades resolve.',
    v_rows, v_topics, v_subtopics;
end $$;

-- -----------------------------------------------------------------------------
-- I3. Resolve ids and derive ordering.
-- -----------------------------------------------------------------------------
-- Topic order_index: 0-based position within (grade, subject), ordered by the
-- topic's FIRST appearance in the source document — i.e. teaching order.
create temporary table _curriculum_2026_topics on commit drop as
select
  s.id                                    as subject_id,
  g.id                                    as grade_id,
  c.topic_name                            as name,
  min(c.term)::smallint                   as term,
  (dense_rank() over (partition by c.subject_code, c.grade_level
                      order by min(c.seq)))::int - 1 as order_index,
  min(c.seq)                              as first_seq
from _curriculum_2026 c
join public.subjects s on s.code  = c.subject_code
join public.grades   g on g.level = c.grade_level
group by s.id, g.id, c.subject_code, c.grade_level, c.topic_name;

-- Subtopic order_index: 0-based position within its topic, source order.
create temporary table _curriculum_2026_subtopics on commit drop as
select
  s.id                     as subject_id,
  g.id                     as grade_id,
  c.topic_name             as topic_name,
  c.subtopic_name          as name,
  c.term::smallint         as term,
  (row_number() over (partition by s.id, g.id, c.topic_name order by c.seq))::int - 1 as order_index
from _curriculum_2026 c
join public.subjects s on s.code  = c.subject_code
join public.grades   g on g.level = c.grade_level;

-- -----------------------------------------------------------------------------
-- I4. Refuse to run against an ambiguous match key.
-- -----------------------------------------------------------------------------
-- The rerun-matching below keys on (subject_id, grade_id, name) for exam topics
-- and (topic_id, name) for subtopics. If either key is already duplicated in the
-- database the joins would fan out and double the tree, so stop instead.
do $$
declare v_dupes text;
begin
  select string_agg(name, '; ') into v_dupes
  from (
    select t.name
    from public.topics t
    where t.scope = 'exam'
    group by t.subject_id, t.grade_id, t.name
    having count(*) > 1
  ) x;
  if v_dupes is not null then
    raise exception
      'curriculum import: duplicate exam topic key(s) already in the database: %. '
      'Resolve them first — the rerun match would fan out.', v_dupes;
  end if;

  select string_agg(name, '; ') into v_dupes
  from (
    select st.name
    from public.subtopics st
    join public.topics t on t.id = st.topic_id and t.scope = 'exam'
    group by st.topic_id, st.name
    having count(*) > 1
  ) x;
  if v_dupes is not null then
    raise exception
      'curriculum import: duplicate subtopic name(s) under one topic: %. '
      'Resolve them first — the rerun match would fan out.', v_dupes;
  end if;

  raise notice 'I4  match keys are unambiguous.';
end $$;

-- -----------------------------------------------------------------------------
-- I5. Topics — insert the missing, realign the existing.
-- -----------------------------------------------------------------------------
insert into public.topics (subject_id, grade_id, name, scope, term, order_index, status)
select ct.subject_id, ct.grade_id, ct.name, 'exam', ct.term, ct.order_index, 'active'
from _curriculum_2026_topics ct
where not exists (
  select 1 from public.topics t
   where t.scope      = 'exam'
     and t.subject_id = ct.subject_id
     and t.grade_id is not distinct from ct.grade_id
     and t.name       = ct.name
);

-- Rerun path: bring an already-present topic back in line with the source.
-- Updating term here also cascades to its subtopics and questions through
-- trg_topic_term_cascade, which is the intended behaviour if the curriculum is
-- ever corrected and re-imported.
update public.topics t
   set term        = ct.term,
       order_index = ct.order_index,
       status      = 'active',
       updated_at  = now()
  from _curriculum_2026_topics ct
 where t.scope      = 'exam'
   and t.subject_id = ct.subject_id
   and t.grade_id is not distinct from ct.grade_id
   and t.name       = ct.name
   and (t.term is distinct from ct.term
        or t.order_index is distinct from ct.order_index
        or t.status is distinct from 'active'::public.catalog_status);

-- -----------------------------------------------------------------------------
-- I6. Subtopics — insert the missing, realign the existing.
-- -----------------------------------------------------------------------------
-- term is set explicitly and equals the parent topic's term, so
-- trg_subtopic_term_guard VALIDATES it (a mismatch raises) instead of silently
-- inheriting from NULL.
insert into public.subtopics (topic_id, name, term, order_index, status)
select t.id, cs.name, cs.term, cs.order_index, 'active'
from _curriculum_2026_subtopics cs
join public.topics t
  on t.scope      = 'exam'
 and t.subject_id = cs.subject_id
 and t.grade_id is not distinct from cs.grade_id
 and t.name       = cs.topic_name
where not exists (
  select 1 from public.subtopics st
   where st.topic_id = t.id
     and st.name     = cs.name
);

update public.subtopics st
   set term        = cs.term,
       order_index = cs.order_index,
       status      = 'active',
       updated_at  = now()
  from _curriculum_2026_subtopics cs
  join public.topics t
    on t.scope      = 'exam'
   and t.subject_id = cs.subject_id
   and t.grade_id is not distinct from cs.grade_id
   and t.name       = cs.topic_name
 where st.topic_id = t.id
   and st.name     = cs.name
   and (st.term is distinct from cs.term
        or st.order_index is distinct from cs.order_index
        or st.status is distinct from 'active'::public.catalog_status);

-- -----------------------------------------------------------------------------
-- I7. Verify the imported tree.
-- -----------------------------------------------------------------------------
do $$
declare
  v_topics    int;
  v_subtopics int;
  v_bad       text;
begin
  -- Exactly the source tree, and nothing else in exam scope.
  select count(*) into v_topics from public.topics where scope = 'exam';
  select count(*) into v_subtopics
    from public.subtopics st join public.topics t on t.id = st.topic_id
   where t.scope = 'exam';

  if v_topics <> 260 then
    raise exception 'curriculum import: % exam topic(s) after import, expected 260', v_topics;
  end if;
  if v_subtopics <> 1077 then
    raise exception 'curriculum import: % exam subtopic(s) after import, expected 1077', v_subtopics;
  end if;

  -- Every topic carries a term in 1..4.
  if exists (select 1 from public.topics where scope = 'exam'
              and (term is null or term < 1 or term > 4)) then
    raise exception 'curriculum import: an exam topic has a NULL/out-of-range term';
  end if;

  -- Every subtopic's term equals its parent topic's term.
  if exists (select 1 from public.subtopics st
               join public.topics t on t.id = st.topic_id
              where t.scope = 'exam' and st.term is distinct from t.term) then
    raise exception 'curriculum import: a subtopic term does not match its topic';
  end if;

  -- No orphans: every exam topic has a subject and a grade and at least one
  -- subtopic; every subtopic has a live parent (FK guarantees the last one, the
  -- check is kept so the intent is explicit).
  if exists (select 1 from public.topics where scope = 'exam'
              and (subject_id is null or grade_id is null)) then
    raise exception 'curriculum import: an exam topic has no subject or no grade';
  end if;
  select string_agg(t.name, '; ') into v_bad
  from public.topics t
  where t.scope = 'exam'
    and not exists (select 1 from public.subtopics st where st.topic_id = t.id);
  if v_bad is not null then
    raise exception 'curriculum import: exam topic(s) with no subtopic: %', v_bad;
  end if;
  if exists (select 1 from public.subtopics st
              where not exists (select 1 from public.topics t where t.id = st.topic_id)) then
    raise exception 'curriculum import: orphan subtopic row';
  end if;

  -- No 'olympiad'-scoped row was produced by this migration.
  if exists (select 1 from public.topics t
               join _curriculum_2026_topics ct
                 on ct.subject_id = t.subject_id
                and ct.grade_id is not distinct from t.grade_id
                and ct.name = t.name
              where t.scope <> 'exam') then
    raise notice 'I7  NOTE: a pre-existing OLYMPIAD-scoped topic shares a name with a curriculum topic. It was left untouched, which is correct.';
  end if;

  raise notice 'I7  imported tree verified: % topics / % subtopics, all terms 1..4, no orphans.',
    v_topics, v_subtopics;
end $$;

-- -----------------------------------------------------------------------------
-- I8. Per (grade, subject) comparison — staged source vs. imported database.
-- -----------------------------------------------------------------------------
-- Raises on ANY difference, then prints the full 60-row comparison so the run
-- log carries the evidence rather than a bare "ok".
do $$
declare
  r record;
  v_diff text;
begin
  select string_agg(format('grade %s / %s: expected %s topics / %s subtopics, got %s / %s',
                           d.level, d.code, d.exp_t, d.exp_s, d.got_t, d.got_s), E'\n         ')
    into v_diff
  from (
    select g.level, s.code,
           count(distinct c.topic_name)                                   as exp_t,
           count(*)                                                       as exp_s,
           (select count(*) from public.topics t
             where t.scope = 'exam' and t.subject_id = s.id and t.grade_id = g.id) as got_t,
           (select count(*) from public.subtopics st
              join public.topics t on t.id = st.topic_id
             where t.scope = 'exam' and t.subject_id = s.id and t.grade_id = g.id) as got_s
    from _curriculum_2026 c
    join public.subjects s on s.code  = c.subject_code
    join public.grades   g on g.level = c.grade_level
    group by g.level, s.code, s.id, g.id
  ) d
  where d.exp_t <> d.got_t or d.exp_s <> d.got_s;

  if v_diff is not null then
    raise exception E'curriculum import: per-(grade, subject) counts do not match the source:\n         %', v_diff;
  end if;

  raise notice 'I8  per-(grade, subject) comparison — source vs database:';
  raise notice 'I8  grade | subject      | topics | subtopics';
  for r in
    select g.level as level, s.code as code,
           count(distinct c.topic_name) as t_cnt,
           count(*)                     as s_cnt
    from _curriculum_2026 c
    join public.subjects s on s.code  = c.subject_code
    join public.grades   g on g.level = c.grade_level
    group by g.level, s.code
    order by g.level, s.code
  loop
    raise notice 'I8  %  | % | %  | %',
      lpad(r.level::text, 5), rpad(r.code, 12), lpad(r.t_cnt::text, 6), lpad(r.s_cnt::text, 9);
  end loop;
  raise notice 'I8  all 60 (grade, subject) pairs match the source exactly.';
end $$;

commit;

-- =============================================================================
-- End of 2026_07_29_095_import_curriculum_2026.sql
-- =============================================================================
