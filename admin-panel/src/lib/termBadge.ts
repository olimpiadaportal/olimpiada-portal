// Round 52 (§9/§10) — the single source for Rüb (term) badge classes.
//
// Lives in its own module because BOTH the questions table and the question
// form render the badge: putting it in either component would make the other
// import it, and QuestionsTable → EditQuestionModal → QuestionForm is already a
// chain (a re-import would close the cycle).
//
// Colours are CSS tokens (--term-N-fg/bg/bd in globals.css), never literals, so
// the badge follows the panel theme. The term DIGIT stays in the visible label,
// so the colour is redundant encoding — never the only way to read the value.

export function termClass(term: number | null | undefined): string {
  return term != null && Number.isInteger(term) && term >= 1 && term <= 4
    ? `term-badge term-badge-${term}`
    : "term-badge term-badge-none";
}
