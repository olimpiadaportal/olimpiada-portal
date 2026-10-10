import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Accounts page's child-avatar column that
// are NOT yet in the shared dictionary (admin-panel/src/i18n/messages.ts).
// Mirrors the established labels.ts pattern (cities/settings/olympiad); these
// should be migrated into messages.ts by the agent that owns admin message
// additions (reported in followups).
//
// Avatar display is READ-ONLY here: preset avatars render the shared boy/girl
// art (public/avatars, same files as the web-app); a custom photo (PRIVATE
// child-avatars bucket) renders as a plain indicator — the panel deliberately
// does not fetch the private object.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "accounts.avatar.boy": "Oğlan",
    "accounts.avatar.girl": "Qız",
    "accounts.avatar.photo": "Öz şəkli",
    "accounts.access.manage": "Giriş və sınaq",
    "accounts.access.title": "Uşağın ortaq girişi",
    "accounts.access.owner": "Hesab sahibi",
    "accounts.access.none": "Başqa valideyn qoşulmayıb.",
    "accounts.access.remove": "Girişi ləğv et",
    "accounts.access.back": "Hesablara qayıt",
    "accounts.access.saved": "Ortaq giriş ləğv edildi.",
    "accounts.access.error": "Ortaq girişi ləğv etmək mümkün olmadı.",
    "accounts.trial.title": "24 saatlıq pulsuz sınaq",
    "accounts.trial.none": "Valideyn hələ sınağı başlatmayıb.",
    "accounts.trial.active": "Aktivdir",
    "accounts.trial.ended": "Bitib",
    "accounts.trial.extended": "Uzadılıb",
    "accounts.trial.endsAt": "Bitmə vaxtı",
    "accounts.trial.subjects": "Fənlər",
    "accounts.trial.extendNote": "Qeyd (istəyə bağlı)",
    "accounts.trial.extend": "Sınaq müddətini uzat",
    "accounts.trial.extendHint": "Əlavə pulsuz müddət yalnız sınaq bitdikdən sonra verilə bilər. Ödəniş alınmır; müddət və limit sistem ayarlarındadır (trial.extension_hours, trial.max_extensions).",
    "accounts.trial.saved": "Sınaq müddəti uzadıldı.",
    "accounts.trial.err.noTrial": "Bu uşağın sınağı yoxdur.",
    "accounts.trial.err.stillActive": "Sınaq hələ davam edir — uzatma yalnız bitdikdən sonra mümkündür.",
    "accounts.trial.err.limit": "Uzatma limiti dolub.",
    "accounts.trial.err.notAdmin": "Bu əməliyyat yalnız administrator üçündür.",
    "accounts.trial.err.generic": "Sınaq müddətini uzatmaq mümkün olmadı.",
  },
  en: {
    "accounts.avatar.boy": "Boy",
    "accounts.avatar.girl": "Girl",
    "accounts.avatar.photo": "Photo set",
    "accounts.access.manage": "Access & trial",
    "accounts.access.title": "Shared child access",
    "accounts.access.owner": "Account owner",
    "accounts.access.none": "No other parent is linked.",
    "accounts.access.remove": "Remove access",
    "accounts.access.back": "Back to accounts",
    "accounts.access.saved": "Shared access was removed.",
    "accounts.access.error": "Shared access could not be removed.",
    "accounts.trial.title": "24-hour free trial",
    "accounts.trial.none": "The parent has not started the trial yet.",
    "accounts.trial.active": "Active",
    "accounts.trial.ended": "Ended",
    "accounts.trial.extended": "Extended",
    "accounts.trial.endsAt": "Ends",
    "accounts.trial.subjects": "Subjects",
    "accounts.trial.extendNote": "Note (optional)",
    "accounts.trial.extend": "Grant trial extension",
    "accounts.trial.extendHint": "An extra free window can only be granted after the trial has ended. Nothing is charged; its length and limit are system settings (trial.extension_hours, trial.max_extensions).",
    "accounts.trial.saved": "Trial extension granted.",
    "accounts.trial.err.noTrial": "This child has no trial.",
    "accounts.trial.err.stillActive": "The trial is still running — an extension can only follow it.",
    "accounts.trial.err.limit": "The extension limit has been reached.",
    "accounts.trial.err.notAdmin": "Only an administrator can do this.",
    "accounts.trial.err.generic": "The trial could not be extended.",
  },
  ru: {
    "accounts.avatar.boy": "Мальчик",
    "accounts.avatar.girl": "Девочка",
    "accounts.avatar.photo": "Своё фото",
    "accounts.access.manage": "Доступ и пробный период",
    "accounts.access.title": "Общий доступ к ребёнку",
    "accounts.access.owner": "Владелец аккаунта",
    "accounts.access.none": "Другие родители не подключены.",
    "accounts.access.remove": "Закрыть доступ",
    "accounts.access.back": "Назад к аккаунтам",
    "accounts.access.saved": "Общий доступ закрыт.",
    "accounts.access.error": "Не удалось закрыть общий доступ.",
    "accounts.trial.title": "24-часовой пробный период",
    "accounts.trial.none": "Родитель ещё не запускал пробный период.",
    "accounts.trial.active": "Активен",
    "accounts.trial.ended": "Закончился",
    "accounts.trial.extended": "Продлён",
    "accounts.trial.endsAt": "Окончание",
    "accounts.trial.subjects": "Предметы",
    "accounts.trial.extendNote": "Примечание (необязательно)",
    "accounts.trial.extend": "Продлить пробный период",
    "accounts.trial.extendHint": "Дополнительный бесплатный период можно выдать только после окончания пробного. Ничего не списывается; длительность и лимит задаются в настройках (trial.extension_hours, trial.max_extensions).",
    "accounts.trial.saved": "Пробный период продлён.",
    "accounts.trial.err.noTrial": "У этого ребёнка нет пробного периода.",
    "accounts.trial.err.stillActive": "Пробный период ещё идёт — продлить можно только после его окончания.",
    "accounts.trial.err.limit": "Лимит продлений исчерпан.",
    "accounts.trial.err.notAdmin": "Это действие доступно только администратору.",
    "accounts.trial.err.generic": "Не удалось продлить пробный период.",
  },
};

// Standalone lookup (az fallback, then the key itself) — same contract as the
// other labels.ts files.
export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
