"use client";

// "Report a problem" (migration 115) — ONE control + dialog, mounted from both
// question surfaces (the runner's question head and the review card's footer)
// so there is no second implementation to keep in sync.
//
// Renders through the shared <Modal> primitive, so it inherits the portal,
// Escape/focus trap, body scroll lock and arena palette mirroring that every
// other dialog in the app has. Success is an IN-PLACE transition inside the
// same dialog rather than a toast: the web app has no toast infrastructure, and
// confirming where the user is already looking is the argument the repo's own
// mobile ConfirmModal makes for its in-dialog errorText.
import { useCallback, useId, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { reportQuestionProblem } from "@/lib/auth/reportActions";
import { REPORT_MESSAGE_MAX } from "@/lib/reportMessage";

export function ReportQuestionButton({
  questionId,
  attemptId,
  dict,
  block = false,
}: {
  questionId: string;
  attemptId: string | null;
  dict: Record<string, string>;
  /** Full-width quiet footer (review card) instead of an inline pill (runner). */
  block?: boolean;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // The review list mounts one of these per question; a hardcoded id would
  // collide with every sibling even though only one dialog can be open.
  const fieldId = useId();
  // A second Enter/click can fire before React re-renders and the `disabled`
  // attribute lands, so the latch — not the pending state — is what actually
  // prevents a double submit.
  const inFlight = useRef(false);

  const close = useCallback(() => {
    // While a request is in flight the overlay, Escape and × are all inert:
    // abandoning the dialog mid-submit would leave the child unsure whether
    // the report was filed.
    if (inFlight.current) return;
    setOpen(false);
  }, []);

  function openDialog() {
    setText("");
    setError(null);
    setSent(false);
    setOpen(true);
  }

  async function submit() {
    if (inFlight.current) return;
    if (text.trim() === "") {
      setError(tt("test.report.emptyErr"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await reportQuestionProblem({
        questionId,
        attemptId,
        message: text,
      });
      if (res.ok) setSent(true);
      else setError(tt(res.errorKey));
    } catch {
      setError(tt("test.report.err.generic"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const remaining = REPORT_MESSAGE_MAX - text.length;

  return (
    <>
      <button
        type="button"
        className={block ? "tst-report block" : "tst-report"}
        aria-label={tt("test.report.action")}
        onClick={openDialog}
      >
        <FlagIcon />
        <span className="tst-report-label">{tt("test.report.action")}</span>
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title={sent ? tt("test.report.successTitle") : tt("test.report.title")}
        closeLabel={tt("test.img.close")}
      >
        {sent ? (
          <>
            <p className="modal-message">{tt("test.report.successBody")}</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tt("test.report.done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-message">{tt("test.report.intro")}</p>
            <label className="tst-report-label-text" htmlFor={fieldId}>
              {tt("test.report.label")}
            </label>
            <textarea
              id={fieldId}
              className="tst-report-input"
              rows={5}
              maxLength={REPORT_MESSAGE_MAX}
              value={text}
              placeholder={tt("test.report.placeholder")}
              disabled={pending}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
            />
            <p className="tst-report-count mono">
              {tt("test.report.remaining").replace("{n}", String(remaining))}
            </p>
            {/* Not .arena-error: that rule paints from --red, which is only
                declared inside .arena (and on a light-theme palette-mirrored
                overlay). The dialog is portaled to <body>, so it uses the root
                --danger token instead and stays visible in every theme. */}
            {error && (
              <p className="tst-report-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={close}
                disabled={pending}
              >
                {tt("test.report.cancel")}
              </button>
              <button type="button" className="btn" onClick={submit} disabled={pending}>
                {pending ? tt("test.report.sending") : tt("test.report.submit")}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}
