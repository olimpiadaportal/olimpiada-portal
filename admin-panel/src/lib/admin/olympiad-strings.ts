import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Olympiad module that are NOT yet in the
// shared dictionary (admin-panel/src/i18n/messages.ts). Plain module (no
// "use server") so both the server pages and lib/admin/olympiad.ts can import
// the constants. These should be migrated into messages.ts by the agent that
// owns admin message additions (reported in followups).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    // bulk_insert_olympiad_package_questions is creation-only: the DB rejects
    // importing into a package that already has questions.
    "oly2.err.creationOnly":
      "Sual hovuzu yalnız paket yaradılarkən yüklənir. Mövcud paketə sonradan sual əlavə etmək mümkün deyil — dəyişiklik lazımdırsa, yeni paket yaradın.",
    // Attempts include ALL uploaded questions (no fixed per-attempt count).
    "oly2.allQuestionsNote":
      "Hər cəhdə paketin bütün dərc edilmiş sualları daxil olur — sabit sual sayı yoxdur.",
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
    "oly2.err.creationOnly":
      "The question pool can only be uploaded when the package is created. Questions cannot be added to an existing package later — create a new package if changes are needed.",
    "oly2.allQuestionsNote":
      "Every attempt includes ALL of the package's published questions — there is no fixed per-attempt count.",
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
    "oly2.err.creationOnly":
      "Пул вопросов загружается только при создании пакета. Добавить вопросы в существующий пакет позже нельзя — при необходимости создайте новый пакет.",
    "oly2.allQuestionsNote":
      "Каждая попытка включает все опубликованные вопросы пакета — фиксированного количества вопросов нет.",
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
