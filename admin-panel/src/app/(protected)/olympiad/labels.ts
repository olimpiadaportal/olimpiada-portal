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
    "olyq.replace.open": "Sualları tam əvəz et",
    "olyq.replace.title": "Sual bazasını tam əvəz etmə",
    "olyq.replace.warnTitle": "Diqqət: bu, əlavə etmə deyil.",
    "olyq.replace.warnBody": "Yüklədiyiniz fayl bu sinfin mövcud suallarını əvəz edəcək. Köhnə suallar aktiv bazadan çıxarılacaq.",
    "olyq.replace.warnMath": "Hazırda bu sinifdə {current} sual var. Əgər {example} sual yükləsəniz, nəticədə {example} sual qalacaq — {current} deyil.",
    "olyq.replace.warnLive": "Nəticə: {current} sual çıxarılacaq, {incoming} sual qalacaq.",
    "olyq.replace.warnKeeps": "Paketi almış ailələr girişini saxlayır və heç bir bildiriş göndərilmir. Şagirdlərin artıq cavablandırdığı suallar keçmiş nəticələr oxunaqlı qalsın deyə arxivlənir, silinmir.",
    "olyq.replace.codeLabel": "Təsdiq üçün paket kodunu yazın: {code}",
    "olyq.replace.codeHint": "Kod düz gəlmədikdə əməliyyat başlamır.",
    "olyq.replace.submit": "Tam əvəz et",
    "olyq.replace.working": "Əvəz olunur…",
    "olyq.replace.ok": "Hazırdır. Bu sinifdə indi {n} sual var.",
    "olyq.replace.err.code": "Paket kodu düz deyil.",
    "olyq.replace.err.empty": "Fayl boşdur. Boş fayl ilə əvəz etmək mümkün deyil.",
    "olyq.replace.err.rows": "Faylda xətalı sətirlər var. Tam əvəz etmə yalnız bütün sətirlər düzgün olduqda aparılır — mövcud suallara toxunulmadı.",
    "olyq.replace.err.live": "Bu sinifdə davam edən cəhd var. Bitməsini gözləyin.",
    "olyq.replace.err.incomplete": "Fayldakı bəzi suallar əlavə oluna bilmədi, ona görə əməliyyat ləğv edildi. Mövcud suallar olduğu kimi qaldı.",
    "olyq.replace.err.floor": "Yeni sual sayı bir cəhd üçün lazım olan minimumdan azdır. Əməliyyat ləğv edildi, mövcud suallar qaldı.",
    "olyq.filter.grades": "Siniflər",
    "olyq.filter.gradeNone": "— sinifsiz —",
    // ---- pool section on the package edit page ----
    "olyq.manageNote":
      "Sualları aşağıda tək-tək əlavə edib redaktə edə bilərsiniz; sinfin hovuzuna toplu şəkildə sual əlavə etmək üçün yuxarıdakı «Siniflər» bölməsindən istifadə edin.",
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
    // ---- Bulk pool management (migration 144) --------------------------------
    "olyq.filter.showing": "{shown} / {total} sual göstərilir",
    "olyq.bulk.archive": "Arxivləşdir",
    "olyq.bulk.restore": "Bərpa et",
    "olyq.bulk.archived": "{changed} sual arxivləndi ({already} sual artıq arxivdə idi).",
    "olyq.bulk.restored": "{changed} sual bərpa olundu ({already} sual artıq nəşrdə idi).",
    "olyq.bulk.archiveTitle": "Seçilmiş sualları arxivləşdirmək?",
    "olyq.bulk.archiveBody":
      "Arxivlənən suallar bundan sonra heç bir girişdə çıxmayacaq — silinmiş kimi. Fərq: keçmiş nəticələr oxunaqlı qalır və hər sualı geri qaytara bilərsiniz.",
    "olyq.bulk.restoreTitle": "Seçilmiş sualları bərpa etmək?",
    "olyq.bulk.restoreBody": "Bu suallar yenidən nəşr olunacaq və girişlərdə çıxacaq.",
    "olyq.floor.ok": "{grade}: {before} → {after} nəşrdə (minimum {min})",
    "olyq.floor.blocked":
      "{grade}: {before} → {after} nəşrdə (minimum {min}) — bu sinif satılıb, əməliyyat rədd ediləcək.",
    "olyq.floor.demote":
      "{grade}: {before} → {after} nəşrdə (minimum {min}) — paket «Deaktiv» olacaq və əl ilə yenidən aktivləşdirilməlidir.",
    "olyq.replaceHint":
      "Sual hovuzunu dəyişmək üçün: ƏVVƏLCƏ yeni sualları yükləyin, SONRA köhnələri seçib arxivləşdirin. Bu ardıcıllıq vacibdir — əks halda hovuz bir anlıq minimumdan aşağı düşür.",
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
    "olyq.err.hasAttempts":
      "Bu suala artıq cavablar verilib, ona görə silmək mümkün deyil — bunun əvəzinə sualı arxivləşdirin.",
  },
  en: {
    "olyq.allGrades": "All grades",
    "olyq.replace.open": "Replace all questions",
    "olyq.replace.title": "Full question-pool replacement",
    "olyq.replace.warnTitle": "Careful: this is not an append.",
    "olyq.replace.warnBody": "The file you upload REPLACES this grade's current questions. The old ones are removed from the active pool.",
    "olyq.replace.warnMath": "This grade currently has {current} questions. If you upload {example}, you end up with {example} — not {current}.",
    "olyq.replace.warnLive": "Result: {current} questions removed, {incoming} remain.",
    "olyq.replace.warnKeeps": "Families who bought this package keep their access and are sent no notification. Questions students have already answered are ARCHIVED rather than deleted, so past results stay readable.",
    "olyq.replace.codeLabel": "Type the package code to confirm: {code}",
    "olyq.replace.codeHint": "Nothing happens unless the code matches.",
    "olyq.replace.submit": "Replace everything",
    "olyq.replace.working": "Replacing…",
    "olyq.replace.ok": "Done. This grade now has {n} questions.",
    "olyq.replace.err.code": "The package code does not match.",
    "olyq.replace.err.empty": "The file is empty. A replacement cannot empty a pool.",
    "olyq.replace.err.rows": "The file has invalid rows. A full replacement runs only when every row is valid — your existing questions were left untouched.",
    "olyq.replace.err.live": "An attempt is in progress for this grade. Wait for it to finish.",
    "olyq.replace.err.incomplete": "Some questions in the file could not be imported, so the operation was cancelled. Your existing questions were left exactly as they were.",
    "olyq.replace.err.floor": "The new pool is smaller than one attempt needs. The operation was cancelled and the existing questions were kept.",
    "olyq.filter.grades": "Grades",
    "olyq.filter.gradeNone": "— no grade —",
    "olyq.manageNote":
      "Add and edit questions one by one below; to add many questions to a grade's pool at once, use the Grades section above.",
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
    // ---- Bulk pool management (migration 144) --------------------------------
    "olyq.filter.showing": "Showing {shown} of {total}",
    "olyq.bulk.archive": "Archive",
    "olyq.bulk.restore": "Restore",
    "olyq.bulk.archived": "{changed} archived ({already} were already archived).",
    "olyq.bulk.restored": "{changed} restored ({already} were already published).",
    "olyq.bulk.archiveTitle": "Archive the selected questions?",
    "olyq.bulk.archiveBody":
      "Archived questions stop appearing in every attempt — the same as deleting them. The difference: past results stay readable and each question can be restored.",
    "olyq.bulk.restoreTitle": "Restore the selected questions?",
    "olyq.bulk.restoreBody": "These questions will be published again and appear in attempts.",
    "olyq.floor.ok": "{grade}: {before} → {after} published (minimum {min})",
    "olyq.floor.blocked":
      "{grade}: {before} → {after} published (minimum {min}) — this grade has been purchased, so the operation will be refused.",
    "olyq.floor.demote":
      "{grade}: {before} → {after} published (minimum {min}) — the package will be set to Inactive and must be re-activated by hand.",
    "olyq.replaceHint":
      "To swap a question pool: upload the new questions FIRST, then select the old ones and archive them. The order matters — the other way round the pool briefly drops below its minimum.",
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
    "olyq.err.hasAttempts":
      "This question already has answer history, so it cannot be deleted — archive it instead.",
  },
  ru: {
    "olyq.allGrades": "Все классы",
    "olyq.replace.open": "Полностью заменить вопросы",
    "olyq.replace.title": "Полная замена базы вопросов",
    "olyq.replace.warnTitle": "Внимание: это не добавление.",
    "olyq.replace.warnBody": "Загружаемый файл ЗАМЕНЯЕТ текущие вопросы этого класса. Старые вопросы убираются из активной базы.",
    "olyq.replace.warnMath": "Сейчас в этом классе {current} вопросов. Если загрузить {example}, останется {example}, а не {current}.",
    "olyq.replace.warnLive": "Итог: {current} вопросов будет убрано, останется {incoming}.",
    "olyq.replace.warnKeeps": "Семьи, купившие пакет, сохраняют доступ, и никаких уведомлений не отправляется. Вопросы, на которые ученики уже отвечали, АРХИВИРУЮТСЯ, а не удаляются, чтобы прошлые результаты остались читаемыми.",
    "olyq.replace.codeLabel": "Введите код пакета для подтверждения: {code}",
    "olyq.replace.codeHint": "Без совпадения кода операция не начнётся.",
    "olyq.replace.submit": "Заменить полностью",
    "olyq.replace.working": "Замена…",
    "olyq.replace.ok": "Готово. В этом классе теперь {n} вопросов.",
    "olyq.replace.err.code": "Код пакета не совпадает.",
    "olyq.replace.err.empty": "Файл пуст. Заменой нельзя опустошить базу.",
    "olyq.replace.err.rows": "В файле есть ошибочные строки. Полная замена выполняется только когда все строки корректны — существующие вопросы не тронуты.",
    "olyq.replace.err.live": "По этому классу идёт попытка. Дождитесь её завершения.",
    "olyq.replace.err.incomplete": "Часть вопросов из файла не удалось импортировать, поэтому операция отменена. Существующие вопросы остались без изменений.",
    "olyq.replace.err.floor": "Новая база меньше, чем нужно для одной попытки. Операция отменена, существующие вопросы сохранены.",
    "olyq.filter.grades": "Классы",
    "olyq.filter.gradeNone": "— без класса —",
    "olyq.manageNote":
      "Добавляйте и редактируйте вопросы по одному ниже; чтобы добавить в пул класса сразу много вопросов, используйте раздел «Классы» выше.",
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
    // ---- Bulk pool management (migration 144) --------------------------------
    "olyq.filter.showing": "Показано {shown} из {total}",
    "olyq.bulk.archive": "В архив",
    "olyq.bulk.restore": "Восстановить",
    "olyq.bulk.archived": "В архив отправлено: {changed} ({already} уже были в архиве).",
    "olyq.bulk.restored": "Восстановлено: {changed} ({already} уже были опубликованы).",
    "olyq.bulk.archiveTitle": "Отправить выбранные вопросы в архив?",
    "olyq.bulk.archiveBody":
      "Архивные вопросы перестают появляться в попытках — как если бы их удалили. Разница: прошлые результаты остаются читаемыми, и каждый вопрос можно вернуть.",
    "olyq.bulk.restoreTitle": "Восстановить выбранные вопросы?",
    "olyq.bulk.restoreBody": "Эти вопросы снова будут опубликованы и появятся в попытках.",
    "olyq.floor.ok": "{grade}: {before} → {after} опубликовано (минимум {min})",
    "olyq.floor.blocked":
      "{grade}: {before} → {after} опубликовано (минимум {min}) — этот класс уже куплен, операция будет отклонена.",
    "olyq.floor.demote":
      "{grade}: {before} → {after} опубликовано (минимум {min}) — пакет станет «Неактивен» и потребует ручной повторной активации.",
    "olyq.replaceHint":
      "Чтобы заменить пул вопросов: СНАЧАЛА загрузите новые вопросы, ЗАТЕМ выберите старые и отправьте их в архив. Порядок важен — иначе пул на короткое время опускается ниже минимума.",
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
