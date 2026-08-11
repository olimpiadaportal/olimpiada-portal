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
    "bulk.fiveRule":
      "Hər sualda düz 5 cavab variantı (A–E) və düz 1 düzgün cavab olmalıdır.",
    "bulk.generalMeta":
      "Hər sətirdə meta.topic, meta.subtopic və meta.term (1–4) mütləqdir; meta.type istəyə bağlıdır (standart: single_choice).",
    "bulk.chooseTerm": "Rüb seçin — bütün suallara tətbiq olunacaq.",
    "bulk.termNote":
      "Rüb kurikulumda mövzuya bağlıdır: meta.term həmin mövzunun rübü ilə eyni olmalıdır, əks halda sətir idxal edilmir.",
    "bulk.mediaHint":
      "İstəyə bağlı meta.media_asset_id — əvvəlcədən yüklənmiş sual şəklinin (question-media) UUID-si; şəkil əsas dilin mətninə bağlanır.",
    "bulk.err.topicRequired": "meta.topic tələb olunur",
    "bulk.err.subtopicRequired": "meta.subtopic tələb olunur",
    "bulk.err.termRequired": "rüb (1–4) tələb olunur",
    "bulk.err.termConflict": "rüb mövcud mövzunun rübü ilə uyğun gəlmir",
    "bulk.err.badMedia":
      "meta.media_asset_id düzgün sual şəklinə istinad etmir",
    "bulk.err.badImage":
      "şəkil faylı oxunmadı — ZIP-dəki faylı yoxlayın",
    "bulk.err.imageType":
      "şəkil formatı dəstəklənmir — yalnız PNG, JPEG, WEBP və ya GIF",
    "bulk.err.imageTooLarge": "şəkil çox böyükdür — hər şəkil ən çox 5 MB",
    "bulk.err.mediaNotAllowed":
      "bu faylda şəkil var, amma «Yalnız yazılı sual» rejimi seçilib — «Qarışıq sual» rejimini seçin",
    "bulk.err.imageTotal":
      "fayldakı şəkillərin ümumi həcmi hədi aşır — ən çox 40 MB",
    "bulk.err.imageUpload":
      "şəkil yüklənə bilmədi — yenidən cəhd edin",
    "bulk.err.needZip": "Qarışıq suallar üçün ZIP faylı yükləyin.",
    "bulk.err.zipUnreadable": "ZIP faylı oxunmadı — fayl zədələnib və ya ZIP deyil.",
    "bulk.err.zipUnsupported":
      "Bu ZIP dəstəklənmir (şifrələnmiş, ZIP64 və ya naməlum sıxılma). Adi ZIP kimi yenidən yığın.",
    "bulk.err.zipTooLarge": "ZIP faylı çox böyükdür — maksimum 40 MB.",
    "bulk.err.zipEntries": "ZIP-də həddindən çox fayl var — maksimum 600.",
    "bulk.err.zipBadPath":
      "ZIP-də yolu düzgün olmayan fayl var — qovluq adlarında «..» və mütləq yol ola bilməz.",
    "bulk.err.zipNoJson": "ZIP faylında questions.json tapılmadı.",
    "bulk.err.zipManyJson": "ZIP-də bir neçə questions.json var — yalnız biri olmalıdır.",
    "bulk.err.badImagePath":
      "şəkil yolu düzgün deyil — questions.json-un yanındakı fayla nisbi yol olmalıdır (məsələn images/q1.png)",
    "bulk.err.imageMissing": "{file} ZIP faylında tapılmadı",
    "bulk.err.imageAmbiguous":
      "ZIP-də {file} adına uyğun bir neçə fayl var — fayl adlarını dəqiqləşdirin",
    "bulk.err.zipUnusedImages":
      "ZIP-də istifadə olunmayan şəkillər var: {files}. Hər şəkil questions.json-dan istinad edilməlidir.",
    "bulk.err.imageNotUploaded":
      "şəkil yüklənməyib — faylı yenidən seçib idxalı təkrarlayın",
    "bulk.err.duplicate":
      "bu sual artıq bu sinfin hovuzundadır (mətn və variantlar eynidir) — təkrar əlavə edilmədi",
    "bulk.fileLabelZip": "Suallar ZIP faylı",
    "bulk.fileHintZip":
      ".zip fayl yükləyin: questions.json + images/ qovluğu. Hər ZIP üçün maksimum 40 MB, hər şəkil 5 MB (hər sinif öz ZIP faylını yükləyir).",
    "bulk.zipLayout":
      "ZIP-in daxili quruluşu belə olmalıdır:\nmixed_questions.zip\n  questions.json\n  images/q1.png\n  images/q1_option_1.png",
    "bulk.uploadingMedia": "Şəkillər yüklənir…",
    "bulk.mode.label": "İdxal növü",
    "bulk.mode.required":
      "İdxal növünü seçin. Davam etmək üçün sualların yalnız yazılı və ya qarışıq formatda olduğunu göstərməlisiniz.",
    "bulk.mode.text": "Yalnız yazılı sual",
    "bulk.mode.textHint": "Suallar və cavab variantları yalnız mətndən ibarətdir.",
    "bulk.mode.mixed": "Qarışıq sual",
    "bulk.mode.mixedHint":
      "Bəzi suallarda və ya cavab variantlarında şəkil var. Şəkilli suallar ZIP faylı ilə idxal olunur.",
    "bulk.mode.mixedNote":
      "Şəkilli suallar ZIP faylı ilə idxal olunur. ZIP daxilində questions.json və images/ qovluğu olmalıdır.",
    "olybulk.optionalMeta":
      "Olimpiada idxalında meta.topic / meta.subtopic / meta.term istəyə bağlıdır.",
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
    "bulk.fiveRule":
      "Each question needs exactly 5 answer options (A–E) with exactly 1 correct.",
    "bulk.generalMeta":
      "Every row requires meta.topic, meta.subtopic and meta.term (1–4); meta.type is optional (defaults to single_choice).",
    "bulk.chooseTerm": "Pick the term — it applies to every question.",
    "bulk.termNote":
      "In the curriculum the term belongs to the topic: meta.term must equal that topic's term, otherwise the row is rejected.",
    "bulk.mediaHint":
      "Optional meta.media_asset_id — the UUID of a pre-uploaded question image (question-media); it is attached to the primary language.",
    "bulk.err.topicRequired": "meta.topic is required",
    "bulk.err.subtopicRequired": "meta.subtopic is required",
    "bulk.err.termRequired": "term (1..4) is required",
    "bulk.err.termConflict": "the term conflicts with the topic's existing term",
    "bulk.err.badMedia":
      "meta.media_asset_id does not reference a valid question image",
    "bulk.err.badImage":
      "the image file could not be read — check the file in the ZIP",
    "bulk.err.imageType":
      "unsupported image format — only PNG, JPEG, WEBP or GIF",
    "bulk.err.imageTooLarge": "image too large — 5 MB maximum per image",
    "bulk.err.mediaNotAllowed":
      "this file contains images but “Text-only questions” is selected — choose “Mixed questions”",
    "bulk.err.imageTotal":
      "the images in this file exceed the total limit — 40 MB maximum",
    "bulk.err.imageUpload": "the image could not be uploaded — please try again",
    "bulk.err.needZip": "Upload a ZIP file for mixed questions.",
    "bulk.err.zipUnreadable":
      "The ZIP file could not be read — it is damaged or not a ZIP.",
    "bulk.err.zipUnsupported":
      "This ZIP is not supported (encrypted, ZIP64 or an unknown compression method). Re-create it as a plain ZIP.",
    "bulk.err.zipTooLarge": "The ZIP file is too large — 40 MB maximum.",
    "bulk.err.zipEntries": "The ZIP contains too many files — 600 maximum.",
    "bulk.err.zipBadPath":
      "The ZIP contains a file with an invalid path — folder names cannot contain “..” or an absolute path.",
    "bulk.err.zipNoJson": "No questions.json was found in the ZIP.",
    "bulk.err.zipManyJson":
      "The ZIP contains several questions.json files — there must be exactly one.",
    "bulk.err.badImagePath":
      "invalid image path — it must be a relative path from the folder holding questions.json (for example images/q1.png)",
    "bulk.err.imageMissing": "{file} is not in the ZIP",
    "bulk.err.imageAmbiguous":
      "several files in the ZIP match {file} — make the file names distinct",
    "bulk.err.zipUnusedImages":
      "The ZIP contains unused images: {files}. Every image must be referenced from questions.json.",
    "bulk.err.imageNotUploaded":
      "the image was not uploaded — choose the file again and repeat the import",
    "bulk.err.duplicate":
      "this question is already in this grade's pool (same text and options) — it was not added again",
    "bulk.fileLabelZip": "Questions ZIP file",
    "bulk.fileHintZip":
      "Upload a .zip file: questions.json plus an images/ folder. Max 40 MB per ZIP (each grade uploads its own), 5 MB per image.",
    "bulk.zipLayout":
      "The ZIP must be laid out like this:\nmixed_questions.zip\n  questions.json\n  images/q1.png\n  images/q1_option_1.png",
    "bulk.uploadingMedia": "Uploading images…",
    "bulk.mode.label": "Import type",
    "bulk.mode.required":
      "Choose the import type. To continue you must state whether the questions are text-only or mixed.",
    "bulk.mode.text": "Text-only questions",
    "bulk.mode.textHint": "Questions and answer options contain text only.",
    "bulk.mode.mixed": "Mixed questions",
    "bulk.mode.mixedHint":
      "Some questions or answer options contain images. Mixed questions are imported as a ZIP file.",
    "bulk.mode.mixedNote":
      "Mixed questions are imported as a ZIP file. The ZIP must contain questions.json and an images/ folder.",
    "olybulk.optionalMeta":
      "In olympiad imports meta.topic / meta.subtopic / meta.term are optional.",
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
    "bulk.fiveRule":
      "У каждого вопроса должно быть ровно 5 вариантов ответа (A–E) и ровно 1 правильный.",
    "bulk.generalMeta":
      "В каждой строке обязательны meta.topic, meta.subtopic и meta.term (1–4); meta.type необязателен (по умолчанию single_choice).",
    "bulk.chooseTerm": "Выберите четверть — она применится ко всем вопросам.",
    "bulk.termNote":
      "В учебной программе четверть привязана к теме: meta.term должен совпадать с четвертью этой темы, иначе строка не импортируется.",
    "bulk.mediaHint":
      "Необязательный meta.media_asset_id — UUID заранее загруженного изображения вопроса (question-media); привязывается к основному языку.",
    "bulk.err.topicRequired": "требуется meta.topic",
    "bulk.err.subtopicRequired": "требуется meta.subtopic",
    "bulk.err.termRequired": "требуется четверть (1–4)",
    "bulk.err.termConflict": "четверть не совпадает с четвертью темы",
    "bulk.err.badMedia":
      "meta.media_asset_id не ссылается на корректное изображение вопроса",
    "bulk.err.badImage":
      "не удалось прочитать изображение — проверьте файл в ZIP",
    "bulk.err.imageType":
      "формат изображения не поддерживается — только PNG, JPEG, WEBP или GIF",
    "bulk.err.imageTooLarge": "изображение слишком большое — максимум 5 МБ на изображение",
    "bulk.err.mediaNotAllowed":
      "в файле есть изображения, но выбран режим «Только текстовые вопросы» — выберите «Смешанные вопросы»",
    "bulk.err.imageTotal":
      "суммарный объём изображений в файле превышает лимит — максимум 40 МБ",
    "bulk.err.imageUpload": "не удалось загрузить изображение — попробуйте ещё раз",
    "bulk.err.needZip": "Для смешанных вопросов загрузите ZIP-файл.",
    "bulk.err.zipUnreadable":
      "Не удалось прочитать ZIP-файл — он повреждён или это не ZIP.",
    "bulk.err.zipUnsupported":
      "Этот ZIP не поддерживается (зашифрован, ZIP64 или неизвестный метод сжатия). Создайте обычный ZIP заново.",
    "bulk.err.zipTooLarge": "ZIP-файл слишком большой — максимум 40 МБ.",
    "bulk.err.zipEntries": "В ZIP слишком много файлов — максимум 600.",
    "bulk.err.zipBadPath":
      "В ZIP есть файл с некорректным путём — в именах папок недопустимы «..» и абсолютный путь.",
    "bulk.err.zipNoJson": "В ZIP-файле не найден questions.json.",
    "bulk.err.zipManyJson":
      "В ZIP несколько файлов questions.json — должен быть ровно один.",
    "bulk.err.badImagePath":
      "некорректный путь к изображению — нужен относительный путь от папки с questions.json (например images/q1.png)",
    "bulk.err.imageMissing": "{file} отсутствует в ZIP",
    "bulk.err.imageAmbiguous":
      "в ZIP несколько файлов совпадают с {file} — сделайте имена файлов различимыми",
    "bulk.err.zipUnusedImages":
      "В ZIP есть неиспользуемые изображения: {files}. На каждое изображение должна быть ссылка в questions.json.",
    "bulk.err.imageNotUploaded":
      "изображение не загружено — выберите файл заново и повторите импорт",
    "bulk.err.duplicate":
      "этот вопрос уже есть в пуле этого класса (тот же текст и варианты) — повторно не добавлен",
    "bulk.fileLabelZip": "ZIP-файл вопросов",
    "bulk.fileHintZip":
      "Загрузите файл .zip: questions.json и папка images/. Максимум 40 МБ на один ZIP (каждый класс загружает свой), 5 МБ на изображение.",
    "bulk.zipLayout":
      "Структура ZIP должна быть такой:\nmixed_questions.zip\n  questions.json\n  images/q1.png\n  images/q1_option_1.png",
    "bulk.uploadingMedia": "Загрузка изображений…",
    "bulk.mode.label": "Тип импорта",
    "bulk.mode.required":
      "Выберите тип импорта. Чтобы продолжить, укажите, содержат ли вопросы только текст или являются смешанными.",
    "bulk.mode.text": "Только текстовые вопросы",
    "bulk.mode.textHint": "Вопросы и варианты ответов содержат только текст.",
    "bulk.mode.mixed": "Смешанные вопросы",
    "bulk.mode.mixedHint":
      "В некоторых вопросах или вариантах ответа есть изображения. Смешанные вопросы импортируются ZIP-файлом.",
    "bulk.mode.mixedNote":
      "Смешанные вопросы импортируются ZIP-файлом. Внутри ZIP должны быть questions.json и папка images/.",
    "olybulk.optionalMeta":
      "В олимпиадном импорте meta.topic / meta.subtopic / meta.term необязательны.",
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
