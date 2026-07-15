"use client";

// Round 22 — the question editor moved from /questions/[id]/edit into a modal
// on the list page (owner: clicking Edit "just opens a modal and we do changes
// on that modal", like the create/bulk modals). ONE instance lives inside
// QuestionsTable; each row's Edit button sets the id.
//   * Data is loaded on demand through the loadQuestionForEdit server action
//     (requirePermission-guarded server-side, error CODES only).
//   * Saves go through the existing saveQuestion action in stay mode — the
//     modal closes and router.refresh() updates the list in place.
//   * The retired edit page's lifecycle transitions + admin delete moved here:
//     they AWAIT their server action, then reload the modal data, so the
//     status pill / buttons / read-only status field never go stale.
//   * The immediate-upload media box (image/audio replace + remove) is passed
//     to QuestionForm as mediaSlot with an EXPLICIT key: an element rendered
//     into another component's child list needs one (this unkeyed slot was the
//     source of the old edit page's "unique key prop" React warning).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { QuestionForm } from "@/components/QuestionForm";
import { QuestionMediaUploader } from "@/components/QuestionMediaUploader";
import {
  deleteQuestion,
  loadQuestionForEdit,
  transitionQuestion,
  type EditQuestionData,
} from "@/lib/admin/questions";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";

// Shared questions-surface helpers (also used by QuestionsTable's row quick
// actions). The server re-checks permissions and current status; RLS is the
// final gate — these only decide which buttons to SHOW.
//   in_review → publish / reject
//   published → reject / to_review
//   rejected  → publish / to_review
export function rowTransitions(
  status: string,
  can: (p: string) => boolean,
): { action: string; key: string }[] {
  const buttons: { action: string; key: string }[] = [];
  if (status === "in_review") {
    if (can("content.publish")) buttons.push({ action: "publish", key: "qact.publish" });
    if (can("content.review")) buttons.push({ action: "reject", key: "qact.reject" });
  } else if (status === "published") {
    if (can("content.review"))
      buttons.push(
        { action: "reject", key: "qact.reject" },
        { action: "to_review", key: "qact.to_review" },
      );
  } else if (status === "rejected") {
    if (can("content.publish")) buttons.push({ action: "publish", key: "qact.publish" });
    if (can("content.review")) buttons.push({ action: "to_review", key: "qact.to_review" });
  }
  return buttons;
}

export function statusPill(s: string): string {
  if (s === "published") return "pill-ok";
  if (s === "rejected") return "pill-warn";
  return "pill-muted"; // in_review
}

type Loaded = Extract<EditQuestionData, { ok: true }>;
type LoadError = "" | "notFound" | "olympiadScoped" | "loadFailed";

export function EditQuestionModal({
  id,
  onClose,
  dict,
  options,
  taxonomy,
  isAdmin,
  perms,
}: {
  // Question to edit; null keeps the modal closed.
  id: string | null;
  onClose: () => void;
  dict: Record<string, string>;
  options: Record<string, { value: string; label: string }[]>;
  taxonomy: QuestionTaxonomy;
  isAdmin: boolean;
  perms: string[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<LoadError>("");
  // A lifecycle/delete call in flight — disables those buttons and blocks
  // dismissing the modal mid-operation.
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // (Re)load the question — used on open and after transition/media changes so
  // status and the media box reflect the server state.
  const reload = useCallback(async (qid: string) => {
    const res = await loadQuestionForEdit(qid);
    if (res.ok) {
      setData(res);
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setLoadError("");
    setActionError("");
    loadQuestionForEdit(id)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res);
        else setLoadError(res.error);
      })
      .catch(() => {
        if (!cancelled) setLoadError("loadFailed");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSaved = useCallback(() => {
    onClose();
    router.refresh();
  }, [onClose, router]);

  if (!id) return null;

  const can = (p: string) => isAdmin || perms.includes(p);
  const errorText =
    loadError === "olympiadScoped"
      ? tt("qnotice.olympiadScoped")
      : loadError === "notFound"
        ? tt("qedit.notFound")
        : loadError === "loadFailed"
          ? tt("qedit.loadFailed")
          : "";

  async function runTransition(action: string) {
    if (!id || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const fd = new FormData();
      fd.set("__id", id);
      fd.set("__action", action);
      await transitionQuestion(fd);
      await reload(id);
      router.refresh(); // the row's status pill behind the modal
    } catch {
      setActionError(tt("err.server"));
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!id || busy) return;
    if (!confirm(tt("qact.confirmDelete"))) return;
    setBusy(true);
    setActionError("");
    try {
      const fd = new FormData();
      fd.set("__id", id);
      fd.set("__stay", "1");
      const res = await deleteQuestion(null, fd);
      if (res?.error) {
        // e.g. the delete guard: answered questions can never be hard-deleted.
        setActionError(res.error);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setActionError(tt("err.server"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tt("qedit.title")}
      closeLabel={tt("modal.close")}
      busy={busy}
      wide
    >
      {errorText ? (
        <p className="form-error">{errorText}</p>
      ) : !data ? (
        <p className="muted">{tt("qedit.loading")}</p>
      ) : (
        <>
          {/* Current status + lifecycle transitions + admin delete (the
              retired edit page's top card). */}
          <div className="lifecycle qedit-lifecycle">
            <span className={`pill pill-sm ${statusPill(data.status)}`}>
              {tt(`qstatus.${data.status}`)}
            </span>
            {rowTransitions(data.status, can).map((b) => (
              <button
                key={b.action}
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => runTransition(b.action)}
              >
                {tt(b.key)}
              </button>
            ))}
            {isAdmin && (
              <button
                type="button"
                className="link-danger"
                disabled={busy}
                onClick={runDelete}
              >
                {tt("qact.delete")}
              </button>
            )}
          </div>
          {actionError && <p className="form-error">{actionError}</p>}

          {/* key={data.id}: remount the form when a DIFFERENT question opens
              (its useState defaults initialize once); reloads of the SAME
              question (transition/media) keep any in-progress field edits. */}
          <QuestionForm
            key={data.id}
            dict={dict}
            options={options}
            taxonomy={taxonomy}
            defaults={data.defaults}
            id={data.id}
            submitLabel={tt("qform.save")}
            statusText={tt(`qstatus.${data.status}`)}
            stay
            onSaved={onSaved}
            mediaSlot={
              <QuestionMediaUploader
                key="question-media"
                questionId={data.id}
                locale={data.defaults.primary_locale}
                current={data.media}
                onChanged={() => {
                  void reload(data.id);
                }}
                strings={{
                  title: tt("qmedia.title"),
                  upload: tt("qmedia.upload"),
                  uploading: tt("qmedia.uploading"),
                  remove: tt("qmedia.remove"),
                  none: tt("qmedia.none"),
                  hint: tt("qmedia.hint"),
                }}
              />
            }
          />
        </>
      )}
    </Modal>
  );
}
