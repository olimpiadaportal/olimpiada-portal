"use client";

// Round 52 (§7) — the copy-pasteable AI prompt for the bulk-import screen.
//
// Why it exists: admins generate question batches with a chat model and then
// fight the importer, because the model has no way to know (a) the exact JSON
// the RPC accepts, or (b) which topic/subtopic names exist. This block builds
// BOTH into one prompt: the schema is spelled out field by field, and the
// curriculum for the subject + grade the admin picked above is embedded
// verbatim, so the model can only choose names that already exist. That is what
// makes "Topic not found" / "Subtopic not found" (§6) rare instead of routine.
//
// The chrome (labels, hints, buttons) is trilingual; the PROMPT BODY is English
// on purpose — models follow English instructions most reliably — and the UI
// says so. The questions the model writes are in the language the prompt names,
// which is the admin panel's current locale.
//
// No dependency: the prompt is a template string and the copy uses the platform
// clipboard with a manual-select fallback.
import { useMemo, useState } from "react";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";

type Opt = { value: string; label: string };

const COUNTS = [10, 25, 50, 100] as const;

// Language the generated questions must be written in (matches the panel
// locale; the importer's primary_locale accepts az/en/ru).
const LOCALE_NAMES: Record<string, string> = {
  az: "Azerbaijani (az)",
  en: "English (en)",
  ru: "Russian (ru)",
};

function buildPrompt({
  subject,
  grade,
  count,
  locale,
  topics,
  mixed,
}: {
  subject: string;
  grade: string;
  count: number;
  locale: string;
  topics: { name: string; term: number | null; subtopics: string[] }[];
  // MIXED mode changes what the model must produce, so it changes the prompt.
  // A single prompt for both modes told a mixed-mode admin "no images" and
  // never mentioned the ZIP — the exact opposite of the format that surface
  // accepts.
  mixed: boolean;
}): string {
  const language = LOCALE_NAMES[locale] ?? LOCALE_NAMES.az;

  const curriculum = topics
    .map((tp) => {
      const term = tp.term == null ? "?" : String(tp.term);
      const subs = tp.subtopics.length
        ? tp.subtopics.map((s) => `    - ${s}`).join("\n")
        : "    - (no subtopics recorded — do not use this topic)";
      return `  TOPIC: ${tp.name}   [term = ${term}]\n${subs}`;
    })
    .join("\n");

  // The worked example uses a REAL row from the list above so it can be copied
  // as-is; falls back to placeholders when the tree is empty.
  const ex = topics.find((tp) => tp.subtopics.length > 0) ?? null;
  const exTopic = ex?.name ?? "<topic from the list>";
  const exSubtopic = ex?.subtopics[0] ?? "<subtopic of that topic>";
  const exTerm = ex?.term ?? 1;
  const example = JSON.stringify(
    [
      {
        primary_locale: locale,
        meta: mixed
          ? {
              topic: exTopic,
              subtopic: exSubtopic,
              term: exTerm,
              image: "images/q1.png",
            }
          : { topic: exTopic, subtopic: exSubtopic, term: exTerm },
        translations: {
          az: {
            body: "2 + 2 neçə edir?",
            prompt: "Düzgün cavabı seçin",
            explanation: "2 + 2 = 4",
          },
          en: { body: "What is 2 + 2?" },
          ru: { body: "Сколько будет 2 + 2?" },
        },
        options: [
          { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
          { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
          { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
          { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
          { is_correct: false, order_index: 4, text: { az: "7", en: "7", ru: "7" } },
        ],
      },
    ],
    null,
    2,
  );

  const metaSchema = mixed
    ? `    "meta": {
      "topic":    "<copied character-for-character from the CURRICULUM below>",
      "subtopic": "<one subtopic of that topic, copied character-for-character>",
      "term":     <the number printed next to that topic: 1, 2, 3 or 4>,
      "image":    "images/q1.png"        <- OPTIONAL, only for a picture question
    },`
    : `    "meta": {
      "topic":    "<copied character-for-character from the CURRICULUM below>",
      "subtopic": "<one subtopic of that topic, copied character-for-character>",
      "term":     <the number printed next to that topic: 1, 2, 3 or 4>
    },`;

  const optionSchema = mixed
    ? `    "options": [
      { "is_correct": true,  "order_index": 0, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 1, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 2, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 3, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 4, "text": { "az": "", "en": "", "ru": "" },
        "image": { "az": "images/q1_option_1.png" } }   <- OPTIONAL picture option
    ]`
    : `    "options": [
      { "is_correct": true,  "order_index": 0, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 1, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 2, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 3, "text": { "az": "...", "en": "...", "ru": "..." } },
      { "is_correct": false, "order_index": 4, "text": { "az": "...", "en": "...", "ru": "..." } }
    ]`;

  // Only mixed mode gets this block: in text-only mode every sentence in it
  // would describe a shape the importer rejects.
  const mediaSection = mixed
    ? `
MEDIA — this import is a ZIP, not a bare JSON file
  The upload looks like this:

    mixed_questions.zip
      questions.json                 <- the array you return
      images/q1.png                  <- the picture files
      images/q1_option_1.png

  "meta.image" and "options[n].image.<locale>" hold a RELATIVE PATH to a file
  inside that ZIP, resolved from the folder holding questions.json. Use a file
  name ONLY if it was given to you — never invent one. Never embed the picture
  itself: no base64, no "data:" URL, no http link, no markdown image. A question
  or an option with no picture simply omits the field.
`
    : "";

  const optionRule = mixed
    ? `  6. Every option needs a non-empty "text"."az" OR an "image"."az" — never
     neither. An option may carry both.`
    : `  6. Every option needs a non-empty "text"."az".`;

  const plainTextRule = mixed
    ? `  7. Plain text only inside every text field: no markdown, no LaTeX, no HTML.
     Pictures are separate FILES referenced by path (see MEDIA above), never
     content inside the JSON. No "All of the above" / "None of the above"
     options. The four wrong answers must be plausible, not obvious filler.`
    : `  7. Plain text only: no markdown, no LaTeX, no HTML, no images, no
     "All of the above" / "None of the above" options. The four wrong answers
     must be plausible, not obvious filler.`;

  const pictureRule = mixed
    ? `  9. No duplicated questions. A question MAY depend on a picture — reference
     it with "meta.image" and make sure that file is in the ZIP.`
    : `  9. No duplicated questions and no question that depends on a picture.`;

  return `You are writing multiple-choice questions for OlympIQ, an Azerbaijani
school platform. Follow the format below EXACTLY — the output is uploaded to an
importer that rejects any row that deviates.

TASK
  Write ${count} multiple-choice questions.
  Subject: ${subject}
  Grade:   ${grade}
  Write the questions in ${language}. Add the English and Russian translations
  when you are confident in them; they are optional.

OUTPUT
  Return ONE JSON array and nothing else: no explanation before or after it, no
  \`\`\` fence, no trailing comma. Every element has exactly this shape:

  {
    "primary_locale": "${locale}",
${metaSchema}
    "translations": {
      "az": { "body": "...", "prompt": "...", "explanation": "..." },
      "en": { "body": "..." },
      "ru": { "body": "..." }
    },
${optionSchema}
  }
${mediaSection}
RULES — each one is enforced by the importer; a row that breaks it is rejected
  1. EXACTLY 5 options per question (A-E) and EXACTLY ONE with
     "is_correct": true. Never 4, never 6, never two correct answers.
  2. "meta.topic" and "meta.subtopic" MUST be copied character-for-character
     from the CURRICULUM list below — same letters, same accents, same case.
     Do not translate, shorten, merge or invent a name, and never use a
     subtopic that belongs to a different topic. An unknown name is rejected as
     "Topic not found" / "Subtopic not found".
  3. "meta.term" MUST be the number printed next to the topic you chose. Only
     1, 2, 3 or 4 — anything else is rejected as "Invalid term value", and a
     term that disagrees with its topic is rejected too.
  4. Do NOT add "meta.subject" or "meta.grade_level" — the importer applies the
     subject and grade selected on screen. Do not add "meta.type" either; the
     default (single choice) is what we want.
  5. "translations" must contain a non-empty "${locale}"."body". "prompt" and
     "explanation" are optional; "en"/"ru" blocks are optional.
${optionRule}
${plainTextRule}
  8. Spread the ${count} questions across the listed subtopics instead of
     stacking them on one, and keep the wording age-appropriate for the grade.
${pictureRule}

CURRICULUM — the ONLY topic and subtopic names you may use
${curriculum || "  (no topics found for this subject and grade)"}

WORKED EXAMPLE — one valid element, in the exact shape required
${example}
`;
}

export function BulkPromptBlock({
  dict,
  locale,
  subjects,
  grades,
  subjectId,
  gradeId,
  taxonomy,
  questionMode,
}: {
  dict: Record<string, string>;
  locale: string;
  subjects: Opt[];
  grades: Opt[];
  // Current batch selection made in the modal above (empty until chosen).
  subjectId: string;
  gradeId: string;
  taxonomy: QuestionTaxonomy;
  // The chosen import type. The prompt DESCRIBES the accepted format, so it has
  // to follow it: a text-only prompt handed to a mixed-mode admin forbids the
  // images that mode exists for.
  questionMode: "" | "text" | "mixed";
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [count, setCount] = useState<number>(25);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const subjectName = subjects.find((s) => s.value === subjectId)?.label ?? "";
  const gradeName = grades.find((g) => g.value === gradeId)?.label ?? "";
  const ready = subjectId !== "" && gradeId !== "";

  const prompt = useMemo(() => {
    if (!ready) return "";
    // Same cascade the question form uses: a topic belongs to the subject and
    // either to this grade or to no grade at all (shared).
    const topics = taxonomy.topics
      .filter(
        (tp) =>
          tp.subject_id === subjectId &&
          (tp.grade_id == null || tp.grade_id === gradeId),
      )
      .map((tp) => ({
        name: tp.name,
        term: tp.term,
        subtopics: taxonomy.subtopics
          .filter((st) => st.topic_id === tp.id)
          .map((st) => st.name),
      }))
      .sort((a, b) => (a.term ?? 9) - (b.term ?? 9) || a.name.localeCompare(b.name));
    return buildPrompt({
      subject: subjectName,
      grade: gradeName,
      count,
      locale,
      topics,
      mixed: questionMode === "mixed",
    });
  }, [
    ready,
    taxonomy,
    subjectId,
    gradeId,
    subjectName,
    gradeName,
    count,
    locale,
    questionMode,
  ]);

  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Insecure context (LAN IP) or a denied permission — the text stays on
      // screen and selectable, so tell the admin to copy it manually.
      setCopyError(true);
    }
  }

  return (
    <details className="ai-prompt">
      <summary>{tt("aiprompt.title")}</summary>
      <div className="ai-prompt-body">
        <p className="hint">{tt("aiprompt.intro")}</p>
        <p className="hint">{tt("aiprompt.curriculumNote")}</p>
        <p className="hint">{tt("aiprompt.mixedNote")}</p>
        <p className="hint">{tt("aiprompt.englishNote")}</p>

        {!ready ? (
          <p className="hint">{tt("aiprompt.pickFirst")}</p>
        ) : (
          <>
            <div className="ai-prompt-actions">
              <label className="qfilters-size">
                <span>{tt("aiprompt.count")}</span>
                <select
                  value={String(count)}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn-ghost" onClick={copy}>
                {tt("aiprompt.copy")}
              </button>
              {copied && (
                <span className="ai-prompt-copied" role="status">
                  {tt("aiprompt.copied")}
                </span>
              )}
            </div>
            {copyError && (
              <p className="form-error">{tt("aiprompt.copyFailed")}</p>
            )}
            <pre className="ai-prompt-text">{prompt}</pre>
          </>
        )}
      </div>
    </details>
  );
}
