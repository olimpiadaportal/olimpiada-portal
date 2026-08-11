"use client";

// Per-grade "JSON format" helper for the olympiad package pool uploads.
//
// WHY IT SITS INSIDE EACH GRADE SLOT
// ----------------------------------
// Every selected grade owns an independent pool and its own upload field. The
// admin's real workflow is: pick type/subject/grades → open the format next to
// ONE grade → copy it → paste it into a chat model together with that grade's
// raw questions → save the answer → drop the file into THAT grade's field. A
// single shared format block at the top would break that rhythm and, worse,
// invite dropping one grade's file into another grade's slot.
//
// The JSON itself is identical for every grade — and that is the point, not an
// oversight. Nothing grade-specific belongs in the file: the slot the file
// lands in IS the grade, exactly as the package supplies the subject and the
// olympiad type. Naming the grade in the heading keeps the admin oriented
// without implying the content differs.
//
// COLLAPSED BY DEFAULT: eleven selected grades would otherwise be eleven copies
// of the same twenty-line block, and the actual upload fields would be pushed
// off the screen.
//
// No dependency: `<details>` gives the disclosure for free (keyboard- and
// screen-reader-accessible, works without JS), and the copy uses the platform
// clipboard with a select-the-text fallback for non-secure origins.
import { useEffect, useMemo, useRef, useState } from "react";
import { bulkTemplateFor } from "@/lib/bulk-client";

export function OlympiadJsonFormat({
  gradeLabel,
  dict,
  // The shown format must follow the chosen import type: a mixed-mode admin
  // copying the text-only shape would produce a file with no images in it.
  questionMode,
}: {
  gradeLabel: string;
  dict: Record<string, string>;
  questionMode: "text" | "mixed";
}) {
  const tt = (k: string) => dict[k] ?? k;
  const formatJson = useMemo(
    () => JSON.stringify(bulkTemplateFor("olympiad", questionMode), null, 2),
    [questionMode],
  );
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  // Clearing the "Copied" pill from a timer that outlives the component is a
  // React state-update-after-unmount warning; deselecting a grade unmounts this
  // block, so the timeout is tracked and cancelled.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatJson);
    } catch {
      // http:// origins and older browsers have no clipboard API. Selecting the
      // block leaves the admin one Ctrl+C away instead of a dead button.
      const el = preRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details className="oly-json-format">
      <summary>
        {tt("olyjson.summary").replace("{grade}", gradeLabel)}
      </summary>
      <div className="oly-json-body">
        {/* The workflow, in one sentence, where the admin is about to act. */}
        <p className="hint">
          {tt(questionMode === "mixed" ? "olyjson.howtoZip" : "olyjson.howto")}
        </p>
        {/* The ZIP tree sits next to the JSON it belongs to, so "where does
            this file go" is answered in the same place it is copied. */}
        {questionMode === "mixed" && (
          <pre className="bulk-zip-layout">{tt("bulk.zipLayout")}</pre>
        )}
        {/* What is NOT in the file, and why — pre-empts "where do I put the
            grade?", which is the first thing a careful admin asks. */}
        <p className="hint">
          {tt("olyjson.inherited").replace("{grade}", gradeLabel)}
        </p>
        <div className="oly-json-actions">
          <button className="btn-ghost" type="button" onClick={() => void copy()}>
            {tt("olyjson.copy")}
          </button>
          {/* aria-live so the confirmation is announced, not just seen. */}
          <span className="oly-json-copied" role="status" aria-live="polite">
            {copied ? tt("olyjson.copied") : ""}
          </span>
        </div>
        <pre ref={preRef} className="oly-json-pre">
          {formatJson}
        </pre>
        <p className="hint">{tt("olyjson.rules")}</p>
      </div>
    </details>
  );
}
