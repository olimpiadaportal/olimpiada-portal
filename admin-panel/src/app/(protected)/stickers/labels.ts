import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Character Stickers admin screens that are
// NOT yet in the shared dictionary (admin-panel/src/i18n/messages.ts). Same
// precedent as the Cities/Schools labels.ts: kept here so the UI is fully
// trilingual today; the identical rows were handed to the central messages.ts
// merge (r11/g-admin.tsv) — once merged, this file can be dropped in favour of
// getT(). Reusable strings (action.*, field.status, manage.*, err.server, …)
// still come from getT() — these are only the gaps.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "stkadm.title": "Personaj stikerləri",
    "stkadm.subtitle":
      "Uşaqların seçdiyi stiker temalarını idarə et. Hər tema aktivləşdirilməzdən əvvəl ən azı 6 şəffaf PNG və ya WebP stikerə malik olmalıdır.",
    "stkadm.addHeading": "Yeni tema əlavə et",
    "stkadm.themeName": "Tema adı",
    "stkadm.nameHint": "2–60 simvol — personajın adı (məs. «Ben 10»).",
    "stkadm.created": "Yaradılıb",
    "stkadm.images": "Stikerlər",
    "stkadm.needsMore": "Aktivləşdirməyə {n} stiker qalıb",
    "stkadm.enabled": "Aktiv",
    "stkadm.disabled": "Deaktiv",
    "stkadm.enable": "Aktivləşdir",
    "stkadm.disable": "Deaktiv et",
    "stkadm.open": "Aç",
    "stkadm.none": "Hələ tema yoxdur. Yuxarıdan birincisini yaradın.",
    "stkadm.listError":
      "Temaların siyahısını yükləmək mümkün olmadı. Səhifəni yeniləyin və ya server loglarını yoxlayın.",
    "stkadm.saved": "Yadda saxlanıldı.",
    "stkadm.enableHint": "Aktivləşdirmə üçün minimum 6 stiker ({n}/6 hazırdır).",
    "stkadm.uploadHeading": "Stiker yüklə",
    "stkadm.uploadButton": "Faylları seç",
    "stkadm.uploading": "Yüklənir…",
    "stkadm.uploadHint":
      "Yalnız PNG və ya WebP · maksimum 2 MB · bir neçə faylı birdən seçmək olar.",
    "stkadm.transparencyHint":
      "Ən yaxşı görünüş üçün şəffaf fonlu stikerlərdən istifadə edin.",
    "stkadm.fileDone": "Yükləndi",
    "stkadm.fileErrType": "Yalnız PNG və ya WebP faylları qəbul olunur.",
    "stkadm.fileErrSize": "Fayl çox böyükdür (maksimum 2 MB).",
    "stkadm.fileErrUpload": "Yükləmə alınmadı. Yenidən cəhd edin.",
    "stkadm.noImages": "Bu temada hələ stiker yoxdur.",
    "stkadm.deleteHeading": "Temanı sil",
    "stkadm.deleteWarn":
      "Tema və onun bütün stikerləri silinəcək. Bu əməliyyat geri qaytarıla bilməz.",
    "stkadm.deleteConfirmLabel": "Təsdiq üçün temanın adını yazın",
    "stkadm.deleteConfirmHint": "Dəqiq bu adı yazın: {name}",
    "stkadm.deleting": "Silinir…",
    "stkadm.errName": "Tema adı 2–60 simvol olmalıdır.",
    "stkadm.errDuplicate": "Bu adda tema artıq mövcuddur.",
    "stkadm.errNeedsFive":
      "Temanı aktivləşdirmək üçün ən azı 6 stiker lazımdır.",
    "stkadm.errKeepFive":
      "Aktiv temada ən azı 6 stiker qalmalıdır. Əvvəlcə temanı deaktiv edin.",
    "stkadm.errConfirm": "Ad düzgün yazılmayıb. Yenidən cəhd edin.",
  },
  en: {
    "stkadm.title": "Character stickers",
    "stkadm.subtitle":
      "Manage the sticker themes children pick from. Every theme needs at least 6 transparent PNG or WebP stickers before it can be enabled.",
    "stkadm.addHeading": "Add a theme",
    "stkadm.themeName": "Theme name",
    "stkadm.nameHint": "2–60 characters — the character's name (e.g. “Ben 10”).",
    "stkadm.created": "Created",
    "stkadm.images": "Stickers",
    "stkadm.needsMore": "{n} more to enable",
    "stkadm.enabled": "Enabled",
    "stkadm.disabled": "Disabled",
    "stkadm.enable": "Enable",
    "stkadm.disable": "Disable",
    "stkadm.open": "Open",
    "stkadm.none": "No themes yet. Create the first one above.",
    "stkadm.listError":
      "The theme list could not be loaded. Refresh the page or check the server logs.",
    "stkadm.saved": "Saved.",
    "stkadm.enableHint": "Minimum 6 stickers to enable ({n}/6 ready).",
    "stkadm.uploadHeading": "Upload stickers",
    "stkadm.uploadButton": "Choose files",
    "stkadm.uploading": "Uploading…",
    "stkadm.uploadHint":
      "PNG or WebP only · 2 MB max · you can select several files at once.",
    "stkadm.transparencyHint":
      "Use stickers with a transparent background for the best look.",
    "stkadm.fileDone": "Uploaded",
    "stkadm.fileErrType": "Only PNG or WebP files are accepted.",
    "stkadm.fileErrSize": "File is too large (2 MB max).",
    "stkadm.fileErrUpload": "Upload failed. Please try again.",
    "stkadm.noImages": "No stickers in this theme yet.",
    "stkadm.deleteHeading": "Delete theme",
    "stkadm.deleteWarn":
      "The theme and all of its stickers will be deleted. This cannot be undone.",
    "stkadm.deleteConfirmLabel": "Type the theme name to confirm",
    "stkadm.deleteConfirmHint": "Type exactly: {name}",
    "stkadm.deleting": "Deleting…",
    "stkadm.errName": "Theme name must be 2–60 characters.",
    "stkadm.errDuplicate": "A theme with this name already exists.",
    "stkadm.errNeedsFive":
      "A theme needs at least 6 stickers before it can be enabled.",
    "stkadm.errKeepFive":
      "An enabled theme must keep at least 6 stickers. Disable the theme first.",
    "stkadm.errConfirm": "The name does not match. Please try again.",
  },
  ru: {
    "stkadm.title": "Стикеры с персонажами",
    "stkadm.subtitle":
      "Управляйте темами стикеров, которые выбирают дети. Чтобы включить тему, в ней должно быть не менее 6 прозрачных стикеров PNG или WebP.",
    "stkadm.addHeading": "Добавить тему",
    "stkadm.themeName": "Название темы",
    "stkadm.nameHint": "2–60 символов — имя персонажа (например, «Бен 10»).",
    "stkadm.created": "Создана",
    "stkadm.images": "Стикеры",
    "stkadm.needsMore": "До включения: ещё {n}",
    "stkadm.enabled": "Включена",
    "stkadm.disabled": "Выключена",
    "stkadm.enable": "Включить",
    "stkadm.disable": "Выключить",
    "stkadm.open": "Открыть",
    "stkadm.none": "Тем пока нет. Создайте первую выше.",
    "stkadm.listError":
      "Не удалось загрузить список тем. Обновите страницу или проверьте логи сервера.",
    "stkadm.saved": "Сохранено.",
    "stkadm.enableHint": "Для включения нужно минимум 6 стикеров (готово {n}/6).",
    "stkadm.uploadHeading": "Загрузить стикеры",
    "stkadm.uploadButton": "Выбрать файлы",
    "stkadm.uploading": "Загрузка…",
    "stkadm.uploadHint":
      "Только PNG или WebP · до 2 МБ · можно выбрать сразу несколько файлов.",
    "stkadm.transparencyHint":
      "Для наилучшего вида используйте стикеры с прозрачным фоном.",
    "stkadm.fileDone": "Загружено",
    "stkadm.fileErrType": "Принимаются только файлы PNG или WebP.",
    "stkadm.fileErrSize": "Файл слишком большой (до 2 МБ).",
    "stkadm.fileErrUpload": "Не удалось загрузить. Попробуйте снова.",
    "stkadm.noImages": "В этой теме пока нет стикеров.",
    "stkadm.deleteHeading": "Удалить тему",
    "stkadm.deleteWarn":
      "Тема и все её стикеры будут удалены. Это действие необратимо.",
    "stkadm.deleteConfirmLabel": "Введите название темы для подтверждения",
    "stkadm.deleteConfirmHint": "Введите точно: {name}",
    "stkadm.deleting": "Удаление…",
    "stkadm.errName": "Название темы должно быть от 2 до 60 символов.",
    "stkadm.errDuplicate": "Тема с таким названием уже существует.",
    "stkadm.errNeedsFive":
      "Чтобы включить тему, нужно не менее 6 стикеров.",
    "stkadm.errKeepFive":
      "Во включённой теме должно оставаться не менее 6 стикеров. Сначала выключите тему.",
    "stkadm.errConfirm": "Название не совпадает. Попробуйте снова.",
  },
};

// key → string with optional {var} interpolation, resolved SERVER-side.
export function localStrings(
  locale: Locale,
): (key: string, vars?: Record<string, string | number>) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key, vars) => {
    let out = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
    }
    return out;
  };
}
