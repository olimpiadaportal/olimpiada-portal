import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Subscription Pricing screen that are NOT yet
// in the shared dictionary (admin-panel/src/i18n/messages.ts). Mirrors the
// locations/settings labels.ts pattern (Round 21): keeps the UI fully
// trilingual today; these should be migrated into messages.ts by the agent
// that owns admin message additions. `nav.pricing` lives here too so the
// sidebar label renders translated until messages.ts gains the key.
// Reusable strings (action.save, manage.saving, settings.saved, err.server)
// still come from getT() — these are only the gaps.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "nav.pricing": "Qiymətlər",
    "pricing.title": "Abunəlik qiymətləri",
    "pricing.subtitle":
      "Hər fənn üçün həftəlik, aylıq və illik abunəlik qiymətlərini idarə et.",
    "pricing.subject": "Fənn",
    "pricing.weekly": "Həftəlik",
    "pricing.monthly": "Aylıq",
    "pricing.yearly": "İllik",
    "pricing.currencyNote": "Bütün qiymətlər AZN ilə göstərilir.",
    "pricing.repriceNote":
      "Ödəniş zamanı qiymət həmişə serverdə yenidən hesablanır. Mövcud abunəliklər yenilənmə və ya dəyişiklik edilənə qədər köhnə qiymətlə davam edir.",
    "pricing.notSet": "Qiymət təyin edilməyib",
    "pricing.empty": "Aktiv fənn yoxdur. Əvvəlcə Fənlər bölməsində fənn əlavə edin.",
    "pricing.loadError":
      "Qiymət məlumatı yüklənmədi. Səhifəni yeniləyib yenidən cəhd edin.",
    "pricing.err.amount":
      "Məbləğ 0-dan böyük, 10000-dən çox olmayan və ən çoxu 2 onluq rəqəmli olmalıdır.",
  },
  en: {
    "nav.pricing": "Pricing",
    "pricing.title": "Subscription pricing",
    "pricing.subtitle":
      "Manage the weekly, monthly and yearly subscription price for each subject.",
    "pricing.subject": "Subject",
    "pricing.weekly": "Weekly",
    "pricing.monthly": "Monthly",
    "pricing.yearly": "Yearly",
    "pricing.currencyNote": "All prices are shown in AZN.",
    "pricing.repriceNote":
      "Checkout always reprices on the server. Existing subscriptions keep their current price until they renew or change.",
    "pricing.notSet": "No price set",
    "pricing.empty": "No active subjects. Add a subject under Subjects first.",
    "pricing.loadError":
      "Could not load the pricing data. Refresh the page and try again.",
    "pricing.err.amount":
      "Enter an amount above 0, at most 10000, with up to 2 decimal places.",
  },
  ru: {
    "nav.pricing": "Цены",
    "pricing.title": "Цены подписок",
    "pricing.subtitle":
      "Управляйте недельной, месячной и годовой ценой подписки для каждого предмета.",
    "pricing.subject": "Предмет",
    "pricing.weekly": "Еженедельно",
    "pricing.monthly": "Ежемесячно",
    "pricing.yearly": "Ежегодно",
    "pricing.currencyNote": "Все цены указаны в AZN.",
    "pricing.repriceNote":
      "При оплате цена всегда пересчитывается на сервере. Действующие подписки сохраняют текущую цену до продления или изменения.",
    "pricing.notSet": "Цена не задана",
    "pricing.empty":
      "Нет активных предметов. Сначала добавьте предмет в разделе «Предметы».",
    "pricing.loadError":
      "Не удалось загрузить данные о ценах. Обновите страницу и попробуйте ещё раз.",
    "pricing.err.amount":
      "Введите сумму больше 0, не более 10000 и максимум с 2 знаками после запятой.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
