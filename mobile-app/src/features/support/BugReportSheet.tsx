// "Report a bug" — the mobile dialog (migration 116).
//
// A PLATFORM BOUNDARY, not a second implementation: React Native cannot render
// the DOM modal web uses, so this is the RN twin of web's ReportBugButton
// exactly as ReportQuestionSheet is the twin of ReportQuestionButton. It shares
// the same bug.* i18n keys and posts to the SAME BFF → same core → same RPC →
// same derive trigger, so nothing about what gets stored differs by platform.
//
// Built on SheetShell (the app's bottom-sheet primitive, AccountSheet pattern)
// rather than the arena Modal: the contact screen is a PUBLIC/parent surface
// and uses the app tokens, not the student arena palette.
//
// Three behaviours match the web dialog deliberately:
//   * an `inFlight` ref latch — not the `pending` state — is what stops a
//     double file, because a second tap lands before React re-renders and the
//     button's disabled state applies;
//   * while a submit is in flight the sheet is strictly modal (backdrop and
//     Android hardware back are both inert), so a request is never abandoned
//     with the reporter unsure whether it was filed;
//   * success is an IN-PLACE transition of this same sheet. The toast the
//     caller raises afterwards is a second confirmation, not the only one.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { SheetShell } from "@/features/parent/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import type { BugReportFields } from "./api";

// The SAME caps as web-app/src/lib/support/bugReport.ts, which is in turn the
// same number as the RPC guard and the chk_bug_reports_* column constraints.
// They are duplicated here rather than imported because the mobile app does not
// build against web-app source — if one of these moves, all four move.
const TITLE_MIN = 3;
const TITLE_MAX = 160;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;
const STEPS_MAX = 2000;
const EXPECTED_MAX = 1000;
const ACTUAL_MAX = 1000;

const SEVERITIES = ["low", "normal", "high", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

/** Stable no-op so a pending sheet's close handler never changes identity. */
function noop() {}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  editable,
  multiline,
  minHeight,
  counter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
  editable: boolean;
  multiline?: boolean;
  minHeight?: number;
  counter?: string;
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={tokens.muted}
        editable={editable}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={{
          backgroundColor: tokens.bg,
          color: tokens.text,
          borderWidth: 1.5,
          borderColor: tokens.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          fontSize: 15,
          lineHeight: 21,
          minHeight: minHeight ?? 48,
        }}
      />
      {counter ? (
        <AppText variant="mono" color={tokens.muted} style={{ fontSize: 12, textAlign: "right" }}>
          {counter}
        </AppText>
      ) : null}
    </View>
  );
}

export function BugReportSheet({
  visible,
  t,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  t: (key: string) => string;
  onClose: () => void;
  /** Resolves to an i18n KEY on failure — raw server text never arrives here. */
  onSubmit: (fields: BugReportFields) => Promise<{ ok: true } | { ok: false; errorKey: string }>;
}) {
  const { tokens } = useTheme();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  function dismiss() {
    if (inFlight.current) return;
    setTitle("");
    setDescription("");
    setSteps("");
    setExpected("");
    setActual("");
    setSeverity("normal");
    setError(null);
    setSent(false);
    onClose();
  }

  async function submit() {
    if (inFlight.current) return;
    // Mirrors normalizeBugReport()'s minimums so the reporter is told what is
    // missing here instead of after a round trip. The SERVER is still the gate:
    // it re-checks every one of these, and so does the database.
    if (title.trim().length < TITLE_MIN || description.trim().length < DESCRIPTION_MIN) {
      setError(t("bug.emptyErr"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit({ title, description, steps, expected, actual, severity });
      if (res.ok) setSent(true);
      else setError(t(res.errorKey));
    } catch {
      setError(t("bug.err.generic"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const remaining = (max: number, v: string) =>
    t("bug.remaining").replace("{n}", String(max - v.length));

  return (
    <SheetShell
      visible={visible}
      onClose={pending ? noop : dismiss}
      closeLabel={t("bug.cancel")}
    >
      {/* A Modal is its own NATIVE window, so KeyboardAvoidingView is the right
          tool here (the app-wide measured contract belongs to scroll bodies) —
          `padding` on both platforms, exactly like PhoneField's country sheet.
          The padding grows the sheet upward (SheetShell's backdrop is flex:1
          above it), which is what lifts the focused field clear of the keyboard.
          It is NOT its own REACT tree, though: context reaches straight through
          a Modal, so without the boundary these inputs would report focus to
          the contact screen's scroll container behind the sheet and scroll the
          page underneath instead of the field. */}
      <KeyboardFocusBoundary>
        <KeyboardAvoidingView behavior="padding">
          {sent ? (
            <View style={{ gap: spacing.md }}>
              <AppText variant="title">{t("bug.successTitle")}</AppText>
              <AppText variant="muted">{t("bug.successBody")}</AppText>
              <Button title={t("bug.close")} onPress={dismiss} />
            </View>
          ) : (
            /* EVERYTHING scrolls, buttons included — DemoPaySheet's reasoning
               applies with more force here: this is a seven-field form and the
               sheet caps at 88% of the window, so on a 320x568 device a fixed
               footer would push the submit button out of reach instead of
               letting the body scroll to it. */
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
            >
              <AppText variant="title">{t("bug.title")}</AppText>
              <AppText variant="muted">{t("bug.intro")}</AppText>

                <Field
                  label={t("bug.f.title.label")}
                  value={title}
                  onChange={(v) => {
                    setTitle(v);
                    if (error) setError(null);
                  }}
                  placeholder={t("bug.f.title.ph")}
                  maxLength={TITLE_MAX}
                  editable={!pending}
                />

                <Field
                  label={t("bug.f.description.label")}
                  value={description}
                  onChange={(v) => {
                    setDescription(v);
                    if (error) setError(null);
                  }}
                  placeholder={t("bug.f.description.ph")}
                  maxLength={DESCRIPTION_MAX}
                  editable={!pending}
                  multiline
                  minHeight={110}
                  counter={remaining(DESCRIPTION_MAX, description)}
                />

                <Field
                  label={t("bug.f.steps.label")}
                  value={steps}
                  onChange={setSteps}
                  placeholder={t("bug.f.steps.ph")}
                  maxLength={STEPS_MAX}
                  editable={!pending}
                  multiline
                  minHeight={88}
                />

                <Field
                  label={t("bug.f.expected.label")}
                  value={expected}
                  onChange={setExpected}
                  placeholder={t("bug.f.expected.ph")}
                  maxLength={EXPECTED_MAX}
                  editable={!pending}
                  multiline
                  minHeight={72}
                />

                <Field
                  label={t("bug.f.actual.label")}
                  value={actual}
                  onChange={setActual}
                  placeholder={t("bug.f.actual.ph")}
                  maxLength={ACTUAL_MAX}
                  editable={!pending}
                  multiline
                  minHeight={72}
                />

                {/* Severity as chips rather than a picker: four short options
                    fit on a 320pt row when they wrap, and a native picker is a
                    second modal on top of this one. This is the reporter's
                    CLAIM — the administrator's own priority is separate and
                    always starts at normal. */}
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="label">{t("bug.f.severity.label")}</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {SEVERITIES.map((s) => {
                      const on = severity === s;
                      return (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on, disabled: pending }}
                          accessibilityLabel={t(`bug.sev.${s}`)}
                          disabled={pending}
                          onPress={() => setSeverity(s)}
                          style={({ pressed }) => ({
                            backgroundColor: on ? tokens.pillBg : "transparent",
                            borderWidth: 1,
                            borderColor: on ? tokens.pillBg : tokens.border,
                            borderRadius: 999,
                            paddingHorizontal: spacing.lg,
                            // 44pt is the minimum comfortable tap target; the
                            // chip is centred inside it rather than padded to
                            // it, so the az labels still wrap onto one row.
                            minHeight: 44,
                            justifyContent: "center",
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <AppText
                            color={on ? tokens.pillText : tokens.muted}
                            style={{ fontSize: 14, fontWeight: on ? "700" : "500" }}
                          >
                            {t(`bug.sev.${s}`)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

              <AppText variant="muted" style={{ fontSize: 13 }}>
                {t("bug.contextNote")}
              </AppText>

              {error ? (
                <AppText accessibilityLiveRegion="polite" color={tokens.danger}>
                  {error}
                </AppText>
              ) : null}

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Button
                  title={t("bug.cancel")}
                  variant="ghost"
                  disabled={pending}
                  onPress={dismiss}
                  style={{ flex: 1 }}
                />
                <Button
                  title={t("bug.submit")}
                  pending={pending}
                  pendingTitle={t("bug.sending")}
                  onPress={submit}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </KeyboardFocusBoundary>
    </SheetShell>
  );
}
