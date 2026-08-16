import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Curriculum Structure screen (the merged
// Subject → Topic → Subtopic tree that replaced /manage/topics and
// /manage/subtopics). Same pattern as locations/labels.ts and pricing/labels.ts:
// keys that already live in the shared dictionary (action.*, field.status,
// manage.select, manage.saving, flt.noMatches, modal.close, pend.deleting,
// term.1…term.4, status.*) still come from getT() — these are only the gaps.
// `nav.curriculum` lives here too so the sidebar renders translated until
// messages.ts gains the key.
//
// Terminology note: "Rüb" is the Azerbaijani school term (1–4). English uses
// "Term", Russian "Четверть" — the same vocabulary the questions module and the
// bulk importer already use, so the two screens read as one product.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "nav.curriculum": "Kurikulum",
    "cur.title": "Kurikulum strukturu",
    "cur.subtitle":
      "Fənn, mövzu və alt mövzuları bir ağacda idarə edin. Mövzunun rübü onun bütün alt mövzularına və suallarına tətbiq olunur.",

    // Toolbar / filters
    "cur.newTopic": "Yeni mövzu",
    "cur.newSubtopic": "Yeni alt mövzu",
    "cur.search": "Mövzu və ya alt mövzu axtar…",
    "cur.allSubjects": "Bütün fənlər",
    "cur.allGrades": "Bütün siniflər",
    "cur.allTerms": "Bütün rüblər",
    "cur.noTermFilter": "Rübsüz (baxılmalı)",
    "cur.expandAll": "Hamısını aç",
    "cur.collapseAll": "Hamısını yığ",

    // Tree
    "cur.countTopics": "Mövzu: {n}",
    "cur.countSubtopics": "Alt mövzu: {n}",
    "cur.countQuestions": "Sual: {n}",
    "cur.addSubtopic": "Alt mövzu əlavə et",
    "cur.gradeShared": "Ümumi",
    "cur.needsTerm": "Rüb təyin edilməyib",
    "cur.statusInactive": "Deaktiv",
    "cur.statusArchived": "Arxivlənib",
    "cur.unknownSubject": "Fənn tapılmadı",
    "cur.searchHit": "Uyğunluq",

    // Empty / loading states
    "cur.noSubjects":
      "Hələ fənn yoxdur. Əvvəlcə «Fənlər» bölməsində fənn yaradın — mövzu fənnə bağlanır.",
    "cur.noTopics": "Hələ mövzu yoxdur.",
    "cur.noTopicsHint": "«Yeni mövzu» düyməsi ilə başlayın.",
    "cur.noSubtopics": "Bu mövzunun alt mövzusu yoxdur.",

    // Pagination
    "cur.showing": "{from}–{to} / {total} mövzu",
    "cur.prev": "Əvvəlki",
    "cur.next": "Sonrakı",
    "cur.pageOf": "Səhifə {page} / {pages}",
    "cur.scanTruncated":
      "Nəticə çox böyükdür — yalnız ilk {n} mövzu nəzərə alınıb. Axtarışı və ya filtrləri daraldın.",

    // Forms
    "cur.fSubject": "Fənn",
    "cur.fGrade": "Sinif",
    "cur.fName": "Ad",
    "cur.fNameAz": "Ad (AZ)",
    "cur.fNameEn": "Ad (EN)",
    "cur.fNameRu": "Ad (RU)",
    "cur.nameAzHint":
      "Azərbaycanca ad əsas addır: sual idxalı və kurikulum yeniləmələri məhz bu ada görə uyğunlaşdırılır. İngilis və rus adları yalnız şagirdə göstərilir; boş buraxsanız, həmin dildə azərbaycanca ad görünəcək.",
    "cur.trMissing": "Tərcümə yoxdur: {langs}",
    "cur.trMissingBoth": "EN və RU",
    "cur.fTerm": "Rüb",
    "cur.fStatus": "Status",
    "cur.fTopic": "Mövzu",
    "cur.gradeNone": "Sinif seçilməyib (ümumi)",
    "cur.termInherited": "Mövzudan miras alınır",
    "cur.termCascadeWarn":
      "Rübü dəyişsəniz, bu mövzunun bütün alt mövzuları və sualları da avtomatik həmin rübə keçəcək.",
    "cur.topicPickerFilter": "Mövzu siyahısını daraldın",
    "cur.noTopicsForSelection":
      "Bu fənn və sinif üzrə mövzu yoxdur. Əvvəlcə mövzu yaradın.",
    "cur.addTopicTitle": "Yeni mövzu əlavə et",
    "cur.editTopicTitle": "Mövzuya düzəliş et",
    "cur.addSubtopicTitle": "Yeni alt mövzu əlavə et",
    "cur.editSubtopicTitle": "Alt mövzuya düzəliş et",

    // Delete
    "cur.deleteTopicTitle": "Mövzunu sil",
    "cur.deleteSubtopicTitle": "Alt mövzunu sil",
    "cur.deleteQuestion": "«{name}» silinsin?",
    "cur.deleteIrreversible": "Bu əməliyyat geri qaytarıla bilməz.",
    "cur.impactLoading": "Bağlı məlumatlar yoxlanılır…",
    "cur.impactNone": "Bağlı məlumat yoxdur.",
    "cur.impactSubtopics": "Alt mövzu: {n} — mövzu ilə birlikdə silinəcək",
    "cur.impactQuestions": "Sual: {n} — bu bölməyə bağlıdır",
    "cur.blockedTopic":
      "Bu mövzunu silmək olmaz: ona bağlı suallar var. Əvvəlcə həmin sualları başqa mövzuya keçirin və ya arxivləyin.",
    "cur.blockedSubtopic":
      "Bu alt mövzunu silmək olmaz: ona bağlı suallar var. Əvvəlcə həmin sualları başqa alt mövzuya keçirin və ya arxivləyin.",

    // Errors
    "cur.errName": "Ad tələb olunur.",
    "cur.errSubject": "Fənn seçilməlidir.",
    "cur.errTerm": "Rüb seçilməlidir (1–4).",
    "cur.errTopic": "Mövzu seçilməlidir.",
    "cur.errDuplicateTopic":
      "Bu fənn və sinif üzrə eyni adlı mövzu artıq mövcuddur.",
    "cur.errDuplicateSubtopic":
      "Bu mövzuda eyni adlı alt mövzu artıq mövcuddur.",
    "cur.errTooLong": "Ad çox uzundur (maksimum 120 simvol).",
    "cur.errTooLongTr": "Tərcümə çox uzundur (maksimum 120 simvol).",
    "cur.errTrSave":
      "Ad yadda saxlanıldı, lakin EN/RU tərcümələri yazılmadı. Yenidən açıb tərcümələri təkrar yadda saxlayın.",
    "cur.errGeneric": "Yadda saxlamaq mümkün olmadı. Yenidən cəhd edin.",
    "cur.errOp": "Əməliyyat alınmadı. Yenidən cəhd edin.",

    // Toasts
    "cur.toastTopicCreated": "Mövzu yaradıldı.",
    "cur.toastTopicUpdated": "Mövzu yeniləndi.",
    "cur.toastSubtopicCreated": "Alt mövzu yaradıldı.",
    "cur.toastSubtopicUpdated": "Alt mövzu yeniləndi.",
    "cur.toastTopicDeleted": "Mövzu silindi.",
    "cur.toastSubtopicDeleted": "Alt mövzu silindi.",
    "cur.toastDismiss": "Bildirişi bağla",
  },

  en: {
    "nav.curriculum": "Curriculum",
    "cur.title": "Curriculum structure",
    "cur.subtitle":
      "Manage subjects, topics and subtopics in one tree. A topic's term applies to all of its subtopics and questions.",

    "cur.newTopic": "New topic",
    "cur.newSubtopic": "New subtopic",
    "cur.search": "Search topics and subtopics…",
    "cur.allSubjects": "All subjects",
    "cur.allGrades": "All grades",
    "cur.allTerms": "All terms",
    "cur.noTermFilter": "No term (needs review)",
    "cur.expandAll": "Expand all",
    "cur.collapseAll": "Collapse all",
    "cur.countTopics": "Topics: {n}",
    "cur.countSubtopics": "Subtopics: {n}",
    "cur.countQuestions": "Questions: {n}",
    "cur.addSubtopic": "Add subtopic",
    "cur.gradeShared": "Shared",
    "cur.needsTerm": "No term assigned",
    "cur.statusInactive": "Inactive",
    "cur.statusArchived": "Archived",
    "cur.unknownSubject": "Subject not found",
    "cur.searchHit": "Match",

    "cur.noSubjects":
      "There are no subjects yet. Create one under “Subjects” first — every topic belongs to a subject.",
    "cur.noTopics": "No topics yet.",
    "cur.noTopicsHint": "Start with the “New topic” button.",
    "cur.noSubtopics": "This topic has no subtopics.",

    "cur.showing": "{from}–{to} of {total} topics",
    "cur.prev": "Previous",
    "cur.next": "Next",
    "cur.pageOf": "Page {page} of {pages}",
    "cur.scanTruncated":
      "The result set is very large — only the first {n} topics were considered. Narrow the search or the filters.",

    "cur.fSubject": "Subject",
    "cur.fGrade": "Grade",
    "cur.fName": "Name",
    "cur.fNameAz": "Name (AZ)",
    "cur.fNameEn": "Name (EN)",
    "cur.fNameRu": "Name (RU)",
    "cur.nameAzHint":
      "The Azerbaijani name is the canonical one: question imports and curriculum updates are matched against it. The English and Russian names are shown to students only; leave one blank and that language falls back to the Azerbaijani name.",
    "cur.trMissing": "No translation: {langs}",
    "cur.trMissingBoth": "EN and RU",
    "cur.fTerm": "Term",
    "cur.fStatus": "Status",
    "cur.fTopic": "Topic",
    "cur.gradeNone": "No grade (shared)",
    "cur.termInherited": "Inherited from the topic",
    "cur.termCascadeWarn":
      "Changing the term also moves every subtopic and every question of this topic to that term.",
    "cur.topicPickerFilter": "Narrow the topic list",
    "cur.noTopicsForSelection":
      "No topics for this subject and grade yet. Create a topic first.",
    "cur.addTopicTitle": "Add a topic",
    "cur.editTopicTitle": "Edit topic",
    "cur.addSubtopicTitle": "Add a subtopic",
    "cur.editSubtopicTitle": "Edit subtopic",

    "cur.deleteTopicTitle": "Delete topic",
    "cur.deleteSubtopicTitle": "Delete subtopic",
    "cur.deleteQuestion": "Delete “{name}”?",
    "cur.deleteIrreversible": "This action cannot be undone.",
    "cur.impactLoading": "Checking linked records…",
    "cur.impactNone": "No linked records.",
    "cur.impactSubtopics": "Subtopics: {n} — deleted together with the topic",
    "cur.impactQuestions": "Questions: {n} — linked to this node",
    "cur.blockedTopic":
      "This topic cannot be deleted: questions are linked to it. Move those questions to another topic or archive them first.",
    "cur.blockedSubtopic":
      "This subtopic cannot be deleted: questions are linked to it. Move those questions to another subtopic or archive them first.",

    "cur.errName": "Name is required.",
    "cur.errSubject": "Selecting a subject is required.",
    "cur.errTerm": "Selecting a term (1–4) is required.",
    "cur.errTopic": "Selecting a topic is required.",
    "cur.errDuplicateTopic":
      "A topic with this name already exists for this subject and grade.",
    "cur.errDuplicateSubtopic":
      "A subtopic with this name already exists under this topic.",
    "cur.errTooLong": "The name is too long (120 characters maximum).",
    "cur.errTooLongTr": "The translation is too long (120 characters maximum).",
    "cur.errTrSave":
      "The name was saved, but the EN/RU translations were not. Reopen the record and save the translations again.",
    "cur.errGeneric": "Could not save. Please try again.",
    "cur.errOp": "The operation failed. Please try again.",

    "cur.toastTopicCreated": "Topic created.",
    "cur.toastTopicUpdated": "Topic updated.",
    "cur.toastSubtopicCreated": "Subtopic created.",
    "cur.toastSubtopicUpdated": "Subtopic updated.",
    "cur.toastTopicDeleted": "Topic deleted.",
    "cur.toastSubtopicDeleted": "Subtopic deleted.",
    "cur.toastDismiss": "Dismiss notification",
  },

  ru: {
    "nav.curriculum": "Учебная программа",
    "cur.title": "Структура учебной программы",
    "cur.subtitle":
      "Управляйте предметами, темами и подтемами в одном дереве. Четверть темы распространяется на все её подтемы и вопросы.",

    "cur.newTopic": "Новая тема",
    "cur.newSubtopic": "Новая подтема",
    "cur.search": "Поиск по темам и подтемам…",
    "cur.allSubjects": "Все предметы",
    "cur.allGrades": "Все классы",
    "cur.allTerms": "Все четверти",
    "cur.noTermFilter": "Без четверти (на проверку)",
    "cur.expandAll": "Развернуть всё",
    "cur.collapseAll": "Свернуть всё",
    "cur.countTopics": "Темы: {n}",
    "cur.countSubtopics": "Подтемы: {n}",
    "cur.countQuestions": "Вопросы: {n}",
    "cur.addSubtopic": "Добавить подтему",
    "cur.gradeShared": "Общая",
    "cur.needsTerm": "Четверть не указана",
    "cur.statusInactive": "Неактивная",
    "cur.statusArchived": "В архиве",
    "cur.unknownSubject": "Предмет не найден",
    "cur.searchHit": "Совпадение",

    "cur.noSubjects":
      "Предметов пока нет. Сначала создайте предмет в разделе «Предметы» — каждая тема принадлежит предмету.",
    "cur.noTopics": "Тем пока нет.",
    "cur.noTopicsHint": "Начните с кнопки «Новая тема».",
    "cur.noSubtopics": "У этой темы нет подтем.",

    "cur.showing": "{from}–{to} из {total} тем",
    "cur.prev": "Назад",
    "cur.next": "Вперёд",
    "cur.pageOf": "Страница {page} из {pages}",
    "cur.scanTruncated":
      "Слишком много результатов — учтены только первые {n} тем. Уточните поиск или фильтры.",

    "cur.fSubject": "Предмет",
    "cur.fGrade": "Класс",
    "cur.fName": "Название",
    "cur.fNameAz": "Название (AZ)",
    "cur.fNameEn": "Название (EN)",
    "cur.fNameRu": "Название (RU)",
    "cur.nameAzHint":
      "Азербайджанское название — основное: именно по нему сопоставляются импорт вопросов и обновления учебной программы. Английское и русское названия видят только ученики; если оставить поле пустым, в этом языке покажется азербайджанское название.",
    "cur.trMissing": "Нет перевода: {langs}",
    "cur.trMissingBoth": "EN и RU",
    "cur.fTerm": "Четверть",
    "cur.fStatus": "Статус",
    "cur.fTopic": "Тема",
    "cur.gradeNone": "Без класса (общая)",
    "cur.termInherited": "Наследуется от темы",
    "cur.termCascadeWarn":
      "При смене четверти все подтемы и все вопросы этой темы тоже перейдут в новую четверть.",
    "cur.topicPickerFilter": "Сузить список тем",
    "cur.noTopicsForSelection":
      "Для этого предмета и класса тем ещё нет. Сначала создайте тему.",
    "cur.addTopicTitle": "Добавить тему",
    "cur.editTopicTitle": "Редактировать тему",
    "cur.addSubtopicTitle": "Добавить подтему",
    "cur.editSubtopicTitle": "Редактировать подтему",

    "cur.deleteTopicTitle": "Удалить тему",
    "cur.deleteSubtopicTitle": "Удалить подтему",
    "cur.deleteQuestion": "Удалить «{name}»?",
    "cur.deleteIrreversible": "Это действие необратимо.",
    "cur.impactLoading": "Проверяем связанные записи…",
    "cur.impactNone": "Связанных записей нет.",
    "cur.impactSubtopics": "Подтемы: {n} — будут удалены вместе с темой",
    "cur.impactQuestions": "Вопросы: {n} — привязаны к этому узлу",
    "cur.blockedTopic":
      "Эту тему нельзя удалить: к ней привязаны вопросы. Сначала перенесите эти вопросы в другую тему или отправьте их в архив.",
    "cur.blockedSubtopic":
      "Эту подтему нельзя удалить: к ней привязаны вопросы. Сначала перенесите эти вопросы в другую подтему или отправьте их в архив.",

    "cur.errName": "Название обязательно.",
    "cur.errSubject": "Выбор предмета обязателен.",
    "cur.errTerm": "Выбор четверти (1–4) обязателен.",
    "cur.errTopic": "Выбор темы обязателен.",
    "cur.errDuplicateTopic":
      "Тема с таким названием уже есть для этого предмета и класса.",
    "cur.errDuplicateSubtopic":
      "Подтема с таким названием уже есть в этой теме.",
    "cur.errTooLong": "Название слишком длинное (максимум 120 символов).",
    "cur.errTooLongTr": "Перевод слишком длинный (максимум 120 символов).",
    "cur.errTrSave":
      "Название сохранено, но переводы EN/RU записать не удалось. Откройте запись снова и сохраните переводы ещё раз.",
    "cur.errGeneric": "Не удалось сохранить. Попробуйте снова.",
    "cur.errOp": "Не удалось выполнить операцию. Попробуйте снова.",

    "cur.toastTopicCreated": "Тема создана.",
    "cur.toastTopicUpdated": "Тема обновлена.",
    "cur.toastSubtopicCreated": "Подтема создана.",
    "cur.toastSubtopicUpdated": "Подтема обновлена.",
    "cur.toastTopicDeleted": "Тема удалена.",
    "cur.toastSubtopicDeleted": "Подтема удалена.",
    "cur.toastDismiss": "Закрыть уведомление",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

/** Full merged dictionary for the locale (az fallback) — handed to the client
 *  tree so it holds no i18n logic of its own. */
export function allStrings(locale: Locale): Record<string, string> {
  return { ...STRINGS.az, ...(STRINGS[locale] ?? {}) };
}
