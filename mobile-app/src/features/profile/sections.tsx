// Parent profile section cards (mobile port of web ParentProfile +
// NotificationPreferences): identity header, change-password, per-profile
// notification channel rows (await + revert on failure), link rows and the
// double-confirm danger zone. Presentational + local state only; privileged
// flows go through the BFF client (bffDeleteAccount) or supabase.auth.
import React, { useState } from "react";
import { Modal, Pressable, Switch, View } from "react-native";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PasswordField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { bffDeleteAccount } from "@/lib/api";
import {
  fetchPrefs,
  savePrefs,
  type NotificationPrefs,
} from "@/features/notifications/useNotifications";
import { AvatarSection } from "./AvatarPicker";
import { initialsOf, type OwnProfile } from "./useOwnProfile";

type T = (key: string) => string;

/* ------------------------------ identity card ------------------------------ */

export function IdentityCard({ profile, t }: { profile: OwnProfile; t: T }) {
  const { tokens } = useTheme();
  const name = profile.displayName.trim() || profile.email;
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: tokens.chipBg,
            borderWidth: 1,
            borderColor: tokens.border,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {profile.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={{ width: 64, height: 64 }}
              contentFit="cover"
              accessibilityLabel={name}
            />
          ) : (
            <AppText variant="title" color={tokens.accent}>
              {initialsOf(profile.displayName, profile.email)}
            </AppText>
          )}
        </View>
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

      <View style={{ gap: spacing.sm }}>
        <InfoRow label={t("prof2.email")} value={profile.email || "—"} />
        <InfoRow label={t("profile.phoneLabel")} value={profile.phone ?? "—"} />
      </View>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
      <AppText variant="muted">{label}</AppText>
      <AppText variant="label" style={{ flexShrink: 1, textAlign: "right" }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
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
      <AppText variant="title" style={{ fontSize: 16 }}>
        {t("prof2.security")}
      </AppText>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("prof2.securityHint")}
      </AppText>
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

/* ------------------------- notification preferences ------------------------ */

const DEFAULT_PREFS: NotificationPrefs = {
  in_app_enabled: true,
  email_enabled: true,
  push_enabled: true,
};

type Channel = keyof NotificationPrefs;

export function PrefRow({
  target,
  label,
  t,
}: {
  /** null = the parent's own prefs; otherwise a child's profile id. */
  target: string | null;
  label: string;
  t: T;
}) {
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const queryKey = ["notif-prefs", target ?? "self"];
  const q = useQuery({ queryKey, queryFn: () => fetchPrefs(target) });
  const [override, setOverride] = useState<NotificationPrefs | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const prefs = override ?? q.data ?? DEFAULT_PREFS;

  // Round-17 lesson: AWAIT the save and revert the optimistic flip on failure.
  async function toggle(ch: Channel) {
    if (status === "saving") return;
    const prev = prefs;
    const next = { ...prefs, [ch]: !prefs[ch] };
    setOverride(next);
    setStatus("saving");
    const ok = await savePrefs(target, next);
    if (ok) {
      queryClient.setQueryData(queryKey, next);
      setStatus("saved");
    } else {
      setOverride(prev);
      setStatus("error");
    }
  }

  const channels: { key: Channel; label: string; note: boolean }[] = [
    { key: "in_app_enabled", label: t("notif.prefs.inApp"), note: false },
    { key: "email_enabled", label: t("notif.prefs.email"), note: true },
    { key: "push_enabled", label: t("notif.prefs.push"), note: true },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </AppText>
        <AppText
          variant="muted"
          style={{ fontSize: 12 }}
          color={status === "error" ? tokens.danger : status === "saved" ? tokens.ok : tokens.muted}
        >
          {status === "saving"
            ? t("notif.prefs.saving")
            : status === "saved"
              ? t("notif.prefs.saved")
              : status === "error"
                ? t("notif.prefs.error")
                : ""}
        </AppText>
      </View>
      {channels.map((c) => (
        <View
          key={c.key}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          <View style={{ flex: 1 }}>
            <AppText>{c.label}</AppText>
            {c.note ? (
              <AppText variant="muted" style={{ fontSize: 11 }}>
                {t("notif.prefs.channelNote")}
              </AppText>
            ) : null}
          </View>
          <Switch
            accessibilityLabel={`${label} — ${c.label}`}
            value={prefs[c.key]}
            disabled={q.isPending}
            onValueChange={() => void toggle(c.key)}
            trackColor={{ false: tokens.border, true: tokens.accent }}
            thumbColor="#ffffff"
          />
        </View>
      ))}
    </View>
  );
}

/* -------------------------------- link rows -------------------------------- */

export function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <AppText variant="label">{label}</AppText>
      <AppText variant="muted">{"›"}</AppText>
    </Pressable>
  );
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

  return (
    <Card style={{ gap: spacing.md, borderColor: tokens.danger }}>
      <AppText variant="title" style={{ fontSize: 16 }} color={tokens.danger}>
        {t("prof2.danger")}
      </AppText>
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
          style={{
            backgroundColor: tokens.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.xl,
            gap: spacing.lg,
          }}
        >
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
