import type { Locale } from "@/i18n/config";

// Local trilingual strings for the merged Locations screen (Cities → Districts
// → Schools master-detail) that are NOT yet in the shared dictionary
// (admin-panel/src/i18n/messages.ts). Replaces the retired cities/labels.ts and
// districts/labels.ts (Round 21 merge). Reusable strings (action.*,
// field.status, manage.*, flt.noMatches, modal.close) still come from getT() —
// these are only the gaps. `nav.locations` lives here too so the sidebar label
// renders translated until messages.ts gains the key.
//
// NAMING (verified): the DB `districts` table holds the CITIES; `city_districts`
// holds the intra-city rayons. In UI language: Şəhərlər / Rayonlar / Məktəblər.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "nav.locations": "Yerlər",
    "loc.subtitle":
      "Şəhər, rayon və məktəbləri bir yerdən idarə et. Şəhəri seç — rayonları, rayonu seç — məktəbləri gör.",
    "loc.cities": "Şəhərlər",
    "loc.districts": "Rayonlar",
    "loc.schools": "Məktəblər",
    "loc.addCity": "Yeni şəhər",
    "loc.addDistrict": "Yeni rayon",
    "loc.addSchool": "Yeni məktəb",
    "loc.searchCities": "Şəhər axtar…",
    "loc.searchDistricts": "Rayon axtar…",
    "loc.searchSchools": "Məktəb axtar…",
    "loc.selectCityForDistricts": "Rayonları görmək üçün şəhər seçin.",
    "loc.selectCityForSchools": "Məktəbləri görmək üçün şəhər seçin.",
    "loc.selectDistrictForSchools": "Məktəbləri görmək üçün rayon seçin.",
    "loc.noDistrictsInCity": "Bu şəhər üzrə rayon yoxdur.",
    "loc.noDistrictsHint": "Məktəblər birbaşa şəhərə bağlanır.",
    "loc.noCities": "Hələ şəhər yoxdur.",
    "loc.noSchools": "Bu siyahıda məktəb yoxdur.",
    "loc.needsDistrict": "Rayon təyin edilməyib",
    "loc.needsDistrictHint": "Rayon gözləyən məktəblər",
    "loc.reviewBanner":
      "Bu məktəblərə rayon təyin edilməyib. Hər məktəbə düzəliş edib rayonunu seçin.",
    "loc.countDistricts": "Rayon: {n}",
    "loc.countSchools": "Məktəb: {n}",
    "loc.countStudents": "Şagird: {n}",
    "loc.statusActive": "Aktiv",
    "loc.statusInactive": "Deaktiv",
    "loc.private": "Özəl",
    "loc.public": "Dövlət",
    "loc.cityName": "Şəhər adı",
    "loc.districtName": "Rayon adı",
    "loc.schoolName": "Məktəb adı",
    "loc.city": "Şəhər",
    "loc.district": "Rayon",
    "loc.isPrivate": "Özəl məktəb",
    "loc.isPrivateHint": "Özəl məktəblər siyahının yuxarısında göstərilir.",
    "loc.addCityTitle": "Yeni şəhər əlavə et",
    "loc.editCityTitle": "Şəhərə düzəliş et",
    "loc.addDistrictTitle": "Yeni rayon əlavə et",
    "loc.editDistrictTitle": "Rayona düzəliş et",
    "loc.addSchoolTitle": "Yeni məktəb əlavə et",
    "loc.editSchoolTitle": "Məktəbə düzəliş et",
    "loc.deleteCityTitle": "Şəhəri sil",
    "loc.deleteDistrictTitle": "Rayonu sil",
    "loc.deleteSchoolTitle": "Məktəbi sil",
    "loc.deleteQuestion": "«{name}» silinsin?",
    "loc.deleteIrreversible": "Bu əməliyyat geri qaytarıla bilməz.",
    "loc.impactLoading": "Bağlı məlumatlar yoxlanılır…",
    "loc.impactNone": "Bağlı məlumat yoxdur.",
    "loc.impactCityDistricts": "Rayon: {n} — şəhərlə birlikdə silinəcək",
    "loc.impactCitySchools": "Məktəb: {n} — bu şəhərə bağlıdır",
    "loc.impactCityStudents": "Şagird: {n} — bu şəhərin məktəblərində oxuyur",
    "loc.impactDistrictSchools":
      "Məktəb: {n} — rayonsuz qalacaq və yenidən təyinat siyahısına düşəcək",
    "loc.impactSchoolStudents":
      "Şagird: {n} — məktəb bağlantısı ləğv ediləcək",
    "loc.errCityInUse":
      "Bu şəhəri silmək olmaz: ona bağlı məktəblər var. Əvvəlcə həmin məktəbləri silin və ya başqa şəhərə köçürün.",
    "loc.errDistrictInUse":
      "Bu rayonu silmək olmadı: ona bağlı məktəblər var. Əvvəlcə həmin məktəbləri başqa rayona köçürün.",
    "loc.errCityName": "Şəhər adı tələb olunur.",
    "loc.errDistrictName": "Rayon adı tələb olunur.",
    "loc.errSchoolName": "Məktəb adı tələb olunur.",
    "loc.errMissingCity": "Şəhər seçimi məcburidir.",
    "loc.errMissingDistrict": "Bu şəhər üçün rayon seçimi məcburidir.",
    "loc.errCityDuplicate": "Bu adda şəhər artıq mövcuddur.",
    "loc.errDistrictDuplicate": "Bu şəhərdə eyni adlı rayon artıq mövcuddur.",
    "loc.errCityChange":
      "Rayonun şəhərini dəyişmək olmaz: ona bağlı məktəblər var.",
    "loc.errGeneric": "Yadda saxlamaq mümkün olmadı. Yenidən cəhd edin.",
    "loc.errOp": "Əməliyyat alınmadı. Yenidən cəhd edin.",
  },
  en: {
    "nav.locations": "Locations",
    "loc.subtitle":
      "Manage cities, districts and schools in one place. Pick a city to see its districts, a district to see its schools.",
    "loc.cities": "Cities",
    "loc.districts": "Districts",
    "loc.schools": "Schools",
    "loc.addCity": "New city",
    "loc.addDistrict": "New district",
    "loc.addSchool": "New school",
    "loc.searchCities": "Search cities…",
    "loc.searchDistricts": "Search districts…",
    "loc.searchSchools": "Search schools…",
    "loc.selectCityForDistricts": "Select a city to see its districts.",
    "loc.selectCityForSchools": "Select a city to see its schools.",
    "loc.selectDistrictForSchools": "Select a district to see its schools.",
    "loc.noDistrictsInCity": "This city has no districts.",
    "loc.noDistrictsHint": "Schools are linked directly to the city.",
    "loc.noCities": "No cities yet.",
    "loc.noSchools": "No schools in this list.",
    "loc.needsDistrict": "No district assigned",
    "loc.needsDistrictHint": "Schools awaiting a district",
    "loc.reviewBanner":
      "These schools have no district assigned yet. Edit each school and pick its district.",
    "loc.countDistricts": "Districts: {n}",
    "loc.countSchools": "Schools: {n}",
    "loc.countStudents": "Students: {n}",
    "loc.statusActive": "Active",
    "loc.statusInactive": "Inactive",
    "loc.private": "Private",
    "loc.public": "Public",
    "loc.cityName": "City name",
    "loc.districtName": "District name",
    "loc.schoolName": "School name",
    "loc.city": "City",
    "loc.district": "District",
    "loc.isPrivate": "Private school",
    "loc.isPrivateHint": "Private schools appear at the top of the list.",
    "loc.addCityTitle": "Add a city",
    "loc.editCityTitle": "Edit city",
    "loc.addDistrictTitle": "Add a district",
    "loc.editDistrictTitle": "Edit district",
    "loc.addSchoolTitle": "Add a school",
    "loc.editSchoolTitle": "Edit school",
    "loc.deleteCityTitle": "Delete city",
    "loc.deleteDistrictTitle": "Delete district",
    "loc.deleteSchoolTitle": "Delete school",
    "loc.deleteQuestion": "Delete “{name}”?",
    "loc.deleteIrreversible": "This action cannot be undone.",
    "loc.impactLoading": "Checking linked records…",
    "loc.impactNone": "No linked records.",
    "loc.impactCityDistricts": "Districts: {n} — deleted together with the city",
    "loc.impactCitySchools": "Schools: {n} — linked to this city",
    "loc.impactCityStudents": "Students: {n} — enrolled in this city's schools",
    "loc.impactDistrictSchools":
      "Schools: {n} — will lose their district and return to the review list",
    "loc.impactSchoolStudents":
      "Students: {n} — will be detached from this school",
    "loc.errCityInUse":
      "This city cannot be deleted: schools are linked to it. Remove or reassign those schools first.",
    "loc.errDistrictInUse":
      "This district could not be deleted: schools are still assigned to it. Reassign those schools to another district first.",
    "loc.errCityName": "City name is required.",
    "loc.errDistrictName": "District name is required.",
    "loc.errSchoolName": "School name is required.",
    "loc.errMissingCity": "Selecting a city is required.",
    "loc.errMissingDistrict": "Selecting a district is required for this city.",
    "loc.errCityDuplicate": "A city with this name already exists.",
    "loc.errDistrictDuplicate":
      "A district with this name already exists in this city.",
    "loc.errCityChange":
      "The district's city cannot be changed: schools are assigned to it.",
    "loc.errGeneric": "Could not save. Please try again.",
    "loc.errOp": "The operation failed. Please try again.",
  },
  ru: {
    "nav.locations": "Локации",
    "loc.subtitle":
      "Управляйте городами, районами и школами в одном месте. Выберите город — увидите районы, район — школы.",
    "loc.cities": "Города",
    "loc.districts": "Районы",
    "loc.schools": "Школы",
    "loc.addCity": "Новый город",
    "loc.addDistrict": "Новый район",
    "loc.addSchool": "Новая школа",
    "loc.searchCities": "Поиск города…",
    "loc.searchDistricts": "Поиск района…",
    "loc.searchSchools": "Поиск школы…",
    "loc.selectCityForDistricts": "Выберите город, чтобы увидеть его районы.",
    "loc.selectCityForSchools": "Выберите город, чтобы увидеть его школы.",
    "loc.selectDistrictForSchools": "Выберите район, чтобы увидеть его школы.",
    "loc.noDistrictsInCity": "В этом городе нет районов.",
    "loc.noDistrictsHint": "Школы привязываются напрямую к городу.",
    "loc.noCities": "Городов пока нет.",
    "loc.noSchools": "В этом списке нет школ.",
    "loc.needsDistrict": "Район не назначен",
    "loc.needsDistrictHint": "Школы, ожидающие район",
    "loc.reviewBanner":
      "Этим школам ещё не назначен район. Откройте каждую школу и выберите её район.",
    "loc.countDistricts": "Районы: {n}",
    "loc.countSchools": "Школы: {n}",
    "loc.countStudents": "Ученики: {n}",
    "loc.statusActive": "Активный",
    "loc.statusInactive": "Неактивный",
    "loc.private": "Частная",
    "loc.public": "Государственная",
    "loc.cityName": "Название города",
    "loc.districtName": "Название района",
    "loc.schoolName": "Название школы",
    "loc.city": "Город",
    "loc.district": "Район",
    "loc.isPrivate": "Частная школа",
    "loc.isPrivateHint": "Частные школы отображаются вверху списка.",
    "loc.addCityTitle": "Добавить город",
    "loc.editCityTitle": "Редактировать город",
    "loc.addDistrictTitle": "Добавить район",
    "loc.editDistrictTitle": "Редактировать район",
    "loc.addSchoolTitle": "Добавить школу",
    "loc.editSchoolTitle": "Редактировать школу",
    "loc.deleteCityTitle": "Удалить город",
    "loc.deleteDistrictTitle": "Удалить район",
    "loc.deleteSchoolTitle": "Удалить школу",
    "loc.deleteQuestion": "Удалить «{name}»?",
    "loc.deleteIrreversible": "Это действие необратимо.",
    "loc.impactLoading": "Проверяем связанные записи…",
    "loc.impactNone": "Связанных записей нет.",
    "loc.impactCityDistricts": "Районы: {n} — будут удалены вместе с городом",
    "loc.impactCitySchools": "Школы: {n} — привязаны к этому городу",
    "loc.impactCityStudents": "Ученики: {n} — учатся в школах этого города",
    "loc.impactDistrictSchools":
      "Школы: {n} — останутся без района и вернутся в список на проверку",
    "loc.impactSchoolStudents":
      "Ученики: {n} — будут откреплены от этой школы",
    "loc.errCityInUse":
      "Этот город нельзя удалить: к нему привязаны школы. Сначала удалите или перенесите эти школы.",
    "loc.errDistrictInUse":
      "Не удалось удалить район: к нему привязаны школы. Сначала переназначьте эти школы в другой район.",
    "loc.errCityName": "Название города обязательно.",
    "loc.errDistrictName": "Название района обязательно.",
    "loc.errSchoolName": "Название школы обязательно.",
    "loc.errMissingCity": "Выбор города обязателен.",
    "loc.errMissingDistrict": "Для этого города выбор района обязателен.",
    "loc.errCityDuplicate": "Город с таким названием уже существует.",
    "loc.errDistrictDuplicate": "Район с таким названием уже есть в этом городе.",
    "loc.errCityChange":
      "Нельзя изменить город района: к нему привязаны школы.",
    "loc.errGeneric": "Не удалось сохранить. Попробуйте снова.",
    "loc.errOp": "Не удалось выполнить операцию. Попробуйте снова.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

// Full merged dictionary for the given locale (az fallback for missing keys) —
// handed to the client explorer so it holds no i18n logic of its own.
export function allStrings(locale: Locale): Record<string, string> {
  return { ...STRINGS.az, ...(STRINGS[locale] ?? {}) };
}
