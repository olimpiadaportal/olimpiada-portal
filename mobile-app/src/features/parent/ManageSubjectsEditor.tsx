// Manage-subjects CHECKBOX editor for a child's LIVE subscription (web
// ManageSubjects parity). Toggling is pure client state; nothing applies until
// Save. Payment-first contract: a diff containing ANY addition opens the demo
// payment sheet first (demo mode); removal-only diffs and free modes submit
// directly. The BFF/server re-diffs the desired FULL set authoritatively —
// the client never sends prices.
//
// Round 41 (web parity — structured change summary): the summary is a
// SaaS-style card in a fixed order: Selected subjects (count) · Added ·
// Removed · Pay now · Renewals · Note. The no-charge line
// (subjedit.noChargeNow) and the removal note (subjedit.noteText) are
// PRICE-FREE and only carry {date}. Amounts stay authoritative
// (bffQuoteSubjectChange's due_now / renewals — never client-computed).
//
// Migration 109 — PER-SUBJECT CYCLES. Every covered subject carries its own
// billing cycle, so this editor shows each subject's cycle and PRESERVES it
// when the subject set changes (it posts the desired full set as `items`).
// Choosing a different cycle for an existing subject stays a WEB action: the
// mobile parent surface is deliberately display-first for commerce, and a
// scheduled cycle change is a billing change. The single
// subjedit.nextBillingLine sentence is replaced by one plan.renewalLine.*
// sentence per cycle — one sentence cannot describe a mixed plan.
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
  INTERVAL_NAME_KEY,
  fmtAmount,
  fmtBakuDate,
  fmtMoney,
  isInterval,
  renewalLineKey,
  type CommercePosture,
  type Interval,
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
  // Migration 109: the desired FULL set with each subject's cycle. It is part
  // of the key, so a cycle that differs produces a different quote rather than
  // silently reusing the previous one.
  itemsKey = "",
) {
  const key = `${studentId}|${addKey}|${removeKey}|${itemsKey}`;
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
        itemsKey
          ? itemsKey.split(",").map((raw) => {
              const [subject_id, interval] = raw.split(":");
              return { subject_id, interval };
            })
          : undefined,
      );
      if (!cancelled) {
        setResult({ key, quote: res.ok ? res.data : null, error: res.ok ? null : res.error });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, studentId, addKey, removeKey, itemsKey, key]);

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

/** One subject as the live subscription currently covers it (migration 109). */
export type CoveredSubject = {
  subjectId: string;
  /** THIS subject's cycle (already resolved against the subscription default). */
  interval: string | null;
  /** A cycle change scheduled for this subject's next renewal. */
  pendingInterval: string | null;
  /** Non-null = scheduled removal; access runs to its own period end. */
  removeAt: string | null;
};

export function ManageSubjectsEditor({
  studentId,
  subjects,
  covered: coveredRows,
  defaultInterval,
  posture,
  addsDisabled = false,
  onSaved,
}: {
  studentId: string;
  subjects: SubjectOption[];
  /** Every covered subject with ITS OWN cycle. A row with `removeAt` set is
   *  scheduled for removal: it renders UNCHECKED with an "ends at period end"
   *  chip — otherwise a completed removal looks like it failed and the parent
   *  has no way to re-tick the subject to cancel it. Web parity. */
  covered: CoveredSubject[];
  /** The subscription's DEFAULT cycle — what a newly added subject inherits. */
  defaultInterval: string | null;
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
  const iv: Interval = isInterval(defaultInterval) ? defaultInterval : "month";

  // Each subject's OWN cycle, so a row is priced and labelled on the cycle the
  // parent actually pays for it — not on one plan-wide interval.
  const cycleOf = useMemo(() => {
    const m = new Map<string, Interval>();
    for (const c of coveredRows) {
      m.set(c.subjectId, isInterval(c.interval) ? c.interval : iv);
    }
    return m;
  }, [coveredRows, iv]);
  const pendingOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of coveredRows) {
      if (c.pendingInterval) m.set(c.subjectId, c.pendingInterval);
    }
    return m;
  }, [coveredRows]);
  const coveredKey = useMemo(
    () =>
      coveredRows
        .filter((c) => !c.removeAt)
        .map((c) => c.subjectId)
        .sort()
        .join(","),
    [coveredRows],
  );
  const covered = useMemo(() => new Set(coveredKey ? coveredKey.split(",") : []), [coveredKey]);
  const ending = useMemo(
    () => new Set(coveredRows.filter((c) => c.removeAt).map((c) => c.subjectId)),
    [coveredRows],
  );
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
  // The DESIRED full set, each subject keeping its own cycle; a NEW subject
  // inherits the subscription's default (changing a cycle is a web action).
  // A subject with a SCHEDULED cycle change posts that scheduled cycle, not the
  // one it is currently paid on: the server treats "the cycle you are already
  // paid on" as a request to CANCEL the schedule, so posting ss.interval here
  // would make an unrelated add/remove silently undo the parent's web choice.
  const items = useMemo(
    () =>
      [...selected].map((id) => {
        const pending = pendingOf.get(id);
        return {
          subject_id: id,
          interval: isInterval(pending) ? pending : (cycleOf.get(id) ?? iv),
        };
      }),
    [selected, cycleOf, pendingOf, iv],
  );
  const itemsKey = useMemo(
    () =>
      items
        .map((i) => `${i.subject_id}:${i.interval}`)
        .sort()
        .join(","),
    [items],
  );
  const {
    quote,
    loading: quoting,
    error: quoteError,
  } = useSubjectChangeQuote(studentId, addKey, removeKey, selected.size > 0, itemsKey);

  // Migration 109: ONE renewal sentence per cycle. A single "{total} {currency}
  // / {interval}" line cannot express a plan whose subjects renew on different
  // dates for different amounts.
  const renewalSentences = (q: SubjectChangeQuote): string[] =>
    (q.renewals ?? [])
      .filter((r) => isInterval(r.interval))
      .map((r) =>
        t(renewalLineKey(r.interval as Interval))
          .replace("{total}", fmtAmount(r.total, locale))
          .replace("{currency}", q.currency),
      );
  const noChargeSentence = (q: SubjectChangeQuote) =>
    t("subjedit.noChargeNow").replace("{date}", fmtBakuDate(q.effective_from, locale));
  // ONE LINE PER REMOVED SUBJECT with ITS OWN period end. removals_effective_at
  // is a single scalar and cannot describe a plan whose subjects run to
  // different dates, so a yearly subject used to be reported as ending on the
  // weekly one's date. Falls back to the old sentence only when an older server
  // returns no per-subject list.
  const removalSentences = (q: SubjectChangeQuote): string[] => {
    const rows = q.removals_effective ?? [];
    if (rows.length === 0) {
      return [t("subjedit.noteText").replace("{date}", fmtBakuDate(q.removals_effective_at, locale))];
    }
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return [
      ...rows.map((r) => {
        const s = byId.get(r.subject_id);
        return t("subjedit.noteLine")
          .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : r.subject_id)
          .replace("{date}", fmtBakuDate(r.remove_at, locale));
      }),
      t("subjedit.noteNoRefund"),
    ];
  };

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
    const res = await bffUpdateSubjects(studentId, [...selected], items);
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
          // Its OWN cycle: the price and the chip both describe what this
          // subject actually costs, not one plan-wide interval.
          const rowIv = cycleOf.get(s.id) ?? iv;
          const pendingIv = pendingOf.get(s.id);
          return (
            <SubjectCheckRow
              key={s.id}
              name={subjectLabel(t, s.code, s.name)}
              priceText={
                addsDisabled && wouldAdd
                  ? ""
                  : `${fmtMoney(s.prices[rowIv] ?? 0, "AZN", locale)} · ${t(
                      INTERVAL_NAME_KEY[rowIv],
                    )}`
              }
              checked={isChecked}
              onToggle={() => toggle(s.id)}
              chip={
                pendingIv && isInterval(pendingIv)
                  ? // A bare cycle name next to a row priced on a DIFFERENT
                    // cycle reads as a rendering bug — say when it applies.
                    t("subjedit.pendingChip").replace(
                      "{cycle}",
                      t(INTERVAL_NAME_KEY[pendingIv]),
                    )
                  : covered.has(s.id)
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
            {/* Renewals: one sentence per cycle — no invented combined rate. */}
            <SumBlock label={t("plan.renewals")}>
              {renewalSentences(quote).map((line, i) => (
                <AppText variant="body" key={i}>
                  {line}
                </AppText>
              ))}
            </SumBlock>
            {/* Note: price-free removal terms. */}
            {toRemove.length > 0 ? (
              <SumBlock label={t("subjedit.noteLabel")}>
                {removalSentences(quote).map((line, i) => (
                  <AppText variant="muted" key={i}>
                    {line}
                  </AppText>
                ))}
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
        thenText={
          !quoting && quote && quote.due_now > 0
            ? (renewalSentences(quote)[0] ?? null)
            : null
        }
        note={t("pay.note")}
        confirmLabel={noChargeConfirm ? t("pay.confirmNoCharge") : t("pay.payNow")}
        error={error}
      />
    </View>
  );
}
