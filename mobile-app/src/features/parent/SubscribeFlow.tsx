// Shared demo-mode subscribe engine: Subjects (checkboxes, ≥1) → Plan cards
// (week/month/year with the LIVE server quote incl. sibling discount) → the
// cosmetic DemoPaySheet → bffSubscribe (allocates + returns the 8-digit ID).
// Used by the add-child wizard (after Info) and by children/[id]/subscribe
// for an existing child without a live subscription. Rendered ONLY when the
// posture allows demo payments — 'real'/'off'/free modes never mount this.
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
  INTERVAL_NOTE_KEY,
  INTERVAL_PER_KEY,
  estimateTotal,
  extractChildUniqueId,
  fmtMoney,
  parseQuote,
  type Interval,
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
  disabled = false,
}: {
  name: string;
  priceText: string;
  checked: boolean;
  onToggle: () => void;
  /** Optional trailing chip (e.g. subjedit.activeChip). */
  chip?: string;
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
              backgroundColor: tokens.pillBg,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 1,
            }}
          >
            <AppText variant="label" color={tokens.pillText} style={{ fontSize: 11 }}>
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

/** Debounced (~400ms) server quote for a subject set + interval. The result is
 *  keyed by its input, so quote/loading are DERIVED — a stale response for an
 *  older selection simply never matches the current key. */
export function useServerQuote(
  studentId: string | null,
  interval: Interval,
  selectedIds: ReadonlySet<string>,
  enabled: boolean,
) {
  const selKey = useMemo(() => [...selectedIds].sort().join(","), [selectedIds]);
  const key = `${studentId ?? ""}|${interval}|${selKey}`;
  const [result, setResult] = useState<{ key: string; quote: Quote | null }>({
    key: "",
    quote: null,
  });

  const active = enabled && !!studentId && selKey.length > 0;
  useEffect(() => {
    if (!active || !studentId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await bffQuote(studentId, interval, selKey.split(","));
      if (!cancelled) setResult({ key, quote: res.ok ? parseQuote(res.data) : null });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, studentId, interval, selKey, key]);

  const fresh = active && result.key === key;
  return { quote: fresh ? result.quote : null, loading: active && !fresh };
}

// ---- plan cards -------------------------------------------------------------------

function PlanCards({
  interval,
  onSelect,
  priceFor,
  disabled,
}: {
  interval: Interval;
  onSelect: (iv: Interval) => void;
  priceFor: (iv: Interval) => string;
  disabled: boolean;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={{ gap: spacing.md }}>
      {INTERVALS.map((iv) => {
        const selected = iv === interval;
        const popular = iv === "month";
        return (
          <Pressable
            key={iv}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={t(INTERVAL_NAME_KEY[iv])}
            onPress={disabled ? undefined : () => onSelect(iv)}
            style={[
              {
                backgroundColor: tokens.surface,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: selected ? tokens.accent : tokens.border,
                padding: spacing.lg,
                gap: spacing.xs,
              },
              selected ? shadow("card", tokens.shadow) : null,
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <AppText variant="label" style={{ flex: 1 }}>
                {t(INTERVAL_NAME_KEY[iv])}
              </AppText>
              {popular ? (
                <View
                  style={{
                    backgroundColor: tokens.accent2,
                    borderRadius: 999,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 2,
                  }}
                >
                  <AppText variant="label" color="#ffffff" style={{ fontSize: 11 }}>
                    {t("billing.popular")}
                  </AppText>
                </View>
              ) : null}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: selected ? tokens.accent : tokens.border,
                  backgroundColor: selected ? tokens.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected ? (
                  <AppText variant="label" color="#ffffff" style={{ fontSize: 12 }}>
                    ✓
                  </AppText>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
              <AppText variant="heading" color={selected ? tokens.accent : tokens.text}>
                {priceFor(iv)}
              </AppText>
              <AppText variant="muted">{t(INTERVAL_PER_KEY[iv])}</AppText>
            </View>
            <AppText variant="muted">{t(INTERVAL_NOTE_KEY[iv])}</AppText>
          </Pressable>
        );
      })}
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
  const { t } = useT();

  const [step, setStepState] = useState<SubscribeStep>("subjects");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [interval, setInterval_] = useState<Interval>("month");
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const setStep = (s: SubscribeStep) => {
    setStepState(s);
    onStepChange?.(s);
  };

  const { quote, loading: quoting } = useServerQuote(studentId, interval, sel, step === "plan");
  const estimate = estimateTotal(subjects, sel, interval);
  const currency = quote?.currency ?? "AZN";

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
    const res = await bffSubscribe(studentId, interval, [...sel]);
    setPayPending(false);
    if (!res.ok) {
      setPayError(t(res.error));
      return;
    }
    setPayOpen(false);
    onDone(extractChildUniqueId(res.data));
  }

  const priceFor = (iv: Interval) =>
    iv === interval && quote
      ? fmtMoney(quote.total, quote.currency)
      : fmtMoney(estimateTotal(subjects, sel, iv), "AZN");

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
                  priceText={fmtMoney(s.prices[interval] ?? 0, "AZN")}
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
          <AppText variant="label">{t("sub.interval")}</AppText>
          <PlanCards
            interval={interval}
            onSelect={setInterval_}
            priceFor={priceFor}
            disabled={payPending}
          />

          <Card>
            <KeyRow
              label={t("pay.subtotal")}
              value={fmtMoney(quote ? quote.base : estimate, currency)}
            />
            <KeyRow
              label={t("pay.discount")}
              value={
                quote && quote.discountPercent > 0
                  ? `−${quote.discountPercent}% (−${fmtMoney(quote.discount, currency)})`
                  : "0%"
              }
            />
            {quote && quote.trialDays > 0 ? (
              <KeyRow label={t("sub.trial")} value={`${quote.trialDays} ${t("sub.days")}`} />
            ) : null}
            <View
              style={{ height: 1, backgroundColor: tokens.border, marginVertical: spacing.sm }}
            />
            <KeyRow
              label={t("pay.total")}
              value={`${fmtMoney(quote ? quote.total : estimate, currency)} ${t(
                INTERVAL_PER_KEY[interval],
              )}`}
              strong
            />
            <AppText variant="muted" style={{ marginTop: spacing.sm }}>
              {quoting ? t("sub.calculating") : t("sub.siblingNote")}
            </AppText>
          </Card>

          <Button
            title={t("pay.payNow")}
            disabled={sel.size === 0}
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
          {
            label: t("pay.subtotal"),
            value: fmtMoney(quote ? quote.base : estimate, currency),
          },
          {
            label: t("pay.discount"),
            value:
              quote && quote.discountPercent > 0
                ? `−${quote.discountPercent}% (−${fmtMoney(quote.discount, currency)})`
                : "0%",
          },
        ]}
        totalLabel={t("pay.total")}
        totalValue={`${fmtMoney(quote ? quote.total : estimate, currency)} ${t(
          INTERVAL_PER_KEY[interval],
        )}`}
        note={t("pay.note")}
        confirmLabel={t("pay.payNow")}
        error={payError}
      />
    </View>
  );
}
