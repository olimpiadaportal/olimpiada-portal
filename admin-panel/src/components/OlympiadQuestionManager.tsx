"use client";

// Question-pool manager for ONE olympiad package (Round 21 item 2): list +
// client-side text search + Add/Edit modals + Archive/Restore/Delete row
// actions. Follows the NewQuestionModal pattern — mutations return state, the
// modal closes and router.refresh() re-renders the SERVER list in place (no
// full page reload). Rows come pre-shaped from the server page; the full
// editable payload of a question is fetched on demand for the edit modal.
//
// Round 53 adds SELECTION + BULK DELETE (migration 112). Two properties are
// deliberate and load-bearing:
//
//   1. THE SELECTION IS SCOPED TO WHAT IS ON SCREEN. Changing the search box or
//      the grade filter prunes it. A tick that survives out of view is a row
//      the admin cannot re-read before confirming, and the toolbar's count
//      would stop describing the table under it — which is precisely how a
//      bulk delete removes something nobody meant to remove.
//   2. THE COPY MATCHES WHAT THE DATABASE DOES. The RPC delegates disposal to
//      purge_question_set: unanswered questions are DELETED, answered ones are
//      ARCHIVED, and which is which is decided inside that transaction. So the
//      dialog promises the rule, never a per-row outcome, and the result line
//      afterwards reports the two counts the action actually returned.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";
import {
  OlympiadQuestionForm,
} from "@/components/OlympiadQuestionForm";
import {
  deleteOlympiadPackageQuestion,
  deleteOlympiadQuestionsAction,
  setOlympiadPoolQuestionsStatusAction,
  setOlympiadPoolQuestionStatus,
  loadOlympiadPoolQuestion,
  type OlympiadPoolQuestionData,
} from "@/lib/admin/olympiad";
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";
import { displayLabelComparator } from "@/lib/admin/subject-display";

export type OlympiadPoolRow = {
  id: string;
  num: number;
  gradeName: string;
  /** Empty string = no grade. A legal state for a pool row, and the reason
   *  the grade filter needs a NO_GRADE sentinel rather than a plain match. */
  gradeId: string;
  excerpt: string;
  search: string; // lowercased text blob for the client-side filter
  optionCount: number;
  hasImage: boolean;
  status: string;
  updatedAt: string;
};

const OPTION_COUNT = 5;

/** Sentinel for "rows with no grade". A plain "" already means "all". */
const NO_GRADE = "\u0000none";

/**
 * Copy for the selection toolbar and its confirmation dialog. Passed from the
 * server page (already translated) rather than looked up here — same contract
 * as every other destructive control in the panel.
 */
export type OlympiadPoolBulkStrings = DestructiveConfirmStrings & {
  /** Both are REQUIRED here: this dialog always asks for the package code. */
  codeLabel: string;
  codeHint: string;
  /** `{n}` — the toolbar count ("3 seçilib" / "3 selected" / "Выбрано: 3"). */
  selected: string;
  selectAll: string;
  selectRow: string;
  clear: string;
  count: string;
  grades: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;
};

/** What the confirmation dialog counts — a snapshot taken when it opens. */
type BulkPreview = {
  ids: string[];
  total: number;
  grades: string[];
  /** The package's confirmation code, typed by the admin and re-checked by the DB. */
  code: string;
};

export function OlympiadQuestionManager({
  dict,
  locale,
  bulkStrings,
  packageId,
  packageCode,
  subjectName,
  packageGrades,
  rows,
  floors,
}: {
  dict: Record<string, string>;
  /** The admin's own language. Every label here arrives pre-translated from the
   *  server, so the ONLY thing this needs it for is COLLATION: the grade filter
   *  and the bulk dialog both order display labels, and az/en/ru do not agree
   *  on an alphabet. Required rather than defaulted — a defaulted locale is a
   *  call site that silently orders a Russian admin's list in Azerbaijani. */
  locale: string;
  bulkStrings: OlympiadPoolBulkStrings;
  packageId: string;
  /** Shown and demanded by the bulk dialog; the RPC compares it under lock. */
  packageCode: string;
  subjectName: string;
  packageGrades: { value: string; label: string }[];
  rows: OlympiadPoolRow[];
  /** Per-grade published-pool floor, for the pre-flight preview. */
  floors: { gradeId: string; label: string; perAttempt: number }[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  // One collator for every label list on this screen (2026-09-10). Grade labels
  // are numbers wearing a suffix — "3-cü sinif", "10-cu sinif" — so the
  // comparator's `numeric` option is doing visible work here, on top of the
  // reader's alphabet.
  const byLabel = useMemo(() => displayLabelComparator(locale), [locale]);

  const [search, setSearch] = useState("");
  // A SET, not a string: the owner asked for "Grade 3 + Grade 5" as a single
  // view. An EMPTY set means ALL — never "none" — so the table opens showing
  // everything, and clearing the last tick returns to that rather than blanking.
  const [gradeSel, setGradeSel] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editData, setEditData] = useState<OlympiadPoolQuestionData | null>(null);
  // Row-level busy/error feedback (edit prefill fetch, delete, archive).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which of the row's buttons is in flight — only that one shows the spinner;
  // the row's other buttons just disable.
  const [busyAct, setBusyAct] = useState<"edit" | "delete" | "archive" | "restore" | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // While a save/upload is in flight the modal must not be dismissable.
  const [formBusy, setFormBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    // Empty set = no grade filter at all. AND-ed with search in the SAME memo,
    // which is what keeps the selection-pruning effect below covering it.
    if (gradeSel.size > 0) {
      out = out.filter((r) => gradeSel.has(r.gradeId || NO_GRADE));
    }
    if (q) out = out.filter((r) => r.search.includes(q));
    return out;
  }, [rows, search, gradeSel]);

  /**
   * Grade options: the grades ACTUALLY PRESENT in this pool, unioned with the
   * package's current target grades.
   *
   * Neither source alone is correct. Target grades alone would drop a grade
   * that was removed from the package after its questions were uploaded —
   * those rows still exist and must stay reachable. Present grades alone would
   * hide a target grade whose pool is empty, which is exactly the grade an
   * admin most needs to notice.
   */
  const gradeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const g of packageGrades) byId.set(g.value, g.label);
    for (const r of rows) if (r.gradeId && !byId.has(r.gradeId)) byId.set(r.gradeId, r.gradeName);
    const opts = Array.from(byId, ([value, label]) => ({ value, label }));
    // In the READER's collation. A bare localeCompare() here ordered the grade
    // filter in the server runtime's default locale — the same order for every
    // admin, in nobody's alphabet — and left "10-cu sinif" sitting above
    // "3-cü sinif" because it compared the digits as text.
    opts.sort((a, b) => byLabel(a.label, b.label));
    return opts;
  }, [rows, packageGrades, byLabel]);

  /** Grade-less rows are legal; without their own option they are unreachable. */
  const anyWithoutGrade = useMemo(() => rows.some((r) => !r.gradeId), [rows]);

  const toggleGrade = useCallback((value: string) => {
    setGradeSel((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  // ---- Bulk selection ------------------------------------------------------
  const [sel, setSel] = useState<Set<string>>(new Set());
  // The dialog is mounted HERE, not inside the toolbar, and this is the reason:
  // a successful delete clears the selection, the toolbar is rendered only while
  // something is selected, and a dialog living in it would be unmounted by its
  // own success — taking the result sentence with it. Mounted only while open,
  // so every opening starts from a clean useActionState instead of showing the
  // previous run's message.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const headCheck = useRef<HTMLInputElement>(null);

  // Property 1 in the file header: a tick may not outlive its row's visibility.
  // `filtered` is memoized, so this settles in one pass per filter change and
  // is a no-op while the admin is only ticking boxes.
  useEffect(() => {
    setSel((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((r) => r.id));
      const next = new Set<string>();
      let dropped = false;
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else dropped = true;
      }
      return dropped ? next : prev;
    });
  }, [filtered]);

  // Bulk status (archive / restore) — migration 144. Kept separate from the
  // delete dialog's state so closing one cannot leave the other half-open.
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<"archived" | "published">("archived");

  /** How many of the ticked rows are currently archived (drives Restore). */
  const selectedArchived = useMemo(
    () => rows.filter((r) => sel.has(r.id) && r.status === "archived").length,
    [rows, sel],
  );

  /**
   * What the selection does to each grade's PUBLISHED count.
   *
   * Only published rows count as leaving — an already-archived row that is
   * ticked contributes nothing, which mirrors the server predicate. Restoring
   * only grows a pool, so the preview is shown for the archive direction alone.
   */
  const floorPreview = useMemo(() => {
    if (sel.size === 0) return [];
    return floors
      .map((f) => {
        const before = rows.filter(
          (r) => r.gradeId === f.gradeId && r.status === "published",
        ).length;
        const leaving = rows.filter(
          (r) => r.gradeId === f.gradeId && r.status === "published" && sel.has(r.id),
        ).length;
        if (leaving === 0) return null;
        const after = before - leaving;
        return {
          gradeId: f.gradeId,
          label: f.label,
          before,
          after,
          min: f.perAttempt,
          short: f.perAttempt > 0 && after < f.perAttempt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rows, sel, floors]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => sel.has(r.id));
  const someVisibleSelected = sel.size > 0 && !allVisibleSelected;

  // `indeterminate` is a DOM property with no HTML attribute — set from an
  // effect or the tri-state header checkbox silently renders as plain unchecked.
  useEffect(() => {
    if (headCheck.current) headCheck.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleRow(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSel(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  const clearSelection = useCallback(() => setSel(new Set()), []);

  // Stable (DestructiveActionForm runs it from an effect). revalidatePath inside
  // the server action already re-rendered the table; the selection is dropped
  // because the rows it pointed at are either gone or now archived, and the
  // branch retires so a second click cannot re-post ids that no longer resolve.
  // router.refresh() is belt-and-braces — the row-level actions here have always
  // called it, and a table still showing deleted questions is the one outcome
  // this must not have.
  const onBulkDeleted = useCallback(() => {
    setBulkDone(true);
    setSel(new Set());
    router.refresh();
  }, [router]);

  // Snapshot at open time, deliberately: what the dialog counts is exactly what
  // the form posts, even if the table refreshes underneath. There is no preview
  // RPC here and there should not be — the delete/archive split is decided
  // inside the delete itself, so any number promised here would be a guess.
  const loadBulkPreview = async (): Promise<BulkPreview> => {
    const chosen = filtered.filter((r) => sel.has(r.id));
    return {
      ids: chosen.map((r) => r.id),
      total: chosen.length,
      // Same collation as the grade filter above. A bare `.sort()` compares
      // UTF-16 code units, so the confirmation dialog for a delete listed the
      // grades as 10, 11, 3 — the one place on this screen where an admin is
      // asked to read a list carefully before agreeing to destroy something.
      grades: Array.from(new Set(chosen.map((r) => r.gradeName))).sort(byLabel),
      code: packageCode,
    };
  };

  // Same snapshot discipline as the delete dialog: what the dialog counts is
  // exactly what the form posts, even if the table refreshes underneath.
  // Archiving only ever acts on rows that are currently PUBLISHED (and
  // restoring on ARCHIVED ones) -- sending the rest would inflate the number
  // the admin reads without changing anything, since the RPC skips them.
  const loadStatusPreview = async (): Promise<BulkPreview> => {
    const want = statusTarget === "archived" ? "published" : "archived";
    const chosen = filtered.filter((r) => sel.has(r.id) && r.status === want);
    return {
      ids: chosen.map((r) => r.id),
      total: chosen.length,
      // The delete dialog's twin, and it gets the reader's collation for the
      // same reason: an archive is refusable and demoting, so the grade list is
      // read before the button is pressed.
      grades: Array.from(new Set(chosen.map((r) => r.gradeName))).sort(byLabel),
      code: packageCode,
    };
  };

  const onBulkStatusDone = useCallback(() => {
    setStatusOpen(false);
    setSel(new Set());
    router.refresh();
  }, [router]);

  function closeModals() {
    setAddOpen(false);
    setEditData(null);
  }

  function onSaved() {
    closeModals();
    router.refresh();
  }

  async function onEdit(id: string) {
    setRowError(null);
    setBusyId(id);
    setBusyAct("edit");
    try {
      const data = await loadOlympiadPoolQuestion(packageId, id);
      if (!data) {
        setRowError({ id, message: tt("olyq.loadFailed") });
        return;
      }
      setEditData(data);
    } catch {
      setRowError({ id, message: tt("olyq.loadFailed") });
    } finally {
      setBusyId(null);
      setBusyAct(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm(tt("olyq.confirmDelete"))) return;
    setRowError(null);
    setBusyId(id);
    setBusyAct("delete");
    try {
      const fd = new FormData();
      fd.set("__package_id", packageId);
      fd.set("__id", id);
      const res = await deleteOlympiadPackageQuestion(fd);
      if (res?.error) {
        setRowError({ id, message: res.error });
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setBusyAct(null);
    }
  }

  async function onStatus(id: string, action: "archive" | "restore") {
    setRowError(null);
    setBusyId(id);
    setBusyAct(action);
    try {
      const fd = new FormData();
      fd.set("__package_id", packageId);
      fd.set("__id", id);
      fd.set("__action", action);
      const res = await setOlympiadPoolQuestionStatus(fd);
      if (res?.error) {
        setRowError({ id, message: res.error });
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setBusyAct(null);
    }
  }

  function statusPill(status: string) {
    const cls =
      status === "published"
        ? "pill pill-sm pill-ok"
        : status === "archived"
          ? "pill pill-sm pill-muted"
          : "pill pill-sm pill-warn";
    return <span className={cls}>{tt(`olyq.status.${status}`)}</span>;
  }

  return (
    <div>
      <div className="row-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setAddOpen(true)}>
          {tt("olyq.add")}
        </button>
        <input
          type="text"
          value={search}
          placeholder={tt("olyq.search")}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {/* GRADE FILTER — multi-select, and rendered even for a single-grade
            package so the admin can always see which grades exist. Checkboxes
            rather than <select multiple>: deselecting one entry of a native
            multi-select needs ctrl-click, which is not discoverable, and this
            control sits directly above a select-all + bulk delete. */}
        {(gradeOptions.length > 0 || anyWithoutGrade) && (
          <div className="oly-gradefilter" role="group" aria-label={tt("olyq.filter.grades")}>
            <button
              type="button"
              className={gradeSel.size === 0 ? "chip chip-on" : "chip"}
              aria-pressed={gradeSel.size === 0}
              onClick={() => setGradeSel(new Set())}
            >
              {tt("olyq.allGrades")}
            </button>
            {gradeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                className={gradeSel.has(o.value) ? "chip chip-on" : "chip"}
                aria-pressed={gradeSel.has(o.value)}
                onClick={() => toggleGrade(o.value)}
              >
                {o.label}
              </button>
            ))}
            {anyWithoutGrade && (
              <button
                type="button"
                className={gradeSel.has(NO_GRADE) ? "chip chip-on" : "chip"}
                aria-pressed={gradeSel.has(NO_GRADE)}
                onClick={() => toggleGrade(NO_GRADE)}
              >
                {tt("olyq.filter.gradeNone")}
              </button>
            )}
          </div>
        )}
        {/* The honest counterweight to a filter that can legitimately match
            nothing: a grade filter can exclude every row, and without this
            line an empty table reads as a bug rather than as a filter. */}
        <span className="muted" style={{ marginInlineStart: "auto" }}>
          {fillTemplate(tt("olyq.filter.showing"), {
            shown: filtered.length,
            total: rows.length,
          })}
        </span>
      </div>

      {/* How to swap a pool safely. Append first, retire second -- the other
          order drops the published pool below its per-attempt floor, which is
          refused outright on a purchased grade and silently demotes the package
          on an unpurchased one. */}
      <p className="hint" style={{ marginTop: 0 }}>{tt("olyq.replaceHint")}</p>

      {/* The panel's shipped bulk toolbar (.bulk-bar / .bulk-count), same as
          the general questions table — it appears above the table only while
          something is selected. The dialog itself is mounted at the bottom of
          this component; see the bulkOpen declaration for why. */}
      {sel.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">
            {fillTemplate(bulkStrings.selected, { n: sel.size })}
          </span>
          <button type="button" className="btn-ghost" onClick={clearSelection}>
            {bulkStrings.clear}
          </button>
          <span className="bulk-spacer" />
          {/* ARCHIVE is offered before DELETE, and deliberately: it removes the
              questions from every future attempt just as deleting does, but past
              results stay readable and each row can be restored. Delete keeps
              its danger styling; archive does not earn it. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setStatusTarget("archived");
              setStatusOpen(true);
            }}
          >
            {tt("olyq.bulk.archive")}
          </button>
          {selectedArchived > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setStatusTarget("published");
                setStatusOpen(true);
              }}
            >
              {tt("olyq.bulk.restore")}
            </button>
          )}
          <button
            type="button"
            className="link-danger"
            onClick={() => {
              setBulkDone(false);
              setBulkOpen(true);
            }}
          >
            {bulkStrings.open}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted">{tt("olyq.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{tt("olyq.noMatch")}</p>
      ) : (
        // Nine columns: below the table's min-width this scrolls sideways
        // instead of crushing the action buttons.
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    ref={headCheck}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label={bulkStrings.selectAll}
                  />
                </th>
                <th>{tt("olyq.col.num")}</th>
                <th>{tt("olyq.grade")}</th>
                <th>{tt("olyq.col.body")}</th>
                <th>{tt("olyq.col.options")}</th>
                <th>{tt("olyq.col.image")}</th>
                <th>{tt("olyq.col.status")}</th>
                <th>{tt("olyq.col.updated")}</th>
                <th>{tt("olyq.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={sel.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      aria-label={bulkStrings.selectRow}
                    />
                  </td>
                  <td>{r.num}</td>
                  <td className="col-narrow">{r.gradeName}</td>
                  <td>{r.excerpt}</td>
                  <td>
                    {r.optionCount}
                    {r.optionCount !== OPTION_COUNT && (
                      <>
                        {" "}
                        <span
                          className="pill pill-sm pill-warn pill-inline"
                          title={tt("olyq.optWarnTitle")}
                        >
                          ≠ 5
                        </span>
                      </>
                    )}
                  </td>
                  <td title={r.hasImage ? tt("olyq.imgYes") : undefined}>
                    {r.hasImage ? "●" : "—"}
                  </td>
                  <td>{statusPill(r.status)}</td>
                  <td>{r.updatedAt}</td>
                  <td>
                    <div className="row-actions">
                      <ActionButton
                        type="button"
                        className="btn-ghost"
                        pending={busyId === r.id && busyAct === "edit"}
                        pendingLabel={tt("pend.loading")}
                        onClick={() => onEdit(r.id)}
                        disabled={busyId === r.id}
                      >
                        {tt("olyq.edit")}
                      </ActionButton>
                      {r.status === "archived" ? (
                        <ActionButton
                          type="button"
                          className="btn-ghost"
                          pending={busyId === r.id && busyAct === "restore"}
                          pendingLabel={tt("pend.processing")}
                          onClick={() => onStatus(r.id, "restore")}
                          disabled={busyId === r.id}
                        >
                          {tt("olyq.restore")}
                        </ActionButton>
                      ) : (
                        <ActionButton
                          type="button"
                          className="btn-ghost"
                          pending={busyId === r.id && busyAct === "archive"}
                          pendingLabel={tt("pend.processing")}
                          onClick={() => onStatus(r.id, "archive")}
                          disabled={busyId === r.id}
                        >
                          {tt("olyq.archive")}
                        </ActionButton>
                      )}
                      <ActionButton
                        type="button"
                        className="link-danger"
                        pending={busyId === r.id && busyAct === "delete"}
                        pendingLabel={tt("pend.deleting")}
                        onClick={() => onDelete(r.id)}
                        disabled={busyId === r.id}
                      >
                        {tt("olyq.delete")}
                      </ActionButton>
                    </div>
                    {rowError?.id === r.id && (
                      <p className="form-error">{rowError.message}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={addOpen}
        onClose={closeModals}
        title={tt("olyq.new.title")}
        closeLabel={tt("olyq.close")}
        busy={formBusy}
        wide
      >
        <OlympiadQuestionForm
          dict={dict}
          packageId={packageId}
          subjectName={subjectName}
          packageGrades={packageGrades}
          onSaved={onSaved}
          onBusyChange={setFormBusy}
        />
      </Modal>

      <Modal
        isOpen={editData != null}
        onClose={closeModals}
        title={tt("olyq.edit.title")}
        closeLabel={tt("olyq.close")}
        busy={formBusy}
        wide
      >
        {editData && (
          <OlympiadQuestionForm
            key={editData.id}
            dict={dict}
            packageId={packageId}
            questionId={editData.id}
            subjectName={subjectName}
            packageGrades={packageGrades}
            defaultGradeId={editData.gradeId}
            defaults={editData}
            onSaved={onSaved}
            onBusyChange={setFormBusy}
          />
        )}
      </Modal>

      {/* Bulk delete, mounted OUTSIDE the toolbar that triggers it — clearing
          the selection on success hides that toolbar, and a dialog inside it
          would be unmounted by the very result it exists to report. */}
      {bulkOpen && (
        <DestructiveConfirmDialog<BulkPreview>
          strings={bulkStrings}
          loadPreview={loadBulkPreview}
          // The package's own code, typed out — and re-compared by the RPC
          // under the package's row lock. The dialog cannot be the control: the
          // RPC is granted to `authenticated`, so it is a PostgREST endpoint an
          // admin session can POST 500 ids at without ever opening this screen.
          code={(p) => p.code}
          // …and the acknowledgement on top, because this branch empties part
          // of a pool. Same friction the grade-pool dialog demands.
          needsAck
          open
          onOpenChange={(next) => {
            if (!next) setBulkOpen(false);
          }}
          details={(p) => (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>
                  {bulkStrings.count}: {p.total}
                </strong>
              </p>
              {p.grades.length > 0 && (
                <p className="muted">
                  {bulkStrings.grades}: {p.grades.join(", ")}
                </p>
              )}
            </>
          )}
        >
          {(p, gate) => (
            <DestructiveActionForm
              gate={gate}
              actionKey="bulk-delete"
              action={deleteOlympiadQuestionsAction}
              // The wire shape the action expects: the package id plus the
              // comma-joined ids of the snapshot this dialog counted on open.
              fields={{ __package_id: packageId, ids: p.ids.join(",") }}
              title={bulkStrings.deleteTitle}
              description={bulkStrings.deleteDesc}
              label={bulkStrings.deleteAction}
              // The ids on screen have been consumed; re-posting them would ask
              // the RPC to delete rows that no longer resolve, and it refuses
              // the whole call for exactly that.
              disabled={p.total === 0 || bulkDone}
              onSuccess={onBulkDeleted}
            />
          )}
        </DestructiveConfirmDialog>
      )}

      {statusOpen && (
        /* TOKEN-FREE, unlike the delete dialog. Archiving is reversible per row,
           so demanding the package code typed out is friction that buys nothing
           -- the acknowledgement is the control here. The DATABASE still
           re-checks the code under the package lock; the action passes it,
           which is what stops a hand-crafted POST skipping the check. */
        <DestructiveConfirmDialog<BulkPreview>
          strings={bulkStrings}
          loadPreview={loadStatusPreview}
          needsAck={statusTarget === "archived"}
          open
          onOpenChange={(next) => {
            if (!next) setStatusOpen(false);
          }}
          details={(p) => (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>
                  {bulkStrings.count}: {p.total}
                </strong>
              </p>
              {p.grades.length > 0 && (
                <p className="muted">
                  {bulkStrings.grades}: {p.grades.join(", ")}
                </p>
              )}
            </>
          )}
        >
          {(p, gate) => (
            <DestructiveActionForm
              gate={gate}
              actionKey={`bulk-${statusTarget}`}
              action={setOlympiadPoolQuestionsStatusAction}
              fields={{
                __package_id: packageId,
                __code: packageCode,
                __status: statusTarget,
                ids: p.ids.join(","),
              }}
              title={tt(
                statusTarget === "archived"
                  ? "olyq.bulk.archiveTitle"
                  : "olyq.bulk.restoreTitle",
              )}
              description={tt(
                statusTarget === "archived"
                  ? "olyq.bulk.archiveBody"
                  : "olyq.bulk.restoreBody",
              )}
              label={tt(
                statusTarget === "archived"
                  ? "olyq.bulk.archive"
                  : "olyq.bulk.restore",
              )}
              onSuccess={onBulkStatusDone}
            />
          )}
        </DestructiveConfirmDialog>
      )}
    </div>
  );
}
