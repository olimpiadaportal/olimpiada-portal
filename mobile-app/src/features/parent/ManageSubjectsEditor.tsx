// Manage-subjects CHECKBOX editor for a child's LIVE subscription (web
// ManageSubjects parity). Toggling is pure client state; nothing applies until
// Save. Payment-first contract: a diff containing ANY addition opens the demo
// payment sheet first (demo mode); removal-only diffs and free modes submit
// directly. The BFF/server re-diffs the desired FULL set authoritatively —
// the client never sends prices. Callers mount this only in demo/free modes.
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { bffUpdateSubjects } from "@/lib/api";
import { useT } from "@/i18n/useT";
import {
  INTERVAL_PER_KEY,
  estimateTotal,
  fmtMoney,
  isInterval,
  type CommercePosture,
  type SubjectOption,
} from "./commerce";
import { DemoPaySheet } from "./DemoPaySheet";
import { SubjectCheckRow, useServerQuote } from "./SubscribeFlow";
import { KeyRow } from "./ui";

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
  const { t } = useT();
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

  const { quote, loading: quoting } = useServerQuote(
    studentId,
    iv,
    selected,
    hasDiff && selected.size > 0,
  );
  const estimate = estimateTotal(subjects, selected, iv);
  const estText = `${fmtMoney(quote ? quote.total : estimate, quote?.currency ?? "AZN")} ${t(
    INTERVAL_PER_KEY[iv],
  )}`;

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
      {posture.demoPay ? <AppText variant="muted">{t("subjedit.demoModeNote")}</AppText> : null}

      <Card style={{ paddingVertical: spacing.xs }}>
        {subjects.map((s) => (
          <SubjectCheckRow
            key={s.id}
            name={s.name}
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
            value={toAdd.map((s) => s.name).join(", ")}
          />
        ) : null}
        {toRemove.length > 0 ? (
          <KeyRow
            label={t("subjedit.pendingRemove")}
            value={toRemove.map((s) => s.name).join(", ")}
          />
        ) : null}
        {hasDiff && selected.size > 0 ? (
          <KeyRow label={t("subjedit.estTotal")} value={quoting ? t("sub.calculating") : estText} />
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
            ? [{ label: t("subjedit.pendingAdd"), value: toAdd.map((s) => s.name).join(", ") }]
            : []),
          ...(toRemove.length > 0
            ? [
                {
                  label: t("subjedit.pendingRemove"),
                  value: toRemove.map((s) => s.name).join(", "),
                },
              ]
            : []),
        ]}
        totalLabel={t("subjedit.estTotal")}
        totalValue={quoting ? t("sub.calculating") : estText}
        note={t("pay.note")}
        confirmLabel={t("pay.payNow")}
        error={error}
      />
    </View>
  );
}
