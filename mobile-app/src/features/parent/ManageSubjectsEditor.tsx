// Manage-subjects CHECKBOX editor for a child's LIVE subscription (web
// ManageSubjects parity). Toggling is pure client state; nothing applies until
// Save. The BFF/server re-diffs the desired FULL set authoritatively — the
// client never sends prices.
//
// PURCHASE-SILENT (docs/STORE_PAYMENTS_COMPLIANCE.md, owner 2026-08-18 — the
// demo payment mode is deleted). This editor renders ONLY where nothing is
// bought: the giveaway/free-access window, and payments-off removal-only mode.
// It therefore shows NO amount anywhere. Because it can no longer print a
// price, it must never commit a change that COSTS something either: an add is
// blocked (mob.subjedit.notInApp) until the server quote answers, and released
// only when it prices the change at zero — which is what the free window this
// editor renders in returns. Removals stay legal in every mode: a parent must
// always be able to stop paying.
//
// Migration 120 — UN-CANCEL. Re-ticking a subject whose removal is scheduled
// but whose paid period has NOT lapsed is a REINSTATEMENT, not a purchase: the
// server clears remove_at and changes nothing else, so nothing is charged and
// the prepaid period survives. It used to be billed as a brand-new add, which
// contradicted the removal rule (access to period end, no refund) by charging
// for the same coverage twice. This screen never loaded the period dates, so
// the SERVER's `reinstatements` list is the only classification it trusts —
// before the quote arrives, an add-shaped row is still treated as an addition
// and is therefore still blocked.
//
// Round 41 (web parity — structured change summary): the summary is a
// SaaS-style card in a fixed order: Selected subjects (count) · Added ·
// Removed · Note. Every line it prints is PRICE-FREE and carries only a
// {date} or a subject name; the web keeps the amounts.
//
// Migration 109 — PER-SUBJECT CYCLES. Every covered subject carries its own
// billing cycle, so this editor shows each subject's cycle and PRESERVES it
// when the subject set changes (it posts the desired full set as `items`).
// Choosing a different cycle for an existing subject is NOT a mobile action:
// the mobile parent surface is read-only for commerce, and a scheduled cycle
// change is a billing change.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { bffQuoteSubjectChange, bffUpdateSubjects, type SubjectChangeQuote } from "@/lib/api";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  INTERVAL_NAME_KEY,
  fmtBakuDate,
  isInterval,
  type Interval,
  type SubjectOption,
} from "./commerce";
import { KeyRow } from "./ui";

// ---- subject checkbox row ---------------------------------------------------------
// Lived in SubscribeFlow until the demo purchase wizard was deleted; this is
// now its only consumer. The trailing text is the subject's own BILLING CYCLE
// — never an amount (the row used to print "9,00 AZN · Aylıq").

function SubjectCheckRow({
  name,
  metaText,
  checked,
  onToggle,
  chip,
  chipTone = "active",
  disabled = false,
}: {
  name: string;
  /** Trailing muted meta — this subject's cycle name, or "" to show nothing. */
  metaText: string;
  checked: boolean;
  onToggle: () => void;
  /** Optional trailing chip (e.g. subjedit.activeChip). */
  chip?: string;
  /** "active" = accent pill (covered now); "ending" = muted pill (scheduled
   *  removal), matching web's .subjedit-chip-active / -chip-ending pair. */
  chipTone?: "active" | "ending";
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={name}
      onPress={disabled ? undefined : onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: tokens.border,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm - 4,
          borderWidth: 2,
          borderColor: checked ? tokens.accent : tokens.border,
          backgroundColor: checked ? tokens.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <AppText variant="label" color="#ffffff" style={{ fontSize: 14 }}>
            ✓
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText style={{ flexShrink: 1 }}>{name}</AppText>
        {chip ? (
          <View
            style={{
              backgroundColor: chipTone === "ending" ? "transparent" : tokens.pillBg,
              borderWidth: chipTone === "ending" ? 1 : 0,
              borderColor: tokens.border,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 1,
            }}
          >
            <AppText
              variant="label"
              color={chipTone === "ending" ? tokens.muted : tokens.pillText}
              style={{ fontSize: 11 }}
            >
              {chip}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="muted">{metaText}</AppText>
    </Pressable>
  );
}

/** Debounced (~400ms) plan-change quote (BFF /subjects/quote), keyed by the
 *  add/remove diff. The result is keyed by its input, so a stale response for
 *  an older diff simply never matches the current key. It is read for its
 *  CLASSIFICATION (free / not free, reinstatement or addition, dates) — the
 *  amounts it carries are never rendered. */
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

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The RAW add side — every ticked subject outside the live coverage. It stays
  // raw on purpose: addKey below is the quote's cache key, and splitting it by
  // something the quote itself returns would change the key the moment the
  // answer arrived and re-request forever.
  const addRows = subjects.filter((s) => selected.has(s.id) && !covered.has(s.id));
  const toRemove = subjects.filter((s) => !selected.has(s.id) && covered.has(s.id));
  const hasDiff = addRows.length > 0 || toRemove.length > 0;

  const addKey = useMemo(() => addRows.map((s) => s.id).sort().join(","), [addRows]);
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

  // Migration 120 — an UN-CANCEL is not a purchase. Re-ticking a subject whose
  // removal is scheduled but whose paid period has NOT lapsed clears remove_at
  // and changes nothing else: same cycle, same price, same period, zero
  // charged. Only the SERVER may say which side of that line a subject is on
  // (this screen never loaded the period dates), so until the quote lands every
  // add-shaped row is still treated as an addition.
  const reinstatedIds = useMemo(
    () => new Set((quote?.reinstatements ?? []).map((r) => r.subject_id)),
    [quote],
  );
  const toReinstate = addRows.filter((s) => reinstatedIds.has(s.id));
  const toAdd = addRows.filter((s) => !reinstatedIds.has(s.id));

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

  // A change this screen may NOT complete: an addition the SERVER prices above
  // zero. With no amount on screen, saving it would commit the parent to a
  // charge they were never shown. Fail-safe in both directions: an add-shaped
  // diff is blocked until the quote lands, and released only once the quote
  // says zero — which is what the giveaway/free window it renders in returns.
  const chargeable = addRows.length > 0 && (!quote || quote.due_now > 0);

  /** One dated line per un-cancelled subject: it keeps the period it paid for. */
  const reinstateSentences = (q: SubjectChangeQuote): string[] => {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return (q.reinstatements ?? []).map((r) => {
      const s = byId.get(r.subject_id);
      return t("subjedit.reinstateLine")
        .replace("{subject}", s ? subjectLabel(t, s.code, s.name) : r.subject_id)
        .replace("{date}", fmtBakuDate(r.renews_at, locale));
    });
  };

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
    setSaved(true);
    setToggled(new Set()); // fresh baseline: the refetched coverage IS the selection
    onSaved();
  }

  function onSave() {
    if (!hasDiff || pending || chargeable) return;
    if (selected.size === 0) {
      setError(t("subjedit.minOne"));
      return;
    }
    void apply();
  }

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("subjedit.title")}</AppText>

      <Card style={{ paddingVertical: spacing.xs }}>
        {subjects.map((s) => {
          const isChecked = selected.has(s.id);
          // Checking this row would ADD a subject (it is outside the live
          // coverage) — in removal-only mode that side is disabled.
          const wouldAdd = !isChecked && !covered.has(s.id);
          // Its OWN cycle: the meta text and the chip both describe how this
          // subject actually renews, not one plan-wide interval.
          const rowIv = cycleOf.get(s.id) ?? iv;
          const pendingIv = pendingOf.get(s.id);
          return (
            <SubjectCheckRow
              key={s.id}
              name={subjectLabel(t, s.code, s.name)}
              metaText={addsDisabled && wouldAdd ? "" : t(INTERVAL_NAME_KEY[rowIv])}
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
          Selected · Added · Un-cancelled · Removed · Note. Price-free. */}
      <Card>
        <KeyRow label={t("subjedit.selectedCount")} value={String(selected.size)} />

        {toAdd.length > 0 ? (
          <SumBlock label={t("subjedit.pendingAdd")}>
            {toAdd.map((s) => (
              <SumSubjectLine key={s.id} name={subjectLabel(t, s.code, s.name)} color={tokens.ok} />
            ))}
            {/* An addition that costs nothing (giveaway / free window) says so.
                One the server DOES price prints no amount — the blocked-change
                notice next to the Save button covers that case. */}
            {quote && quote.due_now === 0 ? (
              <AppText variant="muted">{noChargeSentence(quote)}</AppText>
            ) : null}
          </SumBlock>
        ) : null}
        {/* Un-cancels get their own block: folding them into "Added" next to a
            pay-now amount is the mislabel that preceded the double charge. */}
        {toReinstate.length > 0 ? (
          <SumBlock label={t("subjedit.pendingReinstate")}>
            {toReinstate.map((s) => (
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
            {/* Un-cancel terms: dated, price-free, and explicit that the
                already-paid period is kept rather than bought again. */}
            {toReinstate.length > 0 ? (
              <SumBlock label={t("subjedit.pendingReinstate")}>
                {reinstateSentences(quote).map((line, i) => (
                  <AppText variant="muted" key={i}>
                    {line}
                  </AppText>
                ))}
                <AppText variant="muted">{t("subjedit.reinstateNote")}</AppText>
              </SumBlock>
            ) : null}
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

      {/* Why Save is off: the server priced this change above zero, and a
          change with a price is not made in this app. Shown only once the
          quote has actually said so — never while it is still loading. */}
      {chargeable && quote ? (
        <AppText variant="muted">{t("mob.subjedit.notInApp")}</AppText>
      ) : null}

      <Button
        title={t("subjedit.save")}
        pending={pending}
        pendingTitle={t("subjedit.saving")}
        disabled={!hasDiff || chargeable}
        onPress={onSave}
      />
    </View>
  );
}

