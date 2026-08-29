// Display formatting for the child's 8-digit login ID.
//
// Twin of `groupChildId` in mobile-app/src/features/parent/commerce.ts — both
// halves of the product show the same number, so they group it the same way.
// Keep them in step if either changes.
//
// DISPLAY ONLY. The grouped form is never what gets copied, submitted or
// stored: "2721 0253" pasted into the login field fails, and the parent blames
// the ID rather than the space. Anything that hands the ID to the clipboard or
// to an input must use the raw string.

/** "1234 5678" display grouping for the 8-digit login ID. */
export function groupChildId(id: string): string {
  return id.length > 4 ? `${id.slice(0, 4)} ${id.slice(4)}` : id;
}
