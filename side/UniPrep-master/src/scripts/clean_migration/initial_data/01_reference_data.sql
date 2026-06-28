-- ============================================================================
-- INITIAL REFERENCE DATA
-- Cities, Universities, and Target Groups for Azerbaijan
-- Run AFTER all migration files (00-09) have been executed
-- ============================================================================

-- ============================================================================
-- 1. CITIES (59 cities in Azerbaijan)
-- 'name' = English (used as DB key), 'name_az' = Azerbaijani, 'name_ru' = Russian
-- ============================================================================
INSERT INTO cities (name, name_az, name_ru, region) VALUES
  ('Baku', 'Bakı', 'Баку', 'Baku'),
  ('Ganja', 'Gəncə', 'Гянджа', 'Ganja'),
  ('Sumgayit', 'Sumqayıt', 'Сумгаит', 'Sumgayit'),
  ('Mingachevir', 'Mingəçevir', 'Мингечевир', 'Mingachevir'),
  ('Shirvan', 'Şirvan', 'Ширван', 'Shirvan'),
  ('Nakhchivan', 'Naxçıvan', 'Нахчыван', 'Nakhchivan'),
  ('Lankaran', 'Lənkəran', 'Ленкорань', 'Lankaran'),
  ('Shaki', 'Şəki', 'Шеки', 'Shaki'),
  ('Yevlakh', 'Yevlax', 'Евлах', 'Yevlakh'),
  ('Gabala', 'Qəbələ', 'Габала', 'Gabala'),
  ('Agdam', 'Ağdam', 'Агдам', 'Agdam'),
  ('Aghjabadi', 'Ağcabədi', 'Агджабеди', 'Aghjabadi'),
  ('Agdash', 'Ağdaş', 'Агдаш', 'Agdash'),
  ('Astara', 'Astara', 'Астара', 'Astara'),
  ('Balakan', 'Balakən', 'Балакен', 'Balakan'),
  ('Barda', 'Bərdə', 'Барда', 'Barda'),
  ('Beylagan', 'Beyləqan', 'Бейлаган', 'Beylagan'),
  ('Bilasuvar', 'Biləsuvar', 'Билясувар', 'Bilasuvar'),
  ('Jabrayil', 'Cəbrayıl', 'Джебраил', 'Jabrayil'),
  ('Jalilabad', 'Cəlilabad', 'Джалилабад', 'Jalilabad'),
  ('Dashkasan', 'Daşkəsən', 'Дашкесан', 'Dashkasan'),
  ('Fuzuli', 'Füzuli', 'Физули', 'Fuzuli'),
  ('Gadabay', 'Gədəbəy', 'Гедабек', 'Gadabay'),
  ('Goranboy', 'Goranboy', 'Горанбой', 'Goranboy'),
  ('Goychay', 'Göyçay', 'Гейчай', 'Goychay'),
  ('Hajigabul', 'Hacıqabul', 'Гаджигабул', 'Hajigabul'),
  ('Imishli', 'İmişli', 'Имишли', 'Imishli'),
  ('Ismayilli', 'İsmayıllı', 'Исмаиллы', 'Ismayilli'),
  ('Kalbajar', 'Kəlbəcər', 'Кельбаджар', 'Kalbajar'),
  ('Kurdamir', 'Kürdəmir', 'Кюрдамир', 'Kurdamir'),
  ('Lachin', 'Laçın', 'Лачин', 'Lachin'),
  ('Lerik', 'Lerik', 'Лерик', 'Lerik'),
  ('Masalli', 'Masallı', 'Масаллы', 'Masalli'),
  ('Neftchala', 'Neftçala', 'Нефтчала', 'Neftchala'),
  ('Oguz', 'Oğuz', 'Огуз', 'Oguz'),
  ('Gakh', 'Qax', 'Гах', 'Gakh'),
  ('Gazakh', 'Qazax', 'Газах', 'Gazakh'),
  ('Gobustan', 'Qobustan', 'Гобустан', 'Gobustan'),
  ('Guba', 'Quba', 'Куба', 'Guba'),
  ('Gubadli', 'Qubadlı', 'Губадлы', 'Gubadli'),
  ('Gusar', 'Qusar', 'Гусар', 'Gusar'),
  ('Saatli', 'Saatlı', 'Саатлы', 'Saatli'),
  ('Sabirabad', 'Sabirabad', 'Сабирабад', 'Sabirabad'),
  ('Salyan', 'Salyan', 'Сальян', 'Salyan'),
  ('Shamakhi', 'Şamaxı', 'Шамахы', 'Shamakhi'),
  ('Shamkir', 'Şəmkir', 'Шамкир', 'Shamkir'),
  ('Shusha', 'Şuşa', 'Шуша', 'Shusha'),
  ('Tartar', 'Tərtər', 'Тертер', 'Tartar'),
  ('Tovuz', 'Tovuz', 'Товуз', 'Tovuz'),
  ('Ujar', 'Ucar', 'Уджар', 'Ujar'),
  ('Khachmaz', 'Xaçmaz', 'Хачмаз', 'Khachmaz'),
  ('Khankendi', 'Xankəndi', 'Ханкенди', 'Khankendi'),
  ('Khizi', 'Xızı', 'Хызы', 'Khizi'),
  ('Khojaly', 'Xocalı', 'Ходжалы', 'Khojaly'),
  ('Yardimli', 'Yardımlı', 'Ярдымлы', 'Yardimli'),
  ('Zangilan', 'Zəngilan', 'Зангилан', 'Zangilan'),
  ('Zagatala', 'Zaqatala', 'Закатала', 'Zagatala'),
  ('Zardab', 'Zərdab', 'Зардаб', 'Zardab'),
  ('Khirdalan', 'Xırdalan', 'Хырдалан', 'Absheron')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. UNIVERSITIES (28 universities in Azerbaijan)
-- 'name' = Azerbaijani name (used as DB key), 'name_az' = Azerbaijani, 'name_ru' = Russian
-- ============================================================================
INSERT INTO universities (name, name_az, name_ru, city) VALUES
  ('Bakı Dövlət Universiteti', 'Bakı Dövlət Universiteti', 'Бакинский Государственный Университет', 'Baku'),
  ('Azərbaycan Dövlət İqtisad Universiteti', 'Azərbaycan Dövlət İqtisad Universiteti', 'Азербайджанский Государственный Экономический Университет', 'Baku'),
  ('Azərbaycan Tibb Universiteti', 'Azərbaycan Tibb Universiteti', 'Азербайджанский Медицинский Университет', 'Baku'),
  ('Azərbaycan Dövlət Neft və Sənaye Universiteti', 'Azərbaycan Dövlət Neft və Sənaye Universiteti', 'Азербайджанский Государственный Университет Нефти и Промышленности', 'Baku'),
  ('Azərbaycan Texniki Universiteti', 'Azərbaycan Texniki Universiteti', 'Азербайджанский Технический Университет', 'Baku'),
  ('Azərbaycan Dövlət Pedaqoji Universiteti', 'Azərbaycan Dövlət Pedaqoji Universiteti', 'Азербайджанский Государственный Педагогический Университет', 'Baku'),
  ('Azərbaycan Dövlət Mədəniyyət və İncəsənət Universiteti', 'Azərbaycan Dövlət Mədəniyyət və İncəsənət Universiteti', 'Азербайджанский Государственный Университет Культуры и Искусств', 'Baku'),
  ('Azərbaycan Dövlət Aqrar Universiteti', 'Azərbaycan Dövlət Aqrar Universiteti', 'Азербайджанский Государственный Аграрный Университет', 'Ganja'),
  ('Azərbaycan Dövlət Beden Tərbiyəsi və İdman Akademiyası', 'Azərbaycan Dövlət Beden Tərbiyəsi və İdman Akademiyası', 'Азербайджанская Государственная Академия Физической Культуры и Спорта', 'Baku'),
  ('Azərbaycan Dövlət Dəniz Akademiyası', 'Azərbaycan Dövlət Dəniz Akademiyası', 'Азербайджанская Государственная Морская Академия', 'Baku'),
  ('Bakı Mühəndislik Universiteti', 'Bakı Mühəndislik Universiteti', 'Бакинский Инженерный Университет', 'Baku'),
  ('Bakı Ali Neft Məktəbi', 'Bakı Ali Neft Məktəbi', 'Бакинская Высшая Школа Нефти', 'Baku'),
  ('Azərbaycan Turizm və Menecment Universiteti', 'Azərbaycan Turizm və Menecment Universiteti', 'Азербайджанский Университет Туризма и Менеджмента', 'Baku'),
  ('Azərbaycan Dillər Universiteti', 'Azərbaycan Dillər Universiteti', 'Азербайджанский Университет Языков', 'Baku'),
  ('Azərbaycan Memarlıq və İnşaat Universiteti', 'Azərbaycan Memarlıq və İnşaat Universiteti', 'Азербайджанский Архитектурно-Строительный Университет', 'Baku'),
  ('Naxçıvan Dövlət Universiteti', 'Naxçıvan Dövlət Universiteti', 'Нахчыванский Государственный Университет', 'Nakhchivan'),
  ('Gəncə Dövlət Universiteti', 'Gəncə Dövlət Universiteti', 'Гянджинский Государственный Университет', 'Ganja'),
  ('Sumqayıt Dövlət Universiteti', 'Sumqayıt Dövlət Universiteti', 'Сумгаитский Государственный Университет', 'Sumgayit'),
  ('Lənkəran Dövlət Universiteti', 'Lənkəran Dövlət Universiteti', 'Ленкоранский Государственный Университет', 'Lankaran'),
  ('Mingəçevir Dövlət Universiteti', 'Mingəçevir Dövlət Universiteti', 'Мингечевирский Государственный Университет', 'Mingachevir'),
  ('Xəzər Universiteti', 'Xəzər Universiteti', 'Университет Хазар', 'Baku'),
  ('ADA Universiteti', 'ADA Universiteti', 'АДА Университет', 'Baku'),
  ('Bakı Slavyan Universiteti', 'Bakı Slavyan Universiteti', 'Бакинский Славянский Университет', 'Baku'),
  ('Azərbaycan Beynəlxalq Universiteti', 'Azərbaycan Beynəlxalq Universiteti', 'Азербайджанский Международный Университет', 'Baku'),
  ('Dövlət İdarəçilik Akademiyası', 'Dövlət İdarəçilik Akademiyası', 'Академия Государственного Управления', 'Baku'),
  ('Qərbi Kaspi Universiteti', 'Qərbi Kaspi Universiteti', 'Западно-Каспийский Университет', 'Baku'),
  ('Odlar Yurdu Universiteti', 'Odlar Yurdu Universiteti', 'Университет Одлар Юрду', 'Baku'),
  ('Azərbaycan Respublikasının Prezidenti yanında Dövlət İdarəçilik Akademiyası', 'Azərbaycan Respublikasının Prezidenti yanında Dövlət İdarəçilik Akademiyası', 'Академия Государственного Управления при Президенте Азербайджанской Республики', 'Baku')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. TARGET GROUPS (5 exam groups for Azerbaijan university entrance)
-- ============================================================================
INSERT INTO target_groups (code, name, name_az, description, max_points) VALUES
  ('I', 'Group I', 'I qrup', 'Riyaziyyat və texniki ixtisaslar (Mathematics and technical specialties)', 400),
  ('II', 'Group II', 'II qrup', 'Təbiət elmləri (Natural sciences)', 400),
  ('III', 'Group III', 'III qrup', 'Humanitar və sosial elmlər (Humanities and social sciences)', 400),
  ('IV', 'Group IV', 'IV qrup', 'İqtisadiyyat və idarəetmə (Economics and management)', 400),
  ('V', 'Group V', 'V qrup', 'Pedaqoji ixtisaslar (Pedagogical specialties)', 300)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 4. EXAM GROUPS (5 exam groups for Azerbaijan - Admin S9.1)
-- Maps to exam_groups table (separate from target_groups)
-- ============================================================================
INSERT INTO exam_groups (code, name_en, name_az, description, first_stage_max_points, second_stage_max_points, has_second_stage)
VALUES 
  ('I', 'Group I', 'I Qrup', 'Engineering, Technical - Stage II: Mathematics, Physics, Chemistry', 300, 400, true),
  ('II', 'Group II', 'II Qrup', 'Economics, Management - Stage II: Mathematics, Geography, History', 300, 400, true),
  ('III', 'Group III', 'III Qrup', 'Humanities, Law - Stage II: Native Language, History, Literature', 300, 400, true),
  ('IV', 'Group IV', 'IV Qrup', 'Medicine, Biology - Stage II: Biology, Chemistry, Physics', 300, 400, true),
  ('V', 'Group V', 'V Qrup', 'Special Aptitude, Arts, PE - First Stage Only (no Stage II)', 300, 0, false)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_az = EXCLUDED.name_az,
  description = EXCLUDED.description,
  first_stage_max_points = EXCLUDED.first_stage_max_points,
  second_stage_max_points = EXCLUDED.second_stage_max_points,
  has_second_stage = EXCLUDED.has_second_stage,
  updated_at = NOW();

-- ============================================================================
-- 5. SUBJECT TOPICS (S9.5 - topic tracking for weak area analysis)
-- Seed topics for each subject, used by Competitive Mode
-- ============================================================================

-- Mathematics Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Algebra', 'beginner', 1 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Geometry', 'intermediate', 2 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Trigonometry', 'intermediate', 3 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Calculus', 'advanced', 4 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Statistics', 'intermediate', 5 FROM subjects WHERE name_en = 'Mathematics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Physics Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Mechanics', 'beginner', 1 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Thermodynamics', 'intermediate', 2 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Optics', 'intermediate', 3 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Electricity', 'advanced', 4 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Magnetism', 'advanced', 5 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Waves', 'intermediate', 6 FROM subjects WHERE name_en = 'Physics'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Chemistry Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Organic Chemistry', 'advanced', 1 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Inorganic Chemistry', 'intermediate', 2 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physical Chemistry', 'advanced', 3 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Analytical Chemistry', 'intermediate', 4 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Biochemistry', 'advanced', 5 FROM subjects WHERE name_en = 'Chemistry'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Biology Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Cell Biology', 'beginner', 1 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Genetics', 'intermediate', 2 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Ecology', 'intermediate', 3 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Evolution', 'advanced', 4 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Anatomy', 'intermediate', 5 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physiology', 'advanced', 6 FROM subjects WHERE name_en = 'Biology'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- English Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Grammar', 'beginner', 1 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Vocabulary', 'beginner', 2 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Reading Comprehension', 'intermediate', 3 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Writing', 'intermediate', 4 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Literature', 'advanced', 5 FROM subjects WHERE name_en = 'English'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Azerbaijani Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Grammar', 'beginner', 1 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Literature', 'intermediate', 2 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Composition', 'intermediate', 3 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Poetry', 'advanced', 4 FROM subjects WHERE name_en = 'Azerbaijani'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- History Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Ancient History', 'beginner', 1 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Medieval History', 'intermediate', 2 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Modern History', 'intermediate', 3 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'World History', 'advanced', 4 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Azerbaijan History', 'intermediate', 5 FROM subjects WHERE name_en = 'History'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- Geography Topics
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Physical Geography', 'beginner', 1 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Human Geography', 'intermediate', 2 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Cartography', 'intermediate', 3 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;
INSERT INTO subject_topics (subject_id, topic_name, difficulty_level, display_order)
SELECT id, 'Economic Geography', 'advanced', 4 FROM subjects WHERE name_en = 'Geography'
ON CONFLICT (subject_id, topic_name) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  (SELECT COUNT(*) FROM cities) AS cities_count,
  (SELECT COUNT(*) FROM universities) AS universities_count,
  (SELECT COUNT(*) FROM target_groups) AS target_groups_count,
  (SELECT COUNT(*) FROM exam_groups) AS exam_groups_count,
  (SELECT COUNT(*) FROM subject_topics) AS subject_topics_count;
