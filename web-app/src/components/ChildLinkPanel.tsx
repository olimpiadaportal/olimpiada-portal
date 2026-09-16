"use client";

// THE EXISTING-CHILD ACCESS PANEL.
//
// This used to be a nomination flow: the parent typed a child id plus a one-time
// code, which created a request the creating parent had to approve. The owner
// removed approval on 2026-09-16, so the panel now asks for the child's OWN
// credentials and grants access immediately.
//
// WHAT WENT WITH THE APPROVAL STEP, and why the creator half of this panel is
// smaller than it was: issuing a code, approving and rejecting are all dead
// concepts. Revoking and leaving are NOT - a creator must still be able to take
// access away, and a linked adult must still be able to walk away - so those two
// remain on the same manage_child_link RPC they always used.
//
// The password is never held in component state longer than the submit, and is
// cleared on every outcome. It is a credential belonging to a child, not a form
// value to be echoed back on error.
import { useState, useTransition } from "react";
import {
  childLinkByCredentialsAction,
  childLinkMutationAction,
  childLinkStateAction,
} from "@/lib/auth/childLinkActions";
import type { ChildAccessAdult } from "@/lib/auth/childCredentialLink";
import type { ChildLinkMutationInput, ChildLinkState } from "@/lib/childLink";

type Dict = Record<string, string>;
type AccessMap = Record<string, ChildAccessAdult[]>;

function adultLabel(a: ChildAccessAdult): string {
  const parts = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return parts || a.display_name || "—";
}

export function ChildLinkPanel({
  initial,
  access,
  dict,
}: {
  initial: ChildLinkState;
  access: AccessMap;
  dict: Dict;
}) {
  const [state, setState] = useState(initial);
  const [childId, setChildId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = (key: string) => dict[key] ?? key;

  const canSubmit = childId.length === 8 && password.length > 0 && !pending;

  function submitCredentials() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await childLinkByCredentialsAction(childId, password);
        // Cleared on BOTH paths: a wrong password must not sit in the field
        // waiting to be resubmitted, and a correct one has done its job.
        setPassword("");
        if (!result.ok) {
          setError(t(result.errorKey));
          return;
        }
        setChildId("");
        setState(await childLinkStateAction());
        setNotice(t("link.linkedNotice"));
      } catch {
        setPassword("");
        setError(t("link.err.generic"));
      }
    });
  }

  function run(input: ChildLinkMutationInput) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await childLinkMutationAction(input);
        if (!result.ok) {
          setError(t(result.errorKey));
          return;
        }
        setState(await childLinkStateAction());
        setNotice(t("link.success"));
      } catch {
        setError(t("link.err.generic"));
      }
    });
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card stack link-form">
        <p className="muted">{t("link.subtitle")}</p>

        <div className="field">
          <label htmlFor="link-child-id">{t("link.childId")}</label>
          <input
            id="link-child-id"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={childId}
            disabled={pending}
            onChange={(e) => setChildId(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>

        <div className="field">
          <label htmlFor="link-child-password">{t("link.childPassword")}</label>
          <input
            id="link-child-password"
            type="password"
            autoComplete="off"
            value={password}
            disabled={pending}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submitCredentials();
            }}
          />
        </div>

        <p className="muted link-hint">{t("link.credentialsHint")}</p>

        <button className="btn" disabled={!canSubmit} onClick={submitCredentials}>
          {pending ? t("state.loading") : t("link.request")}
        </button>

        {error ? (
          <p className="notice danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="notice success" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      {state.children.map((child) => {
        const adults = access[child.id] ?? [];
        return (
          <div className="card stack" key={child.id}>
            <div className="row link-child-head">
              <div>
                <h2>{child.name}</h2>
                {child.child_id ? <p className="muted">{child.child_id}</p> : null}
              </div>
              <span className="pill">{child.is_creator ? t("link.owner") : t("link.linked")}</span>
            </div>

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
                        onClick={() => run({ action: "revoke", studentId: child.id, parentId: adult.profile_id })}
                      >
                        {t("link.revoke")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {child.is_creator ? null : (
              <button className="btn secondary" disabled={pending} onClick={() => run({ action: "leave", studentId: child.id })}>
                {t("link.leave")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
