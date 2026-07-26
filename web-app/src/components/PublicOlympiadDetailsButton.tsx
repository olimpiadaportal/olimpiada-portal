"use client";

// Round 49 (owner): on the PUBLIC surfaces the "Ətraflı" button opens a MODAL,
// exactly like the parent dashboard's catalog — not a navigation to another
// page. The standalone /olympiad-packages/[code] page still exists (direct
// links, SEO, sharing), but the button no longer takes the visitor away from
// the listing they were browsing.
//
// The modal body renders the SAME <OlympiadDetailsRows/> the parent modal and
// the details page use, so all three can never drift. Rows arrive already
// localized and display-ready from the server component — this island holds no
// i18n and no business logic, only the open/close state a modal needs.
import { useState } from "react";
import { Modal } from "@/components/Modal";
import {
  OlympiadDetailsRows,
  type OlympiadDetailRow,
} from "@/components/OlympiadDetails";

export function PublicOlympiadDetailsButton({
  title,
  rows,
  description,
  labels,
}: {
  /** Package title — also the modal heading. */
  title: string;
  rows: readonly OlympiadDetailRow[];
  description?: string | null;
  labels: {
    /** "Ətraflı" */
    open: string;
    /** Modal close button label. */
    close: string;
    /** Heading above the free-text description block. */
    description: string;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="poly-details-btn"
        onClick={() => setOpen(true)}
        // A grid renders one of these per package, so the visible label alone
        // gives every button the identical accessible name ("Ətraflı"). Name
        // each by its package, and announce that it opens a dialog.
        aria-label={`${labels.open} — ${title}`}
        aria-haspopup="dialog"
      >
        {labels.open}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        closeLabel={labels.close}
      >
        <OlympiadDetailsRows
          rows={rows}
          description={description}
          descriptionLabel={labels.description}
        />
      </Modal>
    </>
  );
}
