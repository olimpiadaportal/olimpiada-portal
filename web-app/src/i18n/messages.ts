import type { Locale } from "./config";

// UI strings for the Web App. Native phrasing per language (not literal).
// Keep all three languages in sync whenever a UI string is added.
export const messages: Record<Locale, Record<string, string>> = {
  az: {
    "app.brand": "Olimpiada Portalı",
    "home.subtitle": "Şagird və Valideyn Veb Tətbiqi — ilkin versiya.",
    "supabase.heading": "Supabase bağlantısı",
    "supabase.configured": "qurulub ✓",
    "supabase.notConfigured":
      "qurulmayıb — .env.local.example faylını .env.local edin və Supabase URL + anon açarını əlavə edin",
    "home.note":
      "Giriş, idarə panelləri, gündəlik tapşırıqlar, testlər və hesabatlar sonrakı mərhələlərdə əlavə olunur. Bu səhifə yalnız tətbiqin işə düşdüyünü yoxlayır.",
    "state.loading": "Yüklənir…",
    "error.title": "Xəta baş verdi",
    "error.desc": "Gözlənilməz xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.",
    "action.retry": "Yenidən cəhd et",
    "notFound.title": "Səhifə tapılmadı",
    "notFound.desc": "Axtardığınız səhifə mövcud deyil.",
    "action.goHome": "Ana səhifəyə qayıt",
    "unauthorized.title": "İcazə yoxdur",
    "unauthorized.desc": "Bu səhifəyə girişiniz yoxdur.",
    "lang.label": "Dil",
  },
  en: {
    "app.brand": "Olimpiada Portal",
    "home.subtitle": "Student & Parent Web App — foundation skeleton.",
    "supabase.heading": "Supabase connection",
    "supabase.configured": "configured ✓",
    "supabase.notConfigured":
      "not configured — copy .env.local.example to .env.local and add your Supabase URL + anon key",
    "home.note":
      "Auth, dashboards, daily tasks, tests and reports are added in later stages. This page only verifies the app boots.",
    "state.loading": "Loading…",
    "error.title": "Something went wrong",
    "error.desc": "An unexpected error occurred. Please try again.",
    "action.retry": "Try again",
    "notFound.title": "Page not found",
    "notFound.desc": "The page you’re looking for doesn’t exist.",
    "action.goHome": "Go home",
    "unauthorized.title": "Unauthorized",
    "unauthorized.desc": "You don’t have access to this page.",
    "lang.label": "Language",
  },
  ru: {
    "app.brand": "Портал Олимпиад",
    "home.subtitle": "Веб-приложение для учеников и родителей — основа.",
    "supabase.heading": "Подключение Supabase",
    "supabase.configured": "настроено ✓",
    "supabase.notConfigured":
      "не настроено — скопируйте .env.local.example в .env.local и добавьте URL и anon-ключ Supabase",
    "home.note":
      "Аутентификация, панели, ежедневные задания, тесты и отчёты добавляются на следующих этапах. Эта страница лишь проверяет, что приложение запускается.",
    "state.loading": "Загрузка…",
    "error.title": "Что-то пошло не так",
    "error.desc": "Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.",
    "action.retry": "Повторить",
    "notFound.title": "Страница не найдена",
    "notFound.desc": "Запрашиваемая страница не существует.",
    "action.goHome": "На главную",
    "unauthorized.title": "Нет доступа",
    "unauthorized.desc": "У вас нет доступа к этой странице.",
    "lang.label": "Язык",
  },
};
