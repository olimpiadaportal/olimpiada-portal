"use client";

// THE EXISTING-CHILD ACCESS PANEL — ONE ROUTE IN, AND NO APPROVAL BEHIND IT.
//
// HISTORY, because most of this file is shaped by it. Migration 176 shipped an
// invite flow where a second parent redeemed a one-time code and the CREATING
// parent then had to approve that redemption. It completed ZERO links in
// production: issuing a new code revoked any redemption already waiting, so a
// parent who redeemed, saw no prompt and generated a fresh code destroyed their
// own request. The owner removed approval on 2026-09-16 (migration 177) and
// replaced the flow with the child's own credentials. Migration 180 brought the
// CODE back beside it on 2026-09-17, this time WITHOUT approval — `redeem`
// creates the ACTIVE link itself and notifies the creating parent.
//
// THE CREDENTIAL ROUTE IS GONE (owner, 2026-09-17 — migration 181). For two
// days both routes were on this page; the owner wanted one, and the invite code
// is the one that survives on its merits: it is a ONE-TIME, EXPIRING secret the
// CREATING parent generates deliberately and hands to a named adult, while a
// child's password is a STANDING secret the CHILD also knows and can hand to
// anyone. Nothing was stranded — the credential path had completed zero links in
// production when it was withdrawn. If a password field ever returns to this
// panel, the weaker of two doors has been reopened.
//
// There is no pending state to render, no approve button and no reject button.
// If one reappears here, the 176 bug has been rebuilt.
//
// THE CODE IS CLEARED ON SUCCESS: it is single-use, so a spent code left in the
// box only invites a second submit that can never work. It is deliberately NOT
// cleared on failure — a mistyped 20-character code should be correctable, and
// unlike a password it is neither standing nor secret beyond its 72 hours.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
// Clipboard write + select-the-text fallback, already solved for the 8-digit
// login id. The helper itself is id-agnostic (writes the string it is given,
// selects `fallbackEl` when the browser refuses), so the invite code reuses it
// rather than growing a second copy of the same refusal handling.
import { copyRawId } from "@/components/CopyableId";
import {
  childAccessAdultsAction,
  childLinkMutationAction,
  childLinkStateAction,
} from "@/lib/auth/childLinkActions";
import type { ChildAccessAdult } from "@/lib/auth/childAccessAdults";
import type { ChildLinkMutationInput, ChildLinkState } from "@/lib/childLink";
import { formatLongDate } from "@/lib/formatDate";
import type { Locale } from "@/i18n/config";

type Dict = Record<string, string>;
type AccessMap = Record<string, ChildAccessAdult[]>;

/**
 * One message, shown under the form or card that produced it.
 *
 * `scope` is "code" for the redeem form, or a child's profile id for anything
 * raised on that child's card. A single panel-wide message was the alternative
 * and it is worse: a revoke error on the third child would appear over the
 * first, and a redeem rejection would appear over a card it has nothing to do
 * with.
 */
type Feedback = { scope: string; tone: "danger" | "success"; text: string };

/** Invite codes are 20 hex characters; the RPC uppercases and strips spaces and
 *  dashes before it hashes, so the field may as well do it as the parent types
 *  and never reject a code that was pasted in its readable form. */
function normalizeCode(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 20);
}

function adultLabel(a: ChildAccessAdult): string {
  const parts = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return parts || a.display_name || "—";
}

/** The freshly issued code with a copy control. Rendered ONLY from the mutation
 *  result: the database stores a sha256 of the code and can never show it
 *  again, so what is on screen here is the only copy that exists. */
function IssuedCode({ code, dict }: { code: string; dict: Dict }) {
  const t = (key: string) => dict[key] ?? key;
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      className="link-code"
      data-copied={copied ? "true" : "false"}
      aria-label={t("link.copyCode")}
      onClick={() => {
        void (async () => {
          // A refused clipboard write leaves the code SELECTED and the label
          // unchanged. Saying "copied" when nothing was is a lie the parent
          // only discovers when the other parent cannot connect.
          if (!(await copyRawId(code, codeRef.current))) return;
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        })();
      }}
    >
      <span ref={codeRef} className="link-code-value">
        {code}
      </span>
      <span className="link-code-hint" role="status" aria-live="polite">
        {copied ? t("parent.child.idCopied") : t("parent.child.idCopy")}
      </span>
    </button>
  );
}

export function ChildLinkPanel({
  initial,
  access,
  locale,
  dict,
}: {
  initial: ChildLinkState;
  access: AccessMap;
  locale: Locale;
  dict: Dict;
}) {
  const [state, setState] = useState(initial);
  const [accessMap, setAccessMap] = useState(access);
  const [codeChildId, setCodeChildId] = useState("");
  const [code, setCode] = useState("");
  // studentProfileId -> the code just issued for that child. Ephemeral by
  // design: it is not read back from the link state, because the state cannot
  // carry it — only the hash is stored.
  const [issued, setIssued] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const t = (key: string) => dict[key] ?? key;

  const canSubmitCode = codeChildId.length === 8 && code.length === 20 && !pending;

  const refresh = useCallback(async () => {
    const next = await childLinkStateAction();
    setState(next);
    // The access lists are resolved server-side for the first paint, but a
    // successful link GROWS the set of children — and a child with no entry in
    // the map renders "no other parent is linked yet" about the very child this
    // panel just added a second adult to.
    const lists = await Promise.all(next.children.map((c) => childAccessAdultsAction(c.id)));
    const map: AccessMap = {};
    next.children.forEach((child, i) => {
      map[child.id] = lists[i] ?? [];
    });
    setAccessMap(map);
  }, []);

  function submitCode() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await childLinkMutationAction({
          action: "redeem",
          childId: codeChildId,
          code,
        });
        if (!result.ok) {
          setFeedback({ scope: "code", tone: "danger", text: t(result.errorKey) });
          return;
        }
        // NO PENDING BRANCH. Under migration 180 a successful redeem IS the
        // link, so this reports a completed grant and never a submitted request.
        setCodeChildId("");
        setCode("");
        await refresh();
        setFeedback({ scope: "code", tone: "success", text: t("link.linkedNotice") });
      } catch {
        setFeedback({ scope: "code", tone: "danger", text: t("link.err.generic") });
      }
    });
  }

  function issueCode(studentId: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await childLinkMutationAction({ action: "issue", studentId });
        if (!result.ok) {
          setFeedback({ scope: studentId, tone: "danger", text: t(result.errorKey) });
          return;
        }
        // Narrowed on the FIELD rather than on the action: `issue` is the only
        // branch of the mutation result that carries a code, and a result
        // without one means the core rejected the shape it got back.
        if (!("code" in result)) {
          setFeedback({ scope: studentId, tone: "danger", text: t("link.err.generic") });
          return;
        }
        setIssued((prev) => ({
          ...prev,
          [studentId]: { code: result.code, expiresAt: result.expiresAt },
        }));
        setFeedback({ scope: studentId, tone: "success", text: t("link.codeReady") });
      } catch {
        setFeedback({ scope: studentId, tone: "danger", text: t("link.err.generic") });
      }
    });
  }

  function run(input: ChildLinkMutationInput, scope: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await childLinkMutationAction(input);
        if (!result.ok) {
          setFeedback({ scope, tone: "danger", text: t(result.errorKey) });
          return;
        }
        await refresh();
        setFeedback({ scope, tone: "success", text: t("link.success") });
      } catch {
        setFeedback({ scope, tone: "danger", text: t("link.err.generic") });
      }
    });
  }

  /** A plain render helper, deliberately NOT a component declared in here: a
   *  component defined during render is a new type on every render, so React
   *  remounts it — and a remounted `role="alert"` is announced again. */
  function message(scope: string) {
    if (!feedback || feedback.scope !== scope) return null;
    return feedback.tone === "danger" ? (
      <p className="notice danger" role="alert">
        {feedback.text}
      </p>
    ) : (
      <p className="notice success" role="status">
        {feedback.text}
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <p className="muted link-hint">{t("link.subtitle")}</p>

      {/* THE ONE WAY IN. It sat beside a sibling card until 2026-09-17, and the
          styling is deliberately no longer neutral between two options: this is
          the page's primary surface, accented and set apart from the per-child
          cards below it. A form that still looked like one of a matched pair
          would read as though the other half had failed to load. */}
      <div className="card stack link-form link-form-primary">
        <h2 className="link-way-title">{t("link.enterCode.title")}</h2>
        <p className="muted link-hint">{t("link.enterCode.body")}</p>

        <div className="field">
          <label htmlFor="link-code-child-id">{t("link.childId")}</label>
          <input
            id="link-code-child-id"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={codeChildId}
            disabled={pending}
            onChange={(e) => setCodeChildId(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>

        <div className="field">
          <label htmlFor="link-code">{t("link.code")}</label>
          <input
            id="link-code"
            className="link-code-input"
            autoComplete="off"
            spellCheck={false}
            // NO maxLength. It would truncate a PASTE before normalizeCode ever ran,
            // which defeats the normalizer's whole purpose: a code arrives in a chat
            // message as 4A2F-9C11-... and the readable form is LONGER than 20
            // characters, so the browser would clip the tail and the parent would be
            // told a correct code is wrong. normalizeCode already caps at 20 AFTER
            // stripping separators, which is the only order that works.
            value={code}
            disabled={pending}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmitCode) submitCode();
            }}
          />
        </div>

        <p className="muted link-hint">{t("link.codeHint")}</p>

        <button className="btn" disabled={!canSubmitCode} onClick={submitCode}>
          {pending ? t("state.loading") : t("link.request")}
        </button>

        {message("code")}
      </div>

      {state.children.map((child) => {
        const adults = accessMap[child.id] ?? [];
        const fresh = issued[child.id];
        return (
          <div className="card stack" key={child.id}>
            <div className="row link-child-head">
              <div>
                <h2>{child.name}</h2>
                {child.child_id ? <p className="muted">{child.child_id}</p> : null}
              </div>
              <span className="pill">{child.is_creator ? t("link.owner") : t("link.linked")}</span>
            </div>

            {/* THE CREATOR SIDE. Only the parent who created the child may issue
                a code, and only once that child HAS an 8-digit id — the RPC
                refuses both, so the button is not offered where it would be
                declined (the same reasoning as the revoke button below). */}
            {child.is_creator ? (
              <>
                <h3 className="link-access-title">{t("link.code")}</h3>
                {child.child_id ? (
                  <>
                    <p className="muted link-hint">{t("link.issueHint")}</p>
                    {fresh ? (
                      <div className="stack link-code-box">
                        <IssuedCode code={fresh.code} dict={dict} />
                        <p className="muted link-hint">
                          {t("link.codeExpires")} {formatLongDate(fresh.expiresAt, locale, true)}
                        </p>
                        {/* Said OUT LOUD, because it is the sharp edge of the
                            old flow: issuing revokes whatever code is already
                            outstanding for this child. */}
                        <p className="muted link-hint">{t("link.issueReplaces")}</p>
                      </div>
                    ) : null}
                    <button
                      className="btn secondary"
                      disabled={pending}
                      onClick={() => issueCode(child.id)}
                    >
                      {t("link.issue")}
                    </button>
                  </>
                ) : (
                  <p className="muted link-hint">{t("link.err.needsId")}</p>
                )}
              </>
            ) : null}

            <h3 className="link-access-title">{t("link.access.title")}</h3>
            {adults.length === 0 ? (
              <p className="muted">{t("link.noAdults")}</p>
            ) : (
              <ul className="link-access-list">
                {adults.map((adult) => (
                  <li className="row link-access-row" key={adult.profile_id}>
                    <span className="link-access-who">
                      <strong>{adultLabel(adult)}</strong>
                      {adult.email ? <span className="muted">{adult.email}</span> : null}
                      <span className="muted">
                        {adult.role === "creator" ? t("link.access.creator") : t("link.access.linked")}
                      </span>
                    </span>
                    {child.is_creator && adult.role === "linked" ? (
                      <button
                        className="btn secondary"
                        disabled={pending}
                        onClick={() =>
                          run(
                            { action: "revoke", studentId: child.id, parentId: adult.profile_id },
                            child.id,
                          )
                        }
                      >
                        {t("link.revoke")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {child.is_creator ? null : (
              <button
                className="btn secondary"
                disabled={pending}
                onClick={() => run({ action: "leave", studentId: child.id }, child.id)}
              >
                {t("link.leave")}
              </button>
            )}

            {message(child.id)}
          </div>
        );
      })}
    </div>
  );
}
