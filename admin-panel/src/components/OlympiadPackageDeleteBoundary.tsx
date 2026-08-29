"use client";

// ONE package-deletion dialog for the whole package list, mounted ABOVE the
// table it deletes from.
//
// The obvious shape — a dialog inside each row's actions cell — is wrong here,
// and quietly so. A successful delete revalidates /olympiad, the revalidated
// list no longer contains that row, and React unmounts the row's whole subtree.
// The dialog is in that subtree, so the operation's result ("the package and
// its question pool were deleted", or the archive-instead sentence) is destroyed
// in the same commit that would have displayed it: the admin clicks, the row
// blinks out, and nothing ever says what happened. Hoisting the dialog above the
// table is what makes the outcome outlive the row.
//
// Rows therefore render only trigger buttons — Archive and Delete — and BOTH
// open this one hoisted dialog rather than one each: a second dialog would be a
// second copy of the bug above. The strings are handed in once, so a
// hundred-row list ships the dialog's copy once too.
//
// Mounted only while a package is targeted, and keyed by that package id: every
// opening is a fresh dialog, so a typed token — or the previous package's
// result — can never carry over into the next one.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  OlympiadPackageDeleteButton,
  type OlympiadPackageDeleteStrings,
} from "@/components/OlympiadPackageDeleteButton";

type BoundaryValue = {
  strings: OlympiadPackageDeleteStrings;
  target: (packageId: string) => void;
};

const Ctx = createContext<BoundaryValue | null>(null);

export function OlympiadPackageDeleteBoundary({
  strings,
  children,
}: {
  strings: OlympiadPackageDeleteStrings;
  /** The server-rendered list. Rendered as-is — the boundary adds no markup. */
  children: ReactNode;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = useCallback((packageId: string) => setTargetId(packageId), []);
  const value = useMemo<BoundaryValue>(() => ({ strings, target }), [strings, target]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {targetId && (
        <OlympiadPackageDeleteButton
          key={targetId}
          packageId={targetId}
          strings={strings}
          // The list page survives its own deletions — revalidatePath has
          // already dropped the row — so the action's /olympiad redirect is
          // suppressed and the admin keeps their filters.
          staysOnPage
          open
          onOpenChange={(next) => {
            if (!next) setTargetId(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** The row's Delete action. Destructive styling is the panel's `.link-danger`. */
export function OlympiadPackageDeleteTrigger({ packageId }: { packageId: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      className="link-danger"
      onClick={() => ctx.target(packageId)}
    >
      {ctx.strings.open}
    </button>
  );
}

/**
 * The row's Archive action — SAME context, SAME dialog, no second boundary.
 *
 * WHY IT IS ITS OWN BUTTON. Delete can be refused and often is: a package
 * somebody bought is never deleted (CLAUDE.md), so the admin met a disabled
 * control and a sentence recommending an archive they had nowhere to start.
 * Archiving is refused by nothing — buyers keep lifetime access either way — so
 * the row now names the operation that always works, in its own words, instead
 * of hiding it behind a label about deleting.
 *
 * It carries NO intent flag and the dialog needed no change to accept it: the
 * archive branch is already the dialog's first section and its button is gated
 * on nothing but an in-flight submission, so "which action to open on" has one
 * answer for both triggers. Adding an intent would be state to keep in sync for
 * no visible difference.
 *
 * The label travels with the trigger rather than joining `strings`: `strings`
 * is the DIALOG's copy, resolved once for the whole table, while this is the
 * LIST's word for one row action.
 *
 * Neutral `.link-button`, never `.link-danger` — red is reserved for the one
 * operation that destroys something.
 */
export function OlympiadPackageArchiveTrigger({
  packageId,
  label,
}: {
  packageId: string;
  label: string;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => ctx.target(packageId)}
    >
      {label}
    </button>
  );
}
