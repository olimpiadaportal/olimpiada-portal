import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Round-21 admin question-flow overhaul
// (Rüb/term everywhere, fixed A–E options, question image in the create modal,
// review chips, daily-round readiness, bulk import v3). They are NOT yet in the
// shared dictionary (admin-panel/src/i18n/messages.ts) — kept here so the UI is
// fully trilingual today; they should be migrated into messages.ts by the agent
// that owns admin message additions (reported in followups). Once a key exists
// in messages.ts it wins automatically (see the merge helpers below).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "term.1": "1-ci rüb",
    "term.2": "2-ci rüb",
    "term.3": "3-cü rüb",
    "term.4": "4-cü rüb",
    "term.review": "Baxılmalı",
    "qfield.term": "Rüb",
    "field.term": "Rüb",
    "qfilter.allTerms": "Bütün rüblər",
    "qfilter.noTerm": "Rübsüz (baxılmalı)",
    "qerr.topicRequired": "Mövzu seçilməlidir.",
    "qerr.subtopicRequired": "Alt mövzu seçilməlidir.",
    "qerr.termRequired": "Rüb seçilməlidir (1–4).",
    "qerr.taxonomyMismatch":
      "Mövzu seçilmiş fənnə və sinfə uyğun deyil. Mövzu və alt mövzunu yenidən seçin.",
    "qerr.fiveOptions": "5 cavab variantının hamısı (A–E) doldurulmalıdır.",
    "qerr.oneCorrect": "Düzgün cavab seçilməlidir.",
    "qform.termLegacy":
      "Bu mövzunun rübü hələ təyin edilməyib — rüb seçin (seçim mövzuya da yazılacaq).",
    "qform.statusNote": "Yeni suallar «Baxılır» statusu ilə yaradılır.",
    "qform.noTopicsForSelection":
      "Bu fənn və sinif üçün mövzu yoxdur. Əvvəlcə «Mövzular» bölməsində mövzu yaradın.",
    "qimg.title": "Sual şəkli",
    "qimg.choose": "Şəkil seç",
    "qimg.replace": "Şəkli dəyiş",
    "qimg.remove": "Şəkli sil",
    "qimg.optional": "istəyə bağlı",
    "qimg.hint":
      "PNG, JPEG, WebP və ya GIF, maksimum 5 MB. Şəkil sualla birlikdə yadda saxlanılır.",
    "qimg.invalid": "Şəkil faylı uyğun deyil (PNG/JPEG/WebP/GIF, maks. 5 MB).",
    "qimg.uploadFailed": "Şəkli yükləmək mümkün olmadı. Yenidən cəhd edin.",
    "qchip.needsOptionE": "E variantı çatışmır",
    "qchip.needsTerm": "Rüb təyin edilməyib",
    "ready.title": "Günlük raund hazırlığı",
    "ready.subtitle":
      "Cari rüb üzrə hər fənn × sinif üçün uyğun sual sayı (dərc olunmuş, 5 variantlı, rüblü). 25-dən az olan xanalar qırmızı göstərilir.",
    "ready.short": "{n} xana 25-dən aşağıdır",
    "ready.allOk": "Bütün xanalar hazırdır (25+)",
    "ready.empty": "Məlumat yoxdur.",
    "bulk.fiveRule":
      "Hər sualda düz 5 cavab variantı (A–E) və düz 1 düzgün cavab olmalıdır.",
    "bulk.generalMeta":
      "Hər sətirdə meta.topic, meta.subtopic və meta.term (1–4) mütləqdir; meta.type istəyə bağlıdır (standart: single_choice).",
    "bulk.mediaHint":
      "İstəyə bağlı meta.media_asset_id — əvvəlcədən yüklənmiş sual şəklinin (question-media) UUID-si; şəkil əsas dilin mətninə bağlanır.",
    "bulk.err.topicRequired": "meta.topic tələb olunur",
    "bulk.err.subtopicRequired": "meta.subtopic tələb olunur",
    "bulk.err.termRequired": "rüb (1–4) tələb olunur",
    "bulk.err.termConflict": "rüb mövcud mövzunun rübü ilə uyğun gəlmir",
    "bulk.err.badMedia":
      "meta.media_asset_id düzgün sual şəklinə istinad etmir",
    "olybulk.optionalMeta":
      "Olimpiada idxalında meta.topic / meta.subtopic / meta.term istəyə bağlıdır.",
    "olybulk.err.creationOnly":
      "Bu paketdə artıq suallar var — toplu yükləmə yalnız paket yaradılarkən mümkündür.",
    // trg_question_delete_guard (migration 063): answered questions can never
    // be hard-deleted — grading history would vanish.
    "qdel.hasAttempts":
      "Bu suala artıq cavablar verilib, ona görə silmək mümkün deyil — bunun əvəzinə sualı arxivləşdirin və ya dövriyyədən çıxarın.",
    // Round 22 — edit-in-modal on /questions.
    "qedit.loading": "Sual yüklənir…",
    "qedit.loadFailed": "Sualı yükləmək mümkün olmadı. Yenidən cəhd edin.",
    "qedit.notFound": "Sual tapılmadı.",
  },
  en: {
    "term.1": "Term 1",
    "term.2": "Term 2",
    "term.3": "Term 3",
    "term.4": "Term 4",
    "term.review": "Needs review",
    "qfield.term": "Term",
    "field.term": "Term",
    "qfilter.allTerms": "All terms",
    "qfilter.noTerm": "No term (needs review)",
    "qerr.topicRequired": "Topic is required.",
    "qerr.subtopicRequired": "Subtopic is required.",
    "qerr.termRequired": "Term (1–4) is required.",
    "qerr.taxonomyMismatch":
      "The topic does not match the selected subject and grade. Re-select the topic and subtopic.",
    "qerr.fiveOptions": "All 5 answer options (A–E) must be filled in.",
    "qerr.oneCorrect": "Select the correct answer.",
    "qform.termLegacy":
      "This topic has no term yet — pick one (it will be saved to the topic too).",
    "qform.statusNote": "New questions are created with the “In review” status.",
    "qform.noTopicsForSelection":
      "No topics exist for this subject and grade. Create one under Topics first.",
    "qimg.title": "Question image",
    "qimg.choose": "Choose image",
    "qimg.replace": "Replace image",
    "qimg.remove": "Remove image",
    "qimg.optional": "optional",
    "qimg.hint":
      "PNG, JPEG, WebP or GIF, up to 5 MB. The image is saved together with the question.",
    "qimg.invalid": "Invalid image file (PNG/JPEG/WebP/GIF, max 5 MB).",
    "qimg.uploadFailed": "Could not upload the image. Try again.",
    "qchip.needsOptionE": "Needs option E",
    "qchip.needsTerm": "Needs term",
    "ready.title": "Daily round readiness",
    "ready.subtitle":
      "Eligible questions per subject × grade for the current term (published, 5 options, with a term). Cells below 25 are highlighted in red.",
    "ready.short": "{n} cells below 25",
    "ready.allOk": "All cells ready (25+)",
    "ready.empty": "No data.",
    "bulk.fiveRule":
      "Each question needs exactly 5 answer options (A–E) with exactly 1 correct.",
    "bulk.generalMeta":
      "Every row requires meta.topic, meta.subtopic and meta.term (1–4); meta.type is optional (defaults to single_choice).",
    "bulk.mediaHint":
      "Optional meta.media_asset_id — the UUID of a pre-uploaded question image (question-media); it is attached to the primary language.",
    "bulk.err.topicRequired": "meta.topic is required",
    "bulk.err.subtopicRequired": "meta.subtopic is required",
    "bulk.err.termRequired": "term (1..4) is required",
    "bulk.err.termConflict": "the term conflicts with the topic's existing term",
    "bulk.err.badMedia":
      "meta.media_asset_id does not reference a valid question image",
    "olybulk.optionalMeta":
      "In olympiad imports meta.topic / meta.subtopic / meta.term are optional.",
    "olybulk.err.creationOnly":
      "This package already has questions — bulk upload is only possible while creating a package.",
    "qdel.hasAttempts":
      "This question already has answer history, so it cannot be deleted — archive or withdraw it instead.",
    // Round 22 — edit-in-modal on /questions.
    "qedit.loading": "Loading the question…",
    "qedit.loadFailed": "Could not load the question. Try again.",
    "qedit.notFound": "Question not found.",
  },
  ru: {
    "term.1": "1-я четверть",
    "term.2": "2-я четверть",
    "term.3": "3-я четверть",
    "term.4": "4-я четверть",
    "term.review": "Требует проверки",
    "qfield.term": "Четверть",
    "field.term": "Четверть",
    "qfilter.allTerms": "Все четверти",
    "qfilter.noTerm": "Без четверти (требует проверки)",
    "qerr.topicRequired": "Тема обязательна.",
    "qerr.subtopicRequired": "Подтема обязательна.",
    "qerr.termRequired": "Четверть (1–4) обязательна.",
    "qerr.taxonomyMismatch":
      "Тема не соответствует выбранным предмету и классу. Выберите тему и подтему заново.",
    "qerr.fiveOptions": "Все 5 вариантов ответа (A–E) должны быть заполнены.",
    "qerr.oneCorrect": "Выберите правильный ответ.",
    "qform.termLegacy":
      "У этой темы ещё нет четверти — выберите её (она сохранится и для темы).",
    "qform.statusNote": "Новые вопросы создаются со статусом «На проверке».",
    "qform.noTopicsForSelection":
      "Для этого предмета и класса нет тем. Сначала создайте тему в разделе «Темы».",
    "qimg.title": "Изображение вопроса",
    "qimg.choose": "Выбрать изображение",
    "qimg.replace": "Заменить изображение",
    "qimg.remove": "Удалить изображение",
    "qimg.optional": "необязательно",
    "qimg.hint":
      "PNG, JPEG, WebP или GIF, до 5 МБ. Изображение сохраняется вместе с вопросом.",
    "qimg.invalid":
      "Неподходящий файл изображения (PNG/JPEG/WebP/GIF, макс. 5 МБ).",
    "qimg.uploadFailed": "Не удалось загрузить изображение. Попробуйте ещё раз.",
    "qchip.needsOptionE": "Не хватает варианта E",
    "qchip.needsTerm": "Не указана четверть",
    "ready.title": "Готовность ежедневного раунда",
    "ready.subtitle":
      "Подходящие вопросы по предметам и классам за текущую четверть (опубликованные, 5 вариантов, с четвертью). Ячейки меньше 25 выделены красным.",
    "ready.short": "{n} ячеек ниже 25",
    "ready.allOk": "Все ячейки готовы (25+)",
    "ready.empty": "Нет данных.",
    "bulk.fiveRule":
      "У каждого вопроса должно быть ровно 5 вариантов ответа (A–E) и ровно 1 правильный.",
    "bulk.generalMeta":
      "В каждой строке обязательны meta.topic, meta.subtopic и meta.term (1–4); meta.type необязателен (по умолчанию single_choice).",
    "bulk.mediaHint":
      "Необязательный meta.media_asset_id — UUID заранее загруженного изображения вопроса (question-media); привязывается к основному языку.",
    "bulk.err.topicRequired": "требуется meta.topic",
    "bulk.err.subtopicRequired": "требуется meta.subtopic",
    "bulk.err.termRequired": "требуется четверть (1–4)",
    "bulk.err.termConflict": "четверть не совпадает с четвертью темы",
    "bulk.err.badMedia":
      "meta.media_asset_id не ссылается на корректное изображение вопроса",
    "olybulk.optionalMeta":
      "В олимпиадном импорте meta.topic / meta.subtopic / meta.term необязательны.",
    "olybulk.err.creationOnly":
      "В этом пакете уже есть вопросы — массовая загрузка возможна только при создании пакета.",
    "qdel.hasAttempts":
      "На этот вопрос уже отвечали, поэтому его нельзя удалить — вместо этого отправьте его в архив или выведите из оборота.",
    // Round 22 — edit-in-modal on /questions.
    "qedit.loading": "Вопрос загружается…",
    "qedit.loadFailed": "Не удалось загрузить вопрос. Попробуйте ещё раз.",
    "qedit.notFound": "Вопрос не найден.",
  },
};

// Standalone lookup (az fallback, then the key itself).
export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

// Wraps a getT() translator so the local strings above fill only the keys
// messages.ts does not know yet (messages.ts always wins once a key lands).
export function withLocalStrings(
  t: (key: string) => string,
  locale: Locale,
): (key: string) => string {
  const lt = localStrings(locale);
  return (key: string) => {
    const v = t(key);
    return v === key ? lt(key) : v;
  };
}

// Merges the local strings under a client dict (getDict()) — existing
// messages.ts keys win; only the missing ones come from here.
export function mergeLocalDict(
  dict: Record<string, string>,
  locale: Locale,
): Record<string, string> {
  return { ...STRINGS.az, ...(STRINGS[locale] ?? {}), ...dict };
}
