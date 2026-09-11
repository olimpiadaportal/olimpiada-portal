// "Report a problem" (migration 115) — the mobile dialog, built on the shared
// ArenaDialog shell so it behaves identically to ConfirmModal and the rules
// gate: safe-area-padded backdrop, a body that scrolls, and an action row that
// cannot be pushed off the bottom of a short screen.
//
// Two behaviours are deliberate and match the web component:
//   * while a submit is in flight the dialog is strictly modal — the backdrop
//     and Android's hardware back are both inert, so a request can never be
//     abandoned halfway with the child unsure whether the report was filed;
//   * success is an IN-PLACE transition of this same dialog, not a toast. The
//     confirmation belongs where the user is already looking (the same argument
//     ConfirmModal makes for its errorText).
import React, { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { ArenaDialog } from "./ArenaDialog";
import { ArenaButton } from "./ui";

const MESSAGE_MAX = 1000;

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
    <ArenaDialog
      arena={arena}
      visible={visible}
      title={sent ? t("test.report.successTitle") : t("test.report.title")}
      dismissLabel={t("test.report.cancel")}
      onDismiss={pending ? undefined : dismiss}
      // The only dialog in the app with a text input: the Modal is its own
      // native window, so KeyboardAvoidingView is the right tool here, and the
      // focus boundary keeps the screen behind it from scrolling itself.
      keyboardAvoiding
      actions={
        sent ? (
          <ArenaButton
            arena={arena}
            kind="primary"
            title={t("test.report.done")}
            onPress={dismiss}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {error ? (
              <AppText
                accessibilityLiveRegion="polite"
                color={arena.red}
                style={{ fontSize: 14, lineHeight: 20 }}
              >
                {error}
              </AppText>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
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
          </View>
        )
      }
    >
      {sent ? (
        <AppText color={arena.muted} style={{ fontSize: 15, lineHeight: 21 }}>
          {t("test.report.successBody")}
        </AppText>
      ) : (
        <View style={{ gap: spacing.sm }}>
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
            placeholderTextColor={arena.muted}
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
            color={arena.muted}
            style={{ fontSize: 12, textAlign: "right" }}
          >
            {t("test.report.remaining").replace("{n}", String(remaining))}
          </AppText>
        </View>
      )}
    </ArenaDialog>
  );
}
