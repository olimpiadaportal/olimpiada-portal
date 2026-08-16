"use client";

// Curriculum Structure tree — Subject › Topic › Subtopic.
//
// RENDER BUDGET (this is the whole reason the component looks like this):
// the 2026 curriculum is 260 topics / 1077 subtopics. Nothing here ever
// renders the full tree:
//   * the SERVER paginates topics (TOPIC_PAGE_SIZE per page) and fetches
//     subtopics ONLY for the topics on the current page, so the props for one
//     page carry at most ~40 topics and their direct children;
//   * subtopics are LAZY-EXPANDED — a collapsed topic renders zero child nodes,
//     so the default view is ~40 rows plus a handful of subject headers.
// Result: the DOM is bounded by the page size, not by the curriculum size. No
// virtualization library is involved (and no new dependency was added).
//
// Search/filters/pagination live in the URL (the server re-queries and
// re-validates); expansion, modals and toasts are local UI state. When a search
// matched SUBTOPIC names, the server passes the hit ids and their topics
// auto-expand with the hits highlighted — an ancestor of a match is never
// hidden.
//
// All strings arrive pre-translated through `labels`; this component holds no
// i18n logic.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import { termClass } from "@/lib/termBadge";
import {
  deleteCurriculumNode,
  getCurriculumDeleteImpact,
} from "@/lib/admin/curriculum";
import type {
  CurriculumKind,
  GradeItem,
  SubjectItem,
  SubtopicRow,
  TopicGroup,
  TopicOption,
  TopicRow,
} from "@/lib/admin/curriculum-shared";
import { TopicForm } from "./TopicForm";
import { SubtopicForm } from "./SubtopicForm";
import { ToastStack, useToasts } from "./Toasts";

export type CurriculumPagination = {
  page: number;
  totalPages: number;
  from: number; // 1-based, inclusive (0 when the list is empty)
  to: number; // 1-based, inclusive
  total: number;
  prevHref: string | null;
  nextHref: string | null;
};

type ModalState =
  | { type: "topic"; topic?: TopicRow }
  | { type: "subtopic"; subtopic?: SubtopicRow; topicId?: string }
  | { type: "delete"; kind: CurriculumKind; id: string; name: string }
  | null;

/* ---- icons (inline; the panel ships no icon dependency) ------------------ */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "cur-chevron open" : "cur-chevron"}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */

export function CurriculumTree({
  labels,
  subjects,
  grades,
  groups,
  subtopicsByTopic,
  topicOptions,
  matchedSubtopicIds,
  query,
  hasFilters,
  pagination,
  truncatedAt,
  /** Changes whenever the server data behind the tree changes (page/filters) —
   *  resets the expansion defaults. */
  signature,
}: {
  labels: Record<string, string>;
  subjects: SubjectItem[];
  grades: GradeItem[];
  groups: TopicGroup[];
  subtopicsByTopic: Record<string, SubtopicRow[]>;
  topicOptions: TopicOption[];
  matchedSubtopicIds: string[];
  query: string;
  /** Any search/filter is active — an empty tree then means "no matches",
   *  not "no curriculum". */
  hasFilters: boolean;
  pagination: CurriculumPagination;
  truncatedAt: number | null;
  signature: string;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [modal, setModal] = useState<ModalState>(null);

  const l = useCallback((k: string) => labels[k] ?? k, [labels]);
  const fmt = useCallback(
    (k: string, vars: Record<string, string | number>) =>
      Object.entries(vars).reduce(
        (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
        l(k),
      ),
    [l],
  );

  const subjectName = useCallback(
    (id: string) => subjects.find((s) => s.id === id)?.name ?? l("cur.unknownSubject"),
    [subjects, l],
  );
  const gradeName = useCallback(
    (id: string | null) =>
      (id ? grades.find((g) => g.id === id)?.name : undefined) ??
      l("cur.gradeShared"),
    [grades, l],
  );

  const matchedSet = useMemo(
    () => new Set(matchedSubtopicIds),
    [matchedSubtopicIds],
  );

  // Topics whose SUBTOPICS matched the search — they open automatically so the
  // hit is visible without a click.
  const autoOpenTopics = useMemo(() => {
    if (!query) return new Set<string>();
    const open = new Set<string>();
    for (const [topicId, rows] of Object.entries(subtopicsByTopic)) {
      if (rows.some((s) => matchedSet.has(s.id))) open.add(topicId);
    }
    return open;
  }, [query, subtopicsByTopic, matchedSet]);

  const allGroupIds = useMemo(() => groups.map((g) => g.subjectId), [groups]);
  const allTopicIds = useMemo(
    () => groups.flatMap((g) => g.topics.map((t) => t.id)),
    [groups],
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(autoOpenTopics);

  // New server data (page change / filter change / refresh) → back to the
  // defaults for that data set: groups open, search hits expanded.
  useEffect(() => {
    setCollapsedGroups(new Set());
    setExpandedTopics(autoOpenTopics);
    // autoOpenTopics is derived from the same props as `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleTopic = (id: string) =>
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    setCollapsedGroups(new Set());
    setExpandedTopics(new Set(allTopicIds));
  };
  const collapseAll = () => {
    setCollapsedGroups(new Set(allGroupIds));
    setExpandedTopics(new Set());
  };

  const closeModal = useCallback(() => setModal(null), []);

  const onTopicSaved = useCallback(
    (isEdit: boolean) => {
      setModal(null);
      push("success", l(isEdit ? "cur.toastTopicUpdated" : "cur.toastTopicCreated"));
      router.refresh();
    },
    [l, push, router],
  );

  const onSubtopicSaved = useCallback(
    (isEdit: boolean) => {
      setModal(null);
      push(
        "success",
        l(isEdit ? "cur.toastSubtopicUpdated" : "cur.toastSubtopicCreated"),
      );
      router.refresh();
    },
    [l, push, router],
  );

  const onDeleted = useCallback(
    (kind: CurriculumKind) => {
      setModal(null);
      push(
        "success",
        l(kind === "topic" ? "cur.toastTopicDeleted" : "cur.toastSubtopicDeleted"),
      );
      router.refresh();
    },
    [l, push, router],
  );

  const hasTopics = groups.length > 0;

  return (
    <>
      <div className="cur-toolbar">
        <button
          type="button"
          className="btn"
          onClick={() => setModal({ type: "topic" })}
          disabled={subjects.length === 0}
        >
          <PlusIcon /> {l("cur.newTopic")}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setModal({ type: "subtopic" })}
          disabled={topicOptions.length === 0}
        >
          <PlusIcon /> {l("cur.newSubtopic")}
        </button>
        <span className="cur-toolbar-spacer" />
        <button
          type="button"
          className="btn-ghost"
          onClick={expandAll}
          disabled={!hasTopics}
        >
          {l("cur.expandAll")}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={collapseAll}
          disabled={!hasTopics}
        >
          {l("cur.collapseAll")}
        </button>
      </div>

      {subjects.length === 0 && (
        <p className="cur-banner cur-banner-warn">{l("cur.noSubjects")}</p>
      )}
      {truncatedAt !== null && (
        <p className="cur-banner cur-banner-warn">
          {fmt("cur.scanTruncated", { n: truncatedAt })}
        </p>
      )}

      <section className="card cur-card">
        {!hasTopics && (
          <div className="cur-empty">
            <p className="cur-empty-title">
              {hasFilters ? l("flt.noMatches") : l("cur.noTopics")}
            </p>
            {!hasFilters && (
              <p className="cur-empty-hint">{l("cur.noTopicsHint")}</p>
            )}
          </div>
        )}

        {hasTopics && (
          // Deliberately NOT role="tree": this is a disclosure list, not a
          // selectable tree widget. role="tree" would promise roving tabindex,
          // arrow-key navigation and a selection model to screen-reader users,
          // and delivering none of that is worse than plain nested lists with
          // properly wired aria-expanded/aria-controls buttons.
          <ul className="cur-tree" aria-label={l("cur.title")}>
            {groups.map((group) => {
              const open = !collapsedGroups.has(group.subjectId);
              const groupListId = `cur-topics-${group.subjectId}`;
              return (
                <li key={group.subjectId} className="cur-group">
                  <div className="cur-group-head">
                    <button
                      type="button"
                      className="cur-group-toggle"
                      onClick={() => toggleGroup(group.subjectId)}
                      aria-expanded={open}
                      aria-controls={open ? groupListId : undefined}
                    >
                      <Chevron open={open} />
                      <span className="cur-group-title">
                        {subjectName(group.subjectId)}
                      </span>
                    </button>
                    <span className="cur-count">
                      {fmt("cur.countTopics", { n: group.topics.length })}
                    </span>
                  </div>

                  {open && (
                    <ul id={groupListId} className="cur-topics">
                      {group.topics.map((topic) => (
                        <TopicNode
                          key={topic.id}
                          topic={topic}
                          subtopics={subtopicsByTopic[topic.id] ?? []}
                          expanded={expandedTopics.has(topic.id)}
                          onToggle={() => toggleTopic(topic.id)}
                          matchedSet={matchedSet}
                          gradeLabel={gradeName(topic.gradeId)}
                          l={l}
                          fmt={fmt}
                          onEdit={() => setModal({ type: "topic", topic })}
                          onDelete={() =>
                            setModal({
                              type: "delete",
                              kind: "topic",
                              id: topic.id,
                              name: topic.name,
                            })
                          }
                          onAddSubtopic={() =>
                            setModal({ type: "subtopic", topicId: topic.id })
                          }
                          onEditSubtopic={(subtopic) =>
                            setModal({ type: "subtopic", subtopic })
                          }
                          onDeleteSubtopic={(subtopic) =>
                            setModal({
                              type: "delete",
                              kind: "subtopic",
                              id: subtopic.id,
                              name: subtopic.name,
                            })
                          }
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pagination.total > 0 && (
          <nav className="cur-pager" aria-label={l("cur.pageOf")}>
            <span className="cur-pager-info">
              {fmt("cur.showing", {
                from: pagination.from,
                to: pagination.to,
                total: pagination.total,
              })}
            </span>
            <span className="cur-pager-spacer" />
            {pagination.prevHref ? (
              <Link className="btn-ghost" href={pagination.prevHref} scroll={false}>
                ← {l("cur.prev")}
              </Link>
            ) : (
              <span className="btn-ghost cur-pager-disabled">
                ← {l("cur.prev")}
              </span>
            )}
            <span className="cur-pager-page">
              {fmt("cur.pageOf", {
                page: pagination.page,
                pages: pagination.totalPages,
              })}
            </span>
            {pagination.nextHref ? (
              <Link className="btn-ghost" href={pagination.nextHref} scroll={false}>
                {l("cur.next")} →
              </Link>
            ) : (
              <span className="btn-ghost cur-pager-disabled">
                {l("cur.next")} →
              </span>
            )}
          </nav>
        )}
      </section>

      {/* ---- Topic create/edit ---- */}
      <Modal
        isOpen={modal?.type === "topic"}
        onClose={closeModal}
        title={
          modal?.type === "topic" && modal.topic
            ? l("cur.editTopicTitle")
            : l("cur.addTopicTitle")
        }
        closeLabel={l("modal.close")}
      >
        {modal?.type === "topic" && (
          <TopicForm
            values={
              modal.topic
                ? {
                    id: modal.topic.id,
                    subjectId: modal.topic.subjectId,
                    gradeId: modal.topic.gradeId,
                    name: modal.topic.name,
                    nameEn: modal.topic.nameEn,
                    nameRu: modal.topic.nameRu,
                    term: modal.topic.term,
                    status: modal.topic.status,
                  }
                : {}
            }
            subjects={subjects}
            grades={grades}
            l={l}
            onSaved={onTopicSaved}
          />
        )}
      </Modal>

      {/* ---- Subtopic create/edit ---- */}
      <Modal
        isOpen={modal?.type === "subtopic"}
        onClose={closeModal}
        title={
          modal?.type === "subtopic" && modal.subtopic
            ? l("cur.editSubtopicTitle")
            : l("cur.addSubtopicTitle")
        }
        closeLabel={l("modal.close")}
      >
        {modal?.type === "subtopic" && (
          <SubtopicForm
            values={
              modal.subtopic
                ? {
                    id: modal.subtopic.id,
                    topicId: modal.subtopic.topicId,
                    name: modal.subtopic.name,
                    nameEn: modal.subtopic.nameEn,
                    nameRu: modal.subtopic.nameRu,
                    status: modal.subtopic.status,
                  }
                : { topicId: modal.topicId }
            }
            topics={topicOptions}
            subjects={subjects}
            grades={grades}
            l={l}
            onSaved={onSubtopicSaved}
          />
        )}
      </Modal>

      {/* ---- Delete confirmation (impact preview) ---- */}
      {modal?.type === "delete" && (
        <DeleteConfirm
          kind={modal.kind}
          id={modal.id}
          name={modal.name}
          l={l}
          fmt={fmt}
          onClose={closeModal}
          onDeleted={onDeleted}
          onError={(message) => push("error", message)}
        />
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={dismiss}
        dismissLabel={l("cur.toastDismiss")}
      />
    </>
  );
}

/* ------------------------------------------------------------------------- */

function StatusPill({ status, l }: { status: string; l: (k: string) => string }) {
  if (status === "inactive")
    return <span className="cur-pill cur-pill-muted">{l("cur.statusInactive")}</span>;
  if (status === "archived")
    return <span className="cur-pill cur-pill-muted">{l("cur.statusArchived")}</span>;
  return null;
}

/** Colour-coded Rüb badge. Uses the panel-wide term badge (lib/termBadge.ts +
 *  the --term-N-* tokens) rather than a palette of its own, so the same Rüb is
 *  the same colour here and on the questions screen. The digit is always in the
 *  label — colour is redundant encoding, never the only cue. */
function TermPill({ term, l }: { term: number | null; l: (k: string) => string }) {
  return (
    <span className={termClass(term)}>
      {term == null ? l("cur.needsTerm") : l(`term.${term}`)}
    </span>
  );
}

/** The EN/RU names as a muted second line. The AZ name above stays the row's
 *  identity — it is what both bulk importers and migration 095 match on. */
function TranslationLine({
  nameEn,
  nameRu,
}: {
  nameEn: string | null;
  nameRu: string | null;
}) {
  if (!nameEn && !nameRu) return null;
  return (
    <span className="cur-row-tr">
      {[nameEn && `EN · ${nameEn}`, nameRu && `RU · ${nameRu}`]
        .filter(Boolean)
        .join("   ")}
    </span>
  );
}

/** The ONLY place an admin can see that a node still renders Azerbaijani to an
 *  English or Russian reader — both bulk importers create topics with no
 *  translations at all, so without this badge the gap is invisible. */
function MissingTrPill({
  nameEn,
  nameRu,
  l,
  fmt,
}: {
  nameEn: string | null;
  nameRu: string | null;
  l: (k: string) => string;
  fmt: (k: string, vars: Record<string, string | number>) => string;
}) {
  if (nameEn && nameRu) return null;
  const langs = !nameEn && !nameRu ? l("cur.trMissingBoth") : !nameEn ? "EN" : "RU";
  return (
    <span className="cur-pill cur-pill-warn">{fmt("cur.trMissing", { langs })}</span>
  );
}

function TopicNode({
  topic,
  subtopics,
  expanded,
  onToggle,
  matchedSet,
  gradeLabel,
  l,
  fmt,
  onEdit,
  onDelete,
  onAddSubtopic,
  onEditSubtopic,
  onDeleteSubtopic,
}: {
  topic: TopicRow;
  subtopics: SubtopicRow[];
  expanded: boolean;
  onToggle: () => void;
  matchedSet: ReadonlySet<string>;
  gradeLabel: string;
  l: (k: string) => string;
  fmt: (k: string, vars: Record<string, string | number>) => string;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubtopic: () => void;
  onEditSubtopic: (s: SubtopicRow) => void;
  onDeleteSubtopic: (s: SubtopicRow) => void;
}) {
  const dimmed = topic.status !== "active";
  const subListId = `cur-subtopics-${topic.id}`;
  return (
    <li className="cur-topic">
      <div className={`cur-row cur-row-topic${dimmed ? " dimmed" : ""}`}>
        {/* One control, one tab stop: the chevron, the name and the badges are
            all part of the disclosure button. */}
        <button
          type="button"
          className="cur-row-main cur-row-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          // Only while the list is actually rendered — aria-controls pointing at
          // a non-existent id is an axe `aria-valid-attr-value` violation, and
          // keeping the collapsed list mounted would defeat the render budget.
          aria-controls={expanded ? subListId : undefined}
        >
          <Chevron open={expanded} />
          <span className="cur-row-name">{topic.name}</span>
          <span className="cur-row-meta">
            <span className="cur-pill cur-pill-grade">{gradeLabel}</span>
            <TermPill term={topic.term} l={l} />
            <span>{fmt("cur.countSubtopics", { n: topic.subtopicCount })}</span>
            {topic.questionCount > 0 && (
              <span>{fmt("cur.countQuestions", { n: topic.questionCount })}</span>
            )}
            <MissingTrPill nameEn={topic.nameEn} nameRu={topic.nameRu} l={l} fmt={fmt} />
            <StatusPill status={topic.status} l={l} />
          </span>
          <TranslationLine nameEn={topic.nameEn} nameRu={topic.nameRu} />
        </button>

        <span className="cur-row-actions">
          <button
            type="button"
            className="cur-icon-btn"
            title={l("cur.addSubtopic")}
            aria-label={l("cur.addSubtopic")}
            onClick={onAddSubtopic}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="cur-icon-btn"
            title={l("action.edit")}
            aria-label={l("action.edit")}
            onClick={onEdit}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="cur-icon-btn danger"
            title={l("action.delete")}
            aria-label={l("action.delete")}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        </span>
      </div>

      {expanded && (
        <ul id={subListId} className="cur-subtopics">
          {subtopics.length === 0 && (
            <li className="cur-subempty">{l("cur.noSubtopics")}</li>
          )}
          {subtopics.map((s) => (
            <li
              key={s.id}
              className={`cur-row cur-row-subtopic${
                s.status !== "active" ? " dimmed" : ""
              }${matchedSet.has(s.id) ? " hit" : ""}`}
            >
              <span className="cur-row-main static">
                <span className="cur-row-name">{s.name}</span>
                <span className="cur-row-meta">
                  <TermPill term={s.term} l={l} />
                  {matchedSet.has(s.id) && (
                    <span className="cur-pill cur-pill-hit">{l("cur.searchHit")}</span>
                  )}
                  <MissingTrPill nameEn={s.nameEn} nameRu={s.nameRu} l={l} fmt={fmt} />
                  <StatusPill status={s.status} l={l} />
                </span>
                <TranslationLine nameEn={s.nameEn} nameRu={s.nameRu} />
              </span>
              <span className="cur-row-actions">
                <button
                  type="button"
                  className="cur-icon-btn"
                  title={l("action.edit")}
                  aria-label={l("action.edit")}
                  onClick={() => onEditSubtopic(s)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="cur-icon-btn danger"
                  title={l("action.delete")}
                  aria-label={l("action.delete")}
                  onClick={() => onDeleteSubtopic(s)}
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Delete confirmation with an impact preview.
 *
 * Honest surfacing of what the DB really does:
 *   * subtopics CASCADE with their topic → shown as a count;
 *   * questions.topic_id / .subtopic_id are ON DELETE **SET NULL**, so Postgres
 *     would happily accept the delete and quietly strip taxonomy off live
 *     questions. deleteCurriculumNode refuses in that case, and this dialog
 *     says so instead of offering a doomed (or worse, silently destructive)
 *     confirmation.
 */
function DeleteConfirm({
  kind,
  id,
  name,
  l,
  fmt,
  onClose,
  onDeleted,
  onError,
}: {
  kind: CurriculumKind;
  id: string;
  name: string;
  l: (k: string) => string;
  fmt: (k: string, vars: Record<string, string | number>) => string;
  onClose: () => void;
  onDeleted: (kind: CurriculumKind) => void;
  onError: (message: string) => void;
}) {
  const [impact, setImpact] = useState<{
    subtopics: number;
    questions: number;
  } | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCurriculumDeleteImpact(kind, id)
      .then((res) => {
        if (!alive) return;
        if ("ok" in res)
          setImpact({ subtopics: res.subtopics, questions: res.questions });
        else setImpactFailed(true);
      })
      .catch(() => {
        if (alive) setImpactFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [kind, id]);

  const blocked = impact !== null && impact.questions > 0;
  const blockedText =
    kind === "topic" ? l("cur.blockedTopic") : l("cur.blockedSubtopic");

  const lines: string[] = [];
  if (impact) {
    if (impact.subtopics > 0)
      lines.push(fmt("cur.impactSubtopics", { n: impact.subtopics }));
    if (impact.questions > 0)
      lines.push(fmt("cur.impactQuestions", { n: impact.questions }));
  }

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await deleteCurriculumNode(kind, id);
      if ("ok" in res) {
        onDeleted(kind);
        return;
      }
      const message = res.error === "hasQuestions" ? blockedText : l("cur.errOp");
      setError(message);
      onError(message);
    } catch {
      setError(l("cur.errOp"));
      onError(l("cur.errOp"));
    }
    setBusy(false);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        kind === "topic" ? l("cur.deleteTopicTitle") : l("cur.deleteSubtopicTitle")
      }
      closeLabel={l("modal.close")}
      busy={busy}
    >
      <p className="cur-delete-question">
        {fmt("cur.deleteQuestion", { name })}
      </p>

      {impact === null && !impactFailed && (
        <p className="muted">{l("cur.impactLoading")}</p>
      )}
      {impact !== null && lines.length === 0 && (
        <p className="muted">{l("cur.impactNone")}</p>
      )}
      {lines.length > 0 && (
        <ul className="cur-impact">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {blocked && <p className="cur-impact-blocked">{blockedText}</p>}
      {!blocked && impact !== null && (
        <p className="cur-impact-note">{l("cur.deleteIrreversible")}</p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={onClose}
          disabled={busy}
        >
          {l("action.cancel")}
        </button>
        <ActionButton
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          pending={busy}
          pendingLabel={l("pend.deleting")}
          disabled={blocked || (impact === null && !impactFailed)}
        >
          {l("action.delete")}
        </ActionButton>
      </div>
    </Modal>
  );
}
