"use client";

// Status controls for one question report — modelled on NewsLifecycle: one
// bare <form> per action so SubmitButton can read useFormStatus and show a
// pending label, with the whitelisted action name in a hidden field. The server
// action maps that name to an enum value; nothing here is trusted.
import { transitionQuestionReport } from "@/lib/admin/questionReports";
import { SubmitButton } from "@/components/ActionButton";

export function QuestionReportStatus({
  id,
  status,
  dict,
}: {
  id: string;
  status: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  const Action = ({ action, label }: { action: string; label: string }) => (
    <form action={transitionQuestionReport} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <SubmitButton className="btn-ghost" pendingLabel={tt("pend.processing")}>
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {/* Only the moves that make sense from here: an already-resolved report
          offers Reopen, never Resolve again. */}
      {status === "new" && (
        <Action action="in_review" label={tt("qrep.act.in_review")} />
      )}
      {(status === "new" || status === "in_review") && (
        <>
          <Action action="resolve" label={tt("qrep.act.resolve")} />
          <Action action="dismiss" label={tt("qrep.act.dismiss")} />
        </>
      )}
      {(status === "resolved" || status === "dismissed") && (
        <Action action="reopen" label={tt("qrep.act.reopen")} />
      )}
    </div>
  );
}
