import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Olympiad module that are NOT yet in the
// shared dictionary (admin-panel/src/i18n/messages.ts). Plain module (no
// "use server") so both the server pages and lib/admin/olympiad.ts can import
// the constants. These should be migrated into messages.ts by the agent that
// owns admin message additions (reported in followups).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    // ---- Round 34: olympiad type inside the package flow ----
    "oly2.type": "Olimpiada növü",
    "oly2.typeOther": "Digər (yeni növ daxil et)",
    "oly2.typeOtherLabel": "Yeni növün adı",
    "oly2.typeOtherPh": "Məsələn: Beynəlxalq kenquru",
    "oly2.err.type": "Olimpiada növünü seçin.",
    "oly2.err.typeOther": "Yeni növün adını daxil edin.",
    // ---- Round 34: multi-grade packages + per-grade pools ----
    "oly2.grades": "Siniflər",
    "oly2.gradesHint": "Bir və ya bir neçə sinif seçin — hər sinfin ÖZ sual hovuzu olacaq.",
    "oly2.err.grades": "Ən azı bir sinif seçin.",
    "oly2.gradePool": "{grade} üçün sual faylı",
    "oly2.gradeReady": "Hazır: {n} sual",
    "oly2.gradeInvalid": "{n} sətirdə xəta",
    "oly2.gradeMissing": "Fayl seçilməyib",
    "oly2.err.gradeFiles": "Bu siniflərin sual hovuzu hazır deyil: {grades}. Hər seçilmiş sinif üçün düzgün JSON faylı yükləyin.",
    "oly2.err.gradeImport": "{grade}: sualların idxalı alınmadı.",
    "oly2.perGradeNote": "Hər cəhdə şagirdin ÖZ sinfinin hovuzundan paket üzrə təyin edilmiş sayda sual seçilir — siniflərin hovuzları qarışmır.",
    // ---- Round 49: configurable per-attempt count + per-student rotation ----
    "oly2.perAttempt": "Sual sayı",
    "oly2.perAttemptHelp": "Şagird hər girişdə bu sayda sual görəcək.",
    "oly2.perAttemptDistinct":
      "Diqqət: bu, yüklənmiş sualların ümumi sayı DEYİL. Hovuzda daha çox sual ola bilər — hər cəhdə onlardan yalnız bu qədəri seçilir.",
    "oly2.err.perAttempt": "Sual sayı 1 ilə 500 arasında tam ədəd olmalıdır.",
    "oly2.err.poolBelowPerAttempt":
      "{grade} üçün {pool} sual yüklənib. Paket üzrə sual sayı {count} olduğu üçün ən azı {count} sual tələb olunur.",
    "oly2.err.poolBelowPerAttemptNoGrade":
      "Paketə {pool} sual yüklənib. Paket üzrə sual sayı {count} olduğu üçün ən azı {count} sual tələb olunur.",
    "oly2.cycleTitle": "Sual dövrəsi (hər sinif üzrə)",
    "oly2.cycleRow": "{grade}: hovuzda {pool} sual · tam dövrə ≈ {n} cəhd",
    "oly2.cycleShortRow":
      "{grade}: hovuzda cəmi {pool} sual var — paketi aktiv etmək üçün ən azı {count} sual lazımdır.",
    "oly2.cyclePerStudent":
      "Dövrə HƏR ŞAGİRD üçün ayrıca izlənir: şagird hovuz bitənə qədər eyni sualı təkrar görmür; hovuz bitəndə yalnız həmin şagirdin dövrəsi sıfırlanır və yenidən başlayır.",
    "oly2.cycleEmpty": "Sinif seçin və sual faylını yükləyin — dövrə burada hesablanacaq.",
    "oly2.cycleAwaiting": "{grade}: sual faylı hələ yüklənməyib.",
    "oly2.addGrade": "Sinif əlavə et",
    "oly2.addGradeHint": "Yeni sinif yalnız sual faylı ilə birlikdə əlavə olunur — boş hovuzlu sinif yaranmır.",
    "oly2.addGradeBtn": "Sinfi və sualları əlavə et",
    "oly2.adding": "Əlavə olunur…",
    "oly2.removeGrade": "Sinfi sil",
    "oly2.removing": "Silinir…",
    "oly2.err.gradeHasPurchases": "Bu sinif üçün alınmış paketlər var — sinif silinə bilməz (alıcıların girişi ömürlükdür).",
    "oly2.err.lastGrade": "Paketdə ən azı bir sinif qalmalıdır.",
    "oly2.err.gradeExists": "Bu sinif artıq paketə daxildir.",
    "oly2.gradeRemoved": "Sinif silindi; hovuzundakı suallar arxivləndi.",
    "oly2.uploading": "Yüklənir…",
    // bulk_insert_olympiad_package_questions is creation-only: the DB rejects
    // importing into a package that already has questions.
    "oly2.err.creationOnly":
      "Hər sinfin sual hovuzu bir dəfə — paket yaradılarkən və ya sinif paketə əlavə olunarkən — yüklənir. Sonradan ayrı-ayrı sualları aşağıdakı redaktorla idarə edin.",
    // Round 49: an attempt serves exactly `questions_per_attempt` questions,
    // rotated per student (no repeat until that student's cycle ends).
    "oly2.allQuestionsNote":
      "Hər cəhdə paket üzrə təyin edilmiş sayda sual daxil olur. Suallar hər şagird üçün ayrıca dövrə ilə seçilir: hovuz bitənə qədər təkrarlanmır, hovuz bitəndə həmin şagirdin dövrəsi sıfırlanır.",
    // ---- Sale window (sale_starts_at / sale_ends_at) ----
    "oly2.saleStart": "Satışın başlanğıcı (istəyə bağlı)",
    "oly2.saleEnd": "Satışın sonu (istəyə bağlı)",
    "oly2.saleHint":
      "Vaxtlar yerli (Bakı) vaxtı ilə daxil edilir. Boş buraxılsa, paket aktiv olduğu müddətdə daim satışda qalır.",
    "oly2.err.saleWindow": "Satışın sonu başlanğıcından sonra olmalıdır.",
    "oly2.err.badDate": "Tarix düzgün deyil. Tarixi yenidən seçin.",
    // ---- Derived lifecycle state chips ----
    "oly2.state.active": "Aktiv",
    "oly2.state.scheduled": "Planlaşdırılıb",
    "oly2.state.expired": "Vaxtı bitib",
    "oly2.state.archived": "Arxivdə",
    "oly2.state.inactive": "Qeyri-aktiv",
    // ---- Effective public availability (edit-page header) ----
    "oly2.avail.open":
      "Paket hazırda açıq görünür və alına bilər — vaxt məhdudiyyəti yoxdur.",
    "oly2.avail.openUntil":
      "Paket {date} (Bakı vaxtı) tarixinədək açıq görünür və alına bilər.",
    "oly2.avail.scheduled":
      "Satış hələ başlamayıb — paket {date} (Bakı vaxtı) tarixində açıq satışa çıxacaq.",
    "oly2.avail.closes": "Satış {date} (Bakı vaxtı) tarixində bağlanacaq.",
    "oly2.avail.expired":
      "Satış {date} (Bakı vaxtı) tarixində bitib — paket açıq kataloqda daha görünmür. Alıcıların girişi ömürlük qalır.",
    "oly2.avail.archived":
      "Paket arxivdədir — açıq kataloqda görünmür. Alıcıların girişi ömürlük qalır.",
    "oly2.avail.inactive": "Paket qeyri-aktivdir — açıq kataloqda görünmür.",
  },
  en: {
    // ---- Round 34: olympiad type inside the package flow ----
    "oly2.type": "Olympiad type",
    "oly2.typeOther": "Other (enter a new type)",
    "oly2.typeOtherLabel": "New type name",
    "oly2.typeOtherPh": "e.g. International Kangaroo",
    "oly2.err.type": "Select the olympiad type.",
    "oly2.err.typeOther": "Enter the new type's name.",
    // ---- Round 34: multi-grade packages + per-grade pools ----
    "oly2.grades": "Grades",
    "oly2.gradesHint": "Pick one or more grades — each grade gets its OWN question pool.",
    "oly2.err.grades": "Select at least one grade.",
    "oly2.gradePool": "Question file for {grade}",
    "oly2.gradeReady": "Ready: {n} questions",
    "oly2.gradeInvalid": "{n} rows with errors",
    "oly2.gradeMissing": "No file selected",
    "oly2.err.gradeFiles": "These grades have no valid question pool yet: {grades}. Upload a valid JSON file for every selected grade.",
    "oly2.err.gradeImport": "{grade}: importing the questions failed.",
    "oly2.perGradeNote": "Each attempt draws the configured number of questions from the pool of the student's OWN grade — grade pools never mix.",
    // ---- Round 49: configurable per-attempt count + per-student rotation ----
    "oly2.perAttempt": "Questions per attempt",
    "oly2.perAttemptHelp": "The student sees this many questions on every entry.",
    "oly2.perAttemptDistinct":
      "Note: this is NOT the total number of uploaded questions. The pool can be much larger — only this many are drawn for each attempt.",
    "oly2.err.perAttempt": "Questions per attempt must be a whole number between 1 and 500.",
    "oly2.err.poolBelowPerAttempt":
      "{grade} has {pool} questions uploaded. The package serves {count} questions per attempt, so at least {count} questions are required.",
    "oly2.err.poolBelowPerAttemptNoGrade":
      "The package has {pool} questions uploaded. It serves {count} questions per attempt, so at least {count} questions are required.",
    "oly2.cycleTitle": "Question cycle (per grade)",
    "oly2.cycleRow": "{grade}: {pool} questions in the pool · a full cycle ≈ {n} attempts",
    "oly2.cycleShortRow":
      "{grade}: only {pool} questions in the pool — at least {count} are needed to activate the package.",
    "oly2.cyclePerStudent":
      "The cycle is tracked separately for EACH student: a student never sees the same question twice until that pool is used up, and only that student's cycle then resets and starts over.",
    "oly2.cycleEmpty": "Pick a grade and upload its question file — the cycle is calculated here.",
    "oly2.cycleAwaiting": "{grade}: no question file uploaded yet.",
    "oly2.addGrade": "Add a grade",
    "oly2.addGradeHint": "A new grade is only added together with its question file — no grade ever starts with an empty pool.",
    "oly2.addGradeBtn": "Add grade with questions",
    "oly2.adding": "Adding…",
    "oly2.removeGrade": "Remove grade",
    "oly2.removing": "Removing…",
    "oly2.err.gradeHasPurchases": "This grade has purchased entitlements — it cannot be removed (buyers keep lifetime access).",
    "oly2.err.lastGrade": "A package must keep at least one grade.",
    "oly2.err.gradeExists": "This grade is already part of the package.",
    "oly2.gradeRemoved": "Grade removed; its pool questions were archived.",
    "oly2.uploading": "Uploading…",
    "oly2.err.creationOnly":
      "Each grade's question pool is uploaded ONCE — when the package is created or when the grade is added to it. After that, manage individual questions with the editor below.",
    "oly2.allQuestionsNote":
      "Every attempt serves the number of questions configured on the package. Questions are drawn on a per-student cycle: no repeats until the pool is used up, then that student's cycle resets.",
    "oly2.saleStart": "Sale start (optional)",
    "oly2.saleEnd": "Sale end (optional)",
    "oly2.saleHint":
      "Times are entered in local (Baku) time. Leave both empty to keep the package on sale for as long as it is active.",
    "oly2.err.saleWindow": "The sale end must be after the sale start.",
    "oly2.err.badDate": "Invalid date. Re-select the date.",
    "oly2.state.active": "Active",
    "oly2.state.scheduled": "Scheduled",
    "oly2.state.expired": "Expired",
    "oly2.state.archived": "Archived",
    "oly2.state.inactive": "Inactive",
    "oly2.avail.open":
      "The package is currently publicly visible and purchasable — no time limit is set.",
    "oly2.avail.openUntil":
      "The package is publicly visible and purchasable until {date} (Baku time).",
    "oly2.avail.scheduled":
      "Sales have not started yet — the package goes on public sale on {date} (Baku time).",
    "oly2.avail.closes": "Sales close on {date} (Baku time).",
    "oly2.avail.expired":
      "Sales ended on {date} (Baku time) — the package is no longer publicly visible. Purchasers keep lifetime access.",
    "oly2.avail.archived":
      "The package is archived — it is not publicly visible. Purchasers keep lifetime access.",
    "oly2.avail.inactive":
      "The package is inactive — it is not publicly visible.",
  },
  ru: {
    // ---- Round 34: тип олимпиады внутри потока пакета ----
    "oly2.type": "Тип олимпиады",
    "oly2.typeOther": "Другое (ввести новый тип)",
    "oly2.typeOtherLabel": "Название нового типа",
    "oly2.typeOtherPh": "Например: Международный кенгуру",
    "oly2.err.type": "Выберите тип олимпиады.",
    "oly2.err.typeOther": "Введите название нового типа.",
    // ---- Round 34: пакеты для нескольких классов + пул на класс ----
    "oly2.grades": "Классы",
    "oly2.gradesHint": "Выберите один или несколько классов — у каждого класса будет СВОЙ пул вопросов.",
    "oly2.err.grades": "Выберите хотя бы один класс.",
    "oly2.gradePool": "Файл вопросов для {grade}",
    "oly2.gradeReady": "Готово: {n} вопросов",
    "oly2.gradeInvalid": "Ошибки в {n} строках",
    "oly2.gradeMissing": "Файл не выбран",
    "oly2.err.gradeFiles": "У этих классов ещё нет корректного пула вопросов: {grades}. Загрузите корректный JSON-файл для каждого выбранного класса.",
    "oly2.err.gradeImport": "{grade}: импорт вопросов не удался.",
    "oly2.perGradeNote": "В каждой попытке из пула СВОЕГО класса ученика берётся заданное для пакета количество вопросов — пулы классов не смешиваются.",
    // ---- Round 49: настраиваемое число вопросов + ротация по ученику ----
    "oly2.perAttempt": "Вопросов за попытку",
    "oly2.perAttemptHelp": "Ученик будет видеть столько вопросов при каждом входе.",
    "oly2.perAttemptDistinct":
      "Обратите внимание: это НЕ общее количество загруженных вопросов. В пуле их может быть намного больше — в каждой попытке берётся только столько.",
    "oly2.err.perAttempt": "Количество вопросов должно быть целым числом от 1 до 500.",
    "oly2.err.poolBelowPerAttempt":
      "Для {grade} загружено {pool} вопросов. В пакете за попытку выдаётся {count} вопросов, поэтому нужно минимум {count} вопросов.",
    "oly2.err.poolBelowPerAttemptNoGrade":
      "В пакет загружено {pool} вопросов. За попытку выдаётся {count} вопросов, поэтому нужно минимум {count} вопросов.",
    "oly2.cycleTitle": "Цикл вопросов (по классам)",
    "oly2.cycleRow": "{grade}: в пуле {pool} вопросов · полный цикл ≈ {n} попыток",
    "oly2.cycleShortRow":
      "{grade}: в пуле всего {pool} вопросов — для активации пакета нужно минимум {count}.",
    "oly2.cyclePerStudent":
      "Цикл отслеживается ОТДЕЛЬНО для КАЖДОГО ученика: ученик не увидит один и тот же вопрос повторно, пока пул не закончится; после этого сбрасывается и начинается заново только его цикл.",
    "oly2.cycleEmpty": "Выберите класс и загрузите файл вопросов — цикл будет рассчитан здесь.",
    "oly2.cycleAwaiting": "{grade}: файл вопросов ещё не загружен.",
    "oly2.addGrade": "Добавить класс",
    "oly2.addGradeHint": "Новый класс добавляется только вместе с файлом вопросов — класс с пустым пулом не возникает.",
    "oly2.addGradeBtn": "Добавить класс с вопросами",
    "oly2.adding": "Добавление…",
    "oly2.removeGrade": "Удалить класс",
    "oly2.removing": "Удаление…",
    "oly2.err.gradeHasPurchases": "По этому классу есть купленные пакеты — класс нельзя удалить (доступ покупателей пожизненный).",
    "oly2.err.lastGrade": "В пакете должен остаться хотя бы один класс.",
    "oly2.err.gradeExists": "Этот класс уже входит в пакет.",
    "oly2.gradeRemoved": "Класс удалён; вопросы его пула отправлены в архив.",
    "oly2.uploading": "Загрузка…",
    "oly2.err.creationOnly":
      "Пул вопросов класса загружается ОДИН раз — при создании пакета или при добавлении класса. Дальше отдельные вопросы редактируются в редакторе ниже.",
    "oly2.allQuestionsNote":
      "Каждая попытка содержит столько вопросов, сколько задано в пакете. Вопросы выдаются по циклу для каждого ученика: повторов нет, пока пул не закончится, затем цикл этого ученика сбрасывается.",
    "oly2.saleStart": "Начало продаж (необязательно)",
    "oly2.saleEnd": "Окончание продаж (необязательно)",
    "oly2.saleHint":
      "Время вводится по местному (бакинскому) времени. Оставьте оба поля пустыми, чтобы пакет оставался в продаже, пока он активен.",
    "oly2.err.saleWindow": "Окончание продаж должно быть позже их начала.",
    "oly2.err.badDate": "Неверная дата. Выберите дату заново.",
    "oly2.state.active": "Активен",
    "oly2.state.scheduled": "Запланирован",
    "oly2.state.expired": "Истёк",
    "oly2.state.archived": "В архиве",
    "oly2.state.inactive": "Неактивен",
    "oly2.avail.open":
      "Пакет сейчас виден публично и доступен для покупки — ограничение по времени не задано.",
    "oly2.avail.openUntil":
      "Пакет виден публично и доступен для покупки до {date} (бакинское время).",
    "oly2.avail.scheduled":
      "Продажи ещё не начались — пакет появится в открытой продаже {date} (бакинское время).",
    "oly2.avail.closes": "Продажи закроются {date} (бакинское время).",
    "oly2.avail.expired":
      "Продажи завершились {date} (бакинское время) — пакет больше не виден публично. У купивших доступ остаётся пожизненно.",
    "oly2.avail.archived":
      "Пакет в архиве — он не виден публично. У купивших доступ остаётся пожизненно.",
    "oly2.avail.inactive": "Пакет неактивен — он не виден публично.",
  },
};

export function olympiadLocalStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

// Full merged dictionary (az fallback under the locale) for client components
// that need many keys at once (create form, grades manager).
export function olympiadLocalDict(locale: Locale): Record<string, string> {
  return { ...STRINGS.az, ...(STRINGS[locale] ?? {}) };
}
