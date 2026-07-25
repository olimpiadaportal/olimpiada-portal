"use client";

// Round 43 — RATED daily-round start gate. The fresh "Başla" button no longer
// jumps to topic selection: it opens a rules modal with the exam facts (25
// questions · no time limit · counts for the rating) + a required consent tick.
// Confirm submits the EXISTING startDailyRound server action (day="today") via
// a hidden form — the runner, scoring and 25-question generation are untouched.
// The server's one-per-day unique index is the real gate; this UI only mirrors
// it. All strings arrive translated (dict) so this island never touches i18n.
import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { startDailyRound } from "@/lib/auth/testActions";

export type DailyRoundStartDict = {
  /** Fresh-card button + modal confirm label ("Başla"). */
  start: string;
  rulesTitle: string;
  factQuestions: string;
  factNoLimit: string;
  factRated: string;
  ruleRated: string;
  ruleOnce: string;
  ruleNoLimit: string;
  ruleSaved: string;
  consent: string;
  cancel: string;
};

export function DailyRoundStart({
  subjectId,
  dict,
}: {
  subjectId: string;
  dict: DailyRoundStartDict;
}) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const openGate = () => {
    setConsent(false);
    setOpen(true);
  };
  const confirm = () => {
    if (!consent) return;
    // Hand off to the server action (redirects into the runner on success).
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <button type="button" className="arena-btn arena-btn-sm" onClick={openGate}>
        {dict.start}
      </button>

      {/* Hidden real form — the server action stays the single write path. */}
      <form ref={formRef} action={startDailyRound} style={{ display: "none" }}>
        <input type="hidden" name="subject_id" value={subjectId} />
        <input type="hidden" name="day" value="today" />
      </form>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={dict.rulesTitle}
        closeLabel={dict.cancel}
      >
        <div className="drs-facts">
          <span className="drs-fact mono">{dict.factQuestions}</span>
          <span className="drs-fact mono">∞ {dict.factNoLimit}</span>
          <span className="drs-fact mono">{dict.factRated}</span>
        </div>
        <ul className="drs-rules">
          <li>{dict.ruleRated}</li>
          <li>{dict.ruleOnce}</li>
          <li>{dict.ruleNoLimit}</li>
          <li>{dict.ruleSaved}</li>
        </ul>

        <label className="drs-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>{dict.consent}</span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            {dict.cancel}
          </button>
          <button type="button" className="btn" onClick={confirm} disabled={!consent}>
            {dict.start}
          </button>
        </div>
      </Modal>
    </>
  );
}
