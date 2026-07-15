import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Settings screen's Academic card that are
// NOT yet in the shared dictionary (admin-panel/src/i18n/messages.ts). Mirrors
// the cities/districts labels.ts pattern: keeps the UI fully trilingual today;
// these should be migrated into messages.ts by the agent that owns admin
// message additions (reported in followups).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "settings.academic.title": "Cari tədris ili / rüb",
    "settings.academic.desc":
      "Gündəlik raundların sual hovuzlarını idarə edən təqvim parametrləri.",
    "settings.academic.cumulativeNote":
      "Rüb gündəlik raundların sual hovuzunu kumulyativ idarə edir: seçilmiş rüblə yanaşı əvvəlki rüblərin mövzuları da daxil olur.",
    "settings.sys.academic_year.label": "Cari tədris ili",
    "settings.sys.academic_year.help": "Məsələn: 2026-2027.",
    "settings.sys.academic_term.label": "Cari rüb",
    "settings.sys.academic_term.help": "Tədris ilinin cari rübü (1–4).",
    "settings.academic.term.1": "1-ci rüb",
    "settings.academic.term.2": "2-ci rüb",
    "settings.academic.term.3": "3-cü rüb",
    "settings.academic.term.4": "4-cü rüb",
  },
  en: {
    "settings.academic.title": "Current academic year / term",
    "settings.academic.desc":
      "Calendar settings that drive the daily-round question pools.",
    "settings.academic.cumulativeNote":
      "The term drives the daily-round question pool cumulatively: topics from the selected term and every earlier term are included.",
    "settings.sys.academic_year.label": "Current academic year",
    "settings.sys.academic_year.help": "For example: 2026-2027.",
    "settings.sys.academic_term.label": "Current term",
    "settings.sys.academic_term.help": "The current term of the school year (1–4).",
    "settings.academic.term.1": "Term 1",
    "settings.academic.term.2": "Term 2",
    "settings.academic.term.3": "Term 3",
    "settings.academic.term.4": "Term 4",
  },
  ru: {
    "settings.academic.title": "Текущий учебный год / четверть",
    "settings.academic.desc":
      "Параметры календаря, управляющие пулами вопросов ежедневных раундов.",
    "settings.academic.cumulativeNote":
      "Четверть управляет пулом вопросов ежедневных раундов кумулятивно: включаются темы выбранной четверти и всех предыдущих.",
    "settings.sys.academic_year.label": "Текущий учебный год",
    "settings.sys.academic_year.help": "Например: 2026-2027.",
    "settings.sys.academic_term.label": "Текущая четверть",
    "settings.sys.academic_term.help": "Текущая четверть учебного года (1–4).",
    "settings.academic.term.1": "1-я четверть",
    "settings.academic.term.2": "2-я четверть",
    "settings.academic.term.3": "3-я четверть",
    "settings.academic.term.4": "4-я четверть",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
