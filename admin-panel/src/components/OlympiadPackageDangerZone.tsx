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
import { useActionState } from "react";
import {
  archiveOlympiadPackage,
  unarchiveOlympiadPackageAction,
  type OlympiadDeletionState,
} from "@/lib/admin/olympiad";
import { ActionButton, SubmitButton } from "@/components/ActionButton";
import {
  OlympiadPackageDeleteButton,
  type OlympiadPackageDeleteStrings,
} from "@/components/OlympiadPackageDeleteButton";

// The delete dialog itself lives in OlympiadPackageDeleteButton — the package
// list renders the same one from its rows, and a second copy here would be a
// second place for the outcome/blocking copy to drift.
export type OlympiadPackageDangerStrings = OlympiadPackageDeleteStrings & {
  heading: string;
  archive: string;
  archiving: string;
  restore: string;
  restoring: string;
  restoreHint: string;
};

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
          <form action={archiveOlympiadPackage}>
            <input type="hidden" name="__id" value={packageId} />
            <SubmitButton className="link-danger" pendingLabel={strings.archiving}>
              {strings.archive}
            </SubmitButton>
          </form>
        )}

        {/* No `staysOnPage`: THIS page is the one the deletion destroys, so the
            action's fixed /olympiad redirect is the right ending here. */}
        <OlympiadPackageDeleteButton packageId={packageId} strings={strings} />
      </div>

      {isArchived && <p className="hint">{strings.restoreHint}</p>}
      {restoreState && !restoreState.ok && (
        <div role="alert">
          <span className="form-error">{restoreState.error}</span>
          <ul>
            {restoreState.blocks.map((b, i) => (
              <li key={i} className="form-error">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {restoreState && restoreState.ok && (
        <span className="form-ok" role="status">
          {restoreState.message}
        </span>
      )}
    </div>
  );
}
