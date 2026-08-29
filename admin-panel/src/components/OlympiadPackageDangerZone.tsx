"use client";

// The package edit page's lifecycle + deletion controls, in one place.
//
// Archive, restore and delete are three answers to the same question ("this
// package should not be here"), and the panel used to offer only the first —
// an archived package could never be brought back, and a package created by
// mistake could never be removed at all. Putting all three together is what
// makes the ordering readable: archive is reversible, restore is the inverse
// that was missing, delete is the one that is not.
//
// Restore lands the package on INACTIVE, never straight on active, and the hint
// says so: activating re-fires the pool guard (most archived packages have a
// pool too small to pass it) and would put the package back ON SALE under a
// sale window that may be long expired. The admin activates deliberately, from
// the form above, once the pool is ready.
//
// ARCHIVE REPORTS ITS OWN OUTCOME NOW. It used to be a bare `<form action={…}>`
// over a void server action that redirected to /olympiad whatever happened, so
// a refused archive left the same screen as a successful one and read as "the
// system blocked me". It shares the archive action with the dialog below, which
// offers the same operation from the list — one action, two entry points, so
// the two screens cannot drift.
import { useActionState } from "react";
import {
  archiveOlympiadPackageAction,
  unarchiveOlympiadPackageAction,
  type OlympiadDeletionState,
} from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";
import {
  OlympiadPackageDeleteButton,
  type OlympiadPackageDeleteStrings,
} from "@/components/OlympiadPackageDeleteButton";

// The delete/archive dialog itself lives in OlympiadPackageDeleteButton — the
// package list renders the same one from its rows, and a second copy here would
// be a second place for the outcome/blocking copy to drift.
export type OlympiadPackageDangerStrings = OlympiadPackageDeleteStrings & {
  heading: string;
  restore: string;
  restoring: string;
  restoreHint: string;
};

/** A finished result — success or a counted refusal — under one control. */
function Result({ state }: { state: OlympiadDeletionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <span className="form-ok" role="status">
        {state.message}
      </span>
    );
  }
  return (
    <div role="alert">
      <span className="form-error">{state.error}</span>
      {state.blocks.length > 0 && (
        <ul>
          {state.blocks.map((b, i) => (
            <li key={i} className="form-error">
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OlympiadPackageDangerZone({
  packageId,
  isArchived,
  strings,
}: {
  packageId: string;
  isArchived: boolean;
  strings: OlympiadPackageDangerStrings;
}) {
  const [restoreState, restoreAction, restorePending] = useActionState<
    OlympiadDeletionState,
    FormData
  >(unarchiveOlympiadPackageAction, null);
  const [archiveState, archiveAction, archivePending] = useActionState<
    OlympiadDeletionState,
    FormData
  >(archiveOlympiadPackageAction, null);

  return (
    <div>
      <h3>{strings.heading}</h3>

      <div className="row-actions" style={{ justifyContent: "flex-start", gap: 16 }}>
        {isArchived ? (
          <form action={restoreAction}>
            <input type="hidden" name="__id" value={packageId} />
            <ActionButton
              className="btn-ghost"
              pending={restorePending}
              pendingLabel={strings.restoring}
            >
              {strings.restore}
            </ActionButton>
          </form>
        ) : (
          <form action={archiveAction}>
            <input type="hidden" name="__id" value={packageId} />
            {/* Not `.link-danger`: archiving is the SAFE answer here — it stops
                new sales and leaves every buyer whole — and dressing it as a
                destructive action is what pushed admins towards Delete. */}
            <ActionButton
              className="btn-ghost"
              pending={archivePending}
              pendingLabel={strings.archiving}
            >
              {strings.archiveAction}
            </ActionButton>
          </form>
        )}

        {/* No `staysOnPage`: THIS page is the one the deletion destroys, so the
            action's fixed /olympiad redirect is the right ending here. */}
        <OlympiadPackageDeleteButton packageId={packageId} strings={strings} />
      </div>

      {isArchived && <p className="hint">{strings.restoreHint}</p>}
      <Result state={archiveState} />
      <Result state={restoreState} />
    </div>
  );
}
