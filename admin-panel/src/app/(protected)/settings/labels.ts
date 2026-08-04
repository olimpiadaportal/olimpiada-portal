import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Settings screen's Academic card that are
// NOT yet in the shared dictionary (admin-panel/src/i18n/messages.ts). Mirrors
// the cities/districts labels.ts pattern: keeps the UI fully trilingual today;
// these should be migrated into messages.ts by the agent that owns admin
// message additions (reported in followups).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "settings.academic.title": "Cari tədris ili / rüb",
    "settings.academic.desc":
      "Gündəlik raundların sual hovuzlarını idarə edən təqvim parametrləri.",
    "settings.academic.cumulativeNote":
      "Rüb gündəlik raundların sual hovuzunu kumulyativ idarə edir: seçilmiş rüblə yanaşı əvvəlki rüblərin mövzuları da daxil olur.",
    "settings.sys.academic_year.label": "Cari tədris ili",
    "settings.sys.academic_year.help": "Məsələn: 2026-2027.",
    "settings.sys.academic_term.label": "Cari rüb",
    "settings.sys.academic_term.help": "Tədris ilinin cari rübü (1–4).",
    "settings.academic.term.1": "1-ci rüb",
    "settings.academic.term.2": "2-ci rüb",
    "settings.academic.term.3": "3-cü rüb",
    "settings.academic.term.4": "4-cü rüb",
    "settings.sys.support_whatsapp.label": "Dəstək WhatsApp nömrəsi",
    "settings.sys.support_whatsapp.help":
      "Doldurulduqda açıq saytdakı əlaqə bölməsində WhatsApp sətri göstərilir; boş saxlasanız sətir gizlədilir.",
    "settings.sys.support_address.label": "Dəstək ünvanı",
    "settings.sys.support_address.help":
      "Doldurulduqda açıq saytdakı əlaqə bölməsində ünvan sətri göstərilir; boş saxlasanız sətir gizlədilir.",
    "settings.sys.support_map_query.label": "Xəritə üçün dəqiq yer",
    "settings.sys.support_map_query.help":
      "Boş saxlasanız xəritə ünvandan istifadə edəcək; dəqiq nöqtə üçün 40.3719,49.8371 kimi koordinat daxil edin.",

    "settings.privacy.title": "Məxfilik siyasəti",
    "settings.privacy.desc":
      "Siyasətin mətni koddadır; burada yalnız kodun bilə bilmədiyi faktlar saxlanılır. Boş qalan sahə saytda və tətbiqdə «dəqiqləşdirilir» kimi göstərilir.",
    "settings.privacy.draftNote":
      "Qüvvəyəminmə tarixi boş olduğu müddətdə siyasət hər yerdə LAYİHƏ kimi göstərilir və qüvvədə sayılmır. Tarixi yalnız mətn hüquqşünas tərəfindən yoxlandıqdan sonra doldurun.",
    "settings.privacy.derivedNote":
      "Push bildirişləri və ödənişlərlə bağlı cümlələr avtomatik seçilir: onlar «Funksiyalar» bölməsindəki push bayrağından və ödəniş rejimindən götürülür, ona görə burada ayrıca sahə yoxdur.",
    "settings.sys.privacy_effective_date.label": "Qüvvəyəminmə tarixi",
    "settings.sys.privacy_effective_date.help":
      "Sənədin qüvvəyə mindiyi gün. Olduğu kimi göstərilir — 15.08.2026 formatında yazın. Boş = layihə.",
    "settings.sys.privacy_last_updated.label": "Son yenilənmə tarixi",
    "settings.sys.privacy_last_updated.help":
      "Mətndə son ciddi dəyişikliyin edildiyi gün. Adətən qüvvəyəminmə tarixi ilə eyni olur.",
    "settings.sys.privacy_contact_email.label": "Məxfilik üçün e-poçt",
    "settings.sys.privacy_contact_email.help":
      "Məlumatların silinməsi və digər məxfilik sorğuları üçün ünvan. Boş saxlasanız ümumi dəstək e-poçtu göstərilir.",
    "settings.sys.privacy_website_url.label": "Sayt ünvanı",
    "settings.sys.privacy_website_url.help":
      "Siyasətdə göstərilən rəsmi sayt ünvanı, məsələn olympiq.ai.",
    "settings.sys.privacy_hosting_region.label": "Serverlərin yerləşdiyi region",
    "settings.sys.privacy_hosting_region.help":
      "Supabase və Vercel layihələrinin regionu. Supabase idarə panelində Project Settings → General bölməsində göstərilir.",
    "settings.sys.privacy_server_log_retention.label": "Server jurnallarının saxlanma müddəti",
    "settings.sys.privacy_server_log_retention.help":
      "Hostinq provayderinin IP ünvanı olan sorğu jurnallarını nə qədər saxladığı, məsələn «30 gün».",
    "settings.sys.privacy_learning_data_retention.label": "Təhsil məlumatlarının saxlanma müddəti",
    "settings.sys.privacy_learning_data_retention.help":
      "Hesab açıq olduğu müddətdə test nəticələri və giriş cəhdlərinin saxlanma müddəti.",
    "settings.sys.privacy_backup_retention.label": "Ehtiyat nüsxələrin saxlanma müddəti",
    "settings.sys.privacy_backup_retention.help":
      "Verilənlər bazasının ehtiyat nüsxələrinin saxlanma müddəti. Silinmə canlı sətirləri silir, ehtiyat nüsxələr ayrıca müddətlə saxlanılır.",
  },
  en: {
    "settings.academic.title": "Current academic year / term",
    "settings.academic.desc":
      "Calendar settings that drive the daily-round question pools.",
    "settings.academic.cumulativeNote":
      "The term drives the daily-round question pool cumulatively: topics from the selected term and every earlier term are included.",
    "settings.sys.academic_year.label": "Current academic year",
    "settings.sys.academic_year.help": "For example: 2026-2027.",
    "settings.sys.academic_term.label": "Current term",
    "settings.sys.academic_term.help": "The current term of the school year (1–4).",
    "settings.academic.term.1": "Term 1",
    "settings.academic.term.2": "Term 2",
    "settings.academic.term.3": "Term 3",
    "settings.academic.term.4": "Term 4",
    "settings.sys.support_whatsapp.label": "Support WhatsApp number",
    "settings.sys.support_whatsapp.help":
      "When filled in, the WhatsApp row is shown in the public site's contact section; leave empty to hide it.",
    "settings.sys.support_address.label": "Support address",
    "settings.sys.support_address.help":
      "When filled in, the address row is shown in the public site's contact section; leave empty to hide it.",
    "settings.sys.support_map_query.label": "Precise map location",
    "settings.sys.support_map_query.help":
      "Leave empty to use the address; set precise coordinates like 40.3719,49.8371 for an exact map pin.",

    "settings.privacy.title": "Privacy policy",
    "settings.privacy.desc":
      "The policy text lives in code; only the facts the code cannot know are stored here. A field left empty is shown as “to be confirmed” on the site and in the app.",
    "settings.privacy.draftNote":
      "While the effective date is empty the policy presents itself everywhere as a DRAFT and is not in force. Fill it in only after a lawyer has reviewed the text.",
    "settings.privacy.derivedNote":
      "The push and payment sentences are chosen automatically from the push flag and the payment mode on the Features tab, which is why they have no field here.",
    "settings.sys.privacy_effective_date.label": "Effective date",
    "settings.sys.privacy_effective_date.help":
      "The day the document takes effect. Shown verbatim — write it as 15.08.2026. Empty = draft.",
    "settings.sys.privacy_last_updated.label": "Last updated",
    "settings.sys.privacy_last_updated.help":
      "The day of the last substantive edit to the text. Usually the same as the effective date.",
    "settings.sys.privacy_contact_email.label": "Privacy email",
    "settings.sys.privacy_contact_email.help":
      "Address for deletion and other data requests. Leave empty to publish the general support email instead.",
    "settings.sys.privacy_website_url.label": "Website address",
    "settings.sys.privacy_website_url.help":
      "The official site address quoted in the policy, e.g. olympiq.ai.",
    "settings.sys.privacy_hosting_region.label": "Hosting region",
    "settings.sys.privacy_hosting_region.help":
      "The region of the Supabase and Vercel projects. Supabase shows it under Project Settings → General.",
    "settings.sys.privacy_server_log_retention.label": "Server log retention",
    "settings.sys.privacy_server_log_retention.help":
      "How long the hosting providers keep request logs containing IP addresses, e.g. “30 days”.",
    "settings.sys.privacy_learning_data_retention.label": "Learning data retention",
    "settings.sys.privacy_learning_data_retention.help":
      "How long test results, audit entries and sign-in attempts are kept while an account is open.",
    "settings.sys.privacy_backup_retention.label": "Backup retention",
    "settings.sys.privacy_backup_retention.help":
      "How long database backups are kept. Deleting an account removes live rows; backups age out separately.",
  },
  ru: {
    "settings.academic.title": "Текущий учебный год / четверть",
    "settings.academic.desc":
      "Параметры календаря, управляющие пулами вопросов ежедневных раундов.",
    "settings.academic.cumulativeNote":
      "Четверть управляет пулом вопросов ежедневных раундов кумулятивно: включаются темы выбранной четверти и всех предыдущих.",
    "settings.sys.academic_year.label": "Текущий учебный год",
    "settings.sys.academic_year.help": "Например: 2026-2027.",
    "settings.sys.academic_term.label": "Текущая четверть",
    "settings.sys.academic_term.help": "Текущая четверть учебного года (1–4).",
    "settings.academic.term.1": "1-я четверть",
    "settings.academic.term.2": "2-я четверть",
    "settings.academic.term.3": "3-я четверть",
    "settings.academic.term.4": "4-я четверть",
    "settings.sys.support_whatsapp.label": "Номер WhatsApp поддержки",
    "settings.sys.support_whatsapp.help":
      "Если заполнено, строка WhatsApp отображается в контактном разделе публичного сайта; оставьте пустым, чтобы скрыть её.",
    "settings.sys.support_address.label": "Адрес поддержки",
    "settings.sys.support_address.help":
      "Если заполнено, строка адреса отображается в контактном разделе публичного сайта; оставьте пустым, чтобы скрыть её.",
    "settings.sys.support_map_query.label": "Точное место на карте",
    "settings.sys.support_map_query.help":
      "Оставьте пустым, чтобы карта использовала адрес; укажите координаты вида 40.3719,49.8371 для точной метки.",

    "settings.privacy.title": "Политика конфиденциальности",
    "settings.privacy.desc":
      "Текст политики хранится в коде; здесь — только факты, которые код знать не может. Пустое поле отображается на сайте и в приложении как «уточняется».",
    "settings.privacy.draftNote":
      "Пока дата вступления в силу пуста, политика везде показывается как ЧЕРНОВИК и не считается действующей. Заполняйте дату только после проверки текста юристом.",
    "settings.privacy.derivedNote":
      "Формулировки про push-уведомления и платежи выбираются автоматически — из флага push и режима оплаты на вкладке «Функции», поэтому отдельных полей здесь нет.",
    "settings.sys.privacy_effective_date.label": "Дата вступления в силу",
    "settings.sys.privacy_effective_date.help":
      "День, с которого документ действует. Показывается как есть — пишите в виде 15.08.2026. Пусто = черновик.",
    "settings.sys.privacy_last_updated.label": "Дата последнего обновления",
    "settings.sys.privacy_last_updated.help":
      "День последнего существенного изменения текста. Обычно совпадает с датой вступления в силу.",
    "settings.sys.privacy_contact_email.label": "E-mail по вопросам конфиденциальности",
    "settings.sys.privacy_contact_email.help":
      "Адрес для запросов на удаление данных и других обращений. Оставьте пустым, чтобы публиковался общий адрес поддержки.",
    "settings.sys.privacy_website_url.label": "Адрес сайта",
    "settings.sys.privacy_website_url.help":
      "Официальный адрес сайта, указанный в политике, например olympiq.ai.",
    "settings.sys.privacy_hosting_region.label": "Регион хостинга",
    "settings.sys.privacy_hosting_region.help":
      "Регион проектов Supabase и Vercel. В Supabase он указан в разделе Project Settings → General.",
    "settings.sys.privacy_server_log_retention.label": "Срок хранения серверных журналов",
    "settings.sys.privacy_server_log_retention.help":
      "Сколько хостинг-провайдеры хранят журналы запросов с IP-адресами, например «30 дней».",
    "settings.sys.privacy_learning_data_retention.label": "Срок хранения учебных данных",
    "settings.sys.privacy_learning_data_retention.help":
      "Сколько хранятся результаты тестов, записи аудита и попытки входа, пока аккаунт открыт.",
    "settings.sys.privacy_backup_retention.label": "Срок хранения резервных копий",
    "settings.sys.privacy_backup_retention.help":
      "Сколько хранятся резервные копии базы данных. Удаление убирает живые строки, копии устаревают отдельно.",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
