import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Cities & Schools admin screens that are NOT
// yet in the shared dictionary (admin-panel/src/i18n/messages.ts). Kept here so
// the UI is fully trilingual today; these should be migrated into messages.ts by
// the agent that owns admin message additions (reported in followups). Reusable
// strings (action.*, field.name, field.status, status.*, manage.*, nav.cities/
// nav.schools) still come from getT() — these are only the gaps.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "cities.subtitle": "Şəhərləri əlavə et, dəyiş və sil. Məktəblər şəhərlərə bağlanır.",
    "cities.addHeading": "Yeni şəhər əlavə et",
    "cities.editHeading": "Şəhərə düzəliş et",
    "cities.cityName": "Şəhər adı",
    "cities.countryCode": "Ölkə kodu",
    "cities.schoolCount": "Məktəblər",
    "cities.noRecords": "Hələ şəhər yoxdur.",
    "cities.errInUse": "Bu şəhəri silmək olmaz: ona bağlı məktəblər var. Əvvəlcə həmin məktəbləri silin və ya başqa şəhərə köçürün.",
    "cities.errDuplicate": "Bu adda şəhər artıq mövcuddur.",
    "cities.errMissingName": "Şəhər adı tələb olunur.",
    "schools.subtitle": "Məktəbləri əlavə et, dəyiş və sil. Hər məktəb bir şəhərə bağlı olmalıdır.",
    "schools.addHeading": "Yeni məktəb əlavə et",
    "schools.editHeading": "Məktəbə düzəliş et",
    "schools.schoolName": "Məktəb adı",
    "schools.city": "Şəhər",
    "schools.noRecords": "Hələ məktəb yoxdur.",
    "schools.errMissingName": "Məktəb adı tələb olunur.",
    "schools.errMissingCity": "Şəhər seçimi məcburidir.",
    "common.errGeneric": "Yadda saxlamaq mümkün olmadı. Yenidən cəhd edin.",
  },
  en: {
    "cities.subtitle": "Add, edit and remove cities. Schools are linked to cities.",
    "cities.addHeading": "Add a city",
    "cities.editHeading": "Edit city",
    "cities.cityName": "City name",
    "cities.countryCode": "Country code",
    "cities.schoolCount": "Schools",
    "cities.noRecords": "No cities yet.",
    "cities.errInUse": "This city cannot be deleted: schools are linked to it. Remove or reassign those schools first.",
    "cities.errDuplicate": "A city with this name already exists.",
    "cities.errMissingName": "City name is required.",
    "schools.subtitle": "Add, edit and remove schools. Every school must belong to a city.",
    "schools.addHeading": "Add a school",
    "schools.editHeading": "Edit school",
    "schools.schoolName": "School name",
    "schools.city": "City",
    "schools.noRecords": "No schools yet.",
    "schools.errMissingName": "School name is required.",
    "schools.errMissingCity": "Selecting a city is required.",
    "common.errGeneric": "Could not save. Please try again.",
  },
  ru: {
    "cities.subtitle": "Добавляйте, изменяйте и удаляйте города. Школы привязаны к городам.",
    "cities.addHeading": "Добавить город",
    "cities.editHeading": "Редактировать город",
    "cities.cityName": "Название города",
    "cities.countryCode": "Код страны",
    "cities.schoolCount": "Школы",
    "cities.noRecords": "Городов пока нет.",
    "cities.errInUse": "Этот город нельзя удалить: к нему привязаны школы. Сначала удалите или перенесите эти школы.",
    "cities.errDuplicate": "Город с таким названием уже существует.",
    "cities.errMissingName": "Название города обязательно.",
    "schools.subtitle": "Добавляйте, изменяйте и удаляйте школы. Каждая школа должна относиться к городу.",
    "schools.addHeading": "Добавить школу",
    "schools.editHeading": "Редактировать школу",
    "schools.schoolName": "Название школы",
    "schools.city": "Город",
    "schools.noRecords": "Школ пока нет.",
    "schools.errMissingName": "Название школы обязательно.",
    "schools.errMissingCity": "Выбор города обязателен.",
    "common.errGeneric": "Не удалось сохранить. Попробуйте снова.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
