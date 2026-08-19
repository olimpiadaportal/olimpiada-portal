// PURE parsing + gating logic for get_mobile_config() (no React/RN imports —
// unit-tested in __tests__/config.test.ts). The server resolves the payment
// mode; the client NEVER computes or trusts one. Missing/malformed fields
// degrade to the SAFE side: modules off, payments off, maintenance off.
import type { PrivacyPolicyOverrides } from "@/lib/privacyPolicy";

// The DEMO mode was deleted platform-wide (owner, 2026-08-18): the server can
// only report 'real', 'giveaway' or 'off', and anything else degrades to 'off'
// (the fail-closed kill switch, which the UI and the DB guard agree on).
export type PaymentMode = "real" | "giveaway" | "off";

export type TriMessage = { az: string; en: string; ru: string };

export type PlatformGate = {
  min: string;
  latest: string;
  force: boolean;
  storeUrl: string;
  message: TriMessage;
};

export type MobileConfig = {
  payment: { mode: PaymentMode; giveawayEndsAt: string | null };
  flags: {
    newsPublic: boolean;
    olympiadModule: boolean;
    leaderboard: boolean;
    notifications: boolean;
    notificationsPush: boolean;
    launchPromo: boolean;
  };
  maintenance: { on: boolean; message: TriMessage };
  locales: { supported: string[]; default: string };
  // `email` is the TECHNICAL support inbox; `infoEmail` (migration 116) is the
  // general one for questions and feedback. Web's ContactInfo shows both, so
  // the app does too — a single address here would silently drop half of what
  // an administrator configured.
  contact: {
    email: string;
    infoEmail: string;
    phone: string;
    whatsapp: string;
    address: string;
    mapQuery: string;
  };
  social: { facebook: string; instagram: string; youtube: string; tiktok: string };
  // Migration 097. Deliberately the ONLY snake_case member of this type: it is
  // handed straight to resolvePrivacyPolicyStatus(), which both codebases share,
  // so renaming the fields here would mean mapping them back before every call.
  privacy: PrivacyPolicyOverrides;
  version: { ios: PlatformGate; android: PlatformGate };
};

const EMPTY_TRI: TriMessage = { az: "", en: "", ru: "" };

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function tri(v: unknown): TriMessage {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { az: str(o.az), en: str(o.en), ru: str(o.ru) };
  }
  return { ...EMPTY_TRI };
}

/**
 * Privacy metadata, preserving ABSENCE rather than coercing it.
 *
 * `bool()` would turn a missing `push_live` into `false`, and the resolver
 * treats any explicit boolean as an answer — so an old server that predates
 * migration 097 would silently assert "push is not live" instead of falling
 * back to the compiled-in default. Only a real boolean is passed through.
 */
function privacy(v: unknown): PrivacyPolicyOverrides {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: PrivacyPolicyOverrides = {
    effective_date: str(o.effective_date),
    last_updated: str(o.last_updated),
    website_url: str(o.website_url),
    contact_email: str(o.contact_email),
    hosting_region: str(o.hosting_region),
    server_log_retention: str(o.server_log_retention),
    learning_data_retention: str(o.learning_data_retention),
    backup_retention: str(o.backup_retention),
  };
  if (typeof o.push_live === "boolean") out.push_live = o.push_live;
  if (typeof o.payments_live === "boolean") out.payments_live = o.payments_live;
  return out;
}

function gate(v: unknown): PlatformGate {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    min: str(o.min, "0.0.0"),
    latest: str(o.latest, "0.0.0"),
    force: bool(o.force),
    storeUrl: str(o.store_url),
    message: tri(o.message),
  };
}

export function parseMobileConfig(raw: unknown): MobileConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const payment = (o.payment ?? {}) as Record<string, unknown>;
  const flags = (o.flags ?? {}) as Record<string, unknown>;
  const maintenance = (o.maintenance ?? {}) as Record<string, unknown>;
  const loc = (o.locales ?? {}) as Record<string, unknown>;
  const contact = (o.contact ?? {}) as Record<string, unknown>;
  const social = (o.social ?? {}) as Record<string, unknown>;
  const version = (o.version ?? {}) as Record<string, unknown>;

  const mode = str(payment.mode);
  const supported = Array.isArray(loc.supported)
    ? (loc.supported as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return {
    payment: {
      mode: mode === "real" || mode === "giveaway" ? mode : "off",
      giveawayEndsAt:
        typeof payment.giveaway_ends_at === "string" ? payment.giveaway_ends_at : null,
    },
    flags: {
      newsPublic: bool(flags.news_public),
      olympiadModule: bool(flags.olympiad_module),
      leaderboard: bool(flags.leaderboard),
      notifications: bool(flags.notifications),
      notificationsPush: bool(flags.notifications_push),
      launchPromo: bool(flags.launch_promo),
    },
    maintenance: { on: bool(maintenance.on), message: tri(maintenance.message) },
    locales: {
      supported: supported.length > 0 ? supported : ["az", "en", "ru"],
      default: str(loc.default, "az") || "az",
    },
    contact: {
      email: str(contact.email),
      // Absent on a server that predates migration 116 — str() gives "" and the
      // row simply does not render, exactly like the other optional rows.
      infoEmail: str(contact.info_email),
      phone: str(contact.phone),
      whatsapp: str(contact.whatsapp),
      address: str(contact.address),
      mapQuery: str(contact.map_query),
    },
    social: {
      facebook: str(social.facebook),
      instagram: str(social.instagram),
      youtube: str(social.youtube),
      tiktok: str(social.tiktok),
    },
    privacy: privacy(o.privacy),
    version: { ios: gate(version.ios), android: gate(version.android) },
  };
}

/** Numeric semver compare: negative when a < b, 0 when equal, positive when a > b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type VersionGateResult = {
  /** Hard dead-end: the app must be updated before anything else renders. */
  forceUpdate: boolean;
  /** Soft signal: a newer version exists (non-blocking hint). */
  updateAvailable: boolean;
  storeUrl: string;
  message: TriMessage;
};

export function evaluateVersionGate(
  config: MobileConfig,
  platform: "ios" | "android",
  appVersion: string,
): VersionGateResult {
  const g = config.version[platform];
  return {
    forceUpdate: g.force && compareSemver(appVersion, g.min) < 0,
    updateAvailable: compareSemver(appVersion, g.latest) < 0,
    storeUrl: g.storeUrl,
    message: g.message,
  };
}
