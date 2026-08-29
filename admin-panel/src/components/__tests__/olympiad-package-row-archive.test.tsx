// The package LIST row's two actions, and the one property that makes them
// safe to sit in a table.
//
// THE REPORTED DEFECT. Archiving a purchased package was never blocked — only
// hard delete is, and that block is project law. What was missing was a button:
// the row offered Edit and Delete, so an admin met a DISABLED Delete and a red
// sentence recommending an archive with nothing to click. A click-through of
// "delete is refused" passes either way, which is exactly why this is pinned
// here: the assertion that matters is that the archive control is ENABLED in
// the same render where delete is refused.
//
// THE PROPERTY THE BOUNDARY EXISTS FOR. One dialog is hoisted ABOVE the table.
// A per-row dialog would be destroyed by the revalidation that follows its own
// mutation — the row unmounts and takes the answer with it — so the last test
// removes the row after the mutation and demands the result is still readable.
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The dialog imports the "use server" action module; its body must never run in
// jsdom, so the whole module is replaced.
const mocks = vi.hoisted(() => ({
  loadPreview: vi.fn(),
  archive: vi.fn(),
  del: vi.fn(),
  // ONE stable router object. A fresh object per call would change the identity
  // in the dialog's post-archive effect deps on every render, and that effect
  // bumps state — a re-render loop the test would only show as a timeout.
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
}));
vi.mock("@/lib/admin/olympiad", () => ({
  loadOlympiadPackageDeletionPreview: mocks.loadPreview,
  archiveOlympiadPackageAction: mocks.archive,
  deleteOlympiadPackageAction: mocks.del,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import type { OlympiadPackageDeleteStrings } from "@/components/OlympiadPackageDeleteButton";
import {
  OlympiadPackageArchiveTrigger,
  OlympiadPackageDeleteBoundary,
  OlympiadPackageDeleteTrigger,
} from "@/components/OlympiadPackageDeleteBoundary";

const ROW_ARCHIVE = "Archive…";
const ROW_DELETE = "Delete…";

const STRINGS: OlympiadPackageDeleteStrings = {
  open: ROW_DELETE,
  title: "Archive or delete package",
  loading: "Checking…",
  loadFailed: "Could not load",
  cancel: "Cancel",
  close: "Close",
  working: "Deleting…",
  irreversible: "This cannot be undone.",
  ackLabel: "I understand this is permanent.",
  intro: "What happens to “{name}”?",
  impact: "Attached to this package",
  impactOwners: "{n} purchase(s)",
  impactEntitlements: "{n} entitlement(s)",
  impactQuestions: "{total} questions ({deletable} deletable, {archived} archived)",
  impactMedia: "{n} orphaned image(s)",
  cascade: "Cascade",
  ownersNote: "Buyers keep lifetime access either way.",
  noOwners: "Nobody owns this package yet.",
  archiveTitle: "Archive the package",
  archiveDesc: "It leaves the catalogue; buyers keep it.",
  archiveAction: "Archive",
  archivedAlready: "This package is already archived.",
  archiving: "Archiving…",
  recommended: "Recommended",
  confirmHeading: "Confirmation",
  confirmIntro: "The delete below needs this ticked.",
  gateHint: "Tick the box to enable deleting.",
  blockedTitle: "Not possible:",
  outcomeDelete: "The package will be deleted.",
  outcomeArchive: "The package will be archived instead.",
  deleteTitle: "Delete the package",
  deleteDesc: "Everything above goes with it.",
  deleteAction: "Delete package",
};

const PKG = "dddddddd-4444-4444-8444-444444444444";
const OTHER = "eeeeeeee-5555-4555-8555-555555555555";

/** A package somebody bought: delete is refused, archive is not. */
function preview(over: Record<string, unknown> = {}) {
  return {
    id: PKG,
    code: "oly-2026-riy-6",
    titleAz: "Riyaziyyat 6",
    status: "active",
    ok: false,
    // Already-localized finished sentences, as the loader returns them.
    blockedBy: ["42 parents bought this package — archive it instead."],
    owners: { purchases: 42, entitlements: 3 },
    outcome: "delete" as const,
    questions: { total: 120, deletable: 100, archivedInstead: 20, alreadyArchived: 0 },
    deleteCascade: {
      grades: 2,
      translations: 6,
      poolLinks: 120,
      rotations: 40,
      questionTranslations: 240,
      answerOptions: 600,
    },
    archiveCascade: { rotations: 40, questionTranslations: 0, answerOptions: 0 },
    orphanMedia: 0,
    ...over,
  };
}

/** The list, reduced to what the boundary sees: rows that can disappear. */
function Harness({ ids = [PKG, OTHER] }: { ids?: string[] }) {
  return (
    <OlympiadPackageDeleteBoundary strings={STRINGS}>
      <table>
        <tbody>
          {ids.map((id) => (
            <tr key={id}>
              <td>
                <OlympiadPackageArchiveTrigger packageId={id} label={ROW_ARCHIVE} />
                <OlympiadPackageDeleteTrigger packageId={id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </OlympiadPackageDeleteBoundary>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadPreview.mockResolvedValue(preview());
  mocks.archive.mockResolvedValue({ ok: true, message: "The package was archived." });
  mocks.del.mockResolvedValue({ ok: false, error: "Refused", blocks: [] });
});

/** Open the hoisted dialog from the first row's archive button. */
async function openFromArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: ROW_ARCHIVE })[0]);
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(STRINGS.archiveTitle);
  return dialog;
}

describe("olympiad package list — the row's two actions", () => {
  it("gives every row a separately labelled Archive beside Delete", () => {
    render(<Harness />);
    expect(screen.getAllByRole("button", { name: ROW_ARCHIVE })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: ROW_DELETE })).toHaveLength(2);
    // Nothing is mounted until something is pressed: the dialog belongs to the
    // boundary, not to the rows.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens ONE shared dialog from the archive trigger, for that row's package", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openFromArchive(user);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(mocks.loadPreview).toHaveBeenCalledWith(PKG);
  });

  it("targets the row that was pressed, not the first one", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getAllByRole("button", { name: ROW_ARCHIVE })[1]);
    await screen.findByRole("dialog");

    expect(mocks.loadPreview).toHaveBeenCalledWith(OTHER);
  });

  // THE POINT OF THE WHOLE CHANGE. Buyers make the delete impossible and always
  // will (CLAUDE.md: a purchased package is never deleted). The archive must
  // stay live in that very state — otherwise the admin is back to a red
  // sentence with nothing to click.
  it("keeps Archive ENABLED in the same render where Delete is refused", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openFromArchive(user);

    const archive = within(dialog).getByRole("button", { name: STRINGS.archiveAction });
    const del = within(dialog).getByRole("button", { name: STRINGS.deleteAction });

    expect(archive).toBeEnabled();
    expect(del).toBeDisabled();
    // The refusal is stated, and the acknowledgement cannot talk past it.
    expect(within(dialog).getByText(STRINGS.blockedTitle)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox"));
    expect(del).toBeDisabled();
    expect(archive).toBeEnabled();
  });

  it("submits the archive with the package id the row targeted", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openFromArchive(user);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.archiveAction }));

    await screen.findByText("The package was archived.");
    const fd = mocks.archive.mock.calls.at(-1)![1] as FormData;
    expect(fd.get("__id")).toBe(PKG);
    // Archiving destroys nothing, so the dialog re-reads the counts instead of
    // navigating: the delete branch below must not keep arguing from numbers
    // that were true before the archive.
    await waitFor(() =>
      expect(mocks.loadPreview.mock.calls.length).toBeGreaterThan(1),
    );
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  // The boundary's reason to exist. A dialog living in the row would be
  // unmounted by the revalidation its own mutation triggers, and the outcome
  // would vanish in the same commit that should have shown it.
  it("keeps the outcome readable after the row itself disappears", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    const dialog = await openFromArchive(user);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.archiveAction }));
    await screen.findByText("The package was archived.");

    // Revalidation with a status filter active: the archived row is no longer
    // part of the list.
    rerender(<Harness ids={[OTHER]} />);

    expect(screen.queryAllByRole("button", { name: ROW_ARCHIVE })).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("The package was archived.")).toBeInTheDocument();
  });

  it("renders nothing outside a boundary rather than opening a second dialog", () => {
    // A trigger dropped into a page that forgot the boundary must not silently
    // grow its own state — there would be nowhere for the result to live.
    function Stray() {
      const [n] = useState(0);
      return (
        <>
          <OlympiadPackageArchiveTrigger packageId={PKG} label={ROW_ARCHIVE} />
          <span>{n}</span>
        </>
      );
    }
    render(<Stray />);
    expect(screen.queryByRole("button", { name: ROW_ARCHIVE })).toBeNull();
  });
});
