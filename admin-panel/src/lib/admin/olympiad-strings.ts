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
  },
  en: {
    "oly2.err.creationOnly":
      "The question pool can only be uploaded when the package is created. Questions cannot be added to an existing package later — create a new package if changes are needed.",
    "oly2.allQuestionsNote":
      "Every attempt includes ALL of the package's published questions — there is no fixed per-attempt count.",
  },
  ru: {
    "oly2.err.creationOnly":
      "Пул вопросов загружается только при создании пакета. Добавить вопросы в существующий пакет позже нельзя — при необходимости создайте новый пакет.",
    "oly2.allQuestionsNote":
      "Каждая попытка включает все опубликованные вопросы пакета — фиксированного количества вопросов нет.",
  },
};

export function olympiadLocalStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
