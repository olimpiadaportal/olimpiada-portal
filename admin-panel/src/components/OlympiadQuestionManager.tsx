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
  type OlympiadPoolTopic,
  type OlympiadPoolSubtopic,
} from "@/components/OlympiadQuestionForm";
import {
  deleteOlympiadPackageQuestion,
  deleteOlympiadQuestionsAction,
  setOlympiadPoolQuestionStatus,
  loadOlympiadPoolQuestion,
  type OlympiadPoolQuestionData,
} from "@/lib/admin/olympiad";
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";

export type OlympiadPoolRow = {
  id: string;
  num: number;
  gradeName: string;
  gradeId: string;
  excerpt: string;
  search: string; // lowercased text blob for the client-side filter
  optionCount: number;
  hasImage: boolean;
  status: string;
  updatedAt: string;
};

const OPTION_COUNT = 5;

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
  bulkStrings,
  packageId,
  packageCode,
  subjectName,
  packageGrades,
  topics,
  subtopics,
  rows,
}: {
  dict: Record<string, string>;
  bulkStrings: OlympiadPoolBulkStrings;
  packageId: string;
  /** Shown and demanded by the bulk dialog; the RPC compares it under lock. */
  packageCode: string;
  subjectName: string;
  packageGrades: { value: string; label: string }[];
  topics: OlympiadPoolTopic[];
  subtopics: OlympiadPoolSubtopic[];
  rows: OlympiadPoolRow[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
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
    if (gradeFilter) out = out.filter((r) => r.gradeId === gradeFilter);
    if (q) out = out.filter((r) => r.search.includes(q));
    return out;
  }, [rows, search, gradeFilter]);

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
      grades: Array.from(new Set(chosen.map((r) => r.gradeName))).sort(),
      code: packageCode,
    };
  };

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
        {packageGrades.length > 1 && (
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            aria-label={tt("olyq.grade")}
          >
            <option value="">{tt("olyq.allGrades")}</option>
            {packageGrades.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

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
          topics={topics}
          subtopics={subtopics}
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
            topics={topics}
            subtopics={subtopics}
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
    </div>
  );
}
