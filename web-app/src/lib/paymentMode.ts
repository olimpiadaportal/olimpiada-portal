// SERVER-ONLY payment-mode resolver — Round 11.
//
// The platform has THREE payment modes, driven by admin feature flags that are
// mutually exclusive AT THE DATABASE LAYER (trigger `trg_payment_mode_exclusivity`,
// migration 2026_07_04_025):
//
//   'real'     — feature flag `payments`        : real/automatic payments
//                (provider still pending; today it behaves like demo at the
//                single provider seams, but the flag semantics are "real").
//   'demo'     — feature flag `demo_payments`   : the temporary demo-payment
//                flow (cosmetic card form, no charge) until the provider lands.
//   'giveaway' — feature flag `giveaway_period` : everything payment-related is
//                FREE for `giveaway.duration_days` days from `giveaway.started_at`
//                (stamped by the DB trigger when the flag flips on). An ELAPSED
//                window counts as INACTIVE even while the flag is still on —
//                expiry is enforced here, server-side, on every check.
//   'off'      — none of the above: paid mutations are blocked (existing
//                `gate.paymentsOff` UX).
//
// This module is THE single source of truth for "may this transaction happen"
// and "is access currently free". Every payment-adjacent server action calls
// it; visual components only receive the resolved snapshot.
import "server-only";
import { cache } from "react";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type PaymentMode = "real" | "demo" | "giveaway" | "off";

export type GiveawayInfo = {
  /** Flag on AND the window has not elapsed. */
  active: boolean;
  /** ISO timestamp the current giveaway started (stamped by the DB trigger). */
  startedAt: string | null;
  /** ISO timestamp the window ends (startedAt + durationDays). */
  endsAt: string | null;
  durationDays: number;
};

export type PaymentModeInfo = {
  mode: PaymentMode;
  giveaway: GiveawayInfo;
};

const TRIO = ["payments", "demo_payments", "giveaway_period"] as const;

/**
 * Resolve the payment mode + giveaway window in two queries, memoized per
 * request (React cache). Precedence: giveaway (active window) > demo > real.
 *
 * Safe fallbacks mirror lib/flags.ts semantics: if the service-role client is
 * unavailable or a lookup fails, `payments` degrades to AVAILABLE (mode 'real',
 * the pre-Round-11 behavior) while the NEW modes degrade to OFF — a config
 * hiccup must never accidentally open a free-access window.
 */
export const getPaymentModeInfo = cache(async (): Promise<PaymentModeInfo> => {
  const fallback: PaymentModeInfo = {
    mode: "real",
    giveaway: { active: false, startedAt: null, endsAt: null, durationDays: 0 },
  };
  if (!isServiceRoleConfigured) return fallback;

  try {
    const admin = getAdminClient();
    const [{ data: flags, error: fErr }, { data: settings, error: sErr }] =
      await Promise.all([
        admin
          .from("feature_flags")
          .select("key, enabled")
          .in("key", TRIO as unknown as string[]),
        admin
          .from("system_settings")
          .select("key, value_json")
          .in("key", ["giveaway.duration_days", "giveaway.started_at"]),
      ]);
    if (fErr || !flags) return fallback;

    const enabled = new Map<string, boolean>();
    for (const row of flags as { key: string; enabled: boolean | null }[]) {
      enabled.set(row.key, row.enabled === true);
    }
    // Missing-row semantics: `payments` missing → available (legacy parity);
    // the new flags missing → off.
    const real = enabled.has("payments") ? enabled.get("payments")! : true;
    const demo = enabled.get("demo_payments") ?? false;
    const giveawayFlag = enabled.get("giveaway_period") ?? false;

    let durationDays = 0;
    let startedAtRaw = "";
    if (!sErr && settings) {
      for (const row of settings as { key: string; value_json: unknown }[]) {
        if (row.key === "giveaway.duration_days" && typeof row.value_json === "number") {
          durationDays = row.value_json;
        }
        if (row.key === "giveaway.started_at" && typeof row.value_json === "string") {
          startedAtRaw = row.value_json.trim();
        }
      }
    }

    // Compute the window. An unparsable/empty start or non-positive duration
    // means the giveaway can never be active (flag alone is not enough).
    let giveaway: GiveawayInfo = {
      active: false,
      startedAt: null,
      endsAt: null,
      durationDays: durationDays > 0 ? Math.floor(durationDays) : 0,
    };
    if (giveawayFlag && startedAtRaw && giveaway.durationDays > 0) {
      const startMs = Date.parse(startedAtRaw);
      if (Number.isFinite(startMs)) {
        const endMs = startMs + giveaway.durationDays * 24 * 60 * 60 * 1000;
        giveaway = {
          ...giveaway,
          startedAt: new Date(startMs).toISOString(),
          endsAt: new Date(endMs).toISOString(),
          active: Date.now() < endMs,
        };
      }
    }

    const mode: PaymentMode = giveaway.active
      ? "giveaway"
      : demo
        ? "demo"
        : real
          ? "real"
          : "off";
    return { mode, giveaway };
  } catch {
    return fallback;
  }
});

/** True while a giveaway window is running — every payment surface shows FREE. */
export async function isGiveawayActive(): Promise<boolean> {
  return (await getPaymentModeInfo()).giveaway.active;
}

/**
 * May a PAID mutation (subscribe, re-price subjects, olympiad purchase) run?
 * 'real' and 'demo' → yes. 'giveaway' → no (access is free — blocking paid
 * writes during the free window keeps expiry clean: nothing to unwind).
 * 'off' → no.
 */
export async function canTransact(): Promise<boolean> {
  const { mode } = await getPaymentModeInfo();
  return mode === "real" || mode === "demo";
}
