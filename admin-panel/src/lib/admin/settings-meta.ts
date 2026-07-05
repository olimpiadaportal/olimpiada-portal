// Settings/feature-flag presentation metadata. This is a PLAIN module (no
// "use server"): a Server Actions file may only export async functions, so these
// constant maps + types live here and are imported by the settings UI + actions.

// Feature flags: key -> friendly i18n label + description keys.
// Insertion order here is the render order on the Features tab.
export type FlagMeta = { labelKey: string; descKey: string };

export const FLAG_META: Record<string, FlagMeta> = {
  launch_promo: {
    labelKey: "settings.flag.launch_promo.label",
    descKey: "settings.flag.launch_promo.desc",
  },
  news_public: {
    labelKey: "settings.flag.news_public.label",
    descKey: "settings.flag.news_public.desc",
  },
  olympiad_module: {
    labelKey: "settings.flag.olympiad_module.label",
    descKey: "settings.flag.olympiad_module.desc",
  },
  payments: {
    labelKey: "settings.flag.payments.label",
    descKey: "settings.flag.payments.desc",
  },
  demo_payments: {
    labelKey: "settings.flag.demo_payments.label",
    descKey: "settings.flag.demo_payments.desc",
  },
  giveaway_period: {
    labelKey: "settings.flag.giveaway_period.label",
    descKey: "settings.flag.giveaway_period.desc",
  },
  leaderboard: {
    labelKey: "settings.flag.leaderboard.label",
    descKey: "settings.flag.leaderboard.desc",
  },
  notifications_email: {
    labelKey: "settings.flag.notifications_email.label",
    descKey: "settings.flag.notifications_email.desc",
  },
};

// System settings: which typed input to render for a known key.
//   - "text"       : generic single-line text. JSON stored as a quoted string.
//   - "email"      : email field. JSON stored as a quoted string.
//   - "phone"      : telephone field (input type="tel"). Quoted string.
//   - "url"        : URL field (input type="url"). Quoted string.
//   - "number"     : numeric field. JSON stored as a bare number.
//   - "textarea"   : multi-line text. Quoted string.
//   - "trilingual" : three textareas (az/en/ru) saved together as one JSON
//                    object {"az":"…","en":"…","ru":"…"} — assembled in code,
//                    the admin never sees raw JSON.
//   - "boolean"    : sliding toggle (saves immediately). Bare boolean.
//   - "locale"     : single-choice select (az/en/ru). Quoted string.
//   - "locales"    : multi-select checkboxes (az/en/ru). String array.
//
// Every live system_settings key is covered by an entry here; keys present in
// the DB but absent from this map are intentionally NOT rendered (there is no
// raw-JSON fallback editor anymore).
export type SettingEditorKind =
  | "text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "textarea"
  | "trilingual"
  | "boolean"
  | "locale"
  | "locales";

export type SettingMeta = {
  kind: SettingEditorKind;
  labelKey: string;
  helpKey: string;
  // Format example shown inside the empty control (language-neutral, so it is
  // not a translated UI string).
  placeholder?: string;
  // Inclusive bounds for "number" settings (mirrored server-side in
  // updateSetting for keys that need hard validation).
  min?: number;
  max?: number;
};

export const SETTING_META: Record<string, SettingMeta> = {
  "platform.maintenance_mode": {
    kind: "boolean",
    labelKey: "settings.sys.maintenance_mode.label",
    helpKey: "settings.sys.maintenance_mode.help",
  },
  "platform.maintenance_message": {
    kind: "trilingual",
    labelKey: "settings.sys.maintenance_message.label",
    helpKey: "settings.sys.maintenance_message.help",
  },
  "contact.support_email": {
    kind: "email",
    labelKey: "settings.sys.support_email.label",
    helpKey: "settings.sys.support_email.help",
    placeholder: "support@example.com",
  },
  "contact.support_phone": {
    kind: "phone",
    labelKey: "settings.sys.support_phone.label",
    helpKey: "settings.sys.support_phone.help",
    placeholder: "+994 12 345 67 89",
  },
  "social.facebook": {
    kind: "url",
    labelKey: "settings.sys.social_facebook.label",
    helpKey: "settings.sys.social_facebook.help",
    placeholder: "https://facebook.com/…",
  },
  "social.instagram": {
    kind: "url",
    labelKey: "settings.sys.social_instagram.label",
    helpKey: "settings.sys.social_instagram.help",
    placeholder: "https://instagram.com/…",
  },
  "social.youtube": {
    kind: "url",
    labelKey: "settings.sys.social_youtube.label",
    helpKey: "settings.sys.social_youtube.help",
    placeholder: "https://youtube.com/@…",
  },
  "social.tiktok": {
    kind: "url",
    labelKey: "settings.sys.social_tiktok.label",
    helpKey: "settings.sys.social_tiktok.help",
    placeholder: "https://tiktok.com/@…",
  },
  // Giveaway window length in days (integer 1..730 — enforced server-side in
  // updateSetting). NOTE: `giveaway.started_at` is INTERNAL (stamped by the DB
  // trigger when the giveaway flag flips on) and deliberately has NO entry here,
  // so it is never rendered as an editable setting.
  "giveaway.duration_days": {
    kind: "number",
    labelKey: "settings.sys.giveaway_duration_days.label",
    helpKey: "settings.sys.giveaway_duration_days.help",
    placeholder: "7",
    min: 1,
    max: 730,
  },
  "leaderboard.public_display_names": {
    kind: "boolean",
    labelKey: "settings.sys.public_display_names.label",
    helpKey: "settings.sys.public_display_names.help",
  },
  "platform.default_locale": {
    kind: "locale",
    labelKey: "settings.sys.default_locale.label",
    helpKey: "settings.sys.default_locale.help",
  },
  "platform.supported_locales": {
    kind: "locales",
    labelKey: "settings.sys.supported_locales.label",
    helpKey: "settings.sys.supported_locales.help",
  },
};

// Supported UI locales (matches the app's i18n config) for locale inputs.
export const LOCALE_OPTIONS = ["az", "en", "ru"] as const;
