// Parent profile section cards (mobile port of web ParentProfile): identity
// header, the phone add/edit module, change-password, link rows and the
// double-confirm danger zone. Presentational + local state only; privileged
// flows go through the BFF client (bffUpdateParentPhone / bffDeleteAccount /
// bffChangeOwnPassword).
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import {
  KeyRound,
  Mail,
  Phone,
  TriangleAlert,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CmsProse } from "@/components/CmsProse";
import { ListRow } from "@/components/ListRow";
import { SheetDialog } from "@/components/SheetDialog";
import { E164_RE, PhoneField, usePhoneValue } from "@/components/PhoneField";
import { PasswordField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { bffChangeOwnPassword, bffDeleteAccount, bffUpdateParentPhone } from "@/lib/api";
import { checkNewPassword } from "@/lib/passwordPolicy";
import { useFieldChain } from "@/lib/useFieldChain";
import { useAuthStore } from "@/features/auth/authStore";
import { AvatarSection } from "./AvatarPicker";
import { phoneEditorSeed } from "./phoneEditor";
import {
  advanceDelete,
  canRequestDelete,
  closeDelete,
  openDelete,
  type DeleteStep,
} from "./deleteAccount";
import { type OwnProfile } from "./useOwnProfile";

type T = (key: string) => string;

/* ------------------------------ identity card ------------------------------ */

export function IdentityCard({ profile, t }: { profile: OwnProfile; t: T }) {
  const { tokens } = useTheme();
  const profileId = useAuthStore((s) => s.profileId);
  const name = profile.displayName.trim() || profile.email;
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <Avatar name={name} seed={profileId} url={profile.avatarUrl} size={64} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="title" numberOfLines={2}>
            {name}
          </AppText>
          {profile.email ? (
            // Two lines, and elided in the MIDDLE: an address's domain is the
            // disambiguating half, so a tail ellipsis would hide exactly the
            // part that identifies the account. The full value is on the
            // wrapped email row below.
            <AppText variant="muted" numberOfLines={2} ellipsizeMode="middle">
              {profile.email}
            </AppText>
          ) : null}
        </View>
      </View>

      {/* Real photo picker (expo-image-picker → BFF avatar endpoint). */}
      <AvatarSection hasAvatar={profile.avatarUrl !== null} t={t} />

      <View>
        {/* Email wraps (an address has no length ceiling and these two rows are
            the only place the app renders it); the phone stays on the inline
            trailing cell — E.164 is bounded and reads better right-aligned. */}
        <InfoRow
          icon={<Mail size={18} color={tokens.muted} strokeWidth={2} />}
          label={t("prof2.email")}
          value={profile.email || "—"}
          wrap
        />
        <InfoRow
          icon={<Phone size={18} color={tokens.muted} strokeWidth={2} />}
          label={t("profile.phoneLabel")}
          value={profile.phone ?? "—"}
        />
      </View>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
  wrap = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  /** Stack the value under the label and let it wrap — for unbounded values. */
  wrap?: boolean;
}) {
  return <ListRow icon={icon} title={label} value={value} valueWrap={wrap} chevron={false} />;
}

/* ------------------------------- phone number ------------------------------ */

/**
 * Add / edit / CLEAR module for the parent's contact number.
 *
 * THE PHONE IS OPTIONAL (Apple Guideline 5.1.1(v), 2026-08-31). Registration no
 * longer demands one, an account may have none, and emptying this field by hand
 * is a deliberate clear that the BFF stores as NULL. The comment that stood here
 * asserted the opposite on both counts — "registration makes the phone
 * mandatory" and "it deliberately offers no way to clear the field back to
 * empty" — and that stale description is precisely what hid the data loss below
 * for as long as it lasted: an editor that opens EMPTY is harmless only while an
 * empty submit means "no change".
 *
 * So the editor is SEEDED from the stored number (`phoneEditorSeed`, which
 * verifies its own split by recomposing it) and keeps mirroring that number
 * until the parent actually edits something. Opening the editor to check a
 * number and pressing Save now rewrites the same number; clearing the field by
 * hand still submits "" and still deletes it. Cancel discards the edit, because
 * the mirror resumes the moment `edited` is cleared.
 */
export function PhoneSection({
  current,
  t,
  onSaved,
}: {
  /** Stored E.164 value, or null on an account that never got one. */
  current: string | null;
  t: T;
  onSaved: () => void;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  // Country + national number live HERE, not inside PhoneField: state the
  // screen owns survives a remount of the field, and the field itself refuses
  // a write it did not watch the user make (see applyPhoneEdit). `phone`
  // stays the composed E.164 string this section submits.
  //
  // The stored number, split into the two halves the editor needs, and proven
  // to recompose back into itself. One computation feeds BOTH the initial state
  // and the mirror below, so the field and the value being submitted can never
  // come from different readings of `current`.
  const seed = useMemo(() => phoneEditorSeed(current), [current]);
  const [phoneValue, setPhoneValue] = usePhoneValue(seed.value);
  const [phone, setPhone] = useState(seed.e164);
  // True once the parent has changed something in the field. It is the whole
  // difference between "Save the number I just typed" and "Save the number that
  // is already stored", and it is what lets the mirror below stay on without
  // ever writing over someone's typing.
  const [edited, setEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // THE EDITOR MIRRORS THE STORED NUMBER UNTIL THE PARENT EDITS IT.
  //
  // Seeding once at mount is not enough and seeding on the Edit press is not
  // either: `current` arrives from a React Query read (useOwnProfile), so it is
  // null on the first render and can still be null when a parent on a slow
  // connection taps Edit. Both of those seeds would leave the field empty with a
  // number in the database — the data-loss shape all over again. Re-seeding
  // whenever `current` changes closes that window, and the `edited` guard is
  // what keeps it from being the OTHER bug: a stored value landing on top of
  // half-typed input.
  useEffect(() => {
    if (edited) return;
    setPhoneValue(seed.value);
    setPhone(seed.e164);
  }, [seed, edited, setPhoneValue]);

  async function submit() {
    if (pending) return;
    // Client mirror of the server rule — UX only: the BFF re-runs the same
    // E.164 check and the database constraint is the final authority.
    //
    // AN EMPTY VALUE IS A DELIBERATE CLEAR, NOT A FAILURE. The phone became
    // optional for Apple Guideline 5.1.1(v), which requires that a user not be
    // forced to supply information the app does not need — and "optional" is
    // hollow if a parent who once gave a number can never take it back. The
    // server accepts the clear (phoneCore writes NULL); without this guard the
    // client would refuse it, so the field would be one-way.
    if (phone && !E164_RE.test(phone)) {
      setError(t("parent.err.phone"));
      return;
    }
    setError(null);
    setPending(true);
    const res = await bffUpdateParentPhone(phone);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setDone(true);
    setOpen(false);
    // Back to mirroring: the next open re-seeds from whatever the refetch
    // below brings back, so a saved edit is never re-submitted from stale
    // local state.
    setEdited(false);
    // Collapsing back to the summary means the stored value is on screen
    // again — it has to be the one that was just saved, not the cached one.
    onSaved();
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <ListRow
        icon={<Phone size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("profile.phoneLabel")}
        subtitle={t("profile.phoneHint")}
        chevron={false}
      />
      {!open ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="mono" color={current ? tokens.text : tokens.muted}>
            {current ?? "—"}
          </AppText>
          {done ? (
            <AppText variant="muted" color={tokens.ok}>
              {t("profile.phoneSaved")}
            </AppText>
          ) : null}
          <Button
            title={current ? t("profile.phoneEdit") : t("profile.addPhone")}
            variant="ghost"
            onPress={() => {
              setDone(false);
              setError(null);
              setOpen(true);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {/* Same country-code field registration uses; it renders the error
              inline, so the section does not repeat it. A run of one: the
              return key closes the keyboard, Save stays the only submit. */}
          <PhoneField
            label={t("parent.auth.phone")}
            searchPlaceholder={t("parent.auth.phoneSearch")}
            closeLabel={t("drawer.close")}
            error={error}
            value={phoneValue}
            onChange={(next) => {
              // Both callbacks fire together from PhoneField's `commit`, so
              // marking the edit here covers typing AND picking a country.
              setEdited(true);
              setPhoneValue(next);
            }}
            onChangeE164={setPhone}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
          />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("profile.save")}
              pendingTitle={t("profile.saving")}
              pending={pending}
              style={{ flex: 1 }}
              onPress={() => void submit()}
            />
            <Button
              title={t("profile.cancel")}
              variant="ghost"
              disabled={pending}
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                setError(null);
                // Cancel now actually cancels: dropping the flag hands the
                // field back to the mirror, which restores the stored number.
                setEdited(false);
              }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/* ----------------------------- change password ----------------------------- */

export function PasswordSection({ t }: { t: T }) {
  const { tokens } = useTheme();
  // New password → confirm. No `onLast`: changing an account password stays a
  // deliberate press of Save, so the return key on "confirm" only dismisses.
  const chain = useFieldChain(2);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pending) return;
    setDone(false);
    // FEEDBACK ONLY — the BFF re-runs the identical rule and is authoritative.
    // `tooShort` keeps its existing message; the strength dimensions the old
    // length test never covered share the one passwordWeak string.
    const problem = checkNewPassword(pw);
    if (problem) {
      setError(
        t(problem === "tooShort" ? "profile.err.passwordShort" : "profile.err.passwordWeak"),
      );
      return;
    }
    if (pw !== confirm) {
      setError(t("mob.prof.passwordMismatch"));
      return;
    }
    setError(null);
    setPending(true);
    // Was a direct supabase.auth.updateUser, which left this screen with no
    // server-side strength check at all. The BFF owns the rule now.
    const res = await bffChangeOwnPassword(pw);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setPw("");
    setConfirm("");
    setDone(true);
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <ListRow
        icon={<KeyRound size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("prof2.security")}
        subtitle={t("prof2.securityHint")}
        chevron={false}
      />
      {!open ? (
        <Button title={t("profile.changePassword")} variant="ghost" onPress={() => setOpen(true)} />
      ) : (
        <View style={{ gap: spacing.md }}>
          <PasswordField
            {...chain.field(0)}
            label={t("profile.newPassword")}
            value={pw}
            onChangeText={setPw}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            purpose="new"
          />
          <PasswordField
            {...chain.field(1)}
            label={t("mob.prof.confirmPassword")}
            value={confirm}
            onChangeText={setConfirm}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            purpose="new"
          />
          {error ? (
            <AppText variant="muted" color={tokens.danger}>
              {error}
            </AppText>
          ) : null}
          {done ? (
            <AppText variant="muted" color={tokens.ok}>
              {t("profile.passwordChanged")}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("profile.save")}
              pendingTitle={t("profile.saving")}
              pending={pending}
              style={{ flex: 1 }}
              onPress={() => void submit()}
            />
            <Button
              title={t("profile.cancel")}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                setError(null);
                setDone(false);
              }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/* -------------------------------- link rows -------------------------------- */

export function LinkRow({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  /** Leading lucide glyph (18–20, usually accent-tinted). */
  icon?: React.ReactNode;
}) {
  return <ListRow icon={icon} title={label} onPress={onPress} />;
}

/* ------------------------------- danger zone ------------------------------- */

export function DangerZone({ t, onDeleted }: { t: T; onDeleted: () => void }) {
  const { tokens } = useTheme();
  // 0 = closed, 1 = first confirm, 2 = final confirm — and the transitions
  // between them live in ./deleteAccount, not in the JSX below. See that file
  // for why the rule is not three inline expressions in a button prop.
  const [step, setStep] = useState<DeleteStep>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    // TWO locks, and they guard different things. `pending` is one request at
    // a time; `canRequestDelete` is "this account has been confirmed twice"
    // — re-checked HERE, at the only place that can actually delete anything,
    // so that a future edit to the button cannot make one press enough.
    if (pending || !canRequestDelete(step)) return;
    setPending(true);
    setError(null);
    const res = await bffDeleteAccount();
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setStep(closeDelete());
    onDeleted();
  }

  const close = () => {
    if (pending) return;
    // Back to CLOSED, never back to step 1: a sheet that reopened at the final
    // prompt would be one tap from deleting the account.
    setStep(closeDelete());
    setError(null);
  };

  // Red-tinted bordered card: the danger token carries the border AND a soft
  // wash (6-digit hex + alpha byte) so the zone reads as danger in both themes.
  return (
    <Card
      variant="flat"
      style={{
        gap: spacing.md,
        borderColor: tokens.danger,
        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(tokens.danger)
          ? `${tokens.danger}12`
          : tokens.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TriangleAlert size={18} color={tokens.danger} strokeWidth={2} />
        <AppText variant="title" style={{ fontSize: 16 }} color={tokens.danger}>
          {t("prof2.danger")}
        </AppText>
      </View>
      <CmsProse text={t("prof2.dangerHint")} gap={spacing.sm} style={{ fontSize: 12 }} />
      <Button
        title={t("profile.deleteAccount")}
        variant="danger"
        onPress={() => setStep(openDelete())}
      />

      {/* The confirm sheet is on the shared contract (components/SheetDialog):
          safe-area padded, flex-clamped, paragraph scrolls, buttons pinned. It
          used to be a hand-rolled Modal with a flat 24pt bottom padding, no
          maxHeight and no scroll — so on a three-button Android phone the
          buttons sat behind the navigation bar, and at a raised font scale the
          ~180-character confirmation grew the card until they left the window
          entirely. On the single most destructive action in the app. */}
      <SheetDialog
        visible={step > 0}
        title={t("account.delete")}
        titleColor={tokens.danger}
        dismissLabel={t("profile.cancel")}
        // Strictly modal while the delete request is in flight: the account's
        // fate is being decided and a stray backdrop tap must not walk away
        // from it. `close` is already inert during `pending`; this removes the
        // dead tap as well.
        onDismiss={pending ? undefined : close}
        actions={
          <View style={{ gap: spacing.md }}>
            {/* The error rides with the BUTTONS, not with the paragraph: it is
                what explains the button the user is about to press again, so it
                must never be the thing that scrolled out of sight. */}
            {error ? (
              <AppText accessibilityLiveRegion="polite" variant="muted" color={tokens.danger}>
                {error}
              </AppText>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button
                title={step === 1 ? t("account.delete") : t("profile.deleteAccount")}
                variant="danger"
                pending={pending}
                style={{ flex: 1 }}
                onPress={() => {
                  // The press cannot both advance the sheet and send the
                  // request: `advanceDelete` returns submit=true only from the
                  // final step, so the first press is always just a question.
                  const next = advanceDelete(step);
                  setStep(next.step);
                  if (next.submit) void confirmDelete();
                }}
              />
              <Button
                title={t("profile.cancel")}
                variant="ghost"
                disabled={pending}
                style={{ flex: 1 }}
                onPress={close}
              />
            </View>
          </View>
        }
      >
        {/* Two DIFFERENT questions, on purpose. Repeating the same sentence
            teaches a user to tap through it, which is not a confirmation. */}
        <AppText>{step === 1 ? t("account.deleteConfirm") : t("mob.prof.deleteFinal")}</AppText>
      </SheetDialog>
    </Card>
  );
}
