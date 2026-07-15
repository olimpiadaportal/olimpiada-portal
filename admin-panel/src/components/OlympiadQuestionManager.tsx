"use client";

// Question-pool manager for ONE olympiad package (Round 21 item 2): list +
// client-side text search + Add/Edit modals + Archive/Restore/Delete row
// actions. Follows the NewQuestionModal pattern — mutations return state, the
// modal closes and router.refresh() re-renders the SERVER list in place (no
// full page reload). Rows come pre-shaped from the server page; the full
// editable payload of a question is fetched on demand for the edit modal.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import {
  OlympiadQuestionForm,
  type OlympiadPoolTopic,
  type OlympiadPoolSubtopic,
} from "@/components/OlympiadQuestionForm";
import {
  deleteOlympiadPackageQuestion,
  setOlympiadPoolQuestionStatus,
  loadOlympiadPoolQuestion,
  type OlympiadPoolQuestionData,
} from "@/lib/admin/olympiad";

export type OlympiadPoolRow = {
  id: string;
  num: number;
  excerpt: string;
  search: string; // lowercased text blob for the client-side filter
  optionCount: number;
  hasImage: boolean;
  status: string;
  updatedAt: string;
};

const OPTION_COUNT = 5;

export function OlympiadQuestionManager({
  dict,
  packageId,
  subjectName,
  gradeName,
  topics,
  subtopics,
  rows,
}: {
  dict: Record<string, string>;
  packageId: string;
  subjectName: string;
  gradeName: string;
  topics: OlympiadPoolTopic[];
  subtopics: OlympiadPoolSubtopic[];
  rows: OlympiadPoolRow[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editData, setEditData] = useState<OlympiadPoolQuestionData | null>(null);
  // Row-level busy/error feedback (edit prefill fetch, delete, archive).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // While a save/upload is in flight the modal must not be dismissable.
  const [formBusy, setFormBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.search.includes(q));
  }, [rows, search]);

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
    }
  }

  async function onDelete(id: string) {
    if (!confirm(tt("olyq.confirmDelete"))) return;
    setRowError(null);
    setBusyId(id);
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
    }
  }

  async function onStatus(id: string, action: "archive" | "restore") {
    setRowError(null);
    setBusyId(id);
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
      </div>

      {rows.length === 0 ? (
        <p className="muted">{tt("olyq.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{tt("olyq.noMatch")}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{tt("olyq.col.num")}</th>
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
                <td>{r.num}</td>
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
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onEdit(r.id)}
                      disabled={busyId === r.id}
                    >
                      {tt("olyq.edit")}
                    </button>
                    {r.status === "archived" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => onStatus(r.id, "restore")}
                        disabled={busyId === r.id}
                      >
                        {tt("olyq.restore")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => onStatus(r.id, "archive")}
                        disabled={busyId === r.id}
                      >
                        {tt("olyq.archive")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => onDelete(r.id)}
                      disabled={busyId === r.id}
                    >
                      {tt("olyq.delete")}
                    </button>
                  </div>
                  {rowError?.id === r.id && (
                    <p className="form-error">{rowError.message}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          gradeName={gradeName}
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
            gradeName={gradeName}
            topics={topics}
            subtopics={subtopics}
            defaults={editData}
            onSaved={onSaved}
            onBusyChange={setFormBusy}
          />
        )}
      </Modal>
    </div>
  );
}
