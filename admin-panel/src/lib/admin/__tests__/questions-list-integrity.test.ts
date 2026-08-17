// The Admin -> Questions page, asserted against its own source.
//
// Every invariant below was a SHIPPED defect, and each one shares a shape: the
// page kept working, said nothing, and told the admin something false. A bulk
// delete that deleted zero rows and reported nothing. A pager that showed one
// question twice and another never. A failed count rendered as a confident 0.
// None of these can be caught by a query after the fact — by then the admin has
// already acted on the wrong number — so they are pinned here, at the source.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8").split("\r\n").join("\n");
}

const PAGE = read("src/app/(protected)/questions/page.tsx");
const ACTIONS = read("src/lib/admin/questions.ts");
const TABLE = read("src/components/QuestionsTable.tsx");
const SWEEP = read("src/lib/admin/media-sweep.ts");

// Comments in these files QUOTE the defective code they replaced, which is
// deliberate — the reasoning is worthless without the shape it argues against.
// So an assertion about what the code no longer does has to read code only.
function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("questions list: paging is deterministic", () => {
  it("orders by a UNIQUE final key", () => {
    // created_at was documented as "the tiebreaker so paging is deterministic"
    // and is not unique: one bulk import stamps a single timestamp across the
    // whole file. Tied rows may then be ordered differently between the query
    // that serves page 3 and the one that serves page 4 — the same question
    // appears twice while another never appears at all, and reviewing a status
    // page by page silently skips questions forever.
    const order = PAGE.slice(PAGE.indexOf("const loadRows"));
    const idOrder = order.indexOf('.order("id"');
    const createdOrder = order.indexOf('.order("created_at"');
    expect(idOrder, "the list must break ties on a unique column").toBeGreaterThan(-1);
    expect(
      idOrder > createdOrder,
      "the unique key must come LAST or it is not the tiebreaker",
    ).toBe(true);
  });

  it("never renders a failed query as an empty bank", () => {
    const body = PAGE.slice(PAGE.indexOf("const loadRows"), PAGE.indexOf("// Cheap head-only"));
    expect(body).toContain("error");
    expect(body).toContain("failed: true");
    expect(PAGE).toContain("qpage.loadFailed");
  });

  it("clamps the page to the last one that has rows", () => {
    // `page` was clamped at the bottom only, so a bulk action on the last page
    // stranded the admin on an empty table reading "Showing 0-2875 of 2875".
    expect(PAGE).toContain("page > totalPages");
    expect(PAGE).toMatch(/redirect\(href\(\{ page: String\(totalPages\) \}\)\)/);
  });

  it("does not render an unknown count as zero", () => {
    // `statTotal ?? 0` made an RLS failure or a timeout look like an empty bank
    // on the very cards an admin reads to decide whether there is work to do.
    expect(PAGE).not.toContain("count: statTotal ?? 0");
    expect(PAGE).toContain("count: statTotal ?? null");
    expect(PAGE).toContain('c.count === null ? "—"');
  });

  it("reports a capped result set instead of hiding it", () => {
    // Each id resolved for a `.in()` costs ~37 bytes of URL, so ~1000 matches
    // produced a request that was rejected outright — rendering "0-0 of 0" for
    // a word that appears everywhere.
    expect(PAGE).toContain("MAX_IN_IDS");
    expect(PAGE).toContain("searchCapped");
    expect(PAGE).toContain("qpage.resultsCapped");
  });

  it("only scans for option-E candidates when that chip is in use", () => {
    // The scan ran on EVERY page view, before the 25 visible rows could render.
    expect(PAGE).toMatch(/if \(review === "optionE"\) \{[\s\S]{0,400}answer_options\(count\)/);
  });
});

describe("bulk delete: reports what actually happened", () => {
  it("is an action-state action, not a void one", () => {
    // A bare `Promise<void>` action made total success, a guard abort that
    // deleted NOTHING, and a truncated selection render the same screen: none.
    expect(ACTIONS).toContain("export type BulkDeleteState");
    expect(ACTIONS).toMatch(
      /export async function bulkDeleteQuestions\(\s*_prev: BulkDeleteState,\s*formData: FormData,\s*\): Promise<BulkDeleteState>/,
    );
    expect(TABLE).toContain("useActionState(bulkDeleteQuestions, null)");
    expect(
      codeOnly(TABLE).includes("action={bulkDeleteQuestions}"),
      "the form must post to the action-state wrapper, not the raw action",
    ).toBe(false);
    expect(codeOnly(TABLE)).toContain("action={delAction}");
  });

  it("partitions answered questions BEFORE deleting", () => {
    // trg_question_delete_guard is a BEFORE DELETE **FOR EACH ROW** trigger
    // that RAISES, so one answered question aborts the whole statement and
    // NOTHING is deleted. Filtering first is the difference between "43 of 50
    // deleted, 7 need archiving" and a silent no-op.
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function bulkDeleteQuestions"));
    const partition = fn.indexOf("test_attempt_answers");
    const del = fn.indexOf(".delete()");
    expect(partition, "the answered set must be resolved").toBeGreaterThan(-1);
    expect(partition < del, "it must be resolved BEFORE the delete runs").toBe(true);
  });

  it("authorizes before reading any client-supplied FormData", () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function bulkDeleteQuestions"));
    expect(fn.indexOf("requireAdmin()")).toBeLessThan(fn.indexOf("rawIdList(formData)"));
  });

  it("keeps the olympiad-pool scope guard on both the read and the delete", () => {
    const fn = ACTIONS.slice(
      ACTIONS.indexOf("export async function bulkDeleteQuestions"),
      ACTIONS.indexOf("export type BulkTransitionState"),
    );
    expect(fn.split('.is("olympiad_package_id", null)').length - 1).toBeGreaterThanOrEqual(2);
  });

  it("reports a truncated selection rather than shrinking silently", () => {
    expect(ACTIONS).toContain("MAX_BULK_IDS");
    expect(ACTIONS).toContain("truncated");
    expect(TABLE).toContain("qbulk.del.truncated");
  });

  it("writes an audit row for the destructive action", () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function bulkDeleteQuestions"));
    expect(fn).toContain("writeAuditLog");
    expect(fn).toContain("admin.questions.bulk_delete");
  });
});

describe("bulk delete: does not orphan media", () => {
  it("collects the media BEFORE the questions are deleted", () => {
    // The FK is `on delete set null`, so once the questions go nothing points
    // at the assets: the row survives, the Storage object survives, and the
    // image stays publicly fetchable at its original URL forever.
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function bulkDeleteQuestions"));
    const collect = fn.indexOf("collectQuestionMediaIds");
    const del = fn.indexOf(".delete()");
    expect(collect).toBeGreaterThan(-1);
    expect(collect < del, "media must be collected before the delete").toBe(true);
  });

  it("re-checks references AFTER the delete before sweeping", () => {
    // An asset shared with a question that SURVIVED must not be swept, or
    // deleting one question blanks out another's image.
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function bulkDeleteQuestions"));
    const del = fn.indexOf(".delete()");
    const filter = fn.indexOf("filterUnreferencedMedia");
    expect(filter).toBeGreaterThan(-1);
    expect(filter > del, "the reference probe must run after the delete").toBe(true);
  });

  it("covers all three tables that can hold a question's media", () => {
    for (const table of [
      "question_translations",
      "question_explanations",
      "answer_option_translations",
    ]) {
      expect(SWEEP, `${table} must be probed for media references`).toContain(table);
    }
  });

  it("filters each table by a column that actually exists", () => {
    // THIS SHIPPED BROKEN. The sweep filtered answer_option_translations by
    // `answer_option_id`; the column is `option_id` (004). supabase-js RETURNS
    // errors instead of throwing, so the bad name produced `data: null`, the
    // result was read as "no option images", and every per-option image leaked
    // permanently and silently. Assert the names against the schema itself
    // rather than against memory.
    const ddl = readFileSync(
      resolve(process.cwd(), "..", "supabase/sql/004_content_questions_tests.sql"),
      "utf8",
    ).split("\r\n").join("\n");
    const columnsOf = (table: string): string => {
      const start = ddl.indexOf(`create table if not exists public.${table} (`);
      expect(start, `${table} must exist in 004`).toBeGreaterThan(-1);
      return ddl.slice(start, ddl.indexOf("\n);", start));
    };
    // Every `.in("<col>", …)` the collector issues, paired with its table.
    const pairs: [string, string][] = [
      ["question_translations", "question_id"],
      ["question_explanations", "question_id"],
      ["answer_option_translations", "option_id"],
      ["answer_options", "question_id"],
    ];
    for (const [table, col] of pairs) {
      expect(SWEEP, `media-sweep must filter ${table} by ${col}`).toContain(
        `.in("${col}"`,
      );
      expect(
        new RegExp(`^\\s*${col}\\s`, "m").test(columnsOf(table)),
        `${table}.${col} must be a real column in 004`,
      ).toBe(true);
    }
    expect(
      codeOnly(SWEEP).includes("answer_option_id"),
      "answer_option_id is not a column anywhere — it was the shipped typo",
    ).toBe(false);
  });

  it("checks the error on every collect query", () => {
    // A swallowed error here does not fail loudly; it reports "no media" and
    // leaks the bytes forever.
    const fn = SWEEP.slice(
      SWEEP.indexOf("export async function collectQuestionMediaIds"),
      SWEEP.indexOf("export async function filterUnreferencedMedia"),
    );
    const selects = fn.split("await supabase").length - 1;
    // Both destructuring shapes count: the plain one and the aliased one the
    // option lookup needs.
    const checked =
      (fn.split("const { data, error }").length - 1) +
      (fn.split("error: optsError").length - 1);
    expect(checked, "every collect query must destructure its error").toBe(selects);
  });

  it("treats a failed reference probe as in-use, never as unreferenced", () => {
    // Reading a probe failure as "nothing references this" would delete a live
    // image — the failure mode must be a leaked orphan, not a lost picture.
    expect(SWEEP).toMatch(/if \(error\) return \[\];/);
  });
});

describe("selection cannot reach rows the admin can no longer see", () => {
  it("resets when the row set changes", () => {
    // Selection used to be plain state nothing reconciled against the rows, so
    // it survived a page turn, a filter change and a sort INVISIBLY: tick 25
    // rows on page 1, page forward to an empty checkbox column, and the bar
    // still read "25 seçildi" over a live Delete button.
    expect(TABLE).toContain("rowsKey");
    expect(TABLE).toMatch(/if \(seenRowsKey !== rowsKey\) \{[\s\S]{0,200}setSel\(new Set\(\)\)/);
  });

  it("names the count in the delete confirmation", () => {
    expect(TABLE).toContain("qbulk.confirmDeleteN");
  });
});
