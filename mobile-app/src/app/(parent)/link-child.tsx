// Existing-child access for a second adult (web /children/link parity).
//
// TWO ROUTES IN, NEITHER OF THEM APPROVED. The screen originally NOMINATED: the
// parent typed the child's 8-digit id plus a one-time code, which raised a
// request the creating parent then approved. The owner removed approval on
// 2026-09-16 (migration 177) after that flow completed ZERO links in production
// — issuing a second code revoked the redemption already waiting for approval,
// so a parent who retried destroyed their own request — and replaced it with
// the child's own credentials.
//
// The owner brought the CODE back on 2026-09-17 (migration 180), WITHOUT the
// approval step: `redeem` now creates the active link itself and notifies the
// creating parent. So this screen offers both routes, and both grant access the
// moment they succeed. Approve and reject remain dead concepts; if either
// returns here, the 176 bug has been rebuilt.
//
// WHY TWO CARDS RATHER THAN ONE FORM. Both routes open with the same 8-digit id
// and take a secret as their second value, so an id over a password box and an
// id over a code box look identical at a glance. Each gets its own card, its own
// heading, its own sentence about who holds the second value and its own message
// slot — a rejection has to land under the form that caused it.
//
// WHAT SURVIVES FROM BEFORE: revoke and leave. A creator must still be able to
// take access away and a linked adult must still be able to walk away, so both
// remain on the manage_child_link RPC they always used.
//
// THE PASSWORD IS A CHILD'S CREDENTIAL, NOT A FORM VALUE. It is cleared in a
// `finally`, so EVERY outcome clears it: success, rejection, and a throw alike.
// A wrong entry must not sit in the field waiting to be resubmitted, and a
// correct one has done its job. Nothing about that pair is autofilled either —
// `purpose="none"` plus ChildIdField's own exclusion — because it is a MINOR's
// account number and the PARENT's password filed against the same app domain as
// the parent's real credential; the full reasoning is in PASSWORD_AUTOFILL,
// components/TextField.tsx. The invite code is single-use and expires in 72
// hours, so it is not a standing secret in the same way; it is still cleared on
// success, because a spent code left in the box only invites a second submit
// that can never work.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyableId } from "@/components/CopyableId";
import { ChildIdField, PasswordField, TextField } from "@/components/TextField";
import { Skeleton } from "@/components/StatusViews";
import { Pill, ScreenScroll, SectionTitle } from "@/features/parent/ui";
import {
  bffChildAccessAdults,
  bffChildLinkByCredentials,
  bffChildLinkIssue,
  bffChildLinkManage,
  bffChildLinkRedeem,
  bffChildLinkState,
  type ChildAccessAdult,
  type ChildLinkState,
} from "@/lib/api";
import { formatLongDate, formatShortDate } from "@/lib/formatDate";
import { useFieldChain } from "@/lib/useFieldChain";
import { useT } from "@/i18n/useT";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";

const EMPTY: ChildLinkState = { children: [] };

/**
 * One message, shown under the form or the card that produced it.
 *
 * `scope` is "credentials", "code", or a child's profile id. `key` is an i18n
 * KEY, not a rendered sentence — the locale can change while a message is on
 * screen and the message has to follow it (login.tsx does the same).
 */
type Feedback = { scope: string; tone: "danger" | "ok"; key: string };

/** How an adult is named in the access list: the structured parts when we have
 *  them, else the display name migration 177 derived them from. */
function adultLabel(adult: ChildAccessAdult): string {
  const parts = [adult.first_name, adult.last_name].filter(Boolean).join(" ").trim();
  return parts || adult.display_name || "—";
}

/** Invite codes are 20 hex characters; the RPC uppercases and strips spaces and
 *  dashes before it hashes, so the field does the same as the parent types and
 *  never rejects a code pasted in its readable form. */
function normalizeCode(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 20);
}

export default function LinkChildScreen() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const [state, setState] = useState<ChildLinkState>(EMPTY);
  // studentProfileId -> the adults who can reach that child.
  const [access, setAccess] = useState<Record<string, ChildAccessAdult[]>>({});
  const [childId, setChildId] = useState("");
  const [password, setPassword] = useState("");
  const [codeChildId, setCodeChildId] = useState("");
  const [code, setCode] = useState("");
  // studentProfileId -> the code just issued for that child. Ephemeral by
  // design: the link state cannot carry it back, because only its hash is kept.
  const [issued, setIssued] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await bffChildLinkState();
    if (!res.ok) {
      // Scoped to the SCREEN, not to a form: an unreachable origin or an
      // expired session is not a rejection of anything the parent typed, and
      // under the credentials card it would read as one.
      setFeedback({ scope: "screen", tone: "danger", key: res.error });
      setLoading(false);
      return;
    }
    const next = res.data;
    setState(next);
    // One caller-scoped call per child. Issued together rather than in
    // sequence: four children on a slow connection is four round-trips either
    // way, but only one wait. A child whose list fails simply shows none —
    // never a reason to fail the whole screen.
    const lists = await Promise.all(next.children.map((c) => bffChildAccessAdults(c.id)));
    const map: Record<string, ChildAccessAdult[]> = {};
    next.children.forEach((child, i) => {
      const row = lists[i];
      if (row?.ok) map[child.id] = row.data.adults;
    });
    setAccess(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCredentials() {
    if (pending) return;
    // Client-side shape only — the BFF re-validates both fields before any
    // privileged call and is the boundary that counts.
    if (childId.length !== 8) {
      setFeedback({ scope: "credentials", tone: "danger", key: "auth.child.err.idFormat" });
      return;
    }
    if (!password) {
      setFeedback({ scope: "credentials", tone: "danger", key: "auth.child.err.passwordRequired" });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const res = await bffChildLinkByCredentials(childId, password);
      if (!res.ok) {
        setFeedback({ scope: "credentials", tone: "danger", key: res.error });
        return;
      }
      setChildId("");
      await load();
      setFeedback({ scope: "credentials", tone: "ok", key: "link.linkedNotice" });
    } finally {
      // EVERY outcome, a throw included: this field must not still hold a
      // child's password when this function returns.
      setPassword("");
      setPending(false);
    }
  }

  async function submitCode() {
    if (pending) return;
    if (codeChildId.length !== 8) {
      setFeedback({ scope: "code", tone: "danger", key: "auth.child.err.idFormat" });
      return;
    }
    if (code.length !== 20) {
      setFeedback({ scope: "code", tone: "danger", key: "link.err.invalidInvite" });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const res = await bffChildLinkRedeem(codeChildId, code);
      if (!res.ok) {
        setFeedback({ scope: "code", tone: "danger", key: res.error });
        return;
      }
      // NO PENDING BRANCH. A successful redeem IS the link under migration 180,
      // so this reports the same outcome the credential route reports, because
      // the same thing happened.
      setCodeChildId("");
      setCode("");
      await load();
      setFeedback({ scope: "code", tone: "ok", key: "link.linkedNotice" });
    } finally {
      setPending(false);
    }
  }

  async function issueCode(studentId: string) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const res = await bffChildLinkIssue(studentId);
      if (!res.ok) {
        setFeedback({ scope: studentId, tone: "danger", key: res.error });
        return;
      }
      setIssued((prev) => ({
        ...prev,
        [studentId]: { code: res.data.code, expiresAt: res.data.expiresAt },
      }));
      setFeedback({ scope: studentId, tone: "ok", key: "link.codeReady" });
    } finally {
      setPending(false);
    }
  }

  async function manage(body: Record<string, unknown>, scope: string) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const res = await bffChildLinkManage(body);
      if (!res.ok) {
        setFeedback({ scope, tone: "danger", key: res.error });
        return;
      }
      await load();
      setFeedback({ scope, tone: "ok", key: "link.success" });
    } finally {
      setPending(false);
    }
  }

  /** A plain render helper, deliberately NOT a component declared in here: a
   *  component defined during render is a new type on every render, so React
   *  remounts it — and a remounted message animates in again on every keystroke. */
  function message(scope: string) {
    if (!feedback || feedback.scope !== scope) return null;
    return (
      <AppText variant="muted" color={feedback.tone === "danger" ? tokens.danger : tokens.ok}>
        {t(feedback.key)}
      </AppText>
    );
  }

  // ONE chain PER FORM, never across both: chaining from the password into the
  // code field would carry "Done" into a different submit handler. The iOS
  // number pad has no return key, so the 8th digit landing is what advances off
  // each id field (ChildIdField's rising-edge `onComplete`).
  const credentialChain = useFieldChain(2, {
    onLast: () => {
      if (!pending) void submitCredentials();
    },
  });
  const codeChain = useFieldChain(2, {
    onLast: () => {
      if (!pending) void submitCode();
    },
  });

  if (loading) {
    return (
      <ScreenScroll>
        <Skeleton height={220} />
        <Skeleton height={180} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshing={pending} onRefresh={load}>
      <AppText variant="muted">{t("mob.link.intro")}</AppText>
      {message("screen")}

      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="subtitle">{t("link.way.credentials")}</AppText>
          <AppText variant="muted">{t("link.way.credentialsBody")}</AppText>
        </View>
        <ChildIdField
          {...credentialChain.field(0)}
          label={t("link.childId")}
          placeholder={t("mob.childIdPh")}
          value={childId}
          onChangeDigits={setChildId}
          onComplete={() => credentialChain.focus(1)}
        />
        <PasswordField
          {...credentialChain.field(1)}
          label={t("link.childPassword")}
          value={password}
          onChangeText={setPassword}
          showLabel={t("mob.pw.show")}
          hideLabel={t("mob.pw.hide")}
          purpose="none"
        />
        <AppText variant="muted">{t("link.credentialsHint")}</AppText>
        {message("credentials")}
        <Button
          title={t("link.request")}
          variant="gradient"
          pending={pending}
          disabled={childId.length !== 8 || password.length === 0}
          onPress={() => void submitCredentials()}
        />
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="subtitle">{t("link.way.code")}</AppText>
          <AppText variant="muted">{t("link.way.codeBody")}</AppText>
        </View>
        <ChildIdField
          {...codeChain.field(0)}
          label={t("link.childId")}
          placeholder={t("mob.childIdPh")}
          value={codeChildId}
          onChangeDigits={setCodeChildId}
          onComplete={() => codeChain.focus(1)}
        />
        <TextField
          {...codeChain.field(1)}
          label={t("link.code")}
          value={code}
          onChangeText={(text) => setCode(normalizeCode(text))}
          autoCapitalize="characters"
          autoCorrect={false}
          // A one-time code is not a credential any store should remember, and
          // the field sits on the same screen as a child's password — the same
          // exclusion ChildIdField applies to itself.
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          // NO maxLength. It would truncate a PASTE before normalizeCode ever ran,
          // which defeats the normalizer's whole purpose: a code arrives in a chat
          // message as 4A2F-9C11-... and the readable form is LONGER than 20
          // characters, so the browser would clip the tail and the parent would be
          // told a correct code is wrong. normalizeCode already caps at 20 AFTER
          // stripping separators, which is the only order that works.
          style={{ letterSpacing: 2 }}
        />
        <AppText variant="muted">{t("link.codeHint")}</AppText>
        {message("code")}
        <Button
          title={t("link.request")}
          variant="gradient"
          pending={pending}
          disabled={codeChildId.length !== 8 || code.length !== 20}
          onPress={() => void submitCode()}
        />
      </Card>

      {state.children.length > 0 ? <SectionTitle>{t("link.manage")}</SectionTitle> : null}

      {state.children.map((child) => {
        const adults = access[child.id] ?? [];
        const fresh = issued[child.id];
        return (
          <Card key={child.id} style={{ gap: spacing.md }}>
            {/* Identity row: the name cell grows and wraps, the pill shrinks —
                never the other way round on a 320pt screen. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="subtitle" numberOfLines={2}>
                  {child.name}
                </AppText>
                {child.child_id ? <AppText variant="mono">{child.child_id}</AppText> : null}
              </View>
              <Pill
                label={child.is_creator ? t("link.owner") : t("link.linked")}
                tone={child.is_creator ? "accent" : "muted"}
              />
            </View>

            {/* THE CREATOR SIDE. Only the parent who created the child may issue
                a code, and only once that child HAS an 8-digit id — the RPC
                refuses both, so the button is not offered where it would be
                declined (the same reasoning as the revoke button below). */}
            {child.is_creator ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="label">{t("link.code")}</AppText>
                {child.child_id ? (
                  <>
                    <AppText variant="muted">{t("link.issueHint")}</AppText>
                    {fresh ? (
                      <View style={{ gap: spacing.xs }}>
                        <CopyableId
                          id={fresh.code}
                          display={fresh.code}
                          label={t("parent.child.idCopy")}
                          copiedLabel={t("parent.child.idCopied")}
                          a11yLabel={t("link.copyCode")}
                          fontSize={16}
                        />
                        <AppText variant="muted">
                          {t("link.codeExpires")} {formatLongDate(fresh.expiresAt, locale, true)}
                        </AppText>
                        {/* Said OUT LOUD, because it is the sharp edge of the
                            old flow: issuing revokes whatever code is already
                            outstanding for this child. */}
                        <AppText variant="muted">{t("link.issueReplaces")}</AppText>
                      </View>
                    ) : null}
                    <Button
                      title={t("link.issue")}
                      variant="ghost"
                      pending={pending}
                      onPress={() => void issueCode(child.id)}
                    />
                  </>
                ) : (
                  <AppText variant="muted">{t("link.err.needsId")}</AppText>
                )}
              </View>
            ) : null}

            <AppText variant="label">{t("link.access.title")}</AppText>
            {adults.length === 0 ? (
              <AppText variant="muted">{t("link.noAdults")}</AppText>
            ) : (
              adults.map((adult) => (
                <View key={adult.profile_id} style={{ gap: spacing.xs }}>
                  <AppText numberOfLines={2}>{adultLabel(adult)}</AppText>
                  {adult.email ? (
                    // Middle ellipsis: a truncated address keeps its domain,
                    // which is what tells two adults apart at a glance.
                    <AppText variant="muted" numberOfLines={1} ellipsizeMode="middle">
                      {adult.email}
                    </AppText>
                  ) : null}
                  <AppText variant="muted">
                    {adult.role === "creator" ? t("link.access.creator") : t("link.access.linked")}
                    {adult.since ? ` · ${t("link.access.since")} ${formatShortDate(adult.since, locale)}` : ""}
                  </AppText>
                  {/* Only the creator revokes, and never the creator's own row:
                      manage_child_link refuses both anyway, so this keeps the UI
                      from offering a button the server will decline. */}
                  {child.is_creator && adult.role === "linked" ? (
                    <Button
                      title={t("link.revoke")}
                      variant="ghost"
                      pending={pending}
                      onPress={() =>
                        void manage(
                          {
                            action: "revoke",
                            student_id: child.id,
                            parent_id: adult.profile_id,
                          },
                          child.id,
                        )
                      }
                    />
                  ) : null}
                </View>
              ))
            )}

            {child.is_creator ? null : (
              <Button
                title={t("link.leave")}
                variant="ghost"
                pending={pending}
                onPress={() => void manage({ action: "leave", student_id: child.id }, child.id)}
              />
            )}

            {message(child.id)}
          </Card>
        );
      })}
    </ScreenScroll>
  );
}
