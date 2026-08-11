// Shared demo-mode subscribe engine: Subjects (checkboxes, ≥1) → one PLAN CARD
// PER SUBJECT (each with its OWN week/month/year cycle, priced by the LIVE
// server quote incl. sibling discount) → the cosmetic DemoPaySheet →
// bffSubscribe (allocates + returns the 8-digit ID). Used by the add-child
// wizard (after Info) and by children/[id]/subscribe for an existing child
// without a live subscription. Rendered ONLY when the posture allows demo
// payments — 'real'/'off'/free modes never mount this.
//
// Migration 109: the single global cycle picker is GONE. It was the last place
// in the product that could only produce an all-weekly / all-monthly /
// all-yearly plan, so a plan started on the phone could never be the mixed one
// the same family can build on the web. The flow now posts `items`
// ([{subject_id, interval}]); the legacy {interval, subject_ids} body stays
// alive in lib/api.planBody for already-shipped binaries.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";
import { bffQuote, bffSubscribe } from "@/lib/api";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  INTERVALS,
  INTERVAL_NAME_KEY,
  INTERVAL_PER_KEY,
  estimatePlanTotal,
  extractChildUniqueId,
  fmtMoney,
  groupLabelKey,
  normalizePlan,
  parseQuote,
  setPlanInterval,
  type Interval,
  type PlanItem,
  type Quote,
  type SubjectOption,
} from "./commerce";
import { DemoPaySheet } from "./DemoPaySheet";
import { KeyRow } from "./ui";

// ---- shared checkbox row (also used by ManageSubjectsEditor) --------------------

export function SubjectCheckRow({
  name,
  priceText,
  checked,
  onToggle,
  chip,
  chipTone = "active",
  disabled = false,
}: {
  name: string;
  priceText: string;
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
      <AppText variant="muted">{priceText}</AppText>
    </Pressable>
  );
}

// ---- debounced authoritative quote ------------------------------------------------

/** Debounced (~400ms) server quote for a PER-SUBJECT basket. The result is
 *  keyed by its input, so quote/loading are DERIVED — a stale response for an
 *  older basket simply never matches the current key. */
export function useServerQuote(
  studentId: string | null,
  plan: readonly PlanItem[],
  enabled: boolean,
) {
  const planKey = useMemo(
    () =>
      plan
        .map((p) => `${p.subjectId}:${p.interval}`)
        .sort()
        .join(","),
    [plan],
  );
  const key = `${studentId ?? ""}|${planKey}`;
  const [result, setResult] = useState<{ key: string; quote: Quote | null }>({
    key: "",
    quote: null,
  });

  const active = enabled && !!studentId && planKey.length > 0;
  useEffect(() => {
    if (!active || !studentId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const items = planKey.split(",").map((raw) => {
        const [subject_id, interval] = raw.split(":");
        return { subject_id, interval };
      });
      // The positional (interval, subjectIds) pair is the legacy fallback and is
      // ignored whenever `items` is non-empty — see lib/api.planBody.
      const res = await bffQuote(
        studentId,
        items[0]?.interval ?? "month",
        items.map((i) => i.subject_id),
        items,
      );
      if (!cancelled) setResult({ key, quote: res.ok ? parseQuote(res.data) : null });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, studentId, planKey, key]);

  const fresh = active && result.key === key;
  return { quote: fresh ? result.quote : null, loading: active && !fresh };
}

// ---- per-subject plan card --------------------------------------------------------

/** One selected subject with ITS OWN cycle — the web SubjectPlanCard twin.
 *  Changing a cycle here touches only this subject (setPlanInterval returns
 *  every other entry by reference), which is the investor's isolation rule. */
function SubjectPlanCard({
  subject,
  interval,
  onSelect,
  disabled,
  locale,
}: {
  subject: SubjectOption;
  interval: Interval;
  onSelect: (iv: Interval) => void;
  disabled: boolean;
  locale: Parameters<typeof fmtMoney>[2];
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const price = subject.prices[interval];
  const sold = typeof price === "number";
  return (
    <View
      style={[
        {
          backgroundColor: tokens.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tokens.border,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        shadow("card", tokens.shadow),
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
        <AppText variant="label" style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          {subjectLabel(t, subject.code, subject.name)}
        </AppText>
        <AppText variant="heading" color={sold ? tokens.accent : tokens.muted}>
          {sold ? fmtMoney(price, "AZN", locale) : t("cfg.unpriced")}
        </AppText>
        {sold ? <AppText variant="muted">{t(INTERVAL_PER_KEY[interval])}</AppText> : null}
      </View>
      <AppText variant="eyebrow" style={{ textTransform: "uppercase" }}>
        {t("plan.cycle")}
      </AppText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("plan.cycleAria").replace(
          "{subject}",
          subjectLabel(t, subject.code, subject.name),
        )}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {INTERVALS.map((iv) => {
          const selected = iv === interval;
          // A cycle the subject is not sold on is shown but unselectable: the
          // server quote rejects such a basket outright, so offering it would
          // only produce a failed quote the parent cannot explain.
          const unavailable = typeof subject.prices[iv] !== "number";
          return (
            <Pressable
              key={iv}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: disabled || unavailable }}
              accessibilityLabel={t(INTERVAL_NAME_KEY[iv])}
              onPress={disabled || unavailable ? undefined : () => onSelect(iv)}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: spacing.sm,
                borderRadius: radius.sm,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? tokens.accent : tokens.border,
                backgroundColor: selected ? tokens.pillBg : "transparent",
                opacity: unavailable ? 0.4 : 1,
              }}
            >
              <AppText
                variant="label"
                color={selected ? tokens.accent : tokens.muted}
                style={{ fontSize: 12 }}
              >
                {t(INTERVAL_NAME_KEY[iv])}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---- the flow ---------------------------------------------------------------------

export type SubscribeStep = "subjects" | "plan";

export function SubscribeFlow({
  studentId,
  subjects,
  onStepChange,
  onBackFromSubjects,
  onDone,
}: {
  studentId: string;
  subjects: SubjectOption[];
  /** Lets the wizard mirror the internal step in its progress header. */
  onStepChange?: (step: SubscribeStep) => void;
  /** Optional Back handler on the first (subjects) step. */
  onBackFromSubjects?: () => void;
  /** Success: the subscription exists; ID present when newly allocated. */
  onDone: (childUniqueId: string | null) => void;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useT();

  const [step, setStepState] = useState<SubscribeStep>("subjects");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  // The cycle CHOSEN for each subject. Absent = the platform default; every
  // entry is re-resolved against what the subject is actually sold on by
  // normalizePlan below, so a stale choice can never post an unpriced pair.
  const [cycles, setCycles] = useState<Record<string, Interval>>({});
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const setStep = (s: SubscribeStep) => {
    setStepState(s);
    onStepChange?.(s);
  };

  const byId = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const plan = useMemo<PlanItem[]>(
    () =>
      normalizePlan(
        [...sel].map((id) => ({ subjectId: id, interval: cycles[id] ?? "month" })),
        subjects,
      ),
    [sel, cycles, subjects],
  );

  const { quote, loading: quoting } = useServerQuote(studentId, plan, step === "plan");
  const estimate = estimatePlanTotal(subjects, plan);
  const currency = quote?.currency ?? "AZN";
  // The cycles actually in use, in display order — one breakdown block each.
  const usedIntervals = useMemo(
    () => INTERVALS.filter((iv) => plan.some((p) => p.interval === iv)),
    [plan],
  );

  const toggle = (id: string) => {
    setSubjectsError(null);
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function confirmPay() {
    if (payPending) return; // double-submit guard
    setPayPending(true);
    setPayError(null);
    const items = plan.map((p) => ({ subject_id: p.subjectId, interval: p.interval }));
    // The positional pair is the legacy body an older binary posts; `items` is
    // what this build sends and what makes a MIXED plan expressible at all.
    const res = await bffSubscribe(
      studentId,
      items[0]?.interval ?? "month",
      items.map((i) => i.subject_id),
      items,
    );
    setPayPending(false);
    if (!res.ok) {
      setPayError(t(res.error));
      return;
    }
    setPayOpen(false);
    onDone(extractChildUniqueId(res.data));
  }

  /** "from {price} / {cycle}" — the cheapest cycle this subject is sold on.
   *  Falls back to the not-sold label rather than rendering Infinity. */
  const fromPriceText = (s: SubjectOption): string => {
    let best: { price: number; iv: Interval } | null = null;
    for (const iv of INTERVALS) {
      const p = s.prices[iv];
      if (typeof p !== "number") continue;
      if (!best || p < best.price) best = { price: p, iv };
    }
    if (!best) return t("cfg.unpriced");
    return t("plan.fromPrice")
      .replace("{price}", fmtMoney(best.price, "AZN", locale))
      .replace("{cycle}", t(INTERVAL_NAME_KEY[best.iv]));
  };

  /** Per-cycle subtotal: the SERVER's discounted group total wins; the local
   *  sum is a list-price placeholder until the quote lands. */
  const groupTotal = (iv: Interval): number =>
    quote?.groups?.[iv]?.total ??
    estimatePlanTotal(
      subjects,
      plan.filter((p) => p.interval === iv),
    );

  return (
    <View style={{ gap: spacing.lg }}>
      {step === "subjects" ? (
        <>
          <AppText variant="label">{t("sub.subjects")}</AppText>
          {subjects.length === 0 ? (
            <AppText variant="muted">{t("sub.noSubjectsAvailable")}</AppText>
          ) : (
            <Card style={{ paddingVertical: spacing.xs }}>
              {subjects.map((s) => (
                <SubjectCheckRow
                  key={s.id}
                  name={subjectLabel(t, s.code, s.name)}
                  // No global cycle exists any more, so the list shows the
                  // cheapest cycle the subject is sold on ("from …").
                  priceText={fromPriceText(s)}
                  checked={sel.has(s.id)}
                  onToggle={() => toggle(s.id)}
                />
              ))}
            </Card>
          )}
          <AppText variant="muted">{t("pricing.perSubjectNote")}</AppText>
          {subjectsError ? (
            <AppText variant="muted" color={tokens.danger}>
              {subjectsError}
            </AppText>
          ) : null}
          <Button
            title={t("addchild.next")}
            disabled={subjects.length === 0}
            onPress={() => {
              if (sel.size === 0) {
                setSubjectsError(t("sub.err.noSubjects"));
                return;
              }
              setStep("plan");
            }}
          />
          {onBackFromSubjects ? (
            <Button title={t("addchild.back")} variant="ghost" onPress={onBackFromSubjects} />
          ) : null}
        </>
      ) : (
        <>
          <AppText variant="label">{t("plan.perSubjectHint")}</AppText>
          {plan.map((item) => {
            const s = byId.get(item.subjectId);
            if (!s) return null;
            return (
              <SubjectPlanCard
                key={item.subjectId}
                subject={s}
                interval={item.interval}
                disabled={payPending}
                locale={locale}
                onSelect={(iv) => {
                  // setPlanInterval keeps every other entry by reference, so
                  // one subject's cycle can never disturb another's.
                  const next = setPlanInterval(plan, item.subjectId, iv);
                  setCycles(
                    Object.fromEntries(next.map((p) => [p.subjectId, p.interval])),
                  );
                }}
              />
            );
          })}

          <Card>
            {/* One block per cycle in use — no single periodic total is honest
                once the basket spans more than one. */}
            {usedIntervals.map((iv) => (
              <KeyRow
                key={iv}
                label={t(groupLabelKey(iv))}
                value={`${fmtMoney(groupTotal(iv), currency, locale)} ${t(
                  INTERVAL_PER_KEY[iv],
                )}`}
              />
            ))}
            <KeyRow
              label={t("pay.discount")}
              value={
                quote && quote.discountPercent > 0
                  ? `−${quote.discountPercent}% (−${fmtMoney(quote.discount, currency, locale)})`
                  : "0%"
              }
            />
            {quote && quote.trialDays > 0 ? (
              <KeyRow label={t("sub.trial")} value={`${quote.trialDays} ${t("sub.days")}`} />
            ) : null}
            <View
              style={{ height: 1, backgroundColor: tokens.border, marginVertical: spacing.sm }}
            />
            {/* Deliberately NO period suffix: this is what checkout charges now. */}
            <KeyRow
              label={t("plan.dueToday")}
              value={fmtMoney(quote ? quote.total : estimate, currency, locale)}
              strong
            />
            <AppText variant="muted" style={{ marginTop: spacing.sm }}>
              {quoting
                ? t("sub.calculating")
                : usedIntervals.length > 1
                  ? t("plan.dueTodayNote")
                  : t("sub.siblingNote")}
            </AppText>
          </Card>

          <Button
            title={t("pay.payNow")}
            disabled={plan.length === 0}
            onPress={() => {
              setPayError(null);
              setPayOpen(true);
            }}
          />
          <Button
            title={t("addchild.back")}
            variant="ghost"
            disabled={payPending}
            onPress={() => setStep("subjects")}
          />
        </>
      )}

      <DemoPaySheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        onConfirm={() => void confirmPay()}
        pending={payPending}
        rows={[
          ...usedIntervals.map((iv) => ({
            label: t(groupLabelKey(iv)),
            value: `${fmtMoney(groupTotal(iv), currency, locale)} ${t(INTERVAL_PER_KEY[iv])}`,
          })),
          {
            label: t("pay.discount"),
            value:
              quote && quote.discountPercent > 0
                ? `−${quote.discountPercent}% (−${fmtMoney(quote.discount, currency, locale)})`
                : "0%",
          },
        ]}
        totalLabel={t("plan.dueToday")}
        totalValue={fmtMoney(quote ? quote.total : estimate, currency, locale)}
        note={t("pay.note")}
        confirmLabel={t("pay.payNow")}
        error={payError}
      />
    </View>
  );
}
