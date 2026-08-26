import type { Locale } from "@/i18n/config";

// Local trilingual strings for the finance / support view. Mirrors the
// established labels.ts pattern (accounts / olympiad / settings); these should
// be migrated into the shared dictionary by the agent that owns admin message
// additions.
//
// TWO PILLS, NEVER ONE. Every row states what happened to the MONEY and,
// separately, what happened to the THING BOUGHT. The wording is chosen so the
// pair reads as a sentence: "succeeded / not delivered" has to be immediately
// legible as "we took their money and gave them nothing", because that is the
// state this whole view exists to surface.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "fin.title": "Ödəniş dəstəyi",
    "fin.subtitle":
      "Bir ailənin ödənişləri və girişi. Yalnız oxumaq üçün — buradan heç nə dəyişdirilmir.",
    "fin.search.label": "Valideyn e-poçtu, uşağın adı, 8 rəqəmli nömrə və ya sifariş nömrəsi",
    "fin.search.button": "Axtar",
    "fin.search.empty": "Nəticə tapılmadı.",
    "fin.search.hint": "Axtarmaq üçün ən azı 2 simvol yazın.",
    "fin.attention.title": "Diqqət tələb edir",
    "fin.attention.mode": "Ödəniş rejimi",
    "fin.attention.undelivered": "Pul alınıb, heç nə verilməyib",
    "fin.attention.undeliveredNote":
      "Bu vəziyyət yoxlama növbəsində GÖRÜNMÜR — növbə yalnız icra olunmuş sifarişlərə baxır.",
    "fin.attention.reviews": "Açıq yoxlama",
    "fin.attention.reviewsLink": "Yoxlama növbəsinə keç",
    "fin.giveaway.banner":
      "Hazırda kampaniya aktivdir: bütün uşaqların girişi pulsuzdur. «Niyə bu uşağın girişi var?» sualının cavabı budur — ödəniş axtarmağa ehtiyac yoxdur.",
    "fin.family.title": "Ailə",
    "fin.family.children": "Uşaqlar",
    "fin.family.orders": "Sifarişlər",
    "fin.family.noOrders": "Bu ailə üçün heç bir sifariş yoxdur.",
    "fin.family.grants": "Ödənişsiz giriş",
    "fin.family.grantsNote":
      "Bu girişlər üçün heç bir ödəniş yoxdur — komplimentar, məktəb lisenziyası və ya pulsuz sınaq. «Ödəniş tapılmadı» burada cavabdır, nasazlıq deyil.",
    "fin.family.notFound": "Belə bir valideyn tapılmadı.",
    "fin.order.title": "Sifariş",
    "fin.order.notFound": "Belə bir sifariş tapılmadı.",
    "fin.order.events": "Hadisələr",
    "fin.order.refs": "Bank arayışları",
    "fin.order.refsNote":
      "Mübahisə zamanı bankın soruşduğu nömrələr. Ekran şəkli çəkərkən diqqətli olun.",
    "fin.order.backToFamily": "Ailəyə qayıt",
    "fin.col.order": "Sifariş",
    "fin.col.date": "Tarix",
    "fin.col.amount": "Məbləğ",
    "fin.col.money": "Pul",
    "fin.col.delivery": "Təhvil",
    "fin.money.pending": "gözləyir",
    "fin.money.succeeded": "alınıb",
    "fin.money.failed": "alınmayıb",
    "fin.money.canceled": "ləğv edilib",
    "fin.money.refunded": "geri qaytarılıb",
    "fin.money.no_payment_row": "ödəniş qeydi yoxdur",
    "fin.money.not_a_charge": "müştəri ödənişi deyil",
    "fin.delivery.not_delivered": "verilməyib",
    "fin.delivery.delivered": "verilib",
    "fin.delivery.held_for_review": "yoxlamada saxlanılır",
    "fin.delivery.delivered_then_flagged": "verilib, qeydlə",
    "fin.delivery.revoked": "geri alınıb",
    "fin.delivery.not_applicable": "aid deyil",
    "fin.flag.undelivered": "Pul alınıb, heç nə verilməyib",
    "fin.note.settledWindow":
      "Bu, bankdan sonuncu soruşduğumuz vəziyyətdir. 24 saatdan sonra bank sorğuya cavab vermir, ona görə bu, bankın son hesabatı deyil.",
    "fin.serviceMissing":
      "Server açarı təyin edilməyib — bu səhifə məlumat oxuya bilmir.",
    "fin.loadError": "Məlumat yüklənmədi.",
  },
  en: {
    "fin.title": "Payment support",
    "fin.subtitle":
      "One family's payments and access. Read-only — nothing is changed from here.",
    "fin.search.label": "Parent email, child name, 8-digit ID or order number",
    "fin.search.button": "Search",
    "fin.search.empty": "Nothing found.",
    "fin.search.hint": "Type at least 2 characters to search.",
    "fin.attention.title": "Needs attention",
    "fin.attention.mode": "Payment mode",
    "fin.attention.undelivered": "Money taken, nothing delivered",
    "fin.attention.undeliveredNote":
      "This state is INVISIBLE to the review queue — that queue only looks at orders that were redeemed.",
    "fin.attention.reviews": "Open reviews",
    "fin.attention.reviewsLink": "Go to the review queue",
    "fin.giveaway.banner":
      "A campaign is running: access is free for every child. That is the answer to \"why does this child have access?\" — there is no payment to look for.",
    "fin.family.title": "Family",
    "fin.family.children": "Children",
    "fin.family.orders": "Orders",
    "fin.family.noOrders": "No orders for this family.",
    "fin.family.grants": "Access without payment",
    "fin.family.grantsNote":
      "These grants have no payment behind them — comped, school licence or the free trial. Here, \"no payment found\" is the answer, not a fault.",
    "fin.family.notFound": "No such parent.",
    "fin.order.title": "Order",
    "fin.order.notFound": "No such order.",
    "fin.order.events": "Events",
    "fin.order.refs": "Bank references",
    "fin.order.refsNote":
      "The numbers the bank asks for in a dispute. Take care when screenshotting.",
    "fin.order.backToFamily": "Back to the family",
    "fin.col.order": "Order",
    "fin.col.date": "Date",
    "fin.col.amount": "Amount",
    "fin.col.money": "Money",
    "fin.col.delivery": "Delivery",
    "fin.money.pending": "pending",
    "fin.money.succeeded": "taken",
    "fin.money.failed": "failed",
    "fin.money.canceled": "canceled",
    "fin.money.refunded": "refunded",
    "fin.money.no_payment_row": "no payment record",
    "fin.money.not_a_charge": "not a customer charge",
    "fin.delivery.not_delivered": "not delivered",
    "fin.delivery.delivered": "delivered",
    "fin.delivery.held_for_review": "held for review",
    "fin.delivery.delivered_then_flagged": "delivered, with a note",
    "fin.delivery.revoked": "revoked",
    "fin.delivery.not_applicable": "not applicable",
    "fin.flag.undelivered": "Money taken, nothing delivered",
    "fin.note.settledWindow":
      "This is what we last asked the gateway. Beyond 24 hours it stops answering, so this is not the acquirer's book of record.",
    "fin.serviceMissing": "The service key is not set — this page cannot read data.",
    "fin.loadError": "Could not load the data.",
  },
  ru: {
    "fin.title": "Поддержка по платежам",
    "fin.subtitle":
      "Платежи и доступ одной семьи. Только чтение — отсюда ничего не меняется.",
    "fin.search.label": "E-mail родителя, имя ребёнка, 8-значный номер или номер заказа",
    "fin.search.button": "Найти",
    "fin.search.empty": "Ничего не найдено.",
    "fin.search.hint": "Введите минимум 2 символа.",
    "fin.attention.title": "Требует внимания",
    "fin.attention.mode": "Режим оплаты",
    "fin.attention.undelivered": "Деньги списаны, ничего не выдано",
    "fin.attention.undeliveredNote":
      "Это состояние НЕ ВИДНО в очереди проверки — она смотрит только на исполненные заказы.",
    "fin.attention.reviews": "Открытых проверок",
    "fin.attention.reviewsLink": "Перейти к очереди проверки",
    "fin.giveaway.banner":
      "Идёт кампания: доступ бесплатный для всех детей. Это и есть ответ на вопрос «почему у ребёнка есть доступ» — платёж искать не нужно.",
    "fin.family.title": "Семья",
    "fin.family.children": "Дети",
    "fin.family.orders": "Заказы",
    "fin.family.noOrders": "Для этой семьи заказов нет.",
    "fin.family.grants": "Доступ без оплаты",
    "fin.family.grantsNote":
      "За этими доступами нет платежа — льготный, школьная лицензия или бесплатный доступ. Здесь «платёж не найден» — это ответ, а не сбой.",
    "fin.family.notFound": "Такой родитель не найден.",
    "fin.order.title": "Заказ",
    "fin.order.notFound": "Такой заказ не найден.",
    "fin.order.events": "События",
    "fin.order.refs": "Банковские ссылки",
    "fin.order.refsNote":
      "Номера, которые банк запрашивает при споре. Будьте осторожны со скриншотами.",
    "fin.order.backToFamily": "К семье",
    "fin.col.order": "Заказ",
    "fin.col.date": "Дата",
    "fin.col.amount": "Сумма",
    "fin.col.money": "Деньги",
    "fin.col.delivery": "Выдача",
    "fin.money.pending": "ожидает",
    "fin.money.succeeded": "списаны",
    "fin.money.failed": "не прошёл",
    "fin.money.canceled": "отменён",
    "fin.money.refunded": "возвращены",
    "fin.money.no_payment_row": "записи о платеже нет",
    "fin.money.not_a_charge": "не клиентский платёж",
    "fin.delivery.not_delivered": "не выдано",
    "fin.delivery.delivered": "выдано",
    "fin.delivery.held_for_review": "на проверке",
    "fin.delivery.delivered_then_flagged": "выдано, с пометкой",
    "fin.delivery.revoked": "отозвано",
    "fin.delivery.not_applicable": "неприменимо",
    "fin.flag.undelivered": "Деньги списаны, ничего не выдано",
    "fin.note.settledWindow":
      "Это то, что мы последний раз запросили у шлюза. Через 24 часа он перестаёт отвечать, поэтому это не итоговая выписка эквайера.",
    "fin.serviceMissing": "Сервисный ключ не задан — страница не может читать данные.",
    "fin.loadError": "Не удалось загрузить данные.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  return (key: string) => dict[key] ?? STRINGS.az[key] ?? key;
}
