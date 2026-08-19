// SERVER-ONLY payment-mode resolver — Round 11, narrowed by migration 121.
//
// The platform has THREE payment modes, driven by admin feature flags that are
// mutually exclusive AT THE DATABASE LAYER (trigger `trg_payment_mode_exclusivity`,
// migrations 2026_07_04_025 + 2026_08_18_121):
//
//   'real'     — feature flag `payments`        : real/automatic payments
//                (provider still pending; the flag semantics are "real").
//   'giveaway' — feature flag `giveaway_period` : everything payment-related is
//                FREE for `giveaway.duration_days` days from `giveaway.started_at`
//                (stamped by the DB trigger when the flag flips on). An ELAPSED
//                window counts as INACTIVE even while the flag is still on —
//                expiry is enforced here, server-side, on every check.
//   'off'      — neither flag: paid mutations are blocked (existing
//                `gate.paymentsOff` UX).
//
// There is NO demo mode. The fourth mode ('demo', flag `demo_payments`) was the
// temporary cosmetic-card-form stand-in for a payment provider and was DELETED
// on 2026-08-18 — flag row, DB branches and UI. The database now REJECTS a
// `demo_payments` row outright, so this resolver can never see one again.
//
// 'off' is deliberately NOT a payment method: it is the kill switch AND the
// fail-closed fallback below, so the UI and the DB guard
// (`assert_payments_enabled`) always agree even during an infra failure.
//
// This module is THE single source of truth for "may this transaction happen"
// and "is access currently free". Every payment-adjacent server action calls
// it; visual components only receive the resolved snapshot.
import "server-only";
import { cache } from "react";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type PaymentMode = "real" | "giveaway" | "off";

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

const MODE_FLAGS = ["payments", "giveaway_period"] as const;

/**
 * Resolve the payment mode + giveaway window in two queries, memoized per
 * request (React cache). Precedence: giveaway (active window) > real.
 *
 * Round 51 (sync audit F1/F3): this is a MONEY gate, so every failure path is
 * fail-CLOSED — mode 'off'. The old fallback was 'real' (pre-Round-11
 * parity), which showed the full paid UI on an infra hiccup while the DB kill
 * switch (assert_payments_enabled, migration 089) refused every write: buy
 * buttons that always error. 'off' keeps the two layers agreeing. The same
 * applies to a MISSING `payments` flag row — off, exactly like the DB guard.
 */
export const getPaymentModeInfo = cache(async (): Promise<PaymentModeInfo> => {
  const fallback: PaymentModeInfo = {
    mode: "off",
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
          .in("key", MODE_FLAGS as unknown as string[]),
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
    // Missing-row semantics: EVERY flag missing → off (fail closed; matches
    // current_payment_mode() in the DB — migration 091 aligned all resolvers).
    const real = enabled.get("payments") ?? false;
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

    const mode: PaymentMode = giveaway.active ? "giveaway" : real ? "real" : "off";
    return { mode, giveaway };
  } catch {
    return fallback;
  }
});

/** True while a giveaway window is running — every payment surface shows FREE. */
export async function isGiveawayActive(): Promise<boolean> {
  return (await getPaymentModeInfo()).giveaway.active;
}
