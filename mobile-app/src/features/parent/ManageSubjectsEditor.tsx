// Manage-subjects CHECKBOX editor for a child's LIVE subscription (web
// ManageSubjects parity). Toggling is pure client state; nothing applies until
// Save. Payment-first contract: a diff containing ANY addition opens the demo
// payment sheet first (demo mode); removal-only diffs and free modes submit
// directly. The BFF/server re-diffs the desired FULL set authoritatively —
// the client never sends prices. Callers mount this only in demo/free modes.
//
// Round 24/32 (mid-cycle proration, web parity keys): the preview is no
// longer a single recurring total. Additions get an immediate prorated
// top-up (bffQuoteSubjectChange's due_now) while the recurring rate rises
// from now on; removals never refund — access + the old rate continue until
// removals_effective_at. The two numbers are quoted authoritatively
// (diff-based, never client-computed). Copy comes from the synced
// subjedit.dueNow/thenRate/noChargeNow/removalNotice/billingExplainer keys
// (web messages.ts "Round 32" block) — {total}/{currency}/{interval}/{date}
// are filled in here, never baked into a client-side sentence.
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { bffQuoteSubjectChange, bffUpdateSubjects, type SubjectChangeQuote } from "@/lib/api";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  INTERVAL_PER_KEY,
  fmtAmount,
  fmtBakuDate,
  fmtMoney,
  isInterval,
  type CommercePosture,
  type SubjectOption,
} from "./commerce";
import { DemoPaySheet } from "./DemoPaySheet";
import { SubjectCheckRow } from "./SubscribeFlow";
import { KeyRow } from "./ui";

/** Debounced (~400ms) diff-based proration quote (BFF /subjects/quote) — the
 *  useServerQuote (SubscribeFlow) twin, but keyed by the add/remove diff
 *  instead of the desired full set. Result is keyed by its input, so a stale
 *  response for an older diff simply never matches the current key. */
function useSubjectChangeQuote(
  studentId: string,
  addKey: string,
  removeKey: string,
  enabled: boolean,
) {
  const key = `${studentId}|${addKey}|${removeKey}`;
  const [result, setResult] = useState<{
    key: string;
    quote: SubjectChangeQuote | null;
    error: string | null;
  }>({ key: "", quote: null, error: null });

  const active = enabled && !!studentId && (addKey.length > 0 || removeKey.length > 0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await bffQuoteSubjectChange(
        studentId,
        addKey ? addKey.split(",") : [],
        removeKey ? removeKey.split(",") : [],
      );
      if (!cancelled) {
        setResult({ key, quote: res.ok ? res.data : null, error: res.ok ? null : res.error });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, studentId, addKey, removeKey, key]);

  const fresh = active && result.key === key;
  return {
    quote: fresh ? result.quote : null,
    loading: active && !fresh,
    error: fresh ? result.error : null,
  };
}

export function ManageSubjectsEditor({
  studentId,
  subjects,
  coveredIds,
  interval,
  posture,
  onSaved,
}: {
  studentId: string;
  subjects: SubjectOption[];
  /** Subject ids covered by the live subscription right now. */
  coveredIds: string[];
  /** The live subscription's billing interval. */
  interval: string | null;
  posture: CommercePosture;
  onSaved: () => void;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const iv = isInterval(interval) ? interval : "month";

  const coveredKey = useMemo(() => [...coveredIds].sort().join(","), [coveredIds]);
  const covered = useMemo(() => new Set(coveredKey ? coveredKey.split(",") : []), [coveredKey]);
  // User edits are the SYMMETRIC DIFFERENCE vs the live coverage, so the
  // selection is DERIVED (covered XOR toggled) and auto-resyncs when a save
  // refetches the coverage — no state-sync effect needed.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => {
    const sel = new Set<string>();
    for (const s of subjects) {
      if (covered.has(s.id) !== toggled.has(s.id)) sel.add(s.id); // XOR
    }
    return sel;
  }, [subjects, covered, toggled]);

  const [payOpen, setPayOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toAdd = subjects.filter((s) => selected.has(s.id) && !covered.has(s.id));
  const toRemove = subjects.filter((s) => !selected.has(s.id) && covered.has(s.id));
  const hasDiff = toAdd.length > 0 || toRemove.length > 0;

  const addKey = useMemo(() => toAdd.map((s) => s.id).sort().join(","), [toAdd]);
  const removeKey = useMemo(() => toRemove.map((s) => s.id).sort().join(","), [toRemove]);
  const {
    quote,
    loading: quoting,
    error: quoteError,
  } = useSubjectChangeQuote(studentId, addKey, removeKey, selected.size > 0);
  const quoteInterval = quote && isInterval(quote.interval) ? quote.interval : iv;
  // subjedit.thenRate/noChargeNow/removalNotice compose "{total} {currency} /
  // {interval}" themselves — {interval} wants the bare word ("ay"/"il"/
  // "həftə"), so strip the leading "/ " off the existing billing.perX key.
  const bareInterval = t(INTERVAL_PER_KEY[quoteInterval]).replace(/^\/\s*/, "");

  const fillRate = (key: string, total: number, currency: string, date: string | null) =>
    t(key)
      .replace("{total}", fmtAmount(total))
      .replace("{currency}", currency)
      .replace("{interval}", bareInterval)
      .replace("{date}", fmtBakuDate(date, locale));

  /** The DemoPaySheet total / on-screen "Due now" value: the authoritative
   *  due_now amount, or the plain no-charge sentence when it's 0 (trial /
   *  weekly / waived — never a bare "0 AZN"). */
  function dueNowValueText(): string {
    if (quoting) return t("sub.calculating");
    if (!quote) return quoteError ? t(quoteError) : t("sub.calculating");
    return quote.due_now > 0
      ? fmtMoney(quote.due_now, quote.currency)
      : fillRate("subjedit.noChargeNow", quote.new_recurring_total, quote.currency, quote.effective_from);
  }

  const noChargeConfirm = toAdd.length > 0 && !!quote && quote.due_now === 0;

  const toggle = (id: string) => {
    setError(null);
    setSaved(false);
    setToggled((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function apply() {
    if (pending) return; // double-submit guard
    setPending(true);
    setError(null);
    const res = await bffUpdateSubjects(studentId, [...selected]);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setPayOpen(false);
    setSaved(true);
    setToggled(new Set()); // fresh baseline: the refetched coverage IS the selection
    onSaved();
  }

  function onSave() {
    if (!hasDiff || pending) return;
    if (selected.size === 0) {
      setError(t("subjedit.minOne"));
      return;
    }
    if (toAdd.length > 0 && posture.demoPay) {
      setError(null);
      setPayOpen(true);
      return;
    }
    void apply();
  }

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("subjedit.title")}</AppText>
      {posture.demoPay ? (
        <>
          <AppText variant="muted">{t("subjedit.demoModeNote")}</AppText>
          <AppText variant="muted">{t("subjedit.billingExplainer")}</AppText>
        </>
      ) : null}

      <Card style={{ paddingVertical: spacing.xs }}>
        {subjects.map((s) => (
          <SubjectCheckRow
            key={s.id}
            name={subjectLabel(t, s.code, s.name)}
            priceText={fmtMoney(s.prices[iv] ?? 0, "AZN")}
            checked={selected.has(s.id)}
            onToggle={() => toggle(s.id)}
            chip={covered.has(s.id) ? t("subjedit.activeChip") : undefined}
            disabled={pending}
          />
        ))}
      </Card>
      <AppText variant="muted">{t("pricing.perSubjectNote")}</AppText>

      <Card>
        <KeyRow label={t("subjedit.selectedCount")} value={String(selected.size)} />
        {toAdd.length > 0 ? (
          <KeyRow
            label={t("subjedit.pendingAdd")}
            value={toAdd.map((s) => subjectLabel(t, s.code, s.name)).join(", ")}
          />
        ) : null}
        {toRemove.length > 0 ? (
          <KeyRow
            label={t("subjedit.pendingRemove")}
            value={toRemove.map((s) => subjectLabel(t, s.code, s.name)).join(", ")}
          />
        ) : null}

        {toAdd.length > 0 ? (
          quoting ? (
            <KeyRow label={t("subjedit.dueNow")} value={t("sub.calculating")} strong />
          ) : quote ? (
            quote.due_now > 0 ? (
              <>
                <KeyRow
                  label={t("subjedit.dueNow")}
                  value={fmtMoney(quote.due_now, quote.currency)}
                  strong
                />
                <AppText variant="muted" style={{ marginTop: spacing.xs }}>
                  {fillRate(
                    "subjedit.thenRate",
                    quote.new_recurring_total,
                    quote.currency,
                    quote.effective_from,
                  )}
                </AppText>
              </>
            ) : (
              <AppText variant="muted" style={{ marginTop: spacing.xs }}>
                {fillRate(
                  "subjedit.noChargeNow",
                  quote.new_recurring_total,
                  quote.currency,
                  quote.effective_from,
                )}
              </AppText>
            )
          ) : quoteError ? (
            <AppText variant="muted" color={tokens.danger}>
              {t(quoteError)}
            </AppText>
          ) : null
        ) : null}

        {toRemove.length > 0 && quote ? (
          <AppText variant="muted" style={{ marginTop: spacing.xs }}>
            {fillRate(
              "subjedit.removalNotice",
              quote.new_recurring_total,
              quote.currency,
              quote.removals_effective_at,
            )}
          </AppText>
        ) : null}

        {!hasDiff ? (
          <AppText variant="muted">{t("subjedit.noChanges")}</AppText>
        ) : (
          <AppText variant="muted" style={{ marginTop: spacing.xs }}>
            {t("sub.siblingNote")}
          </AppText>
        )}
      </Card>

      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
      {saved ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("subjedit.saved")}
        </AppText>
      ) : null}

      <Button
        title={t("subjedit.save")}
        pending={pending && !payOpen}
        pendingTitle={t("subjedit.saving")}
        disabled={!hasDiff}
        onPress={onSave}
      />

      <DemoPaySheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        onConfirm={() => void apply()}
        pending={pending}
        rows={[
          ...(toAdd.length > 0
            ? [
                {
                  label: t("subjedit.pendingAdd"),
                  value: toAdd.map((s) => subjectLabel(t, s.code, s.name)).join(", "),
                },
              ]
            : []),
          ...(toRemove.length > 0
            ? [
                {
                  label: t("subjedit.pendingRemove"),
                  value: toRemove.map((s) => subjectLabel(t, s.code, s.name)).join(", "),
                },
              ]
            : []),
        ]}
        totalLabel={t("subjedit.dueNow")}
        totalValue={dueNowValueText()}
        note={t("pay.note")}
        confirmLabel={noChargeConfirm ? t("pay.confirmNoCharge") : t("pay.payNow")}
        error={error}
      />
    </View>
  );
}
