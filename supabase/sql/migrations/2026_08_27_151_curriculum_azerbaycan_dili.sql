-- =============================================================================
-- 2026_08_27_151 — AZƎRBAYCAN DİLİ'S CURRICULUM, AND NOTHING ELSE.
--
-- Source: docs/investor/Kurikulum_1-11_AZ_EN_RU_UPDATED.docx, extracted to
-- supabase/seed/curriculum_2026_updated.json (1,165 rows, all three languages
-- verified parallel by grade+term alignment rather than by matching text —
-- topic names are translated, so text matching would be circular).
--
-- WHAT IS ACTUALLY NEW. Of the file's 1,165 subtopics, 1,077 already exist.
-- The only subject with no taxonomy at all was Azərbaycan dili: 44 topics and
-- 88 subtopics across grades 1-11. That is exactly what this migration adds.
--
-- WHAT IT DELIBERATELY LEAVES ALONE, and why this is not an oversight.
-- The database holds 604 subtopics that are NOT in the file, and they carry
-- 3,958 questions — nearly the entire bank of 4,441. The 1,077 rows that ARE in
-- the file carry 483. So the file is not a superset of what the platform runs
-- on; the questions were imported against a taxonomy the file does not describe.
-- Deleting the leftovers would set `questions.subtopic_id` to NULL on 3,958 rows
-- (the FK is ON DELETE SET NULL), silently detaching most of the bank from the
-- curriculum tree while leaving every question still servable and untraceable.
--
-- The rule agreed with the owner and confirmed by the investor: ADD what is new,
-- KEEP anything with questions attached, and REPORT the rest rather than
-- reconciling it away. The verification block at the end counts the leftovers so
-- the number is on the record instead of in a chat message.
--
-- FIZIKA IS 7-11 BY DATA, not by a rule written anywhere. The file carries
-- Fizika rows for grades 7-11 only, and the database already matches. Nothing
-- here needs to enforce it; the SUBJECT LIST is where a grade-3 child could
-- still be shown Fizika, and that is fixed in the app, not in SQL.
--
-- Conventions copied from the 260 existing topics, not invented:
--   * `name` holds the AZERBAIJANI text; en/ru live in *_translations. There is
--     no 'az' translation row, and check 102 counts en+ru only.
--   * topic.term = min(subtopic.term) — true of all 260 existing topics.
--   * scope = 'exam'.
--
-- Idempotent: neither natural key has a unique constraint, so every insert is
-- guarded by NOT EXISTS. Re-running changes nothing.
--
-- Self-transacting. Data-only: no schema change, nothing to backport.
-- =============================================================================
begin;

do $$
declare
  v_payload  jsonb := '[{"grade":1,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Dinlədiyi sadə mətn üzrə faktoloji suallara cavab vermə","en":"Answers simple factual questions about a listened text","ru":"Отвечает на простые фактические вопросы по прослушанному тексту","term":1,"order":0},{"name":"Sadə dialoqda dinləmə və növbə ilə danışma","en":"Participates in a short dialogue, listening and taking turns","ru":"Участвует в коротком диалоге, слушая собеседника и соблюдая очередность реплик","term":1,"order":1}]},{"grade":1,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Hərf-səs uyğunluğu, heca və sözlərin oxunması","en":"Recognizes letter-sound correspondences and reads syllables and words","ru":"Соотносит буквы и звуки, читает слоги и слова","term":2,"order":0},{"name":"Sadə cümlə və qısa mətnin şüurlu oxusu","en":"Reads simple sentences and short texts with understanding","ru":"Осознанно читает простые предложения и короткие тексты","term":2,"order":1}]},{"grade":1,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Hərf və sözlərin düzgün və səliqəli yazılması","en":"Writes letters and words legibly and correctly","ru":"Разборчиво и правильно пишет буквы и слова","term":3,"order":0},{"name":"Şəkil üzrə 2-3 sadə cümlənin qurulması və yazılması","en":"Writes 2-3 simple sentences based on a picture","ru":"Составляет и записывает 2-3 простых предложения по картинке","term":3,"order":1}]},{"grade":1,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Sait, samit, heca və vurğu haqqında ilkin təsəvvür","en":"Distinguishes vowels, consonants, syllables and basic word stress","ru":"Различает гласные, согласные, слоги и основные правила ударения","term":4,"order":0},{"name":"Böyük hərf və cümlə sonu durğu işarələrinin işlədilməsi","en":"Uses capital letters and sentence-final punctuation","ru":"Использует заглавную букву и знаки конца предложения","term":4,"order":1}]},{"grade":2,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Dinlədiyi mətnin əsas məqamlarını müəyyən edib sualları cavablandırma","en":"Identifies key points in a listened text and answers questions","ru":"Определяет основные моменты прослушанного текста и отвечает на вопросы","term":1,"order":0},{"name":"Dialoqda mövzuya uyğun sual vermə və cavablandırma","en":"Asks and answers relevant questions in a dialogue","ru":"Задаёт и отвечает на вопросы по теме диалога","term":1,"order":1}]},{"grade":2,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Qısa mətnləri düzgün və səlis oxuma","en":"Reads short texts fluently and accurately","ru":"Правильно и бегло читает короткие тексты","term":2,"order":0},{"name":"Mətnin əsas fikrini və dəstəkləyici detalları müəyyən etmə","en":"Identifies the main idea and supporting details","ru":"Определяет основную мысль и поддерживающие детали","term":2,"order":1}]},{"grade":2,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"4-5 cümlədən ibarət rabitəli mətn yazma","en":"Writes a coherent 4-5 sentence narrative","ru":"Пишет связный текст из 4-5 предложений","term":3,"order":0},{"name":"Yazıda əsas orfoqrafiya və durğu qaydalarını tətbiq etmə","en":"Applies basic spelling and punctuation when writing","ru":"Применяет основные правила орфографии и пунктуации","term":3,"order":1}]},{"grade":2,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Söz mənasını sinonim və antonimlərlə aydınlaşdırma","en":"Uses synonyms and antonyms to clarify word meaning","ru":"Уточняет значение слов с помощью синонимов и антонимов","term":4,"order":0},{"name":"İsim, feil və sifət haqqında ilkin anlayışları fərqləndirmə","en":"Recognizes basic nouns, verbs and adjectives","ru":"Различает базовые понятия существительного, глагола и прилагательного","term":4,"order":1}]},{"grade":3,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Əsas və ikincidərəcəli məlumatı fərqləndirib qısa qeydlər aparma","en":"Distinguishes main and secondary information and makes brief notes","ru":"Различает основную и второстепенную информацию и делает краткие записи","term":1,"order":0},{"name":"Hadisələri ardıcıllıqla və rabitəli şəkildə nəql etmə","en":"Retells events coherently and in sequence","ru":"Связно и последовательно пересказывает события","term":1,"order":1}]},{"grade":3,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mətni ifadəli oxuma və sadə plan tərtib etmə","en":"Reads expressively and creates a simple text plan","ru":"Выразительно читает и составляет простой план текста","term":2,"order":0},{"name":"Səbəb-nəticə əlaqələrini və sadə gizli mənanı müəyyən etmə","en":"Identifies cause-and-effect links and simple implicit meaning","ru":"Определяет причинно-следственные связи и простой скрытый смысл","term":2,"order":1}]},{"grade":3,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Qısa mətni abzaslar üzrə strukturlaşdırma","en":"Organizes a short text into paragraphs","ru":"Структурирует короткий текст по абзацам","term":3,"order":0},{"name":"Mətni orfoqrafiya və durğu baxımından redaktə etmə","en":"Edits a text for spelling and punctuation","ru":"Редактирует текст с точки зрения орфографии и пунктуации","term":3,"order":1}]},{"grade":3,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Sözün kök və şəkilçilərini müəyyən etmə","en":"Identifies roots and affixes in words","ru":"Определяет корень и аффиксы в словах","term":4,"order":0},{"name":"Cümlənin əsas üzvlərini və əsas cümlə növlərini fərqləndirmə","en":"Recognizes main sentence parts and common sentence types","ru":"Различает главные члены предложения и основные типы предложений","term":4,"order":1}]},{"grade":4,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Dinlədiyi məlumatı ümumiləşdirib münasibət bildirmə","en":"Summarizes listened information and expresses an opinion","ru":"Обобщает прослушанную информацию и выражает своё мнение","term":1,"order":0},{"name":"Müzakirədə ünsiyyət qaydalarına əməl edib fikrini sadə arqumentlə əsaslandırma","en":"Participates in discussion, follows communication etiquette and gives simple reasons","ru":"Участвует в обсуждении, соблюдает речевой этикет и приводит простые аргументы","term":1,"order":1}]},{"grade":4,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mətnin mövzusunu, əsas fikrini və strukturunu müəyyən etmə","en":"Identifies the topic, main idea and structure of a text","ru":"Определяет тему, основную мысль и структуру текста","term":2,"order":0},{"name":"İki mətni və ya mətnlə vizual məlumatı müqayisə etmə","en":"Compares two texts or a text with visual information","ru":"Сравнивает два текста или текст с визуальной информацией","term":2,"order":1}]},{"grade":4,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Giriş, əsas hissə və nəticədən ibarət mətn qurma","en":"Writes a text with an introduction, body and conclusion","ru":"Пишет текст со вступлением, основной частью и заключением","term":3,"order":0},{"name":"Təsviri, nəqli və məlumatverici qısa mətnlər yazma","en":"Produces short descriptive, narrative and informative texts","ru":"Создаёт короткие описательные, повествовательные и информационные тексты","term":3,"order":1}]},{"grade":4,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Nitq hissələrini və əsas qrammatik formaları tətbiq etmə","en":"Applies parts of speech and basic grammatical forms","ru":"Применяет знания о частях речи и основных грамматических формах","term":4,"order":0},{"name":"Cümlə növləri və uyğun durğu işarələrindən istifadə etmə","en":"Uses sentence types and punctuation appropriately","ru":"Правильно использует типы предложений и соответствующую пунктуацию","term":4,"order":1}]},{"grade":5,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Şifahi məlumatdan açar sözləri seçib qısa qeydlər aparma","en":"Takes keywords and short notes from oral information","ru":"Выделяет ключевые слова и делает краткие записи по устной информации","term":1,"order":0},{"name":"Plan əsasında qısa şifahi təqdimat etmə","en":"Gives a short oral presentation according to a plan","ru":"Делает короткое устное выступление по плану","term":1,"order":1}]},{"grade":5,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mətndə açıq və dolayı ifadə olunan məlumatı fərqləndirmə","en":"Distinguishes explicit and implicit information in a text","ru":"Различает явно и косвенно выраженную информацию в тексте","term":2,"order":0},{"name":"Mətnin əsas dil və üslub xüsusiyyətlərini təhlil etmə","en":"Analyzes basic language and style features of a text","ru":"Анализирует основные языковые и стилевые особенности текста","term":2,"order":1}]},{"grade":5,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Strukturlaşdırılmış xülasə və qısa esse yazma","en":"Writes a structured summary and short essay","ru":"Пишет структурированное изложение и короткое эссе","term":3,"order":0},{"name":"Mətni rabitəlilik, orfoqrafiya və durğu baxımından təkmilləşdirmə","en":"Revises writing for coherence, spelling and punctuation","ru":"Редактирует текст с точки зрения связности, орфографии и пунктуации","term":3,"order":1}]},{"grade":5,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Fonetik və orfoepik normaları, o cümlədən vurğunu tətbiq etmə","en":"Applies phonetic and orthoepic norms, including word stress","ru":"Применяет фонетические и орфоэпические нормы, включая ударение","term":4,"order":0},{"name":"Həqiqi və məcazi məna, frazeologizm, sinonim və antonimləri fərqləndirmə","en":"Distinguishes literal and figurative meaning, phraseology, synonyms and antonyms","ru":"Различает прямое и переносное значение, фразеологизмы, синонимы и антонимы","term":4,"order":1}]},{"grade":6,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Dinlədiyi məlumatın əsas məqamlarını əlaqələndirib ümumiləşdirmə","en":"Synthesizes the main points of listened information","ru":"Связывает и обобщает основные положения прослушанной информации","term":1,"order":0},{"name":"Müzakirədə arqumentlərdən istifadə edib fikirlərə adekvat reaksiya vermə","en":"Uses arguments in discussion and responds appropriately to others","ru":"Использует аргументы в обсуждении и адекватно реагирует на мнения других","term":1,"order":1}]},{"grade":6,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mətnin məqsədini, auditoriyasını və strukturunu müəyyən etmə","en":"Determines the purpose, audience and structure of a text","ru":"Определяет цель, аудиторию и структуру текста","term":2,"order":0},{"name":"Fakt və rəyi fərqləndirib səbəb-nəticə əlaqələrini müəyyən etmə","en":"Distinguishes facts and opinions and identifies cause-and-effect links","ru":"Различает факты и мнения и выявляет причинно-следственные связи","term":2,"order":1}]},{"grade":6,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Məqsədə uyğun müxtəlif funksional mətn növləri yazma","en":"Produces different functional text types according to a plan","ru":"Создаёт различные функциональные типы текстов по плану","term":3,"order":0},{"name":"Dəlil və sitatlardan istifadə edib mətni rabitəlilik baxımından redaktə etmə","en":"Uses evidence and quotations and edits text for coherence","ru":"Использует доказательства и цитаты и редактирует текст на связность","term":3,"order":1}]},{"grade":6,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Söz yaradıcılığı və morfologiya qaydalarını tətbiq etmə","en":"Applies word-formation and morphology rules","ru":"Применяет правила словообразования и морфологии","term":4,"order":0},{"name":"Sadə və ilkin mürəkkəb cümlə quruluşlarında durğu işarələrini tətbiq etmə","en":"Uses simple and introductory complex sentence structures with punctuation","ru":"Использует простые и базовые сложные конструкции с правильной пунктуацией","term":4,"order":1}]},{"grade":7,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Danışanın mövqeyini və onu əsaslandıran arqumentləri müəyyən etmə","en":"Identifies a speaker''s position and supporting arguments","ru":"Определяет позицию говорящего и поддерживающие её аргументы","term":1,"order":0},{"name":"Debatda qaydalara əməl edib mövqeyini dəlillərlə müdafiə etmə","en":"Participates in debate, follows rules and supports a viewpoint with evidence","ru":"Участвует в дебатах, соблюдает правила и обосновывает позицию доказательствами","term":1,"order":1}]},{"grade":7,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mətnin əsas fikrini, dəlillərini və strukturunu təhlil etmə","en":"Analyzes the main idea, evidence and text structure","ru":"Анализирует основную мысль, доказательства и структуру текста","term":2,"order":0},{"name":"Məcazi ifadələri və dolayı mənanı şərh etmə","en":"Interprets figurative language and implicit meaning","ru":"Интерпретирует переносные выражения и скрытый смысл","term":2,"order":1}]},{"grade":7,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Arqumentativ abzas və qısa esse yazma","en":"Writes an argumentative paragraph and short essay","ru":"Пишет аргументированный абзац и короткое эссе","term":3,"order":0},{"name":"Aydın strukturlu xülasə və ya rəy mətni hazırlama","en":"Produces a summary or review with clear structure","ru":"Готовит структурированное изложение или отзыв","term":3,"order":1}]},{"grade":7,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Qrammatik kateqoriyaları və nitq hissələrinin xüsusiyyətlərini tətbiq etmə","en":"Applies grammatical categories and parts-of-speech rules","ru":"Применяет грамматические категории и правила частей речи","term":4,"order":0},{"name":"Həmcins üzvlər və ilkin mürəkkəb cümlələrdə durğu işarələrini işlətmə","en":"Uses homogeneous sentence parts and basic complex-sentence punctuation","ru":"Использует однородные члены и базовую пунктуацию сложных предложений","term":4,"order":1}]},{"grade":8,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Şifahi məlumatın məqsədini və etibarlılığını qiymətləndirmə","en":"Evaluates the purpose and reliability of oral information","ru":"Оценивает цель и достоверность устной информации","term":1,"order":0},{"name":"Əks-arqument irəli sürüb dəlillərə əsaslanan təqdimat etmə","en":"Presents a counterargument and gives an evidence-based oral presentation","ru":"Выдвигает контраргумент и делает устное выступление на основе доказательств","term":1,"order":1}]},{"grade":8,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mənbələri müqayisə edib müəllif mövqeyini müəyyən etmə","en":"Compares sources and identifies the author''s position","ru":"Сравнивает источники и определяет позицию автора","term":2,"order":0},{"name":"Arqumentasiyanı, konteksti və mətnin təşkilini təhlil etmə","en":"Analyzes argumentation, context and text organization","ru":"Анализирует аргументацию, контекст и организацию текста","term":2,"order":1}]},{"grade":8,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Tezis və dəlillərə əsaslanan arqumentativ esse yazma","en":"Writes an argumentative essay with a thesis and evidence","ru":"Пишет аргументативное эссе с тезисом и доказательствами","term":3,"order":0},{"name":"Annotasiya, xülasə və rəsmi xarakterli qısa mətn hazırlama","en":"Produces an annotation, summary and short formal text","ru":"Готовит аннотацию, резюме и короткий официальный текст","term":3,"order":1}]},{"grade":8,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Mürəkkəb cümlələrdə əlaqələndirici vasitələrdən düzgün istifadə etmə","en":"Uses complex-sentence connectors correctly","ru":"Правильно использует средства связи в сложных предложениях","term":4,"order":0},{"name":"Vasitəsiz və vasitəli nitqdə uyğun durğu işarələrini tətbiq etmə","en":"Applies direct and indirect speech with related punctuation","ru":"Применяет правила прямой и косвенной речи и соответствующую пунктуацию","term":4,"order":1}]},{"grade":9,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Şifahi məlumatdan götürdüyü qeydləri cədvəl, sxem və digər qrafik formalarda sistemləşdirmə","en":"Organizes notes from oral information using tables, schemes and other graphic forms","ru":"Систематизирует записи по устной информации в таблицах, схемах и других графических формах","term":1,"order":0},{"name":"Müxtəlif mövqeləri şifahi nitqdə ümumiləşdirib müqayisə etmə","en":"Summarizes and compares multiple viewpoints in oral speech","ru":"Обобщает и сравнивает разные точки зрения в устной речи","term":1,"order":1}]},{"grade":9,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Dəlil, fakt-rəy fərqi və mümkün qərəzi tənqidi qiymətləndirmə","en":"Critically evaluates evidence, fact versus opinion and possible bias","ru":"Критически оценивает доказательства, различает факт и мнение и возможную предвзятость","term":2,"order":0},{"name":"Bir neçə mətndən əldə olunan məlumatı sintez etmə","en":"Synthesizes information from several texts","ru":"Синтезирует информацию из нескольких текстов","term":2,"order":1}]},{"grade":9,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Analitik hesabat və ya rəy yazma","en":"Writes an analytical report or review","ru":"Пишет аналитический отчёт или рецензию","term":3,"order":0},{"name":"Sitat və mənbəyə istinadın əsas qaydalarını tətbiq etmə","en":"Uses basic citation and source-referencing conventions","ru":"Применяет базовые правила цитирования и ссылок на источники","term":3,"order":1}]},{"grade":9,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Mürəkkəb sintaksis və durğu normalarını tətbiq etmə","en":"Applies complex syntax and punctuation","ru":"Применяет сложный синтаксис и нормы пунктуации","term":4,"order":0},{"name":"Fəal və qeyri-fəal leksikanı fərqləndirib üsluba uyğun söz seçmə","en":"Distinguishes active and non-active vocabulary and selects words according to style","ru":"Различает активную и неактивную лексику и выбирает слова в соответствии со стилем","term":4,"order":1}]},{"grade":10,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Mühazirə, müsahibə və müzakirələrdən əldə olunan məlumatı sintez etmə","en":"Synthesizes information from lectures, interviews and discussions","ru":"Синтезирует информацию из лекций, интервью и обсуждений","term":1,"order":0},{"name":"Rəsmi debatda iştirak edib strukturlaşdırılmış təqdimat etmə","en":"Participates in formal debate and delivers a structured presentation","ru":"Участвует в формальных дебатах и делает структурированную презентацию","term":1,"order":1}]},{"grade":10,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Janr, üslub və ritorik məqsədi təhlil etmə","en":"Analyzes genre, style and rhetorical purpose","ru":"Анализирует жанр, стиль и риторическую цель","term":2,"order":0},{"name":"Mənbənin etibarlılığını və mövzuya uyğunluğunu qiymətləndirmə","en":"Evaluates the credibility and relevance of sources","ru":"Оценивает достоверность и релевантность источников","term":2,"order":1}]},{"grade":10,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Tezis, dəlil və nəticə əsasında esse və ya hesabat yazma","en":"Writes an essay or report with thesis, evidence and conclusion","ru":"Пишет эссе или отчёт с тезисом, доказательствами и выводом","term":3,"order":0},{"name":"Mətni rabitəlilik, dəqiqlik və uyğun registr baxımından redaktə etmə","en":"Edits text for coherence, precision and appropriate register","ru":"Редактирует текст с точки зрения связности, точности и уместного регистра","term":3,"order":1}]},{"grade":10,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Yüksək səviyyəli sintaksis və durğu normalarını tətbiq etmə","en":"Applies advanced syntax and punctuation norms","ru":"Применяет продвинутые нормы синтаксиса и пунктуации","term":4,"order":0},{"name":"Jarqon, slenq, varvarizm, vulqarizm və evfemizmi fərqləndirib işlənmə uyğunluğunu qiymətləndirmə","en":"Distinguishes jargon, slang, barbarisms, vulgarisms and euphemisms and evaluates their appropriateness","ru":"Различает жаргон, сленг, варваризмы, вульгаризмы и эвфемизмы и оценивает уместность их употребления","term":4,"order":1}]},{"grade":11,"name":"Dinləmə və danışma","en":"Listening and speaking","ru":"Аудирование и говорение","order":0,"subs":[{"name":"Mürəkkəb şifahi məlumatı sintez edib əsaslandırılmış nəticələr çıxarma","en":"Synthesizes complex oral information and draws reasoned conclusions","ru":"Синтезирует сложную устную информацию и делает обоснованные выводы","term":1,"order":0},{"name":"İnandırıcı təqdimat etmə və müzakirəni uyğun qaydada moderasiya etmə","en":"Delivers persuasive presentations and moderates discussion appropriately","ru":"Проводит убедительную презентацию и корректно модерирует обсуждение","term":1,"order":1}]},{"grade":11,"name":"Oxu","en":"Reading","ru":"Чтение","order":1,"subs":[{"name":"Mürəkkəb mətnlərin tənqidi və müqayisəli təhlilini aparma","en":"Performs critical comparative analysis of complex texts","ru":"Проводит критический сравнительный анализ сложных текстов","term":2,"order":0},{"name":"Ritorik vasitələri və arqumentasiyanın keyfiyyətini qiymətləndirmə","en":"Evaluates rhetorical devices and the quality of argumentation","ru":"Оценивает риторические средства и качество аргументации","term":2,"order":1}]},{"grade":11,"name":"Yazı","en":"Writing","ru":"Письмо","order":2,"subs":[{"name":"Akademik və rəsmi-işgüzar mətnlər hazırlama","en":"Produces academic and formal-business texts","ru":"Создаёт академические и официально-деловые тексты","term":3,"order":0},{"name":"Mətni rabitəlilik, dəqiqlik, istinad və üslub ardıcıllığı baxımından redaktə etmə","en":"Edits writing for coherence, precision, citation and stylistic consistency","ru":"Редактирует текст с точки зрения связности, точности, цитирования и стилевого единства","term":3,"order":1}]},{"grade":11,"name":"Dil qaydaları","en":"Language rules","ru":"Языковые нормы","order":3,"subs":[{"name":"Funksional üslubları və yüksək səviyyəli dil normalarını tətbiq etmə","en":"Applies functional styles and advanced language norms","ru":"Применяет функциональные стили и продвинутые языковые нормы","term":4,"order":0},{"name":"Leksik, qrammatik və üslubi redaktəni kompleks şəkildə aparma","en":"Performs advanced lexical, grammatical and stylistic editing","ru":"Выполняет комплексное лексическое, грамматическое и стилистическое редактирование","term":4,"order":1}]}]'::jsonb;
  v_subject  uuid;
  v_grade    uuid;
  v_topic    uuid;
  v_item     jsonb;
  v_sub      jsonb;
  v_term     int;
  v_new_t    int := 0;
  v_new_s    int := 0;
begin
  select id into v_subject from public.subjects where code = 'azerbaycan_dili';
  if v_subject is null then
    raise exception '151: subject azerbaycan_dili not found';
  end if;

  for v_item in select * from jsonb_array_elements(v_payload)
  loop
    select id into v_grade from public.grades where level = (v_item->>'grade')::int;
    if v_grade is null then
      raise exception '151: grade level % not found', v_item->>'grade';
    end if;

    -- topic.term is the MIN of its subtopics' terms, matching every existing row.
    select min((s->>'term')::int) into v_term
    from jsonb_array_elements(v_item->'subs') s;

    select t.id into v_topic
    from public.topics t
    where t.subject_id = v_subject
      and t.grade_id = v_grade
      and t.scope = 'exam'
      and t.name = v_item->>'name';

    if v_topic is null then
      insert into public.topics (subject_id, grade_id, name, scope, term, order_index, status)
      values (v_subject, v_grade, v_item->>'name', 'exam', v_term,
              (v_item->>'order')::int, 'active')
      returning id into v_topic;
      v_new_t := v_new_t + 1;
    end if;

    insert into public.topic_translations (topic_id, locale, name)
    values (v_topic, 'en', v_item->>'en'), (v_topic, 'ru', v_item->>'ru')
    on conflict (topic_id, locale) do update set name = excluded.name, updated_at = now();

    for v_sub in select * from jsonb_array_elements(v_item->'subs')
    loop
      if not exists (
        select 1 from public.subtopics st
        where st.topic_id = v_topic and st.name = v_sub->>'name'
      ) then
        insert into public.subtopics (topic_id, name, term, order_index, status)
        values (v_topic, v_sub->>'name', (v_sub->>'term')::int,
                (v_sub->>'order')::int, 'active');
        v_new_s := v_new_s + 1;
      end if;

      insert into public.subtopic_translations (subtopic_id, locale, name)
      -- Explicit cast: `locale` is the content_locale ENUM, and a column coming
      -- out of a VALUES list arrives as text. A bare literal coerces from
      -- unknown, a derived column does not.
      select st.id, x.locale::content_locale, x.nm
      from public.subtopics st
      cross join (values ('en', v_sub->>'en'), ('ru', v_sub->>'ru')) as x(locale, nm)
      where st.topic_id = v_topic and st.name = v_sub->>'name'
      on conflict (subtopic_id, locale) do update set name = excluded.name, updated_at = now();
    end loop;
  end loop;

  raise notice '151: inserted % topic(s) and % subtopic(s) for Azərbaycan dili',
    v_new_t, v_new_s;
end $$;

-- -----------------------------------------------------------------------------
-- PRICING. The owner's instruction was "make it the same as the others" — every
-- other sold subject is 3 / 9 / 90 AZN per child. Guarded by the natural key so
-- an admin's later change through the Pricing page is never overwritten.
-- -----------------------------------------------------------------------------
insert into public.subjects_pricing (subject_id, interval, price_amount, currency, status)
select s.id, v.iv::plan_interval, v.amt, 'AZN', 'active'::catalog_status
from public.subjects s
cross join (values ('week', 3.00), ('month', 9.00), ('year', 90.00)) as v(iv, amt)
where s.code = 'azerbaycan_dili'
on conflict (subject_id, "interval") do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION, including the leftovers this migration deliberately kept.
-- -----------------------------------------------------------------------------
do $$
declare
  v_t        int;
  v_s        int;
  v_en       int;
  v_ru       int;
  v_prices   int;
  v_orphans  int;
  v_orphan_q int;
begin
  select count(distinct t.id), count(st.id)
    into v_t, v_s
  from public.topics t
  join public.subjects s on s.id = t.subject_id and s.code = 'azerbaycan_dili'
  left join public.subtopics st on st.topic_id = t.id
  where t.scope = 'exam';

  if v_t <> 44 then raise exception '151: expected 44 topics, found %', v_t; end if;
  if v_s <> 88 then raise exception '151: expected 88 subtopics, found %', v_s; end if;

  select count(*) filter (where tt.locale = 'en'), count(*) filter (where tt.locale = 'ru')
    into v_en, v_ru
  from public.topic_translations tt
  join public.topics t on t.id = tt.topic_id
  join public.subjects s on s.id = t.subject_id and s.code = 'azerbaycan_dili';
  if v_en <> 44 or v_ru <> 44 then
    raise exception '151: topic translations en=% ru=%, expected 44 each', v_en, v_ru;
  end if;

  select count(*) into v_prices
  from public.subjects_pricing p
  join public.subjects s on s.id = p.subject_id and s.code = 'azerbaycan_dili';
  if v_prices < 3 then
    raise exception '151: Azərbaycan dili has % price rows, expected 3', v_prices;
  end if;

  -- The number that must stay visible: subtopics NOT in the 2026 file, and the
  -- questions hanging off them. Deleting these was considered and refused.
  select count(*), coalesce(sum(q.n), 0)
    into v_orphans, v_orphan_q
  from public.subtopics st
  join public.topics t on t.id = st.topic_id and t.scope = 'exam'
  join lateral (select count(*) as n from public.questions q where q.subtopic_id = st.id) q on true
  where not exists (
    select 1 from public.subtopic_translations x
    where x.subtopic_id = st.id and x.locale = 'en'
  );

  raise notice '151: Azərbaycan dili ready — % topics, % subtopics, en/ru complete, 3 prices',
    v_t, v_s;
  raise notice '151: KEPT % subtopic(s) outside the 2026 file, carrying % question(s). Not deleted by design.',
    v_orphans, v_orphan_q;
end $$;

commit;
