import type { Locale } from "@/i18n/config";

// Local trilingual strings for the olympiad-package QUESTION POOL manager
// (Round 21 item 2: per-question add/edit/archive/delete inside a package).
// Mirrors the established labels.ts pattern (cities/districts/settings): NOT
// yet in the shared dictionary (admin-panel/src/i18n/messages.ts); these should
// be migrated into messages.ts by the agent that owns admin message additions
// (reported in followups). Plain module (no "use server") so both the server
// pages/actions (lib/admin/olympiad.ts) and this route's pages can import it.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "olyq.allGrades": "Bütün siniflər",
    // ---- pool section on the package edit page ----
    "olyq.manageNote":
      "Sualları aşağıda tək-tək əlavə edib redaktə edə bilərsiniz; toplu yükləmə yalnız paket yaradılarkən mümkündür.",
    "olyq.archivedNote":
      "Arxivlənmiş suallar yeni cəhdlərə düşmür; keçmiş nəticələr oxunaqlı qalır.",
    "olyq.add": "Yeni sual",
    "olyq.search": "Sual mətnində axtar…",
    "olyq.empty": "Bu paketdə hələ sual yoxdur.",
    "olyq.noMatch": "Axtarışa uyğun sual tapılmadı.",
    "olyq.col.num": "№",
    "olyq.col.body": "Sual",
    "olyq.col.options": "Variantlar",
    "olyq.col.image": "Şəkil",
    "olyq.col.status": "Status",
    "olyq.col.updated": "Yenilənib",
    "olyq.col.actions": "Əməliyyatlar",
    "olyq.optWarnTitle": "Düz 5 variant (A–E) olmalıdır",
    "olyq.imgYes": "Şəkil var",
    "olyq.status.published": "Dərc edilib",
    "olyq.status.archived": "Arxivdə",
    "olyq.status.in_review": "Baxılır",
    "olyq.status.rejected": "Rədd edilib",
    "olyq.status.draft": "Qaralama",
    "olyq.status.approved": "Təsdiqlənib",
    "olyq.edit": "Redaktə et",
    "olyq.delete": "Sil",
    "olyq.archive": "Arxivləşdir",
    "olyq.restore": "Bərpa et",
    "olyq.confirmDelete":
      "Bu sual paketdən birdəfəlik silinəcək. Davam edilsin?",
    "olyq.loadFailed": "Sualı yükləmək mümkün olmadı. Yenidən cəhd edin.",
    // ---- editor modal ----
    "olyq.new.title": "Yeni sual",
    "olyq.edit.title": "Sualı redaktə et",
    "olyq.subject": "Fənn",
    "olyq.grade": "Sinif",
    "olyq.fixedNote": "Fənn və sinif paketdən götürülür.",
    "olyq.topic": "Mövzu (istəyə bağlı)",
    "olyq.subtopic": "Alt mövzu (istəyə bağlı)",
    "olyq.noTopics": "Bu fənn üçün olimpiada mövzusu yoxdur.",
    "olyq.none": "— seçilməyib —",
    "olyq.trilingualNote":
      "Azərbaycan dili mütləqdir; ingilis və rus dilləri istəyə bağlıdır. Dil əlavə etmək üçün həmin dilin mətnini doldurun.",
    "olyq.body": "Sualın mətni",
    "olyq.prompt": "Sual cümləsi",
    "olyq.explanation": "İzah",
    "olyq.options": "Cavab variantları (A–E)",
    "olyq.correct": "Düzgün",
    "olyq.correctHint":
      "Hər sualda düz 5 variant (A–E) və düz 1 düzgün cavab olur.",
    "olyq.img.title": "Sual şəkli (istəyə bağlı)",
    "olyq.img.choose": "Şəkil seç",
    "olyq.img.replace": "Şəkli dəyiş",
    "olyq.img.remove": "Şəkli sil",
    "olyq.img.undo": "Geri qaytar",
    "olyq.img.willRemove": "Şəkil yadda saxlanarkən silinəcək.",
    "olyq.img.hint": "PNG, JPEG, WebP və ya GIF, maksimum 5 MB.",
    "olyq.img.invalid":
      "Şəkil faylı uyğun deyil (PNG/JPEG/WebP/GIF, maks. 5 MB).",
    "olyq.img.uploadFailed":
      "Şəkli yükləmək mümkün olmadı. Yenidən cəhd edin.",
    "olyq.save": "Yadda saxla",
    "olyq.saving": "Yadda saxlanılır…",
    "olyq.close": "Bağla",
    // ---- validation / server errors ----
    "olyq.err.azBody": "Azərbaycanca sual mətni mütləqdir.",
    "olyq.err.localeIncomplete":
      "{lang}: dil əlavə olunubsa, sual mətni və 5 variantın hamısı doldurulmalıdır.",
    "olyq.err.fiveOptions":
      "5 cavab variantının hamısı (A–E) doldurulmalıdır.",
    "olyq.err.oneCorrect": "Düzgün cavab seçilməlidir.",
    "olyq.err.taxonomy":
      "Mövzu bu paketin fənninə uyğun deyil. Mövzu və alt mövzunu yenidən seçin.",
    "olyq.err.hasAttempts":
      "Bu suala artıq cavablar verilib, ona görə silmək mümkün deyil — bunun əvəzinə sualı arxivləşdirin.",
  },
  en: {
    "olyq.allGrades": "All grades",
    "olyq.manageNote":
      "Add and edit questions one by one below; bulk upload is only available while creating the package.",
    "olyq.archivedNote":
      "Archived questions are excluded from new attempts; past results stay readable.",
    "olyq.add": "Add question",
    "olyq.search": "Search question text…",
    "olyq.empty": "No questions in this package yet.",
    "olyq.noMatch": "No questions match the search.",
    "olyq.col.num": "#",
    "olyq.col.body": "Question",
    "olyq.col.options": "Options",
    "olyq.col.image": "Image",
    "olyq.col.status": "Status",
    "olyq.col.updated": "Updated",
    "olyq.col.actions": "Actions",
    "olyq.optWarnTitle": "Must have exactly 5 options (A–E)",
    "olyq.imgYes": "Has an image",
    "olyq.status.published": "Published",
    "olyq.status.archived": "Archived",
    "olyq.status.in_review": "In review",
    "olyq.status.rejected": "Rejected",
    "olyq.status.draft": "Draft",
    "olyq.status.approved": "Approved",
    "olyq.edit": "Edit",
    "olyq.delete": "Delete",
    "olyq.archive": "Archive",
    "olyq.restore": "Restore",
    "olyq.confirmDelete":
      "This question will be permanently deleted from the package. Continue?",
    "olyq.loadFailed": "Could not load the question. Try again.",
    "olyq.new.title": "New question",
    "olyq.edit.title": "Edit question",
    "olyq.subject": "Subject",
    "olyq.grade": "Grade",
    "olyq.fixedNote": "Subject and grade are inherited from the package.",
    "olyq.topic": "Topic (optional)",
    "olyq.subtopic": "Subtopic (optional)",
    "olyq.noTopics": "No olympiad topics exist for this subject.",
    "olyq.none": "— none —",
    "olyq.trilingualNote":
      "Azerbaijani is required; English and Russian are optional. To add a language, fill in its text.",
    "olyq.body": "Question text",
    "olyq.prompt": "Prompt",
    "olyq.explanation": "Explanation",
    "olyq.options": "Answer options (A–E)",
    "olyq.correct": "Correct",
    "olyq.correctHint":
      "Each question has exactly 5 options (A–E) with exactly 1 correct answer.",
    "olyq.img.title": "Question image (optional)",
    "olyq.img.choose": "Choose image",
    "olyq.img.replace": "Replace image",
    "olyq.img.remove": "Remove image",
    "olyq.img.undo": "Undo",
    "olyq.img.willRemove": "The image will be removed when you save.",
    "olyq.img.hint": "PNG, JPEG, WebP or GIF, up to 5 MB.",
    "olyq.img.invalid": "Invalid image file (PNG/JPEG/WebP/GIF, max 5 MB).",
    "olyq.img.uploadFailed": "Could not upload the image. Try again.",
    "olyq.save": "Save",
    "olyq.saving": "Saving…",
    "olyq.close": "Close",
    "olyq.err.azBody": "The Azerbaijani question text is required.",
    "olyq.err.localeIncomplete":
      "{lang}: when a language is added, its question text and all 5 options must be filled in.",
    "olyq.err.fiveOptions": "All 5 answer options (A–E) must be filled in.",
    "olyq.err.oneCorrect": "Select the correct answer.",
    "olyq.err.taxonomy":
      "The topic does not match this package's subject. Re-select the topic and subtopic.",
    "olyq.err.hasAttempts":
      "This question already has answer history, so it cannot be deleted — archive it instead.",
  },
  ru: {
    "olyq.allGrades": "Все классы",
    "olyq.manageNote":
      "Добавляйте и редактируйте вопросы по одному ниже; массовая загрузка доступна только при создании пакета.",
    "olyq.archivedNote":
      "Архивные вопросы не попадают в новые попытки; прошлые результаты остаются доступными.",
    "olyq.add": "Добавить вопрос",
    "olyq.search": "Поиск по тексту вопроса…",
    "olyq.empty": "В этом пакете пока нет вопросов.",
    "olyq.noMatch": "По запросу ничего не найдено.",
    "olyq.col.num": "№",
    "olyq.col.body": "Вопрос",
    "olyq.col.options": "Варианты",
    "olyq.col.image": "Изобр.",
    "olyq.col.status": "Статус",
    "olyq.col.updated": "Обновлён",
    "olyq.col.actions": "Действия",
    "olyq.optWarnTitle": "Должно быть ровно 5 вариантов (A–E)",
    "olyq.imgYes": "Есть изображение",
    "olyq.status.published": "Опубликован",
    "olyq.status.archived": "В архиве",
    "olyq.status.in_review": "На проверке",
    "olyq.status.rejected": "Отклонён",
    "olyq.status.draft": "Черновик",
    "olyq.status.approved": "Одобрен",
    "olyq.edit": "Изменить",
    "olyq.delete": "Удалить",
    "olyq.archive": "В архив",
    "olyq.restore": "Восстановить",
    "olyq.confirmDelete":
      "Вопрос будет безвозвратно удалён из пакета. Продолжить?",
    "olyq.loadFailed": "Не удалось загрузить вопрос. Попробуйте ещё раз.",
    "olyq.new.title": "Новый вопрос",
    "olyq.edit.title": "Редактирование вопроса",
    "olyq.subject": "Предмет",
    "olyq.grade": "Класс",
    "olyq.fixedNote": "Предмет и класс наследуются от пакета.",
    "olyq.topic": "Тема (необязательно)",
    "olyq.subtopic": "Подтема (необязательно)",
    "olyq.noTopics": "Для этого предмета нет олимпиадных тем.",
    "olyq.none": "— не выбрано —",
    "olyq.trilingualNote":
      "Азербайджанский обязателен; английский и русский необязательны. Чтобы добавить язык, заполните его текст.",
    "olyq.body": "Текст вопроса",
    "olyq.prompt": "Формулировка задания",
    "olyq.explanation": "Объяснение",
    "olyq.options": "Варианты ответа (A–E)",
    "olyq.correct": "Правильный",
    "olyq.correctHint":
      "У каждого вопроса ровно 5 вариантов (A–E) и ровно 1 правильный ответ.",
    "olyq.img.title": "Изображение вопроса (необязательно)",
    "olyq.img.choose": "Выбрать изображение",
    "olyq.img.replace": "Заменить изображение",
    "olyq.img.remove": "Удалить изображение",
    "olyq.img.undo": "Отменить",
    "olyq.img.willRemove": "Изображение будет удалено при сохранении.",
    "olyq.img.hint": "PNG, JPEG, WebP или GIF, до 5 МБ.",
    "olyq.img.invalid":
      "Неподходящий файл изображения (PNG/JPEG/WebP/GIF, макс. 5 МБ).",
    "olyq.img.uploadFailed":
      "Не удалось загрузить изображение. Попробуйте ещё раз.",
    "olyq.save": "Сохранить",
    "olyq.saving": "Сохранение…",
    "olyq.close": "Закрыть",
    "olyq.err.azBody": "Текст вопроса на азербайджанском обязателен.",
    "olyq.err.localeIncomplete":
      "{lang}: если язык добавлен, нужно заполнить текст вопроса и все 5 вариантов.",
    "olyq.err.fiveOptions":
      "Все 5 вариантов ответа (A–E) должны быть заполнены.",
    "olyq.err.oneCorrect": "Выберите правильный ответ.",
    "olyq.err.taxonomy":
      "Тема не соответствует предмету пакета. Выберите тему и подтему заново.",
    "olyq.err.hasAttempts":
      "На этот вопрос уже отвечали, поэтому его нельзя удалить — вместо этого отправьте его в архив.",
  },
};

// Standalone lookup (az fallback, then the key itself) — same contract as the
// other labels.ts files.
export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

// Full merged dictionary (az fallback under the locale) for client components
// that need many keys at once.
export function localDict(locale: Locale): Record<string, string> {
  return { ...STRINGS.az, ...(STRINGS[locale] ?? {}) };
}
