// The two UI properties of this round that fail SILENTLY in a click-through.
//
//   1. A tri-state header checkbox whose `indeterminate` was never set looks
//      exactly like an unchecked one, and a selection that outlives the filter
//      that hid its rows looks exactly like a selection you can read. Both ship
//      green and both end with somebody deleting a question they never saw.
//   2. The shared dialog's TOKEN-FREE mode removes the typed confirmation. If
//      the acknowledgement did not become mandatory in exchange, a bulk delete
//      would be one unguarded click — and nothing about the rendered page would
//      say so.
//   3. Modal's focus effect used to depend on the `onClose` identity, which
//      every caller re-creates each render. Any field whose state lives in the
//      Modal's PARENT therefore lost focus after one character — which is the
//      confirmation-code box, i.e. the friction the whole dialog is built
//      around. It is pinned here because a browser test of "delete is blocked"
//      passes either way: the button stays disabled for the right reason and
//      the wrong one.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The manager imports the "use server" module for its actions; none of them are
// called by these tests, so the whole module is stubbed rather than executed.
const deleteOlympiadQuestionsAction = vi.fn(async (..._args: unknown[]) => null);
vi.mock("@/lib/admin/olympiad", () => ({
  deleteOlympiadPackageQuestion: vi.fn(async () => null),
  deleteOlympiadQuestionsAction: (...a: unknown[]) =>
    (deleteOlympiadQuestionsAction as (...x: unknown[]) => unknown)(...a),
  setOlympiadPoolQuestionStatus: vi.fn(async () => null),
  loadOlympiadPoolQuestion: vi.fn(async () => null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
// The editor form pulls in the media uploader and the whole question schema —
// irrelevant here, and it is never opened by these tests.
vi.mock("@/components/OlympiadQuestionForm", () => ({
  OlympiadQuestionForm: () => null,
}));

import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";
import { Modal } from "@/components/Modal";
import {
  OlympiadQuestionManager,
  type OlympiadPoolBulkStrings,
  type OlympiadPoolRow,
} from "@/components/OlympiadQuestionManager";

const BASE: DestructiveConfirmStrings = {
  open: "Delete selected",
  title: "Delete the selected questions",
  loading: "Checking…",
  loadFailed: "Could not load",
  blockedTitle: "Not possible:",
  warnTitle: "Careful:",
  irreversible: "This cannot be undone.",
  codeLabel: "Confirmation code",
  codeHint: "Type this code:",
  ackLabel: "I understand this is permanent.",
  cancel: "Cancel",
  close: "Close",
  working: "Deleting…",
};

const BULK: OlympiadPoolBulkStrings = {
  ...BASE,
  // Required on THIS dialog: the bulk delete always asks for the package code
  // (BASE types them as optional because a dialog may run without one).
  codeLabel: "Confirmation code",
  codeHint: "Type this code:",
  selected: "{n} selected",
  selectAll: "Select every question on screen",
  selectRow: "Select this question",
  clear: "Clear selection",
  count: "Selected questions",
  grades: "Grades",
  deleteTitle: "Delete the selected questions",
  deleteDesc: "Unanswered questions are deleted; answered ones are archived.",
  deleteAction: "Delete the selected questions",
};

function row(id: string, num: number, gradeId: string, gradeName: string): OlympiadPoolRow {
  return {
    id,
    num,
    gradeId,
    gradeName,
    // Empty = no topic set, which is the ordinary case for an olympiad pool
    // imported without topic metadata.
    excerpt: `question ${num}`,
    search: `question ${num}`.toLowerCase(),
    optionCount: 5,
    hasImage: false,
    status: "published",
    updatedAt: "2026-08-14",
  };
}

const G6 = "11111111-1111-4111-8111-111111111111";
const G7 = "22222222-2222-4222-8222-222222222222";
const ROWS: OlympiadPoolRow[] = [
  row("aaaaaaaa-1111-4111-8111-111111111111", 1, G6, "6"),
  row("bbbbbbbb-2222-4222-8222-222222222222", 2, G6, "6"),
  row("cccccccc-3333-4333-8333-333333333333", 3, G7, "7"),
];

const PKG_CODE = "oly-2026-riy-6";

function renderManager() {
  return render(
    <OlympiadQuestionManager
      dict={{}}
      bulkStrings={BULK}
      packageId="dddddddd-4444-4444-8444-444444444444"
      packageCode={PKG_CODE}
      subjectName="Riyaziyyat"
      packageGrades={[
        { value: G6, label: "6" },
        { value: G7, label: "7" },
      ]}
      rows={ROWS}
      // Both grades carry a floor of 2, so a selection of 2 grade-6 rows is a
      // shortfall and the preview has something real to say.
      floors={[
        { gradeId: G6, label: "6", perAttempt: 2 },
        { gradeId: G7, label: "7", perAttempt: 2 },
      ]}
    />,
  );
}

const headBox = () =>
  screen.getByRole("checkbox", { name: BULK.selectAll }) as HTMLInputElement;
const rowBoxes = () =>
  screen.getAllByRole("checkbox", { name: BULK.selectRow }) as HTMLInputElement[];

describe("olympiad pool — selection", () => {
  it("has no bulk toolbar until something is ticked", () => {
    renderManager();
    expect(screen.queryByText("1 selected")).toBeNull();
    expect(headBox().checked).toBe(false);
  });

  it("shows the header checkbox as INDETERMINATE while only some rows are ticked", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(rowBoxes()[0]);

    // The property, not the attribute — this is the assertion the whole
    // tri-state depends on.
    expect(headBox().indeterminate).toBe(true);
    expect(headBox().checked).toBe(false);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("select-all covers every visible row, and clears back to none", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(headBox());
    expect(rowBoxes().every((b) => b.checked)).toBe(true);
    expect(headBox().indeterminate).toBe(false);
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    await user.click(headBox());
    expect(rowBoxes().some((b) => b.checked)).toBe(false);
    expect(screen.queryByText("3 selected")).toBeNull();
  });

  /** One grade chip in the filter group, by its visible label. */
  const gradeChip = (label: string) =>
    within(screen.getByRole("group", { name: "olyq.filter.grades" })).getByRole(
      "button",
      { name: label },
    );

  it("select-all after a grade filter takes ONLY the rows on screen", async () => {
    const user = userEvent.setup();
    renderManager();

    // The grade filter is a group of toggle CHIPS now, not a <select>: a
    // native multi-select needs ctrl-click to deselect, which no admin
    // discovers, and this control sits directly above select-all + bulk delete.
    await user.click(gradeChip("7"));
    await user.click(headBox());

    expect(rowBoxes()).toHaveLength(1);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("shows BOTH grades when two chips are picked (§2 multi-select)", async () => {
    const user = userEvent.setup();
    renderManager();

    // One chip narrows to a single grade...
    await user.click(gradeChip("7"));
    expect(rowBoxes()).toHaveLength(1);

    // ...a second chip WIDENS rather than replacing, which is the whole point
    // of the owner's "Grade 3 + Grade 5" requirement. A single-value <select>
    // could not express this state at all.
    await user.click(gradeChip("6"));
    expect(rowBoxes()).toHaveLength(3);

    // And clearing the last chip returns to ALL, never to an empty table.
    await user.click(gradeChip("7"));
    await user.click(gradeChip("6"));
    expect(rowBoxes()).toHaveLength(3);
  });

  it("PRUNES the selection when a filter hides the ticked rows", async () => {
    const user = userEvent.setup();
    renderManager();

    // Two grade-6 rows ticked…
    await user.click(rowBoxes()[0]);
    await user.click(rowBoxes()[1]);
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // …then filtered off screen. They must not survive: the count would stop
    // describing the table, and a confirmed delete would take rows the admin
    // can no longer read.
    // The grade filter is a group of toggle CHIPS now, not a <select>: a
    // native multi-select needs ctrl-click to deselect, which no admin
    // discovers, and this control sits directly above select-all + bulk delete.
    await user.click(gradeChip("7"));
    expect(screen.queryByText("2 selected")).toBeNull();
    expect(rowBoxes()[0].checked).toBe(false);
  });

  it("clear-selection empties the toolbar without touching the rows", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(rowBoxes()[0]);
    await user.click(screen.getByRole("button", { name: BULK.clear }));

    expect(screen.queryByText("1 selected")).toBeNull();
    expect(rowBoxes()).toHaveLength(3);
  });

  it("opens the confirmation with the selected count and the affected grades", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(headBox());
    await user.click(screen.getByRole("button", { name: BULK.open }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`${BULK.count}: 3`)).toBeInTheDocument();
    expect(within(dialog).getByText(`${BULK.grades}: 6, 7`)).toBeInTheDocument();
    // The copy must not promise a plain delete — the database archives the
    // answered ones.
    expect(within(dialog).getByText(BULK.deleteDesc)).toBeInTheDocument();
    expect(within(dialog).getByText(BULK.irreversible)).toBeInTheDocument();
  });

  // The finding this suite exists to keep closed: the bulk RPC is granted to
  // `authenticated`, so it is a PostgREST endpoint an admin session can POST
  // 500 ids at. A dialog that asked for nothing the DATABASE re-checks would
  // leave the confirmation entirely on the client.
  it("demands the package CODE and the acknowledgement before it will submit", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(headBox());
    await user.click(screen.getByRole("button", { name: BULK.open }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(`${BULK.count}: 3`);

    const submit = within(dialog).getByRole("button", { name: BULK.deleteAction });
    const field = within(dialog).getByRole("textbox");
    const ack = within(dialog).getByRole("checkbox");

    expect(submit).toBeDisabled();
    // The code alone is not enough…
    await user.type(field, PKG_CODE);
    expect(submit).toBeDisabled();
    // …nor is the acknowledgement alone.
    await user.clear(field);
    await user.click(ack);
    expect(submit).toBeDisabled();
    await user.type(field, PKG_CODE);
    expect(submit).toBeEnabled();
  });

  it("refuses a code that is nearly right", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(headBox());
    await user.click(screen.getByRole("button", { name: BULK.open }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(`${BULK.count}: 3`);

    await user.click(within(dialog).getByRole("checkbox"));
    await user.type(within(dialog).getByRole("textbox"), `${PKG_CODE}x`);
    expect(within(dialog).getByRole("button", { name: BULK.deleteAction })).toBeDisabled();
  });

  it("posts the typed code as __code, so the database can compare it", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(rowBoxes()[0]);
    await user.click(screen.getByRole("button", { name: BULK.open }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(`${BULK.count}: 1`);

    await user.click(within(dialog).getByRole("checkbox"));
    await user.type(within(dialog).getByRole("textbox"), PKG_CODE);
    await user.click(within(dialog).getByRole("button", { name: BULK.deleteAction }));

    expect(deleteOlympiadQuestionsAction).toHaveBeenCalled();
    const fd = deleteOlympiadQuestionsAction.mock.calls.at(-1)![1] as FormData;
    expect(fd.get("__code")).toBe(PKG_CODE);
    expect(fd.get("ids")).toBe(ROWS[0].id);
  });
});

describe("DestructiveConfirmDialog — token-free mode", () => {
  function Harness({ withCode }: { withCode: boolean }) {
    return (
      <DestructiveConfirmDialog<{ code: string }>
        strings={BASE}
        loadPreview={async () => ({ code: "pkg-2026" })}
        code={withCode ? (p) => p.code : undefined}
        details={() => <p>details</p>}
      >
        {(_p, gate) => (
          <DestructiveActionForm
            gate={gate}
            actionKey="x"
            action={async () => ({ ok: true as const, message: "done" })}
            fields={{ __id: "1" }}
            title="Delete"
            description="desc"
            label="Delete it"
          />
        )}
      </DestructiveConfirmDialog>
    );
  }

  it("drops the code field and FORCES the acknowledgement when no code is given", async () => {
    const user = userEvent.setup();
    render(<Harness withCode={false} />);
    await user.click(screen.getByRole("button", { name: BASE.open }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("details");

    expect(within(dialog).queryByText(BASE.codeLabel!)).toBeNull();
    const ack = within(dialog).getByRole("checkbox");
    const submit = within(dialog).getByRole("button", { name: "Delete it" });

    expect(submit).toBeDisabled();
    await user.click(ack);
    expect(submit).toBeEnabled();
  });

  it("still demands the typed code — and only the exact one — when a code IS given", async () => {
    const user = userEvent.setup();
    render(<Harness withCode />);
    await user.click(screen.getByRole("button", { name: BASE.open }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("details");

    const field = within(dialog).getByRole("textbox");
    const submit = within(dialog).getByRole("button", { name: "Delete it" });
    // No acknowledgement checkbox: this branch did not ask for one, and the
    // dialog only forces it in the token-free mode.
    expect(within(dialog).queryByRole("checkbox")).toBeNull();

    expect(submit).toBeDisabled();
    await user.type(field, "pkg-2025");
    expect(submit).toBeDisabled();
    await user.clear(field);
    await user.type(field, "pkg-2026");
    expect(submit).toBeEnabled();
  });

  it("renders no trigger of its own in controlled mode, and reports its close", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <DestructiveConfirmDialog<{ code: string }>
        strings={BASE}
        loadPreview={async () => ({ code: "pkg-2026" })}
        details={() => <p>details</p>}
        open
        onOpenChange={onOpenChange}
      >
        {() => null}
      </DestructiveConfirmDialog>,
    );

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("details");
    // The only "open"-labelled button would be the built-in trigger.
    expect(screen.queryByRole("button", { name: BASE.open })).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: BASE.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Modal — a field owned by the modal's parent stays focused", () => {
  it("accepts a whole typed string, not just its first character", async () => {
    const user = userEvent.setup();

    // The exact shape DestructiveConfirmDialog has: the value lives in the
    // Modal's PARENT, and onClose is a fresh inline arrow on every render.
    function Parent() {
      const [value, setValue] = useState("");
      return (
        <Modal isOpen onClose={() => {}} title="t" closeLabel="Close">
          <input
            aria-label="token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Modal>
      );
    }
    render(<Parent />);

    const field = screen.getByRole("textbox", { name: "token" }) as HTMLInputElement;
    await user.type(field, "pkg-2026");
    expect(field.value).toBe("pkg-2026");
    expect(document.activeElement).toBe(field);
  });
});
