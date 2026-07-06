// Pure helpers shared by the question editor (client) and the question-types
// admin pages (server) for rendering a type's structure rules. No server code
// here — safe to import from both sides.

export type TypeRuleConfig = {
  options_required: number | null;
  correct_required: number | null;
};

// "5 answer options, 1 correct answer" — built from the config columns so the
// summary always matches what the DB validator (assert_question_type_rules)
// actually enforces. `tr` is any translate function (t on the server, the
// dict lookup on the client).
export function typeRuleSummary(
  tr: (key: string) => string,
  c: TypeRuleConfig,
): string {
  const opts =
    c.options_required != null
      ? tr("qrule.exactOptions").replace("{n}", String(c.options_required))
      : tr("qrule.rangeOptions");
  const correct =
    c.correct_required != null
      ? tr("qrule.exactCorrect").replace("{n}", String(c.correct_required))
      : tr("qrule.minCorrect");
  return `${opts}, ${correct}`;
}
