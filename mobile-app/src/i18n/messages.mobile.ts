// Mobile-ONLY strings (screens that have no web counterpart). Everything else
// comes from messages.generated.ts (synced from the web catalog). Keys here
// win over synced keys, so this file can also patch phrasing that reads wrong
// on a phone. az default / en / ru — every key in all three, natural phrasing.
import type { Locale } from "./messages.generated";

export const mobileMessages: Record<Locale, Record<string, string>> = {
  az: {
    "mob.welcome.tagline": "Olimpiadalara hazırlaşmağın ən əyləncəli yolu",
    "mob.welcome.studentLogin": "Şagird girişi",
    "mob.update.title": "Yeniləmə tələb olunur",
    "mob.update.body":
      "Tətbiqin bu versiyası artıq dəstəklənmir. Davam etmək üçün mağazadan yeniləyin.",
    "mob.update.cta": "İndi yenilə",
    "mob.boot.error": "Yükləmək mümkün olmadı. İnternet bağlantını yoxla.",
    "mob.retry": "Yenidən cəhd et",
    "mob.childId": "8 rəqəmli şagird ID-si",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Valideynin təyin etdiyi şifrə",
    "mob.forgotOnWeb": "Şifrə bərpası veb saytda açılır.",
    "mob.placeholder.title": "Tezliklə",
    "mob.placeholder.body": "Bu bölmə növbəti mərhələdə əlavə olunacaq.",
    "mob.gallery.title": "Dizayn qalereyası",
    "mob.session.expired": "Sessiyanın vaxtı bitdi — yenidən daxil ol.",
    "mob.pw.show": "Şifrəni göstər",
    "mob.pw.hide": "Şifrəni gizlət",
  },
  en: {
    "mob.welcome.tagline": "The most fun way to prepare for olympiads",
    "mob.welcome.studentLogin": "Student sign-in",
    "mob.update.title": "Update required",
    "mob.update.body":
      "This version of the app is no longer supported. Update from the store to continue.",
    "mob.update.cta": "Update now",
    "mob.boot.error": "Could not load. Check your internet connection.",
    "mob.retry": "Try again",
    "mob.childId": "8-digit student ID",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Password set by your parent",
    "mob.forgotOnWeb": "Password recovery opens on the website.",
    "mob.placeholder.title": "Coming soon",
    "mob.placeholder.body": "This section arrives in the next stage.",
    "mob.gallery.title": "Design gallery",
    "mob.session.expired": "Your session expired — please sign in again.",
    "mob.pw.show": "Show password",
    "mob.pw.hide": "Hide password",
  },
  ru: {
    "mob.welcome.tagline": "Самый увлекательный способ готовиться к олимпиадам",
    "mob.welcome.studentLogin": "Вход для ученика",
    "mob.update.title": "Требуется обновление",
    "mob.update.body":
      "Эта версия приложения больше не поддерживается. Обновите её в магазине, чтобы продолжить.",
    "mob.update.cta": "Обновить",
    "mob.boot.error": "Не удалось загрузить. Проверьте подключение к интернету.",
    "mob.retry": "Повторить",
    "mob.childId": "8-значный ID ученика",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Пароль, заданный родителем",
    "mob.forgotOnWeb": "Восстановление пароля откроется на сайте.",
    "mob.placeholder.title": "Скоро",
    "mob.placeholder.body": "Этот раздел появится на следующем этапе.",
    "mob.gallery.title": "Галерея дизайна",
    "mob.session.expired": "Сессия истекла — войдите снова.",
    "mob.pw.show": "Показать пароль",
    "mob.pw.hide": "Скрыть пароль",
  },
};
