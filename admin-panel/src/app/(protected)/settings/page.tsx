import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { FeatureFlagToggle } from "@/components/FeatureFlagToggle";
import { SettingEditor, type SettingFieldKind } from "@/components/SettingEditor";
import { SettingToggle } from "@/components/SettingToggle";
import { SettingCard } from "@/components/SettingCard";
import { SettingsTabs } from "@/components/SettingsTabs";
import { FLAG_META, SETTING_META, LOCALE_OPTIONS } from "@/lib/admin/settings-meta";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "./labels";

// Round 11: the three payment-mode flags are grouped into their own Features
// sub-card. The DATABASE trigger guarantees mutual exclusivity (enabling one
// auto-disables the other two); the toggle's revalidatePath("/settings") makes
// the sibling switches visibly drop after a flip.
const PAYMENT_MODE_FLAGS = ["payments", "demo_payments", "giveaway_period"] as const;

// Settings redesign (Round 6): a single tabbed page (General / Localization /
// Features) with settings grouped into cards and typed per-field editors.
// There is NO raw-JSON editor: every rendered setting uses a typed control
// from SETTING_META. Keys present in the DB but absent from SETTING_META are
// intentionally NOT rendered — all live keys are covered by META, so an
// unknown key means a not-yet-supported experiment that should get a META
// entry (and i18n strings) before being exposed to admins.
export default async function SettingsPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const supabase = await createClient();

  const [{ data: flagRows }, { data: settingRows }] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled"),
    supabase.from("system_settings").select("key, value_json"),
  ]);

  const flagEnabled = new Map(
    ((flagRows ?? []) as { key: string; enabled: boolean }[]).map((f) => [
      f.key,
      f.enabled,
    ]),
  );

  const settingValue = new Map<string, unknown>();
  for (const row of (settingRows ?? []) as { key: string; value_json: unknown }[]) {
    settingValue.set(row.key, row.value_json);
  }

  // Shared strings for the typed field editors.
  const editorBase = {
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    invalidJson: t("settings.err.invalidJson"),
    notFound: t("settings.err.notFound"),
    missing: t("settings.err.missing"),
    notConfigured: t("settings.notConfigured"),
    localesEmpty: t("settings.err.localesEmpty"),
    langAz: t("settings.lang.az"),
    langEn: t("settings.lang.en"),
    langRu: t("settings.lang.ru"),
  };

  // Typed field for a known non-boolean setting key. If the DB row has not
  // been seeded yet, the control still renders (empty/default value) with a
  // muted "not configured yet" hint; saving then reports not-found.
  function field(key: string) {
    const meta = SETTING_META[key];
    if (!meta) return null;
    const kind = meta.kind;
    if (kind === "boolean") return null; // booleans render via toggle()
    return (
      <SettingEditor
        key={key}
        settingKey={key}
        kind={kind as SettingFieldKind}
        value={settingValue.get(key)}
        exists={settingValue.has(key)}
        localeOptions={LOCALE_OPTIONS}
        placeholder={meta.placeholder}
        min={meta.min}
        max={meta.max}
        strings={{ ...editorBase, label: t(meta.labelKey), help: t(meta.helpKey) }}
      />
    );
  }

  // Boolean setting toggle (saves immediately). `confirm` marks dangerous
  // toggles that require an inline confirmation step before enabling.
  function toggle(key: string, opts?: { confirm?: boolean }) {
    const meta = SETTING_META[key];
    if (!meta) return null;
    return (
      <SettingToggle
        key={key}
        settingKey={key}
        initial={settingValue.get(key) === true}
        exists={settingValue.has(key)}
        strings={{
          label: t(meta.labelKey),
          help: t(meta.helpKey),
          on: t("settings.on"),
          off: t("settings.off"),
          enable: t("settings.enable"),
          disable: t("settings.disable"),
          saved: t("settings.saved"),
          notFound: t("settings.err.notFound"),
          notConfigured: t("settings.notConfigured"),
          ...(opts?.confirm
            ? {
                confirmText: t("settings.maintenanceConfirm"),
                confirmYes: t("settings.confirm"),
                cancel: t("action.cancel"),
              }
            : {}),
        }}
      />
    );
  }

  // ---- Academic year / term (Round 20) --------------------------------------
  // Rendered directly (not via field()) so the labels come from the LOCAL
  // trilingual strings until messages.ts gains the settings.sys.academic_* keys.
  // The term renders as a fixed 1..4 select ("1-ci rüb" … "4-cü rüb") but is
  // stored as a bare JSON number through the same updateSetting action.
  const termOptions = [1, 2, 3, 4].map((n) => ({
    value: n,
    label: lt(`settings.academic.term.${n}`),
  }));
  const academicFields = (
    <>
      <SettingEditor
        settingKey="academic.year"
        kind="text"
        value={settingValue.get("academic.year")}
        exists={settingValue.has("academic.year")}
        localeOptions={LOCALE_OPTIONS}
        placeholder={SETTING_META["academic.year"]?.placeholder}
        strings={{
          ...editorBase,
          label: lt("settings.sys.academic_year.label"),
          help: lt("settings.sys.academic_year.help"),
        }}
      />
      <SettingEditor
        settingKey="academic.current_term"
        kind="number"
        value={settingValue.get("academic.current_term")}
        exists={settingValue.has("academic.current_term")}
        localeOptions={LOCALE_OPTIONS}
        min={SETTING_META["academic.current_term"]?.min}
        max={SETTING_META["academic.current_term"]?.max}
        numberOptions={termOptions}
        strings={{
          ...editorBase,
          label: lt("settings.sys.academic_term.label"),
          help: lt("settings.sys.academic_term.help"),
        }}
      />
      <p className="hint" style={{ marginTop: 8 }}>
        {lt("settings.academic.cumulativeNote")}
      </p>
    </>
  );

  /* ------------------------------ Tab: General ------------------------------ */
  const generalTab = (
    <div className="settings-panel-stack">
      <SettingCard
        title={t("settings.card.maintenance.title")}
        description={t("settings.card.maintenance.desc")}
        variant="warning"
      >
        {toggle("platform.maintenance_mode", { confirm: true })}
        {field("platform.maintenance_message")}
      </SettingCard>

      <SettingCard
        title={lt("settings.academic.title")}
        description={lt("settings.academic.desc")}
      >
        {academicFields}
      </SettingCard>

      <SettingCard
        title={t("settings.card.support.title")}
        description={t("settings.card.support.desc")}
      >
        {field("contact.support_email")}
        {field("contact.support_phone")}
      </SettingCard>

      <SettingCard
        title={t("settings.card.social.title")}
        description={t("settings.card.social.desc")}
        variant="info"
      >
        {field("social.facebook")}
        {field("social.instagram")}
        {field("social.youtube")}
        {field("social.tiktok")}
      </SettingCard>
    </div>
  );

  /* --------------------------- Tab: Localization ---------------------------- */
  const localizationTab = (
    <div className="settings-panel-stack">
      <SettingCard
        title={t("settings.card.languages.title")}
        description={t("settings.card.languages.desc")}
      >
        {field("platform.default_locale")}
        {field("platform.supported_locales")}
      </SettingCard>
    </div>
  );

  /* ------------------------------ Tab: Features ----------------------------- */
  // Shared renderer for one feature-flag row (used by both the payment-mode
  // sub-section and the general flag list below it).
  function flagRow(key: string) {
    const meta = FLAG_META[key];
    if (!meta) return null;
    const enabled = flagEnabled.get(key);
    return (
      <div className="flag-row" key={key}>
        <div className="flag-info">
          <span className="flag-title">{t(meta.labelKey)}</span>
          <span className="flag-desc">{t(meta.descKey)}</span>
        </div>
        <div className="flag-controls">
          {enabled === undefined ? (
            // Flag row not seeded in the DB yet — nothing to toggle.
            <span className="sfield-missing">{t("settings.notConfigured")}</span>
          ) : (
            <FeatureFlagToggle
              flagKey={key}
              enabled={enabled}
              enableLabel={t("settings.enable")}
              disableLabel={t("settings.disable")}
              onText={t("settings.on")}
              offText={t("settings.off")}
            />
          )}
        </div>
      </div>
    );
  }

  // ---- Giveaway window (read-only status) -----------------------------------
  // `giveaway.started_at` is stamped by the DB trigger when the flag flips ON
  // (it is intentionally absent from SETTING_META → never editable here).
  const giveawayOn = flagEnabled.get("giveaway_period") === true;
  const startedRaw = settingValue.get("giveaway.started_at");
  const durationRaw = settingValue.get("giveaway.duration_days");
  const durationDays =
    typeof durationRaw === "number" &&
    Number.isInteger(durationRaw) &&
    durationRaw >= 1 &&
    durationRaw <= 730
      ? durationRaw
      : null;
  const startedAt =
    typeof startedRaw === "string" && startedRaw.trim() !== ""
      ? new Date(startedRaw)
      : null;
  const startedValid = startedAt !== null && !Number.isNaN(startedAt.getTime());
  const endsAt =
    startedValid && durationDays !== null
      ? new Date(startedAt!.getTime() + durationDays * 86_400_000)
      : null;
  const giveawayExpired = endsAt !== null && endsAt.getTime() <= Date.now();
  // Owner-facing times are always shown in Azerbaijan time (Asia/Baku).
  const bakuFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baku",
  });

  const featuresTab = (
    <div className="settings-panel-stack">
      <SettingCard
        title={t("settings.card.paymentMode.title")}
        description={t("settings.card.paymentMode.desc")}
        variant="info"
      >
        {/* Mutual exclusivity is enforced by the DATABASE: flipping one on
            turns the other two off; revalidation refreshes the sibling rows. */}
        <p className="pm-note">{t("settings.paymentMode.exclusiveNote")}</p>
        <div className="flag-list">
          {PAYMENT_MODE_FLAGS.map((key) => flagRow(key))}
        </div>
        <div className="pm-giveaway">
          {field("giveaway.duration_days")}
          {giveawayOn && startedValid && (
            <div
              className={`pm-window${giveawayExpired ? " pm-window-expired" : ""}`}
            >
              <span
                className={`pill ${giveawayExpired ? "pill-warn" : "pill-ok"}`}
              >
                {giveawayExpired
                  ? t("settings.giveaway.statusExpired")
                  : t("settings.giveaway.statusActive")}
              </span>
              <span className="pm-window-line">
                {t("settings.giveaway.startedAt")}{" "}
                <strong>{bakuFmt.format(startedAt!)}</strong>
              </span>
              {endsAt !== null && (
                <span className="pm-window-line">
                  {t("settings.giveaway.endsAt")}{" "}
                  <strong>{bakuFmt.format(endsAt)}</strong>
                </span>
              )}
              <span className="pm-window-tz">{t("settings.giveaway.tz")}</span>
            </div>
          )}
        </div>
      </SettingCard>

      <SettingCard
        title={t("settings.flagsTitle")}
        description={t("settings.flagsIntro")}
      >
        <div className="flag-list">
          {Object.keys(FLAG_META)
            .filter(
              (key) => !(PAYMENT_MODE_FLAGS as readonly string[]).includes(key),
            )
            .map((key) => flagRow(key))}
        </div>
      </SettingCard>

      <SettingCard
        title={t("settings.card.leaderboard.title")}
        description={t("settings.card.leaderboard.desc")}
      >
        {toggle("leaderboard.public_display_names")}
      </SettingCard>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.settings")}</h1>
        <p className="muted">{t("settings.subtitle")}</p>
      </div>

      <SettingsTabs
        tabs={[
          { id: "general", label: t("settings.tab.general"), content: generalTab },
          {
            id: "localization",
            label: t("settings.tab.localization"),
            content: localizationTab,
          },
          { id: "features", label: t("settings.tab.features"), content: featuresTab },
        ]}
      />
    </div>
  );
}
