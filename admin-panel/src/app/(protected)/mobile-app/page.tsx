import { requireAdmin } from "@/lib/admin/guards";
import { listMobileVersions } from "@/lib/admin/mobileApp";
import { SettingCard } from "@/components/SettingCard";
import {
  MobileVersionForm,
  type MobileVersionLabels,
} from "@/components/MobileVersionForm";
import { getT, getLocale } from "@/i18n/server";

// Mobile app version gate — one card per platform (iOS / Android) editing the
// seeded mobile_app_versions rows the mobile app reads via get_mobile_config().
export default async function MobileAppPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const rows = await listMobileVersions();

  // Owner-facing times are always shown in Azerbaijan time (Asia/Baku).
  const bakuFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baku",
  });

  const labels: MobileVersionLabels = {
    min: t("mobileapp.min"),
    minHelp: t("mobileapp.minHelp"),
    latest: t("mobileapp.latest"),
    latestHelp: t("mobileapp.latestHelp"),
    force: t("mobileapp.force"),
    forceHelp: t("mobileapp.forceHelp"),
    storeUrl: t("mobileapp.storeUrl"),
    storeUrlHelp: t("mobileapp.storeUrlHelp"),
    message: t("mobileapp.message"),
    messageHelp: t("mobileapp.messageHelp"),
    langAz: t("settings.lang.az"),
    langEn: t("settings.lang.en"),
    langRu: t("settings.lang.ru"),
    updatedAt: t("mobileapp.updatedAt"),
    save: t("mobileapp.save"),
    saving: t("mobileapp.saving"),
    saved: t("mobileapp.saved"),
    errSemver: t("mobileapp.err.semver"),
    errUrl: t("mobileapp.err.url"),
    errLength: t("mobileapp.err.length"),
    errGeneric: t("mobileapp.err.server"),
  };

  const platforms = [
    {
      platform: "ios" as const,
      title: t("mobileapp.ios"),
      description: t("mobileapp.iosDesc"),
    },
    {
      platform: "android" as const,
      title: t("mobileapp.android"),
      description: t("mobileapp.androidDesc"),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("mobileapp.title")}</h1>
        <p className="muted">{t("mobileapp.help")}</p>
      </div>

      <div className="settings-panel-stack">
        {platforms.map((p) => {
          const row = rows.find((r) => r.platform === p.platform);
          return (
            <SettingCard
              key={p.platform}
              title={p.title}
              description={p.description}
            >
              {row ? (
                <MobileVersionForm
                  platform={row.platform}
                  initial={{
                    min_version: row.min_version,
                    latest_version: row.latest_version,
                    force_update: row.force_update,
                    store_url: row.store_url,
                    message_az: row.message_az,
                    message_en: row.message_en,
                    message_ru: row.message_ru,
                  }}
                  updatedAt={bakuFmt.format(new Date(row.updated_at))}
                  labels={labels}
                />
              ) : (
                // Row not seeded in the DB yet — nothing to edit.
                <p className="sfield-help sfield-missing">
                  {t("settings.notConfigured")}
                </p>
              )}
            </SettingCard>
          );
        })}
      </div>
    </div>
  );
}
