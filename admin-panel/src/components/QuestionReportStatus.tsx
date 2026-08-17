"use client";

// Status controls for one question report — modelled on NewsLifecycle: one
// bare <form> per action so SubmitButton can read useFormStatus and show a
// pending label, with the whitelisted action name in a hidden field. The server
// action maps that name to an enum value; nothing here is trusted.
//
// THREE OF THESE BUTTONS WRITE TO THE STUDENT. Since migration 117 an UPDATE
// that lands question_reports.status on in_review, resolved or dismissed fires
// a database trigger that notifies the reporter in the language they filed in.
// Nothing in this file sends it — a second, app-side emitter would be a second
// insert path and would double-notify. The UI's whole job here is to make sure
// the admin knows: the natural next move is the PRIMARY button, everything else
// is ghost, and the line underneath names which clicks are heard outside.
import { transitionQuestionReport } from "@/lib/admin/questionReports";
import { SubmitButton } from "@/components/ActionButton";

export function QuestionReportStatus({
  id,
  status,
  /** false = anonymous or deleted reporter: nothing can be delivered. */
  notifiesReporter,
  dict,
}: {
  id: string;
  status: string;
  notifiesReporter: boolean;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  const Action = ({
    action,
    label,
    primary = false,
  }: {
    action: string;
    label: string;
    primary?: boolean;
  }) => (
    <form action={transitionQuestionReport} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <SubmitButton
        className={primary ? "btn" : "btn-ghost"}
        pendingLabel={tt("pend.processing")}
      >
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <div className="qrep-triage">
      <span className="qrep-triage-label">{tt("qrep.detail.actionsHeading")}</span>
      <div className="qrep-triage-row">
        {/* Only the moves that make sense from here, and the expected one first:
            an untouched report is picked up before it is closed, so "Start
            review" leads while it exists and "Mark resolved" leads after. An
            already-resolved report offers Reopen, never Resolve again. */}
        {status === "new" && (
          <Action action="in_review" label={tt("qrep.act.in_review")} primary />
        )}
        {(status === "new" || status === "in_review") && (
          <>
            <Action
              action="resolve"
              label={tt("qrep.act.resolve")}
              primary={status === "in_review"}
            />
            <Action action="dismiss" label={tt("qrep.act.dismiss")} />
          </>
        )}
        {(status === "resolved" || status === "dismissed") && (
          <Action action="reopen" label={tt("qrep.act.reopen")} />
        )}
      </div>
      <p className="hint">
        {notifiesReporter ? tt("qrep.notify.hint") : tt("qrep.notify.none")}
      </p>
    </div>
  );
}
