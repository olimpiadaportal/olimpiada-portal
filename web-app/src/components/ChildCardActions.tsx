"use client";

import { useActionState, useState } from "react";
import {
  resetChildPasswordAction,
  deleteChild,
  type ChildOpState,
} from "@/lib/auth/parentService";

export function ChildCardActions({
  studentProfileId,
  dict,
}: {
  studentProfileId: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState<ChildOpState, FormData>(
    resetChildPasswordAction,
    null,
  );

  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn-ghost" onClick={() => setShow((v) => !v)}>
        {tt("child.resetPw")}
      </button>
      <form
        action={deleteChild}
        onSubmit={(e) => {
          if (!confirm(tt("child.deleteConfirm"))) e.preventDefault();
        }}
      >
        <input type="hidden" name="student_profile_id" value={studentProfileId} />
        <button type="submit" className="link-danger">
          {tt("child.deleteChild")}
        </button>
      </form>

      {show && (
        <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexBasis: "100%" }}>
          <input type="hidden" name="student_profile_id" value={studentProfileId} />
          <input
            name="new_password"
            type="password"
            minLength={8}
            required
            placeholder={tt("child.newPassword")}
          />
          <button type="submit" className="btn-ghost" disabled={pending}>
            {tt("child.resetPwSubmit")}
          </button>
          {state?.ok && <span className="muted">{tt("child.resetPwOk")}</span>}
          {state?.error && <span className="form-error">{state.error}</span>}
        </form>
      )}
    </div>
  );
}
