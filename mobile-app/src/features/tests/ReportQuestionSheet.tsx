// "Report a problem" (migration 115) — the mobile dialog, modelled on the
// sibling ConfirmModal.tsx so the two behave identically: RN <Modal>, backdrop
// press to dismiss, an in-dialog error line, and ArenaButton's pending state.
//
// Two behaviours are deliberate and match the web component:
//   * while a submit is in flight the dialog is strictly modal — the backdrop
//     and Android's hardware back are both inert, so a request can never be
//     abandoned halfway with the child unsure whether the report was filed;
//   * success is an IN-PLACE transition of this same dialog, not a toast. The
//     confirmation belongs where the user is already looking (the same argument
//     ConfirmModal makes for its errorText).
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { radius, shadow, spacing, type ArenaTokens } from "@/theme/tokens";
import { ArenaButton, tint } from "./ui";

const MESSAGE_MAX = 1000;

/** Stable no-op so a pending dialog's close handler never changes identity. */
function noop() {}

export function ReportQuestionSheet({
  arena,
  visible,
  t,
  onClose,
  onSubmit,
}: {
  arena: ArenaTokens;
  visible: boolean;
  t: (key: string) => string;
  onClose: () => void;
  /** Resolves to an i18n KEY on failure — raw database text never arrives here. */
  onSubmit: (message: string) => Promise<{ ok: true } | { ok: false; errorKey: string }>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // A second tap can land before React re-renders and the button's disabled
  // state applies, so the latch — not `pending` — is what stops a double file.
  const inFlight = useRef(false);

  function dismiss() {
    if (inFlight.current) return;
    setText("");
    setError(null);
    setSent(false);
    onClose();
  }

  async function submit() {
    if (inFlight.current) return;
    if (text.trim() === "") {
      setError(t("test.report.emptyErr"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit(text);
      if (res.ok) setSent(true);
      else setError(t(res.errorKey));
    } catch {
      setError(t("test.report.err.generic"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const remaining = MESSAGE_MAX - text.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={pending ? noop : dismiss}
    >
      {/* A Modal is its own NATIVE window, so KeyboardAvoidingView is the right
          tool here (the app-wide measured contract belongs to scroll bodies) —
          `padding` on BOTH platforms, exactly like PhoneField's country sheet:
          this window starts at y=0 with no header to offset against, and if
          Android's adjustResize did shrink it the measured frame already
          shrank and the computed padding falls to 0.

          It is NOT its own REACT tree, though: context reaches straight through
          a Modal. The note field below is a bare TextInput today and reports
          focus to nobody, but the boundary is what keeps that true — the moment
          it becomes a TextField (which reports its wrapper upward) it would
          otherwise scroll the runner/review list behind this sheet. */}
      <KeyboardFocusBoundary>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            accessibilityLabel={t("test.report.cancel")}
            onPress={pending ? undefined : dismiss}
            style={{
              flex: 1,
              backgroundColor: tint("#000000", 0.55),
              justifyContent: "center",
              padding: spacing.xl,
            }}
          >
            {/* Inner pressable swallows taps so the card never closes itself. */}
            <Pressable
              onPress={() => {}}
              style={[
                {
                  backgroundColor: arena.panel,
                  borderColor: arena.line,
                  borderWidth: 1,
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  gap: spacing.md,
                  maxHeight: "85%",
                },
                shadow("float"),
              ]}
            >
              <AppText variant="title" color={arena.ink}>
                {sent ? t("test.report.successTitle") : t("test.report.title")}
              </AppText>

              {sent ? (
                <>
                  <AppText color={arena.muted} style={{ fontSize: 15, lineHeight: 21 }}>
                    {t("test.report.successBody")}
                  </AppText>
                  <ArenaButton
                    arena={arena}
                    kind="primary"
                    title={t("test.report.done")}
                    onPress={dismiss}
                    style={{ marginTop: spacing.sm }}
                  />
                </>
              ) : (
                <>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: spacing.sm }}
                  >
                    <AppText color={arena.muted} style={{ fontSize: 15, lineHeight: 21 }}>
                      {t("test.report.intro")}
                    </AppText>
                    <AppText variant="label" color={arena.muted} style={{ fontSize: 12 }}>
                      {t("test.report.label")}
                    </AppText>
                    <TextInput
                      accessibilityLabel={t("test.report.label")}
                      multiline
                      editable={!pending}
                      maxLength={MESSAGE_MAX}
                      value={text}
                      onChangeText={(v) => {
                        setText(v);
                        if (error) setError(null);
                      }}
                      placeholder={t("test.report.placeholder")}
                      placeholderTextColor={arena.dim}
                      textAlignVertical="top"
                      style={{
                        backgroundColor: arena.panel2,
                        color: arena.ink,
                        borderWidth: 1,
                        borderColor: arena.line,
                        borderRadius: radius.md,
                        padding: spacing.md,
                        minHeight: 110,
                        fontSize: 15,
                        lineHeight: 21,
                      }}
                    />
                    <AppText
                      variant="mono"
                      color={arena.dim}
                      style={{ fontSize: 12, textAlign: "right" }}
                    >
                      {t("test.report.remaining").replace("{n}", String(remaining))}
                    </AppText>
                  </ScrollView>

                  {error ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      color={arena.red}
                      style={{ fontSize: 14, lineHeight: 20 }}
                    >
                      {error}
                    </AppText>
                  ) : null}

                  <View
                    style={{
                      flexDirection: "row",
                      gap: spacing.md,
                      marginTop: spacing.sm,
                    }}
                  >
                    <ArenaButton
                      arena={arena}
                      kind="ghost"
                      title={t("test.report.cancel")}
                      onPress={dismiss}
                      disabled={pending}
                      style={{ flex: 1 }}
                    />
                    <ArenaButton
                      arena={arena}
                      kind="primary"
                      title={t("test.report.submit")}
                      onPress={submit}
                      pending={pending}
                      pendingTitle={t("test.report.sending")}
                      style={{ flex: 1 }}
                    />
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </KeyboardFocusBoundary>
    </Modal>
  );
}
