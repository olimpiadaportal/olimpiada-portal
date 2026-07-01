import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { FeatureFlagToggle } from "@/components/FeatureFlagToggle";
import { SettingEditor } from "@/components/SettingEditor";
import { getT } from "@/i18n/server";

export default async function SettingsPage() {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();

  const { data: flagRows } = await supabase
    .from("feature_flags")
    .select("key, enabled")
    .order("key", { ascending: true });
  const flags = (flagRows ?? []) as any[];

  const { data: settingRows } = await supabase
    .from("system_settings")
    .select("key, value_json")
    .order("key", { ascending: true });
  const settings = (settingRows ?? []) as any[];

  const settingStrings = {
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    invalidJson: t("settings.err.invalidJson"),
    notFound: t("settings.err.notFound"),
    missing: t("settings.err.missing"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.settings")}</h1>
        <p className="muted">{t("settings.subtitle")}</p>
      </div>

      <div className="card-stack">
        <section className="card">
          <div className="card-head">
            <h3>{t("settings.flagsTitle")}</h3>
          </div>

          {flags.length === 0 ? (
            <div className="flag-empty">{t("settings.noFlags")}</div>
          ) : (
            <div className="flag-list">
              {flags.map((f) => (
                <div className="flag-row" key={f.key}>
                  <div className="flag-info">
                    <span className="flag-name">{f.key}</span>
                    <span className="flag-desc">{t("settings.flagKey")}</span>
                  </div>
                  <div className="flag-controls">
                    <span
                      className={`pill pill-inline ${
                        f.enabled ? "pill-ok" : "pill-muted"
                      }`}
                    >
                      {f.enabled ? t("settings.on") : t("settings.off")}
                    </span>
                    <FeatureFlagToggle
                      flagKey={f.key}
                      enabled={f.enabled}
                      enableLabel={t("settings.enable")}
                      disableLabel={t("settings.disable")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("settings.settingsTitle")}</h3>
            <span className="muted">{t("settings.jsonHint")}</span>
          </div>

          {settings.length === 0 ? (
            <div className="setting-empty">{t("settings.noSettings")}</div>
          ) : (
            <div className="setting-list">
              {settings.map((srow) => (
                <div className="setting-item" key={srow.key}>
                  <div className="setting-item-head">
                    <span className="setting-key">{srow.key}</span>
                  </div>
                  <SettingEditor
                    settingKey={srow.key}
                    value={JSON.stringify(srow.value_json, null, 2)}
                    strings={settingStrings}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
