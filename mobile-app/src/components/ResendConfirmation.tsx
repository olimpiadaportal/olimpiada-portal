// Resend the SIGNUP confirmation email — the mobile twin of the web
// /verify-email form. Shared by the register screen's "check your inbox" card
// and by Login, because those are the two places a parent can be holding an
// unconfirmed account: the mail can go missing on the day they sign up, and it
// can still be missing a week later when they come back and try to log in.
// Without the Login instance the whole feature would only serve users who never
// left the register screen.
//
// All three outcomes are visible (success / pending / throttled) — a control
// that silently does nothing is the failure class this exists to remove.
import React, { useEffect, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { Send } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { bffResendConfirmation } from "@/lib/api";

// GoTrue enforces its OWN per-address resend interval (60s by default) and the
// server deliberately swallows that rejection (telling the caller about it
// would leak whether the address exists), so a tap inside the window returns a
// truthful-looking success that sent nothing. Hold the button for the same
// window instead — web ResendConfirmationForm parity.
const RESEND_COOLDOWN_MS = 60_000;

export function ResendConfirmation({
  email,
  /** Arm the cooldown immediately: registration JUST sent that mail, so the
   *  server-side window is already running and a first tap would send nothing.
   *  False on Login, where nothing was sent and the button must work at once. */
  startOnCooldown = false,
  style,
}: {
  email: string;
  startOnCooldown?: boolean;
  style?: ViewStyle;
}) {
  const { t } = useT();
  const { tokens } = useTheme();

  const [pending, setPending] = useState(false);
  // `note` holds the i18n KEY, not the rendered sentence — the language
  // switcher on these screens can change the locale while a note is on screen
  // and the message has to follow it. The flag picks success vs failure color.
  const [note, setNote] = useState<{ ok: boolean; key: string } | null>(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(() =>
    startOnCooldown ? Date.now() + RESEND_COOLDOWN_MS : 0,
  );
  const [cooldownLeft, setCooldownLeft] = useState(
    startOnCooldown ? RESEND_COOLDOWN_MS / 1000 : 0,
  );

  // Deadline-based, not a decrementing counter: JS timers are throttled while
  // the app is backgrounded, and leaving for the mail app is exactly what this
  // control asks for — on return the remaining seconds are recomputed from the
  // clock instead of resuming where they froze. Self-clearing at zero, so no
  // timer survives the countdown.
  useEffect(() => {
    if (cooldownEndsAt <= 0) {
      setCooldownLeft(0);
      return;
    }
    const remaining = () => Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
    setCooldownLeft(remaining());
    const id = setInterval(() => {
      const left = remaining();
      setCooldownLeft(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  async function resend() {
    if (pending || cooldownLeft > 0) return;
    setPending(true);
    setNote(null);
    const res = await bffResendConfirmation(email);
    setPending(false);
    if (!res.ok) {
      setNote({ ok: false, key: res.error });
      // Being throttled still means the request landed, so hold the button
      // rather than let it be hammered. A transport failure sent nothing and
      // stays instantly retryable once the connection is back.
      if (res.error === "parent.err.tooMany") {
        setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_MS);
      }
      return;
    }
    // Success here means the server HANDLED it, not that a mail went out: it
    // answers the same for an unknown or already-confirmed address, which is
    // why verify.resent is worded conditionally.
    setNote({ ok: true, key: "verify.resent" });
    setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_MS);
  }

  return (
    <View style={[{ alignSelf: "stretch", gap: spacing.md }, style]}>
      {/* Outcome line above the action, matching every form on these screens
          (error then button), so the button stays the last thing in the card. */}
      {note ? (
        <AppText
          variant="muted"
          color={note.ok ? tokens.ok : tokens.danger}
          style={{ textAlign: "center" }}
        >
          {t(note.key)}
        </AppText>
      ) : null}
      <Button
        title={
          cooldownLeft > 0 ? `${t("verify.resend")} (${cooldownLeft})` : t("verify.resend")
        }
        variant="ghost"
        icon={<Send size={18} color={tokens.accent} />}
        pending={pending}
        pendingTitle={t("parent.auth.submitting")}
        disabled={cooldownLeft > 0}
        onPress={() => void resend()}
        // Cards center their children; stretch makes this a full-width block
        // instead of a label-width pill, and it stays flex-sized so long az/ru
        // titles never overflow it at 320pt.
        style={{ alignSelf: "stretch" }}
      />
    </View>
  );
}
