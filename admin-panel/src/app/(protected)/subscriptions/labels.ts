import type { Locale } from "@/i18n/config";

// Local trilingual strings for the admin Subscriptions section (list, detail,
// lifecycle actions). Mirrors the pricing/labels.ts pattern: only the GAPS not
// already in the shared dictionary (src/i18n/messages.ts) live here — reusable
// strings (action.cancel, action.save, manage.saving, modal.close, err.server,
// flt.noMatches, qfilter.clear, qpage.*, manage.back) still come from getT().
// `nav.subscriptions` already exists trilingually in messages.ts, so it is NOT
// duplicated here.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "subs.subtitle":
      "Uşaq abunəliklərini idarə et: komplimentar və ya inzibatçı tərəfindən verilmiş girişləri fəallaşdır, uzat, ləğv et və ya bitir. Ödəniş provayderi hələ qoşulmayıb.",

    // Filters
    "subs.filter.search": "Uşaq və ya valideyn (ad / e-poçt)",
    "subs.filter.status": "Status",
    "subs.filter.interval": "Dövr",
    "subs.filter.provider": "Mənbə",
    "subs.filter.periodEndFrom": "Dövrün bitməsi (başlanğıc)",
    "subs.filter.periodEndTo": "Dövrün bitməsi (son)",
    "subs.filter.all": "Hamısı",
    "subs.filter.apply": "Tətbiq et",

    // Columns
    "subs.col.child": "Uşaq",
    "subs.col.parent": "Valideyn",
    "subs.col.subjects": "Fənlər",
    "subs.col.interval": "Dövr",
    "subs.col.status": "Status",
    "subs.col.amount": "Məbləğ",
    "subs.col.source": "Mənbə",
    "subs.col.trialEnd": "Sınaq bitir",
    "subs.col.periodEnd": "Dövr bitir",
    // Migration 109 — per-subject cycles. total_amount is now the NEXT
    // invoice, current_period_end is when COVERAGE ends and next_renewal_at is
    // the next charge, so the columns say which is which.
    "subs.col.nextInvoice": "Növbəti hesab",
    "subs.col.nextCharge": "Növbəti ödəniş",
    "subs.mixedCycles": "qarışıq",
    "subs.plan.pendingCycle": "Planlaşdırılmış dövr",
    "subs.plan.scheduledRemoval": "Silinmə tarixi",
    "subs.col.updated": "Yenilənib",
    "subs.col.actions": "",

    "subs.action.view": "Ətraflı",
    "subs.none": "Heç bir abunəlik yoxdur.",

    // Statuses
    "subs.status.trialing": "Sınaq müddəti",
    "subs.status.active": "Aktiv",
    "subs.status.past_due": "Ödəniş gecikib",
    "subs.status.canceled": "Ləğv edilib",
    "subs.status.expired": "Bitib",
    "subs.status.incomplete": "Tamamlanmayıb",

    // Intervals
    "subs.interval.week": "Həftəlik",
    "subs.interval.month": "Aylıq",
    "subs.interval.year": "İllik",

    // Source / provider
    "subs.source.none": "Provayder yoxdur",
    "subs.source.comped": "Komplimentar",

    // Detail page
    "subs.detail.back": "Abunəliklərə qayıt",
    "subs.detail.parentSection": "Valideyn",
    "subs.detail.childSection": "Uşaq",
    "subs.detail.email": "E-poçt",
    "subs.detail.childAccessStatus": "Uşağın giriş statusu",
    "subs.detail.childId": "Uşaq ID",
    "subs.detail.subjectsSection": "Fənlər",
    "subs.detail.noSubjects": "Bu abunəliyə fənn əlavə edilməyib.",
    "subs.detail.billingSection": "Qiymət və dövr",
    "subs.detail.interval": "Dövr",
    "subs.detail.status": "Status",
    "subs.detail.baseAmount": "Baza məbləği",
    "subs.detail.discount": "Bacı/qardaş endirimi",
    "subs.detail.discountNone": "Endirim yoxdur",
    "subs.detail.totalAmount": "Yekun məbləğ",
    "subs.detail.trialStart": "Sınaq başlayıb",
    "subs.detail.trialEnd": "Sınaq bitir",
    "subs.detail.periodStart": "Cari dövr başlayıb",
    "subs.detail.periodEnd": "Cari dövr bitir",
    "subs.detail.coverageEnds": "Giriş bitir (bütün fənlər)",
    "subs.detail.nextCharge": "Növbəti ödəniş",
    "subs.detail.created": "Yaradılıb",
    "subs.detail.updated": "Son yenilənmə",
    "subs.detail.provider": "Ödəniş mənbəyi",
    "subs.detail.providerSubId": "Provayder abunəlik ID",
    "subs.detail.siblingSection": "Bacı/qardaş endirimi qeydi",
    "subs.detail.siblingRank": "Ailədə sıra",
    "subs.detail.siblingPercent": "Endirim faizi",
    "subs.detail.siblingAppliedAt": "Tətbiq olunub",
    "subs.detail.siblingNone":
      "Bu abunəlik üçün ayrıca bacı/qardaş endirim qeydi yoxdur.",
    "subs.detail.paymentTitle": "Ödəniş əməliyyatı",
    "subs.detail.paymentNote":
      "Real ödəniş provayderi hələ qoşulmayıb — bu giriş üçün heç bir pul əməliyyatı olmayıb (inzibatçı tərəfindən verilmiş və ya komplimentar giriş). Heç bir ödəniş qeydi yaradılmayıb.",
    "subs.detail.actionsSection": "Əməliyyatlar",
    "subs.detail.noActions":
      "Bu status üçün mövcud əməliyyat yoxdur (son vəziyyət).",
    "subs.detail.notFound": "Abunəlik tapılmadı.",

    // Lifecycle actions
    "subs.action.activate.button": "Fəallaşdır",
    "subs.action.activate.title": "Abunəliyi fəallaşdır",
    "subs.action.activate.body":
      "Abunəlik dərhal aktiv ediləcək və yeni bir ödəniş dövrü açılacaq.",
    "subs.action.activate.confirm": "Bəli, fəallaşdır",
    "subs.action.activate.done": "Abunəlik fəallaşdırıldı.",

    "subs.action.cancel.button": "Ləğv et",
    "subs.action.cancel.title": "Abunəliyi ləğv et",
    "subs.action.cancel.body":
      "Abunəlik ləğv ediləcək, lakin uşaq cari dövrün sonuna qədər girişini saxlayacaq.",
    "subs.action.cancel.confirm": "Bəli, ləğv et",
    "subs.action.cancel.done": "Abunəlik ləğv edildi.",

    "subs.action.expire.button": "Girişi indi bitir",
    "subs.action.expire.title": "Girişi dərhal bitir",
    "subs.action.expire.body":
      "Uşağın girişi DƏRHAL ləğv ediləcək (dövrün sonunu gözləmədən). Bu geri qaytarıla bilməz.",
    "subs.action.expire.confirm": "Bəli, indi bitir",
    "subs.action.expire.done": "Giriş dərhal bitirildi.",

    "subs.action.extend.button": "Uzat",
    "subs.action.extend.title": "Abunəlik dövrünü uzat",
    "subs.action.extend.body":
      "Cari dövrün bitmə tarixinə göstərilən gün sayı əlavə olunacaq.",
    "subs.action.extend.confirm": "Uzat",
    "subs.action.extend.done": "Abunəlik uzadıldı.",
    "subs.action.daysLabel": "Neçə gün",
    "subs.action.daysHint": "1 ilə 730 gün arasında.",

    // Errors (RPC error → friendly, never raw Postgres text)
    "subs.err.forbidden": "Bu əməliyyat üçün icazəniz yoxdur.",
    "subs.err.notFound": "Abunəlik tapılmadı.",
    "subs.err.invalidTransition":
      "Bu status dəyişikliyi mövcud vəziyyətdən mümkün deyil. Səhifəni yeniləyin.",
    "subs.err.badDays": "Gün sayı 1 ilə 730 arasında olmalıdır.",
    "subs.err.unknownAction": "Naməlum əməliyyat.",
    "subs.err.duplicateLive":
      "Bu uşağın artıq aktiv abunəliyi var — eyni anda yalnız bir aktiv abunəlik ola bilər.",
    "subs.noServiceKey":
      "Server SUPABASE_SERVICE_ROLE_KEY açarını tapmır. Abunəlikləri idarə etmək üçün onu admin-panel/.env.local faylına (yalnız server) əlavə edin və yenidən başladın.",

    // Migration 127 — the CHECKOUT REVIEW queue. `needs_review` is the
    // database's way of saying "we are holding a family's money and have not
    // delivered on it"; until 127 it reached only 013 check 118.
    "ckrev.title": "Ödəniş baxışı",
    "ckrev.subtitle":
      "Ödənişi alınmış, lakin çatdırıla bilməmiş sifarişlər — və çatdırılmış, amma sonradan problem yaranmış olanlar. Hər sətir ya ailəyə aldığı şeyi, ya da pulunu qaytarmağı tələb edir.",
    "ckrev.nav": "Ödəniş baxışı",
    "ckrev.empty": "Baxış gözləyən ödəniş yoxdur.",
    "ckrev.openCount": "{n} açıq",
    "ckrev.col.order": "Sifariş",
    "ckrev.col.what": "Nə alınıb",
    "ckrev.col.family": "Ailə",
    "ckrev.col.amount": "Məbləğ",
    "ckrev.col.reason": "Səbəb",
    "ckrev.col.decidedAt": "Qərar tarixi",
    "ckrev.col.action": "Nəticə",
    "ckrev.kind.plan_start": "Yeni abunəlik",
    "ckrev.kind.plan_change": "Abunəlik dəyişikliyi",
    "ckrev.kind.olympiad": "Olimpiada paketi",
    "ckrev.status.needs_review": "Pul bizdədir, çatdırılmayıb",
    "ckrev.status.applied": "Çatdırılıb, sonrakı addım alınmadı",
    // Bankdan geri qaytarılma: pul artıq ailədədir. Bu sətir "pul bizdədir"
    // yazısını əvəz edir — yoxsa operator geri qaytarılmış ödəniş üçün girişi
    // əl ilə açar.
    "ckrev.status.refunded": "Pul geri qaytarılıb — borcumuz yoxdur",
    "ckrev.resolved": "Həll olunub",
    "ckrev.resolvePlaceholder": "Nə etdiniz? (məs. pul geri qaytarıldı, ailə ilə danışıldı)",
    "ckrev.resolve": "Nəticəni yaz",
    "ckrev.resolving": "Yazılır…",
    "ckrev.resolveHint":
      "Statusu dəyişmir — status pulun taleyini saxlayır. Yalnız nə etdiyinizi qeyd edir və audit jurnalına yazılır. Pul geri qaytarılıbsa da bir cümlə yazın: sıra yalnız bundan sonra bağlanır.",
    "ckrev.err.needResolution": "Nə etdiyinizi yazın.",
    "ckrev.err.notFound": "Bu sifariş üzrə qərar verilmiş ödəniş tapılmadı.",
    "ckrev.noServiceKey":
      "Server SUPABASE_SERVICE_ROLE_KEY açarını tapmır. Ödəniş baxışını görmək üçün onu admin-panel/.env.local faylına (yalnız server) əlavə edin və yenidən başladın.",
  },
  en: {
    "subs.subtitle":
      "Manage child subscriptions: activate, extend, cancel or expire comped and admin-granted access. No real payment provider is wired up yet.",

    "subs.filter.search": "Child or parent (name / email)",
    "subs.filter.status": "Status",
    "subs.filter.interval": "Interval",
    "subs.filter.provider": "Source",
    "subs.filter.periodEndFrom": "Period end from",
    "subs.filter.periodEndTo": "Period end to",
    "subs.filter.all": "All",
    "subs.filter.apply": "Apply",

    "subs.col.child": "Child",
    "subs.col.parent": "Parent",
    "subs.col.subjects": "Subjects",
    "subs.col.interval": "Interval",
    "subs.col.status": "Status",
    "subs.col.amount": "Amount",
    "subs.col.source": "Source",
    "subs.col.trialEnd": "Trial ends",
    "subs.col.periodEnd": "Period ends",
    // Migration 109 — per-subject cycles. total_amount is now the NEXT
    // invoice, current_period_end is when COVERAGE ends and next_renewal_at is
    // the next charge, so the columns say which is which.
    "subs.col.nextInvoice": "Next invoice",
    "subs.col.nextCharge": "Next charge",
    "subs.mixedCycles": "mixed",
    "subs.plan.pendingCycle": "Scheduled cycle",
    "subs.plan.scheduledRemoval": "Scheduled removal",
    "subs.col.updated": "Updated",
    "subs.col.actions": "",

    "subs.action.view": "Details",
    "subs.none": "No subscriptions.",

    "subs.status.trialing": "Trialing",
    "subs.status.active": "Active",
    "subs.status.past_due": "Past due",
    "subs.status.canceled": "Canceled",
    "subs.status.expired": "Expired",
    "subs.status.incomplete": "Incomplete",

    "subs.interval.week": "Weekly",
    "subs.interval.month": "Monthly",
    "subs.interval.year": "Yearly",

    "subs.source.none": "No provider",
    "subs.source.comped": "Comped",

    "subs.detail.back": "Back to Subscriptions",
    "subs.detail.parentSection": "Parent",
    "subs.detail.childSection": "Child",
    "subs.detail.email": "Email",
    "subs.detail.childAccessStatus": "Child's access status",
    "subs.detail.childId": "Child ID",
    "subs.detail.subjectsSection": "Subjects",
    "subs.detail.noSubjects": "No subjects on this subscription.",
    "subs.detail.billingSection": "Price and period",
    "subs.detail.interval": "Interval",
    "subs.detail.status": "Status",
    "subs.detail.baseAmount": "Base amount",
    "subs.detail.discount": "Sibling discount",
    "subs.detail.discountNone": "No discount",
    "subs.detail.totalAmount": "Total amount",
    "subs.detail.trialStart": "Trial started",
    "subs.detail.trialEnd": "Trial ends",
    "subs.detail.periodStart": "Current period started",
    "subs.detail.periodEnd": "Current period ends",
    "subs.detail.coverageEnds": "Coverage ends (all subjects)",
    "subs.detail.nextCharge": "Next charge",
    "subs.detail.created": "Created",
    "subs.detail.updated": "Last updated",
    "subs.detail.provider": "Payment source",
    "subs.detail.providerSubId": "Provider subscription ID",
    "subs.detail.siblingSection": "Sibling discount record",
    "subs.detail.siblingRank": "Rank among siblings",
    "subs.detail.siblingPercent": "Discount percent",
    "subs.detail.siblingAppliedAt": "Applied at",
    "subs.detail.siblingNone":
      "No separate sibling-discount record for this subscription.",
    "subs.detail.paymentTitle": "Payment transaction",
    "subs.detail.paymentNote":
      "No real payment provider is connected yet — no money moved for this access (admin-granted or comped). No payment record was created.",
    "subs.detail.actionsSection": "Actions",
    "subs.detail.noActions":
      "No actions are available for this status (terminal state).",
    "subs.detail.notFound": "Subscription not found.",

    "subs.action.activate.button": "Activate",
    "subs.action.activate.title": "Activate subscription",
    "subs.action.activate.body":
      "The subscription will be activated immediately and a new billing period will open.",
    "subs.action.activate.confirm": "Yes, activate",
    "subs.action.activate.done": "Subscription activated.",

    "subs.action.cancel.button": "Cancel",
    "subs.action.cancel.title": "Cancel subscription",
    "subs.action.cancel.body":
      "The subscription will be canceled, but the child keeps access until the current period ends.",
    "subs.action.cancel.confirm": "Yes, cancel",
    "subs.action.cancel.done": "Subscription canceled.",

    "subs.action.expire.button": "Expire access now",
    "subs.action.expire.title": "Expire access now",
    "subs.action.expire.body":
      "The child's access will be revoked IMMEDIATELY (not at period end). This cannot be undone.",
    "subs.action.expire.confirm": "Yes, expire now",
    "subs.action.expire.done": "Access expired immediately.",

    "subs.action.extend.button": "Extend",
    "subs.action.extend.title": "Extend subscription period",
    "subs.action.extend.body":
      "The current period end date will be pushed out by the number of days you enter.",
    "subs.action.extend.confirm": "Extend",
    "subs.action.extend.done": "Subscription extended.",
    "subs.action.daysLabel": "Number of days",
    "subs.action.daysHint": "Between 1 and 730 days.",

    "subs.err.forbidden": "You do not have permission for this action.",
    "subs.err.notFound": "Subscription not found.",
    "subs.err.invalidTransition":
      "That status change is not possible from the current state. Refresh the page.",
    "subs.err.badDays": "Days must be between 1 and 730.",
    "subs.err.unknownAction": "Unknown action.",
    "subs.err.duplicateLive":
      "This child already has a live subscription — only one can be active at a time.",
    "subs.noServiceKey":
      "The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to admin-panel/.env.local (server-only) and restart to manage subscriptions.",

    "ckrev.title": "Checkout review",
    "ckrev.subtitle":
      "Orders whose money was taken but could not be delivered — and ones that were delivered and then hit a problem. Every row is a family owed either the thing they paid for or their money back.",
    "ckrev.nav": "Checkout review",
    "ckrev.empty": "Nothing is waiting for review.",
    "ckrev.openCount": "{n} open",
    "ckrev.col.order": "Order",
    "ckrev.col.what": "What was bought",
    "ckrev.col.family": "Family",
    "ckrev.col.amount": "Amount",
    "ckrev.col.reason": "Reason",
    "ckrev.col.decidedAt": "Decided",
    "ckrev.col.action": "Outcome",
    "ckrev.kind.plan_start": "New subscription",
    "ckrev.kind.plan_change": "Subscription change",
    "ckrev.kind.olympiad": "Olympiad package",
    "ckrev.status.needs_review": "Money held, nothing delivered",
    "ckrev.status.applied": "Delivered, follow-up failed",
    "ckrev.status.refunded": "Money returned — nothing is owed",
    "ckrev.resolved": "Resolved",
    "ckrev.resolvePlaceholder": "What did you do? (e.g. refunded, spoke to the family)",
    "ckrev.resolve": "Record outcome",
    "ckrev.resolving": "Saving…",
    "ckrev.resolveHint":
      "This does not change the status — the status records what happened to the money. It only writes down what you did, and it is audited. Write a sentence even when the money has already been returned: that is what closes the row.",
    "ckrev.err.needResolution": "Say what you did.",
    "ckrev.err.notFound": "No decided payment was found for this order.",
    "ckrev.noServiceKey":
      "The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to admin-panel/.env.local (server-only) and restart to see the checkout review queue.",
  },
  ru: {
    "subs.subtitle":
      "Управляйте подписками детей: активируйте, продлевайте, отменяйте или завершайте льготный и выданный администратором доступ. Реальный платёжный провайдер пока не подключён.",

    "subs.filter.search": "Ребёнок или родитель (имя / email)",
    "subs.filter.status": "Статус",
    "subs.filter.interval": "Период",
    "subs.filter.provider": "Источник",
    "subs.filter.periodEndFrom": "Окончание периода от",
    "subs.filter.periodEndTo": "Окончание периода до",
    "subs.filter.all": "Все",
    "subs.filter.apply": "Применить",

    "subs.col.child": "Ребёнок",
    "subs.col.parent": "Родитель",
    "subs.col.subjects": "Предметы",
    "subs.col.interval": "Период",
    "subs.col.status": "Статус",
    "subs.col.amount": "Сумма",
    "subs.col.source": "Источник",
    "subs.col.trialEnd": "Пробный период до",
    "subs.col.periodEnd": "Период до",
    // Migration 109 — per-subject cycles. total_amount is now the NEXT
    // invoice, current_period_end is when COVERAGE ends and next_renewal_at is
    // the next charge, so the columns say which is which.
    "subs.col.nextInvoice": "Следующий счёт",
    "subs.col.nextCharge": "Следующее списание",
    "subs.mixedCycles": "смешанный",
    "subs.plan.pendingCycle": "Запланированный период",
    "subs.plan.scheduledRemoval": "Удаление запланировано",
    "subs.col.updated": "Обновлено",
    "subs.col.actions": "",

    "subs.action.view": "Подробнее",
    "subs.none": "Подписок нет.",

    "subs.status.trialing": "Пробный период",
    "subs.status.active": "Активна",
    "subs.status.past_due": "Просрочена оплата",
    "subs.status.canceled": "Отменена",
    "subs.status.expired": "Истекла",
    "subs.status.incomplete": "Не завершена",

    "subs.interval.week": "Еженедельно",
    "subs.interval.month": "Ежемесячно",
    "subs.interval.year": "Ежегодно",

    "subs.source.none": "Без провайдера",
    "subs.source.comped": "Льготная",

    "subs.detail.back": "Назад к подпискам",
    "subs.detail.parentSection": "Родитель",
    "subs.detail.childSection": "Ребёнок",
    "subs.detail.email": "Email",
    "subs.detail.childAccessStatus": "Статус доступа ребёнка",
    "subs.detail.childId": "ID ребёнка",
    "subs.detail.subjectsSection": "Предметы",
    "subs.detail.noSubjects": "К этой подписке не добавлены предметы.",
    "subs.detail.billingSection": "Цена и период",
    "subs.detail.interval": "Период",
    "subs.detail.status": "Статус",
    "subs.detail.baseAmount": "Базовая сумма",
    "subs.detail.discount": "Скидка за братьев/сестёр",
    "subs.detail.discountNone": "Без скидки",
    "subs.detail.totalAmount": "Итоговая сумма",
    "subs.detail.trialStart": "Пробный период начался",
    "subs.detail.trialEnd": "Пробный период заканчивается",
    "subs.detail.periodStart": "Текущий период начался",
    "subs.detail.periodEnd": "Текущий период заканчивается",
    "subs.detail.coverageEnds": "Доступ заканчивается (все предметы)",
    "subs.detail.nextCharge": "Следующее списание",
    "subs.detail.created": "Создано",
    "subs.detail.updated": "Последнее обновление",
    "subs.detail.provider": "Источник оплаты",
    "subs.detail.providerSubId": "ID подписки провайдера",
    "subs.detail.siblingSection": "Запись о скидке за братьев/сестёр",
    "subs.detail.siblingRank": "Порядковый номер в семье",
    "subs.detail.siblingPercent": "Процент скидки",
    "subs.detail.siblingAppliedAt": "Применено",
    "subs.detail.siblingNone":
      "Отдельной записи о скидке за братьев/сестёр для этой подписки нет.",
    "subs.detail.paymentTitle": "Платёжная операция",
    "subs.detail.paymentNote":
      "Реальный платёжный провайдер ещё не подключён — по этому доступу не было денежных операций (доступ выдан администратором или предоставлен льготно). Запись об оплате не создавалась.",
    "subs.detail.actionsSection": "Действия",
    "subs.detail.noActions":
      "Для этого статуса действия недоступны (конечное состояние).",
    "subs.detail.notFound": "Подписка не найдена.",

    "subs.action.activate.button": "Активировать",
    "subs.action.activate.title": "Активировать подписку",
    "subs.action.activate.body":
      "Подписка будет немедленно активирована, откроется новый расчётный период.",
    "subs.action.activate.confirm": "Да, активировать",
    "subs.action.activate.done": "Подписка активирована.",

    "subs.action.cancel.button": "Отменить",
    "subs.action.cancel.title": "Отменить подписку",
    "subs.action.cancel.body":
      "Подписка будет отменена, но ребёнок сохранит доступ до конца текущего периода.",
    "subs.action.cancel.confirm": "Да, отменить",
    "subs.action.cancel.done": "Подписка отменена.",

    "subs.action.expire.button": "Завершить доступ сейчас",
    "subs.action.expire.title": "Завершить доступ немедленно",
    "subs.action.expire.body":
      "Доступ ребёнка будет отозван НЕМЕДЛЕННО (не дожидаясь конца периода). Это необратимо.",
    "subs.action.expire.confirm": "Да, завершить сейчас",
    "subs.action.expire.done": "Доступ немедленно завершён.",

    "subs.action.extend.button": "Продлить",
    "subs.action.extend.title": "Продлить период подписки",
    "subs.action.extend.body":
      "Дата окончания текущего периода будет сдвинута на указанное число дней.",
    "subs.action.extend.confirm": "Продлить",
    "subs.action.extend.done": "Подписка продлена.",
    "subs.action.daysLabel": "Количество дней",
    "subs.action.daysHint": "От 1 до 730 дней.",

    "subs.err.forbidden": "У вас нет прав для этого действия.",
    "subs.err.notFound": "Подписка не найдена.",
    "subs.err.invalidTransition":
      "Это изменение статуса невозможно из текущего состояния. Обновите страницу.",
    "subs.err.badDays": "Количество дней должно быть от 1 до 730.",
    "subs.err.unknownAction": "Неизвестное действие.",
    "subs.err.duplicateLive":
      "У этого ребёнка уже есть активная подписка — одновременно может быть только одна.",
    "subs.noServiceKey":
      "На сервере нет ключа SUPABASE_SERVICE_ROLE_KEY. Добавьте его в admin-panel/.env.local (только сервер) и перезапустите, чтобы управлять подписками.",

    "ckrev.title": "Проверка платежей",
    "ckrev.subtitle":
      "Заказы, деньги по которым получены, но доставить купленное не удалось, — и те, что были доставлены, но потом возникла проблема. За каждой строкой семья, которой должны либо покупку, либо возврат.",
    "ckrev.nav": "Проверка платежей",
    "ckrev.empty": "Ничего не ждёт проверки.",
    "ckrev.openCount": "{n} открытых",
    "ckrev.col.order": "Заказ",
    "ckrev.col.what": "Что куплено",
    "ckrev.col.family": "Семья",
    "ckrev.col.amount": "Сумма",
    "ckrev.col.reason": "Причина",
    "ckrev.col.decidedAt": "Решение",
    "ckrev.col.action": "Итог",
    "ckrev.kind.plan_start": "Новая подписка",
    "ckrev.kind.plan_change": "Изменение подписки",
    "ckrev.kind.olympiad": "Олимпиадный пакет",
    "ckrev.status.needs_review": "Деньги у нас, ничего не доставлено",
    "ckrev.status.applied": "Доставлено, следующий шаг не прошёл",
    "ckrev.status.refunded": "Деньги возвращены — мы ничего не должны",
    "ckrev.resolved": "Решено",
    "ckrev.resolvePlaceholder": "Что вы сделали? (например: вернули деньги, связались с семьёй)",
    "ckrev.resolve": "Записать итог",
    "ckrev.resolving": "Сохраняем…",
    "ckrev.resolveHint":
      "Статус не меняется — он хранит судьбу денег. Записывается только то, что вы сделали, и это попадает в журнал аудита. Напишите фразу и тогда, когда деньги уже вернули: только так строка закрывается.",
    "ckrev.err.needResolution": "Напишите, что вы сделали.",
    "ckrev.err.notFound": "Решённый платёж по этому заказу не найден.",
    "ckrev.noServiceKey":
      "На сервере нет ключа SUPABASE_SERVICE_ROLE_KEY. Добавьте его в admin-panel/.env.local (только сервер) и перезапустите, чтобы видеть очередь проверки платежей.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
