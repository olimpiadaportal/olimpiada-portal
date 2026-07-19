// Curated, editable public-site content keys (Website Content CMS, text-only).
//
// DRIFT WARNING (L21): every `defaults` record below MIRRORS the live text in
// web-app/src/i18n/messages.ts for the same key. The two files must be updated
// TOGETHER — if a web-app string changes, update its defaults here in the same
// change (and vice versa), otherwise admins see stale "current live" text.
//
// PLAIN module (no "use server"): a Server Actions file may only export async
// functions, so this registry + its types live here and are imported by both
// the site-content server action and the admin UI.
//
// MODEL: the CMS is organised as SECTION -> MENU -> ENTRIES. Each entry maps an
// EXISTING web-app i18n string (`key`) to an editable trilingual record. The
// `defaults` are the current live web-app text (shown until an admin saves an
// override); the web-app reads `public.site_content` (service role) and layers
// any override on top of its built-in i18n by `key`.
//
// TO ADD A NEW EDITABLE STRING: add a row here (its section + menu + key +
// current az/en/ru defaults, and `multiline: true` for long text). If the menu
// is new, also list it in SECTIONS below. Nothing else has to change — the UI
// and the save action are fully data-driven from this file.

export type SiteContentEntry = {
  key: string; // i18n key the web-app overrides
  section: string; // top-level group id (see SECTIONS)
  menu: string; // sub-group id within the section (see SECTIONS)
  defaults: { az: string; en: string; ru: string }; // current live web-app text
  multiline?: boolean; // long text → render a textarea instead of an input
};

// =============================================================================
// Site typography (owner item 16) — "Sayt şrifti".
//
// One system_settings key stores the sitewide font + base sizes; the web-app
// reads it server-side (web-app/src/lib/siteTypography.ts mirrors these
// constants — update BOTH files together). Every applied font-family always
// falls back to the Azerbaijani-safe stack; the admin UI previews each font
// with the schwa/glyph test line so missing ə/Ə support is visible BEFORE save.
// =============================================================================

export const SITE_TYPOGRAPHY_KEY = "site.typography";

export type SiteTypography = {
  fontFamily: string; // one of FONT_LIBRARY names
  baseFontSize: number; // px, 12–72
  headingFontSize: number; // px, 12–72
  buttonFontSize: number; // px, 12–72
};

export const TYPOGRAPHY_DEFAULTS: SiteTypography = {
  fontFamily: "Arial",
  baseFontSize: 16,
  headingFontSize: 32,
  buttonFontSize: 15,
};

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 72;

// Azerbaijani-safe fallback stack — ALWAYS appended after the chosen family.
export const SAFE_FONT_STACK =
  'Arial, Helvetica, "Segoe UI", system-ui, sans-serif';

// Curated font library. `google: false` = system font (no stylesheet needed).
export const FONT_LIBRARY: { name: string; google: boolean }[] = [
  { name: "Mulish", google: true },
  { name: "Arial", google: false },
  { name: "Inter", google: true },
  { name: "Roboto", google: true },
  { name: "Open Sans", google: true },
  { name: "Lato", google: true },
  { name: "Poppins", google: true },
  { name: "Nunito", google: true },
  { name: "Montserrat", google: true },
  { name: "Source Sans 3", google: true },
  { name: "Ubuntu", google: true },
  { name: "Work Sans", google: true },
  { name: "DM Sans", google: true },
  { name: "Noto Sans", google: true },
  { name: "Manrope", google: true },
  { name: "Rubik", google: true },
  { name: "Fira Sans", google: true },
  { name: "IBM Plex Sans", google: true },
  { name: "Quicksand", google: true },
  { name: "Raleway", google: true },
];

export const FONT_NAMES = FONT_LIBRARY.map((f) => f.name);

// The glyph test the admin SEES for every font option (fixed, not localized —
// it is an alphabet check, identical in all UI languages).
export const AZ_GLYPH_TEST = "Əlifba sınağı — ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ";

/** CSS font-family value for a library font (chosen family + safe stack). */
export function fontStackFor(name: string): string {
  return name === "Arial" ? SAFE_FONT_STACK : `"${name}", ${SAFE_FONT_STACK}`;
}

// ONE Google Fonts stylesheet covering every google-hosted library font at
// 400/700 — loaded ONLY on the Website Content page so the pickers/preview
// render each candidate in its real face (display=swap; CSP allows the two
// Google Fonts origins explicitly, see next.config.mjs).
export const GOOGLE_FONTS_PREVIEW_URL =
  "https://fonts.googleapis.com/css2?" +
  FONT_LIBRARY.filter((f) => f.google)
    .map((f) => `family=${f.name.replace(/ /g, "+")}:wght@400;700`)
    .join("&") +
  "&display=swap";

// -----------------------------------------------------------------------------
// Per-field font sizes.
//
// A field's optional font size is stored in a SIBLING site_content row keyed
// `<key>#style` whose `az` column holds a tiny JSON blob (e.g. {"fontSize":24}).
// Text rows stay plain strings, so every existing row/consumer keeps working;
// readers that don't understand `#style` rows simply never look them up.
// -----------------------------------------------------------------------------

export const STYLE_KEY_SUFFIX = "#style";

export function styleKeyFor(key: string): string {
  return `${key}${STYLE_KEY_SUFFIX}`;
}

// Options offered by the per-field "Font size" select (px).
export const FIELD_FONT_SIZE_OPTIONS = [
  12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48,
] as const;

// Ordered section → menu structure. The UI renders sections/menus in this order.
// The human-readable labels live in admin-panel i18n:
//   section: siteContent.section.<id> · menu: siteContent.menu.<id>
export const SECTIONS: { id: string; menus: string[] }[] = [
  { id: "landing", menus: ["hero", "nav", "stats", "about", "faq", "contact", "footer"] },
  { id: "student", menus: ["dashboard", "profile", "stickers", "settings"] },
  { id: "parent", menus: ["dashboard", "addchild", "subscription", "analytics"] },
];

export const SITE_CONTENT_REGISTRY: SiteContentEntry[] = [
  // ======================= SECTION: landing =======================
  // ---- landing / hero (add a row here to expose another hero string) -------
  {
    key: "home.heroTitle",
    section: "landing",
    menu: "hero",
    defaults: {
      az: "OlympIQ — Hər gün bir pillə yuxarı",
      en: "OlympIQ — One step higher every day",
      ru: "OlympIQ — каждый день на ступень выше",
    },
  },
  {
    key: "home.heroLead",
    section: "landing",
    menu: "hero",
    multiline: true,
    defaults: {
      az: "1–11-ci siniflər üçün olimpiada hazırlığı portalı. Şagirdlər üçün abunə əsaslı platforma — valideyn idarə edir, uşaq öyrənir.",
      en: "An olympiad preparation portal for grades 1–11. A subscription-based platform for students — the parent manages, the child learns.",
      ru: "Портал подготовки к олимпиадам для 1–11 классов. Платформа по подписке для школьников — родитель управляет, ребёнок учится.",
    },
  },
  {
    key: "home.ctaStart",
    section: "landing",
    menu: "hero",
    defaults: { az: "Başla", en: "Get started", ru: "Начать" },
  },
  {
    key: "home.ctaSubjects",
    section: "landing",
    menu: "hero",
    defaults: { az: "Fənlərə bax", en: "Explore subjects", ru: "Посмотреть предметы" },
  },
  {
    key: "home.f1Title",
    section: "landing",
    menu: "hero",
    defaults: {
      az: "Valideyn idarəli hesablar",
      en: "Parent-managed accounts",
      ru: "Аккаунты под управлением родителя",
    },
  },
  {
    key: "home.f2Title",
    section: "landing",
    menu: "hero",
    defaults: {
      az: "Fənn paketləri",
      en: "Subject packages",
      ru: "Предметные пакеты",
    },
  },
  {
    key: "home.f3Title",
    section: "landing",
    menu: "hero",
    defaults: {
      az: "Olimpiada hazırlığı",
      en: "Olympiad preparation",
      ru: "Подготовка к олимпиадам",
    },
  },
  // ---- landing / nav -------------------------------------------------------
  {
    key: "nav.home",
    section: "landing",
    menu: "nav",
    defaults: { az: "Ana səhifə", en: "Home", ru: "Главная" },
  },
  {
    key: "nav.subjects",
    section: "landing",
    menu: "nav",
    defaults: { az: "Fənlər", en: "Subjects", ru: "Предметы" },
  },
  {
    // Services rename (investor round): the key id stays `nav.pricing` for
    // stability; only the label VALUES changed (the page now lives at
    // /services with a permanent /pricing redirect).
    key: "nav.pricing",
    section: "landing",
    menu: "nav",
    defaults: { az: "Xidmətlər", en: "Services", ru: "Услуги" },
  },
  {
    key: "nav.olympiad",
    section: "landing",
    menu: "nav",
    defaults: { az: "Olimpiada hazırlığı", en: "Olympiad Prep", ru: "Подготовка к олимпиадам" },
  },
  {
    key: "nav.news",
    section: "landing",
    menu: "nav",
    defaults: { az: "Xəbərlər", en: "News", ru: "Новости" },
  },
  {
    key: "nav.about",
    section: "landing",
    menu: "nav",
    defaults: { az: "Haqqımızda", en: "About us", ru: "О нас" },
  },
  {
    key: "nav.contact",
    section: "landing",
    menu: "nav",
    defaults: { az: "Əlaqə", en: "Contact", ru: "Контакты" },
  },
  {
    key: "nav.login",
    section: "landing",
    menu: "nav",
    defaults: { az: "Daxil ol", en: "Log in", ru: "Войти" },
  },
  {
    key: "nav.register",
    section: "landing",
    menu: "nav",
    defaults: { az: "Qeydiyyat", en: "Register", ru: "Регистрация" },
  },
  // ---- landing / stats -----------------------------------------------------
  {
    key: "stats.title",
    section: "landing",
    menu: "stats",
    defaults: { az: "OlympIQ Rəqəmlərlə", en: "OlympIQ in numbers", ru: "OlympIQ в цифрах" },
  },
  {
    key: "stats.tests",
    section: "landing",
    menu: "stats",
    defaults: { az: "Test bazası", en: "Question bank", ru: "База тестов" },
  },
  {
    key: "stats.olympiads",
    section: "landing",
    menu: "stats",
    defaults: { az: "Olimpiada paketi", en: "Olympiad packages", ru: "Олимпиадные пакеты" },
  },
  {
    key: "stats.students",
    section: "landing",
    menu: "stats",
    defaults: { az: "Aktiv məktəbli", en: "Active students", ru: "Активные школьники" },
  },
  {
    key: "stats.successRate",
    section: "landing",
    menu: "stats",
    defaults: { az: "Uğur göstəricisi", en: "Success rate", ru: "Показатель успеха" },
  },
  // ---- landing / about -----------------------------------------------------
  {
    key: "about2.hero.eyebrow",
    section: "landing",
    menu: "about",
    defaults: { az: "Haqqımızda", en: "About us", ru: "О нас" },
  },
  {
    key: "about2.hero.title",
    section: "landing",
    menu: "about",
    defaults: {
      az: "Böyük zirvələr kiçik addımlarla fəth olunur",
      en: "Great peaks are conquered in small steps",
      ru: "Большие вершины покоряются маленькими шагами",
    },
  },
  {
    key: "about2.hero.lead",
    section: "landing",
    menu: "about",
    multiline: true,
    defaults: {
      az: "Hər bir olimpiada qalibinin uğurunun arxasında planlı hazırlıq, davamlı məşq və düzgün istiqamətləndirmə dayanır. OlympIQ məhz bu məqsədlə yaradılmış süni intellekt əsaslı olimpiada hazırlıq platformasıdır. Platformamız 1–11-ci sinif şagirdlərinə biliklərini sistemli şəkildə inkişaf etdirmək, olimpiadalara peşəkar səviyyədə hazırlaşmaq və potensiallarını tam üzə çıxarmaq imkanı yaradır.",
      en: "Behind every olympiad winner's success stand planned preparation, consistent practice and the right guidance. OlympIQ is an AI-powered olympiad preparation platform built exactly for that. It gives students in grades 1–11 the opportunity to grow their knowledge systematically, prepare for olympiads at a professional level and unlock their full potential.",
      ru: "За успехом каждого победителя олимпиады стоят планомерная подготовка, постоянная практика и правильное направление. OlympIQ — платформа олимпиадной подготовки на основе искусственного интеллекта, созданная именно для этого. Она даёт ученикам 1–11 классов возможность системно развивать знания, готовиться к олимпиадам на профессиональном уровне и полностью раскрывать свой потенциал.",
    },
  },
  {
    key: "about2.b1.title",
    section: "landing",
    menu: "about",
    defaults: {
      az: "Öyrən, cəhd et, yüksəl!",
      en: "Learn, try, rise!",
      ru: "Учись, пробуй, поднимайся!",
    },
  },
  {
    key: "about2.b2.title",
    section: "landing",
    menu: "about",
    defaults: {
      az: "Valideyn idarə edir, uşaq öyrənir",
      en: "Parents manage, children learn",
      ru: "Родитель управляет — ребёнок учится",
    },
  },
  {
    key: "about2.values.title",
    section: "landing",
    menu: "about",
    defaults: {
      az: "Bir baxışda OlympIQ",
      en: "OlympIQ at a glance",
      ru: "OlympIQ в двух словах",
    },
  },
  {
    key: "about2.values.sub",
    section: "landing",
    menu: "about",
    defaults: {
      az: "Dörd prinsip — bir platforma.",
      en: "Four principles, one platform.",
      ru: "Четыре принципа — одна платформа.",
    },
  },
  // ---- landing / faq -------------------------------------------------------
  {
    key: "faq.title",
    section: "landing",
    menu: "faq",
    defaults: {
      az: "Tez-tez verilən suallar",
      en: "Frequently asked questions",
      ru: "Частые вопросы",
    },
  },
  {
    key: "faq.q1",
    section: "landing",
    menu: "faq",
    defaults: {
      az: "Şagirdin hesabını kim yaradır?",
      en: "Who creates the student's account?",
      ru: "Кто создаёт аккаунт ученика?",
    },
  },
  {
    key: "faq.a1",
    section: "landing",
    menu: "faq",
    multiline: true,
    defaults: {
      az: "Yalnız valideyn. Qeydiyyatdan sonra valideyn hər uşağı əlavə edir və parol təyin edir. Sistem uşağın daxil olması üçün unikal 8 rəqəmli ID verir.",
      en: "Only the parent. After registering, the parent adds each child and sets a password. The system issues a unique 8-digit ID the student uses to log in.",
      ru: "Только родитель. После регистрации родитель добавляет каждого ребёнка и задаёт пароль. Система выдаёт уникальный 8-значный ID, по которому ученик входит в систему.",
    },
  },
  {
    key: "faq.q2",
    section: "landing",
    menu: "faq",
    defaults: {
      az: "Şagirdlər necə daxil olur?",
      en: "How do students log in?",
      ru: "Как ученики входят в систему?",
    },
  },
  {
    key: "faq.a2",
    section: "landing",
    menu: "faq",
    multiline: true,
    defaults: {
      az: "Şagird 8 rəqəmli ID və valideynin təyin etdiyi parolla portala daxil olur. E-poçt tələb olunmur.",
      en: "Students log in to the portal with their 8-digit ID and the password set by the parent. No email is required.",
      ru: "Ученик входит на портал по 8-значному ID и паролю, заданному родителем. Электронная почта не требуется.",
    },
  },
  {
    key: "faq.q3",
    section: "landing",
    menu: "faq",
    defaults: {
      az: "Qiymət necə işləyir?",
      en: "How does pricing work?",
      ru: "Как работает оплата?",
    },
  },
  {
    key: "faq.a3",
    section: "landing",
    menu: "faq",
    multiline: true,
    defaults: {
      az: "Hər fənn və hər uşaq üçün (həftəlik, aylıq və ya illik) abunə paketi var. İlk 7 günlük ödənişsiz sınaq və eyni ailədən olan 2 və daha çox uşaq üçün avtomatik bacı/qardaş endirimi verilir.",
      en: "Each subject and each child has its own subscription package (weekly, monthly or yearly). It starts with a free 7-day trial, and an automatic sibling discount applies for 2 or more children from the same family.",
      ru: "Для каждого предмета и каждого ребёнка есть свой пакет подписки (на неделю, месяц или год). Действует бесплатный 7-дневный пробный период, а для 2 и более детей из одной семьи автоматически применяется скидка для братьев и сестёр.",
    },
  },
  // ---- landing / contact ---------------------------------------------------
  {
    key: "contact.title",
    section: "landing",
    menu: "contact",
    defaults: { az: "Əlaqə", en: "Contact", ru: "Контакты" },
  },
  {
    key: "contact.lead",
    section: "landing",
    menu: "contact",
    multiline: true,
    defaults: {
      az: "Sual və ya rəyiniz var? Eşitmək istərdik.",
      en: "Questions or feedback? We'd love to hear from you.",
      ru: "Вопросы или отзывы? Будем рады услышать вас.",
    },
  },
  {
    key: "contact.address",
    section: "landing",
    menu: "contact",
    defaults: { az: "Ünvan", en: "Address", ru: "Адрес" },
  },
  {
    key: "contact.addressValue",
    section: "landing",
    menu: "contact",
    defaults: {
      az: "Hökumət Evi, Bakı, Azərbaycan",
      en: "Government House of Baku, Azerbaijan",
      ru: "Дом Правительства, Баку, Азербайджан",
    },
  },
  {
    key: "contact.emailLabel",
    section: "landing",
    menu: "contact",
    defaults: { az: "Dəstək e-poçtu", en: "Support email", ru: "Эл. почта поддержки" },
  },
  {
    key: "contact.phoneLabel",
    section: "landing",
    menu: "contact",
    defaults: { az: "Telefon", en: "Phone", ru: "Телефон" },
  },
  // ---- landing / footer ----------------------------------------------------
  {
    key: "footer.tagline",
    section: "landing",
    menu: "footer",
    multiline: true,
    defaults: {
      az: "1–11-ci siniflər üçün olimpiada hazırlığı portalı",
      en: "An olympiad preparation portal for grades 1–11",
      ru: "Портал подготовки к олимпиадам для 1–11 классов",
    },
  },
  {
    key: "footer.product",
    section: "landing",
    menu: "footer",
    defaults: { az: "Xidmət", en: "Services", ru: "Сервис" },
  },
  {
    key: "footer.company",
    section: "landing",
    menu: "footer",
    defaults: { az: "Şirkət", en: "Company", ru: "Компания" },
  },
  {
    key: "footer.legal",
    section: "landing",
    menu: "footer",
    defaults: { az: "Hüquqi", en: "Legal", ru: "Правовая информация" },
  },
  {
    key: "foot.rights",
    section: "landing",
    menu: "footer",
    defaults: {
      az: "Hər gün bir pillə yuxarı",
      en: "One step higher every day",
      ru: "Каждый день на ступень выше",
    },
  },

  // ======================= SECTION: student =======================
  // ---- student / dashboard (the student arena home) ------------------------
  {
    key: "arena.heroEyebrow",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Bugünkü raundlar", en: "Today's rounds", ru: "Сегодняшние раунды" },
  },
  {
    key: "arena.heroTitle",
    section: "student",
    menu: "dashboard",
    defaults: {
      az: "Növbəti raundu götür, irəli çıx.",
      en: "Take the next round and climb.",
      ru: "Берись за следующий раунд и поднимайся.",
    },
  },
  {
    key: "arena.startRound",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Raunda başla", en: "Start a round", ru: "Начать раунд" },
  },
  {
    key: "arena.todaysRounds",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Bugünkü raundlar", en: "Today's rounds", ru: "Сегодняшние раунды" },
  },
  {
    key: "arena.subjectStrength",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Fənn üzrə güc", en: "Subject strength", ru: "Сила по предметам" },
  },
  {
    key: "arena.recentRounds",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Son raundlar", en: "Recent rounds", ru: "Недавние раунды" },
  },
  {
    key: "arena.statPoints",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Xal", en: "Points", ru: "Очки" },
  },
  {
    key: "arena.statAccuracy",
    section: "student",
    menu: "dashboard",
    defaults: { az: "Dəqiqlik", en: "Accuracy", ru: "Точность" },
  },
  // ---- student / profile ---------------------------------------------------
  {
    key: "prof2.accountInfo",
    section: "student",
    menu: "profile",
    defaults: { az: "Hesab məlumatları", en: "Account information", ru: "Данные аккаунта" },
  },
  {
    key: "prof2.security",
    section: "student",
    menu: "profile",
    defaults: { az: "Təhlükəsizlik", en: "Security", ru: "Безопасность" },
  },
  {
    key: "prof2.securityHint",
    section: "student",
    menu: "profile",
    multiline: true,
    defaults: {
      az: "Hesabınızın təhlükəsizliyi üçün şifrənizi vaxtaşırı yeniləyin.",
      en: "Update your password from time to time to keep your account secure.",
      ru: "Время от времени меняйте пароль, чтобы ваш аккаунт оставался в безопасности.",
    },
  },
  {
    key: "prof2.danger",
    section: "student",
    menu: "profile",
    defaults: { az: "Təhlükəli zona", en: "Danger zone", ru: "Опасная зона" },
  },
  {
    key: "prof2.dangerHint",
    section: "student",
    menu: "profile",
    multiline: true,
    defaults: {
      az: "Hesabınızı silsəniz, bütün məlumatlarınız birdəfəlik silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil.",
      en: "Deleting your account permanently removes all of your data. This action cannot be undone.",
      ru: "При удалении аккаунта все ваши данные будут удалены безвозвратно. Это действие нельзя отменить.",
    },
  },
  {
    key: "pal.title",
    section: "student",
    menu: "profile",
    defaults: {
      az: "Rəng dəsti (açıq rejim)",
      en: "Color palette (light mode)",
      ru: "Цветовая палитра (светлый режим)",
    },
  },
  // ---- student / stickers --------------------------------------------------
  {
    key: "stk.sectionTitle",
    section: "student",
    menu: "stickers",
    defaults: { az: "Personaj stikerləri", en: "Character stickers", ru: "Стикеры с персонажами" },
  },
  {
    key: "stk.sectionDesc",
    section: "student",
    menu: "stickers",
    multiline: true,
    defaults: {
      az: "Sevimli mövzunu seç — şən stikerlər səhifələrini bəzəsin.",
      en: "Pick a favorite theme and playful stickers will decorate your pages.",
      ru: "Выбери любимую тему — весёлые стикеры украсят твои страницы.",
    },
  },
  {
    key: "stk.none",
    section: "student",
    menu: "stickers",
    defaults: { az: "Stikersiz", en: "No stickers", ru: "Без стикеров" },
  },
  {
    key: "stk.empty",
    section: "student",
    menu: "stickers",
    defaults: {
      az: "Hələ stiker mövzusu yoxdur — tezliklə!",
      en: "No sticker themes yet — coming soon!",
      ru: "Тем со стикерами пока нет — скоро появятся!",
    },
  },
  {
    key: "stk.countTitle",
    section: "student",
    menu: "stickers",
    defaults: { az: "Stiker sayı", en: "Number of stickers", ru: "Количество стикеров" },
  },
  // ---- student / settings (account drawer) ---------------------------------
  {
    key: "drawer.title",
    section: "student",
    menu: "settings",
    defaults: { az: "Hesab", en: "Account", ru: "Аккаунт" },
  },
  {
    key: "drawer.language",
    section: "student",
    menu: "settings",
    defaults: { az: "Dil", en: "Language", ru: "Язык" },
  },
  {
    key: "drawer.theme",
    section: "student",
    menu: "settings",
    defaults: { az: "Görünüş", en: "Appearance", ru: "Оформление" },
  },
  {
    key: "drawer.profileBtn",
    section: "student",
    menu: "settings",
    defaults: { az: "Profilim", en: "My profile", ru: "Мой профиль" },
  },
  {
    key: "drawer.logout",
    section: "student",
    menu: "settings",
    defaults: { az: "Çıxış", en: "Log out", ru: "Выйти" },
  },
  {
    key: "drawer2.themeLight",
    section: "student",
    menu: "settings",
    defaults: { az: "İşıqlı", en: "Light", ru: "Светлая" },
  },
  {
    key: "drawer2.themeDark",
    section: "student",
    menu: "settings",
    defaults: { az: "Qaranlıq", en: "Dark", ru: "Тёмная" },
  },

  // ======================= SECTION: parent =======================
  // ---- parent / dashboard --------------------------------------------------
  {
    key: "parent.dash.title",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Uşaqlarım", en: "My children", ru: "Мои дети" },
  },
  {
    key: "parent.dash.addChild",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Uşaq əlavə et", en: "Add child", ru: "Добавить ребёнка" },
  },
  {
    key: "parent.dash.noChildren",
    section: "parent",
    menu: "dashboard",
    defaults: {
      az: "Hələ uşaq əlavə etməmisiniz.",
      en: "You haven't added any children yet.",
      ru: "Вы ещё не добавили детей.",
    },
  },
  {
    key: "parent.dash.childId",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Giriş ID", en: "Login ID", ru: "ID для входа" },
  },
  {
    key: "parent.dash.manage",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Fənlər", en: "Subjects", ru: "Предметы" },
  },
  {
    key: "parent.dash.choosePlan",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Plan seç", en: "Choose a plan", ru: "Выбрать план" },
  },
  {
    key: "parent.dash.olympiads",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "Olimpiadalar", en: "Olympiads", ru: "Олимпиады" },
  },
  {
    key: "parent.dash.progress",
    section: "parent",
    menu: "dashboard",
    defaults: { az: "İrəliləyiş", en: "Progress", ru: "Прогресс" },
  },
  // ---- parent / addchild ---------------------------------------------------
  {
    key: "addchild.step.info",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Məlumat", en: "Details", ru: "Данные" },
  },
  {
    key: "addchild.step.subjects",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Fənlər", en: "Subjects", ru: "Предметы" },
  },
  {
    key: "addchild.step.plan",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Plan", en: "Plan", ru: "План" },
  },
  {
    key: "addchild.step.payment",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Ödəniş", en: "Payment", ru: "Оплата" },
  },
  {
    key: "addchild.step.done",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Hazır", en: "Done", ru: "Готово" },
  },
  {
    key: "addchild.next",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Növbəti", en: "Next", ru: "Далее" },
  },
  {
    key: "addchild.createChild",
    section: "parent",
    menu: "addchild",
    defaults: { az: "Uşağı yarat", en: "Create child", ru: "Создать ребёнка" },
  },
  // ---- parent / subscription -----------------------------------------------
  {
    key: "subscription.title",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Abunəlik", en: "Subscription", ru: "Подписка" },
  },
  {
    key: "subscription.subtitle",
    section: "parent",
    menu: "subscription",
    multiline: true,
    defaults: {
      az: "Övladlarınızın fənlərini və abunəliklərini idarə edin.",
      en: "Manage your children's subjects and subscriptions.",
      ru: "Управляйте предметами и подписками ваших детей.",
    },
  },
  {
    key: "subscription.manageSubjects",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Fənləri idarə et", en: "Manage subjects", ru: "Управлять предметами" },
  },
  {
    key: "subscription.startPlan",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Abunəliyə başla", en: "Start a plan", ru: "Оформить подписку" },
  },
  {
    key: "subscription.cancelBtn",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Abunəliyi ləğv et", en: "Cancel subscription", ru: "Отменить подписку" },
  },
  {
    key: "sub.title",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Fənlər və abunəlik", en: "Subjects & subscription", ru: "Предметы и подписка" },
  },
  {
    key: "sub.submit",
    section: "parent",
    menu: "subscription",
    defaults: {
      az: "7 günlük pulsuz sınağı başlat",
      en: "Start 7-day free trial",
      ru: "Начать 7-дневный бесплатный период",
    },
  },
  {
    key: "sub.trial",
    section: "parent",
    menu: "subscription",
    defaults: { az: "Pulsuz sınaq", en: "Free trial", ru: "Бесплатный период" },
  },
  // ---- parent / analytics --------------------------------------------------
  {
    key: "analytics.title",
    section: "parent",
    menu: "analytics",
    defaults: { az: "Analitika", en: "Analytics", ru: "Аналитика" },
  },
  {
    key: "analytics.subtitle",
    section: "parent",
    menu: "analytics",
    multiline: true,
    defaults: {
      az: "Övladlarınızın irəliləyişinə ümumi baxış.",
      en: "An overview of your children's progress.",
      ru: "Обзор успеваемости ваших детей.",
    },
  },
  {
    key: "analytics.totalChildren",
    section: "parent",
    menu: "analytics",
    defaults: { az: "Uşaqlar", en: "Children", ru: "Дети" },
  },
  {
    key: "analytics.activeSubs",
    section: "parent",
    menu: "analytics",
    defaults: { az: "Aktiv abunəliklər", en: "Active subscriptions", ru: "Активные подписки" },
  },
  {
    key: "analytics.attempts",
    section: "parent",
    menu: "analytics",
    defaults: { az: "Cəhdlər", en: "Attempts", ru: "Попытки" },
  },
  {
    key: "analytics.avgScore",
    section: "parent",
    menu: "analytics",
    defaults: { az: "Orta nəticə", en: "Average score", ru: "Средний балл" },
  },
];

// Fast key -> entry lookup for the server action (reject unknown keys).
export const SITE_CONTENT_BY_KEY: Record<string, SiteContentEntry> =
  Object.fromEntries(SITE_CONTENT_REGISTRY.map((e) => [e.key, e]));
