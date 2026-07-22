// Parent profile section cards (mobile port of web ParentProfile): identity
// header, the phone add/edit module, change-password, link rows and the
// double-confirm danger zone. Presentational + local state only; privileged
// flows go through the BFF client (bffUpdateParentPhone / bffDeleteAccount) or
// supabase.auth.
import React, { useState } from "react";
import { Modal, Pressable, View } from "react-native";
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
import { ListRow } from "@/components/ListRow";
import { E164_RE, PhoneField } from "@/components/PhoneField";
import { PasswordField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { bffDeleteAccount, bffUpdateParentPhone } from "@/lib/api";
import { useAuthStore } from "@/features/auth/authStore";
import { AvatarSection } from "./AvatarPicker";
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
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" numberOfLines={1}>
            {name}
          </AppText>
          {profile.email ? (
            <AppText variant="muted" numberOfLines={1}>
              {profile.email}
            </AppText>
          ) : null}
        </View>
      </View>

      {/* Real photo picker (expo-image-picker → BFF avatar endpoint). */}
      <AvatarSection hasAvatar={profile.avatarUrl !== null} t={t} />

      <View>
        <InfoRow
          icon={<Mail size={18} color={tokens.muted} strokeWidth={2} />}
          label={t("prof2.email")}
          value={profile.email || "—"}
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
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return <ListRow icon={icon} title={label} value={value} chevron={false} />;
}

/* ------------------------------- phone number ------------------------------ */

/**
 * Add/edit module for the parent's contact number. Registration makes the
 * phone mandatory, so this exists to fill legacy nulls and to correct a stale
 * number — it deliberately offers no way to clear the field back to empty.
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
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pending) return;
    // Client mirror of the server rule — UX only: the BFF re-runs the same
    // E.164 check and the database constraint is the final authority.
    if (!E164_RE.test(phone)) {
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
              inline, so the section does not repeat it. */}
          <PhoneField
            label={t("parent.auth.phone")}
            searchPlaceholder={t("parent.auth.phoneSearch")}
            closeLabel={t("drawer.close")}
            error={error}
            onChangeE164={setPhone}
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
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pending) return;
    setDone(false);
    if (pw.length < 8) {
      setError(t("profile.err.passwordShort"));
      return;
    }
    if (pw !== confirm) {
      setError(t("mob.prof.passwordMismatch"));
      return;
    }
    setError(null);
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setPending(false);
    if (err) {
      setError(t("profile.err.updateFailed"));
      return;
    }
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
            label={t("profile.newPassword")}
            value={pw}
            onChangeText={setPw}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            isParentCredential
          />
          <PasswordField
            label={t("mob.prof.confirmPassword")}
            value={confirm}
            onChangeText={setConfirm}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            isParentCredential
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
  // 0 = closed, 1 = first confirm, 2 = final confirm.
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await bffDeleteAccount();
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setStep(0);
    onDeleted();
  }

  const close = () => {
    if (pending) return;
    setStep(0);
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
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("prof2.dangerHint")}
      </AppText>
      <Button title={t("profile.deleteAccount")} variant="danger" onPress={() => setStep(1)} />

      <Modal visible={step > 0} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          accessibilityLabel={t("profile.cancel")}
          onPress={close}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        />
        <View
          style={[
            {
              backgroundColor: tokens.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
              gap: spacing.lg,
            },
            shadow("float", tokens.shadow),
          ]}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.border,
            }}
          />
          <AppText variant="title" color={tokens.danger}>
            {t("account.delete")}
          </AppText>
          <AppText>
            {step === 1 ? t("account.deleteConfirm") : t("mob.prof.deleteFinal")}
          </AppText>
          {error ? (
            <AppText variant="muted" color={tokens.danger}>
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
                if (step === 1) setStep(2);
                else void confirmDelete();
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
      </Modal>
    </Card>
  );
}
