"use client";

// Season-close + hard-reset controls for the /leaderboard admin page.
// Both actions confirm through the shared Modal; the hard reset additionally
// requires an explicit acknowledgement checkbox (double-confirm) because it
// permanently wipes the ledger, activity history and every cached point/streak.
// All strings arrive translated from the server page (lb.* family).
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  resetLeaderboard,
  type LeaderboardResetState,
} from "@/lib/admin/leaderboard";

export type LeaderboardResetStrings = {
  seasonButton: string;
  seasonTitle: string;
  seasonText: string;
  seasonConfirm: string;
  seasonDone: string;
  hardButton: string;
  hardTitle: string;
  hardText: string;
  hardAck: string;
  hardConfirm: string;
  hardDone: string;
  working: string;
  cancel: string;
  close: string;
  error: string;
};

export function LeaderboardResetControls({
  strings,
}: {
  strings: LeaderboardResetStrings;
}) {
  const [state, action, pending] = useActionState<
    LeaderboardResetState,
    FormData
  >(resetLeaderboard, null);

  const [open, setOpen] = useState<"season" | "hard" | null>(null);
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<"season" | "hard" | null>(null);

  // Close the dialog on success and show a transient success line.
  useEffect(() => {
    if (state?.ok && state.mode) {
      setOpen(null);
      setAck(false);
      setDone(state.mode);
      const timer = setTimeout(() => setDone(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const openDialog = (mode: "season" | "hard") => {
    setAck(false);
    setOpen(mode);
  };

  const errorText = state?.error && !state.ok ? strings.error : null;

  return (
    <div>
      <div className="row-actions" style={{ justifyContent: "flex-start", gap: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => openDialog("season")}
          disabled={pending}
        >
          {strings.seasonButton}
        </button>
        <button
          type="button"
          className="btn-warn"
          onClick={() => openDialog("hard")}
          disabled={pending}
        >
          {strings.hardButton}
        </button>
        {done === "season" && (
          <span className="inline-status ok" role="status">
            {strings.seasonDone}
          </span>
        )}
        {done === "hard" && (
          <span className="inline-status ok" role="status">
            {strings.hardDone}
          </span>
        )}
        {!open && errorText && (
          <span className="inline-status err" role="alert">
            {errorText}
          </span>
        )}
      </div>

      {/* ---- Close season (archive + zero the month) ---- */}
      <Modal
        isOpen={open === "season"}
        onClose={() => setOpen(null)}
        title={strings.seasonTitle}
        closeLabel={strings.close}
        busy={pending}
      >
        <form action={action} className="form">
          <input type="hidden" name="mode" value="season" />
          <p className="muted" style={{ marginTop: 0 }}>
            {strings.seasonText}
          </p>
          {errorText && (
            <span className="form-error" role="alert">
              {errorText}
            </span>
          )}
          <div className="row-actions" style={{ justifyContent: "flex-start" }}>
            <button type="submit" className="btn" disabled={pending}>
              {pending ? strings.working : strings.seasonConfirm}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOpen(null)}
              disabled={pending}
            >
              {strings.cancel}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Hard reset (destructive, double-confirm) ---- */}
      <Modal
        isOpen={open === "hard"}
        onClose={() => setOpen(null)}
        title={strings.hardTitle}
        closeLabel={strings.close}
        busy={pending}
      >
        <form action={action} className="form">
          <input type="hidden" name="mode" value="hard" />
          <p className="muted" style={{ marginTop: 0 }}>
            {strings.hardText}
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={pending}
              style={{ marginTop: 3 }}
            />
            <span>{strings.hardAck}</span>
          </label>
          {errorText && (
            <span className="form-error" role="alert">
              {errorText}
            </span>
          )}
          <div className="row-actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="submit"
              className="btn-warn"
              disabled={pending || !ack}
            >
              {pending ? strings.working : strings.hardConfirm}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOpen(null)}
              disabled={pending}
            >
              {strings.cancel}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
