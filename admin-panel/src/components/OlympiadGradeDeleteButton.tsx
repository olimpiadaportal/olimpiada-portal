"use client";

// Per-grade pool deletion on the package edit page — the shared destructive
// dialog wired to the two grade branches of migration 111.
//
// Both branches belong in ONE dialog because they differ by a single flag and
// by their blocking rules, and the admin has to choose between them knowing
// both: detaching the grade removes it from the package (and the activation
// guard then only has to hold for the survivors), while merely emptying the
// pool leaves the grade targeted with nothing to serve — which is what demotes
// an ACTIVE package to inactive.
//
// The SAFE path stays where it was: "remove grade" in OlympiadGradesManager
// still calls remove_olympiad_package_grade, which archives the pool instead of
// destroying it. This dialog is the hard one, and it is deliberately one more
// click away.
import {
  deleteOlympiadGradePoolAction,
  loadOlympiadGradePoolDeletionPreview,
  type OlympiadGradePoolDeletionPreview,
} from "@/lib/admin/olympiad";
import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";

export type OlympiadGradeDeleteStrings = DestructiveConfirmStrings & {
  /** `{grade}` is substituted with the grade name. */
  questions: string;
  perAttempt: string;
  dropTitle: string;
  dropDesc: string;
  dropAction: string;
  purgeTitle: string;
  purgeDesc: string;
  purgeAction: string;
  /** Appended to the KEEP-the-grade branch only — see the preview comment. */
  demoteWarn: string;
};

/** `{grade}` substitution. split/join, never String.replace: a replacement
 *  string is parsed for `$` escapes and would corrupt any value containing one. */
function withGrade(text: string, grade: string): string {
  return text.split("{grade}").join(grade);
}

export function OlympiadGradeDeleteButton({
  packageId,
  gradeId,
  gradeName,
  strings,
}: {
  packageId: string;
  gradeId: string;
  gradeName: string;
  strings: OlympiadGradeDeleteStrings;
}) {
  return (
    <DestructiveConfirmDialog<OlympiadGradePoolDeletionPreview>
      strings={{ ...strings, title: withGrade(strings.title, gradeName) }}
      loadPreview={() => loadOlympiadGradePoolDeletionPreview(packageId, gradeId)}
      // The PACKAGE code, not the grade's: that is what the RPC compares, and
      // showing anything else here would be a confirmation nobody can satisfy.
      code={(p) => p.code}
      // Both branches empty a pool, so the checkbox applies to the whole dialog.
      needsAck
      triggerClassName="link-danger btn-sm"
      details={(p) => (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{p.gradeName}</strong> — {p.packageTitleAz}
          </p>
          <p className="muted">
            {strings.questions}: {p.questions.total} ({p.questions.deletable} /{" "}
            {p.questions.archivedInstead})
          </p>
          <p className="muted">
            {strings.perAttempt}: {p.questionsPerAttempt}
          </p>
        </>
      )}
    >
      {(p, gate) => (
        <>
          <DestructiveActionForm
            gate={gate}
            actionKey="drop"
            action={deleteOlympiadGradePoolAction}
            fields={{ __id: p.packageId, grade_id: p.gradeId, drop_grade: "1" }}
            title={strings.dropTitle}
            description={strings.dropDesc}
            label={strings.dropAction}
            blockedBy={p.dropGrade.blockedBy}
            needsAck
          />
          <DestructiveActionForm
            gate={gate}
            actionKey="purge"
            action={deleteOlympiadGradePoolAction}
            fields={{ __id: p.packageId, grade_id: p.gradeId, drop_grade: "0" }}
            title={strings.purgeTitle}
            // The demotion warning belongs to THIS branch only: dropping the
            // grade removes it from the activation check instead of leaving it
            // empty, so no demotion follows there.
            description={
              p.packageBecomesUnservable
                ? `${strings.purgeDesc} ${strings.demoteWarn}`
                : strings.purgeDesc
            }
            label={strings.purgeAction}
            blockedBy={p.keepGrade.blockedBy}
            needsAck
            disabled={p.questions.total === 0}
          />
        </>
      )}
    </DestructiveConfirmDialog>
  );
}
