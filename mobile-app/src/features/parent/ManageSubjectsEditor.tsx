// Manage-subjects CHECKBOX editor for a child's LIVE subscription (web
// ManageSubjects parity). Toggling is pure client state; nothing applies until
// Save. Payment-first contract: a diff containing ANY addition opens the demo
// payment sheet first (demo mode); removal-only diffs and free modes submit
// directly. The BFF/server re-diffs the desired FULL set authoritatively —
// the client never sends prices.
//
// Round 41 (web parity — structured change summary): the summary is a
// SaaS-style card in a fixed order: Selected subjects (count) · Added ·
// Removed · Pay now · Next billing · Note. The new recurring rate appears in
// EXACTLY ONE sentence (subjedit.nextBillingLine, filled with {date}/{total}/
// {currency}/{interval}); the no-charge line (subjedit.noChargeNow) and the
// removal note (subjedit.noteText) are PRICE-FREE and only carry {date}. The
// retired thenRate/removalNotice/billingExplainer keys are gone from the
// catalog. Amounts stay authoritative (bffQuoteSubjectChange's due_now /
// new_recurring_total — diff-based, never client-computed).
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, weight } from "@/theme/tokens";
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

/** Summary section: small uppercase muted label over its content (web
 *  .subjedit-sum-block twin). */
function SumBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
      <AppText variant="eyebrow" style={{ textTransform: "uppercase" }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

/** Bullet line for a pending added/removed subject — 320pt-safe (the name
 *  wraps inside flexShrink instead of pushing off-screen). */
function SumSubjectLine({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <AppText variant="body" color={color}>
        {"•"}
      </AppText>
      <AppText variant="body" color={color} style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
        {name}
      </AppText>
    </View>
  );
}

export function ManageSubjectsEditor({
  studentId,
  subjects,
  coveredIds,
  endingIds = [],
  interval,
  posture,
  addsDisabled = false,
  onSaved,
}: {
  studentId: string;
  subjects: SubjectOption[];
  /** Subject ids in the GO-FORWARD plan (scheduled removals excluded). */
  coveredIds: string[];
  /** Subject ids with a scheduled removal (access runs to the period end).
   *  They render UNCHECKED with an "ends at period end" chip — otherwise a
   *  completed removal looks like it failed and the parent has no way to
   *  re-tick the subject to cancel it. Web ManageSubjects parity. */
  endingIds?: string[];
  /** The live subscription's billing interval. */
  interval: string | null;
  posture: CommercePosture;
  /** Removal-only mode (payments off): the server deliberately keeps
   *  REMOVALS legal when payments are off — a parent must always be able to
   *  stop paying — and blocks only ADDS. Add-side rows (unchecked subjects
   *  outside the live coverage) become non-selectable and price-free;
   *  unchecking currently-active subjects keeps working. */
  addsDisabled?: boolean;
  onSaved: () => void;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const iv = isInterval(interval) ? interval : "month";

  const coveredKey = useMemo(() => [...coveredIds].sort().join(","), [coveredIds]);
  const covered = useMemo(() => new Set(coveredKey ? coveredKey.split(",") : []), [coveredKey]);
  const endingKey = useMemo(() => [...endingIds].sort().join(","), [endingIds]);
  const ending = useMemo(() => new Set(endingKey ? endingKey.split(",") : []), [endingKey]);
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
  // subjedit.nextBillingLine composes "{total} {currency} / {interval}" itself
  // — {interval} wants the bare word ("ay"/"il"/"həftə"), so strip the leading
  // "/ " off the existing billing.perX key.
  const bareInterval = t(INTERVAL_PER_KEY[quoteInterval]).replace(/^\/\s*/, "");

  // Round 41 sentences (web ManageSubjects twins): the new recurring rate
  // appears ONLY in nextBillingSentence; the other two are price-free.
  const nextBillingSentence = (q: SubjectChangeQuote) =>
    t("subjedit.nextBillingLine")
      .replace("{date}", fmtBakuDate(q.effective_from, locale))
      .replace("{total}", fmtAmount(q.new_recurring_total, locale))
      .replace("{currency}", q.currency)
      .replace("{interval}", bareInterval);
  const noChargeSentence = (q: SubjectChangeQuote) =>
    t("subjedit.noChargeNow").replace("{date}", fmtBakuDate(q.effective_from, locale));
  const noteSentence = (q: SubjectChangeQuote) =>
    t("subjedit.noteText").replace("{date}", fmtBakuDate(q.removals_effective_at, locale));

  /** The DemoPaySheet total: the authoritative due_now amount, or the
   *  price-free no-charge sentence when it's 0 (trial / weekly / waived —
   *  never a bare "0 AZN"). Web DemoPaymentModal wiring. */
  function dueNowValueText(): string {
    if (quoting) return t("sub.calculating");
    if (!quote) return quoteError ? t(quoteError) : t("sub.calculating");
    return quote.due_now > 0
      ? fmtMoney(quote.due_now, quote.currency, locale)
      : noChargeSentence(quote);
  }

  const noChargeConfirm = toAdd.length > 0 && !!quote && quote.due_now === 0;

  const toggle = (id: string) => {
    // Removal-only mode: checking a subject outside the live coverage would
    // be an ADD (the server rejects it while payments are off) — ignore it.
    // Ending rows count too: re-ticking a scheduled removal is add-shaped.
    if (addsDisabled && !selected.has(id) && !covered.has(id)) return;
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
      <AppText variant="muted">{t("pricing.perSubjectNote")}</AppText>
      {posture.demoPay ? <AppText variant="muted">{t("subjedit.demoModeNote")}</AppText> : null}

      <Card style={{ paddingVertical: spacing.xs }}>
        {subjects.map((s) => {
          const isChecked = selected.has(s.id);
          // Checking this row would ADD a subject (it is outside the live
          // coverage) — in removal-only mode that side is disabled and shows
          // no price line.
          const wouldAdd = !isChecked && !covered.has(s.id);
          return (
            <SubjectCheckRow
              key={s.id}
              name={subjectLabel(t, s.code, s.name)}
              priceText={addsDisabled && wouldAdd ? "" : fmtMoney(s.prices[iv] ?? 0, "AZN", locale)}
              checked={isChecked}
              onToggle={() => toggle(s.id)}
              chip={
                covered.has(s.id)
                  ? t("subjedit.activeChip")
                  : ending.has(s.id) && !isChecked
                    ? t("subjedit.endingChip")
                    : undefined
              }
              chipTone={covered.has(s.id) ? "active" : "ending"}
              disabled={pending || (addsDisabled && wouldAdd)}
            />
          );
        })}
      </Card>
      <AppText variant="muted">{t("subjedit.minOne")}</AppText>

      {/* Round 41 — structured change summary (web .subjedit-summary twin):
          Selected · Added · Removed · Pay now · Next billing · Note. */}
      <Card>
        <KeyRow label={t("subjedit.selectedCount")} value={String(selected.size)} />

        {toAdd.length > 0 ? (
          <SumBlock label={t("subjedit.pendingAdd")}>
            {toAdd.map((s) => (
              <SumSubjectLine key={s.id} name={subjectLabel(t, s.code, s.name)} color={tokens.ok} />
            ))}
          </SumBlock>
        ) : null}
        {toRemove.length > 0 ? (
          <SumBlock label={t("subjedit.pendingRemove")}>
            {toRemove.map((s) => (
              <SumSubjectLine
                key={s.id}
                name={subjectLabel(t, s.code, s.name)}
                color={tokens.danger}
              />
            ))}
          </SumBlock>
        ) : null}

        {quoting ? (
          <AppText variant="muted" style={{ marginTop: spacing.sm }}>
            {t("sub.calculating")}
          </AppText>
        ) : quote ? (
          <>
            {/* Pay now: the prorated top-up as ONE prominent amount. A
                waived/trial 0 top-up shows the price-free no-charge line. */}
            {toAdd.length > 0 ? (
              <SumBlock label={t("subjedit.dueNow")}>
                {quote.due_now > 0 ? (
                  <AppText variant="mono" style={{ fontSize: 20, fontWeight: weight.bold }}>
                    {fmtMoney(quote.due_now, quote.currency, locale)}
                  </AppText>
                ) : (
                  <AppText variant="muted">{noChargeSentence(quote)}</AppText>
                )}
              </SumBlock>
            ) : null}
            {/* Next billing: the ONLY place the new recurring rate appears. */}
            <SumBlock label={t("subjedit.nextBilling")}>
              <AppText variant="body">{nextBillingSentence(quote)}</AppText>
            </SumBlock>
            {/* Note: price-free removal terms. */}
            {toRemove.length > 0 ? (
              <SumBlock label={t("subjedit.noteLabel")}>
                <AppText variant="muted">{noteSentence(quote)}</AppText>
              </SumBlock>
            ) : null}
          </>
        ) : quoteError ? (
          <AppText variant="muted" color={tokens.danger} style={{ marginTop: spacing.sm }}>
            {t(quoteError)}
          </AppText>
        ) : null}
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
        thenText={!quoting && quote && quote.due_now > 0 ? nextBillingSentence(quote) : null}
        note={t("pay.note")}
        confirmLabel={noChargeConfirm ? t("pay.confirmNoCharge") : t("pay.payNow")}
        error={error}
      />
    </View>
  );
}
