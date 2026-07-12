"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Taxonomy } from "@/components/QuestionsTable";

export type FilterOption = { value: string; label: string };

// Canonical validated filter state (server-provided; the URL is the source of
// truth — every change router.replace()s a new URL and the server re-renders).
export type FilterCurrent = {
  q: string;
  subject: string;
  topic: string;
  subtopic: string;
  grade: string;
  status: string;
  size: string;
};

const PAGE_SIZES = ["25", "50", "100"];

export function QuestionFilters({
  taxonomy,
  grades,
  statuses,
  current,
  dict,
}: {
  taxonomy: Taxonomy;
  grades: FilterOption[];
  statuses: FilterOption[];
  current: FilterCurrent;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const [text, setText] = useState(current.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the search box in sync when the URL changes externally
  // (e.g. "clear filters" or a stat-card click).
  useEffect(() => {
    setText(current.q);
  }, [current.q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Any filter change resets pagination to page 1 (we simply never emit page).
  const buildHref = (overrides: Partial<FilterCurrent>): string => {
    const merged = { ...current, ...overrides };
    const p = new URLSearchParams();
    if (merged.q) p.set("q", merged.q);
    if (merged.subject) p.set("subject", merged.subject);
    if (merged.topic) p.set("topic", merged.topic);
    if (merged.subtopic) p.set("subtopic", merged.subtopic);
    if (merged.grade) p.set("grade", merged.grade);
    if (merged.status) p.set("status", merged.status);
    if (merged.size && merged.size !== "25") p.set("size", merged.size);
    const qs = p.toString();
    return qs ? `/questions?${qs}` : "/questions";
  };

  const apply = (overrides: Partial<FilterCurrent>) => {
    router.replace(buildHref(overrides));
  };

  // Debounced (350 ms) text search.
  const onText = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: v.trim() }), 350);
  };

  const topicsForSubject = taxonomy.topics.filter(
    (tp) => tp.subject_id === current.subject,
  );
  const subtopicsForTopic = taxonomy.subtopics.filter(
    (st) => st.topic_id === current.topic,
  );

  const hasFilters = Boolean(
    current.q ||
      current.subject ||
      current.topic ||
      current.subtopic ||
      current.grade ||
      current.status,
  );

  return (
    <div className="qfilters">
      <input
        className="qfilters-search"
        type="search"
        value={text}
        placeholder={tt("qfilter.search")}
        aria-label={tt("qfilter.search")}
        onChange={(e) => onText(e.target.value)}
      />

      {/* Cascading taxonomy filters: subject → topic → subtopic. */}
      <select
        aria-label={tt("qfield.subject")}
        value={current.subject}
        onChange={(e) =>
          apply({ subject: e.target.value, topic: "", subtopic: "" })
        }
      >
        <option value="">{tt("qfilter.allSubjects")}</option>
        {taxonomy.subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        aria-label={tt("qfield.topic")}
        value={current.topic}
        disabled={!current.subject}
        onChange={(e) => apply({ topic: e.target.value, subtopic: "" })}
      >
        <option value="">{tt("qfilter.allTopics")}</option>
        {topicsForSubject.map((tp) => (
          <option key={tp.id} value={tp.id}>
            {tp.name}
          </option>
        ))}
      </select>
      <select
        aria-label={tt("qfield.subtopic")}
        value={current.subtopic}
        disabled={!current.topic}
        onChange={(e) => apply({ subtopic: e.target.value })}
      >
        <option value="">{tt("qfilter.allSubtopics")}</option>
        {subtopicsForTopic.map((st) => (
          <option key={st.id} value={st.id}>
            {st.name}
          </option>
        ))}
      </select>

      <select
        aria-label={tt("qfield.grade")}
        value={current.grade}
        onChange={(e) => apply({ grade: e.target.value })}
      >
        <option value="">{tt("qfilter.allGrades")}</option>
        {grades.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label={tt("qfield.status")}
        value={current.status}
        onChange={(e) => apply({ status: e.target.value })}
      >
        <option value="">{tt("qfilter.allStatuses")}</option>
        {statuses.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {hasFilters && (
        <Link
          className="qfilters-clear"
          href={buildHref({
            q: "",
            subject: "",
            topic: "",
            subtopic: "",
            grade: "",
            status: "",
          })}
        >
          {tt("qfilter.clear")}
        </Link>
      )}

      <span className="qfilters-spacer" />

      <label className="qfilters-size">
        <span>{tt("qpage.perPage")}</span>
        <select
          value={current.size}
          onChange={(e) => apply({ size: e.target.value })}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
