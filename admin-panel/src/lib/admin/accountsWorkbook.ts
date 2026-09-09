import "server-only";

// Excel rendering for the Accounts export. Server-only: ExcelJS is a Node
// library and must never be pulled into a client bundle (its `browser` build
// is ~1 MB of code this panel has no use for).
//
// This module does FORMATTING ONLY. Every number it writes was computed in
// accounts-export.ts from one snapshot, so there is no arithmetic here that
// could disagree with sheet 1 — the two sheets are two views of one object.
//
// SHEET NAMES stay literal English ("Accounts Data" / "Statistics"): the owner
// specified them, and they double as stable identifiers for anyone scripting
// against the file. Everything a human reads INSIDE the sheets — title, column
// headers, values, statistic labels — is localized to the admin's panel locale.
import { Workbook, type Worksheet } from "exceljs";
import type { T } from "@/i18n/server";
import type {
  AccountsExport,
  AccountsStats,
  ChildLoginStatus,
  GenderCell,
} from "@/lib/admin/accounts-export";

// Panel palette, carried into the spreadsheet so the file looks like the
// product it came from (globals.css --brand / --border / --muted / --text).
const BRAND = "FF4F46E5";
const BRAND_DARK = "FF4338CA";
const BRAND_TINT = "FFEEF2FF";
const PAPER = "FFF8FAFC";
const BORDER = "FFE2E8F0";
const TEXT = "FF0F172A";
const MUTED = "FF64748B";
const WHITE = "FFFFFFFF";

// Calibri is Excel's default and renders the full Azerbaijani Latin set
// (ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ) on Windows, macOS and Excel Online. Do not
// swap it for a font without checking those glyphs — a report full of boxes is
// worse than a plain one.
const FONT = "Calibri";

const thin = { style: "thin" as const, color: { argb: BORDER } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };

const fill = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;

// --------------------------------------------------------------------------
// Sheet 1 — Accounts Data
// --------------------------------------------------------------------------

// Column order is the owner's, verbatim, ending with the relation key. Header
// text and width live on ONE row of this table rather than in two parallel
// arrays: a header list and a width list that drift apart mislabel a column,
// and a mislabelled column in a spreadsheet is invisible.
const COLUMNS: Array<{ header: string; width: number }> = [
  { header: "accexp.col.parentId", width: 38 },
  { header: "accexp.col.parentName", width: 26 },
  { header: "accexp.col.parentEmail", width: 30 },
  { header: "accexp.col.parentStatus", width: 18 },
  { header: "accexp.col.registeredAt", width: 18 },
  { header: "accexp.col.childCount", width: 12 },
  { header: "accexp.col.childId", width: 13 },
  { header: "accexp.col.childName", width: 26 },
  { header: "accexp.col.childGender", width: 15 },
  { header: "accexp.col.childLogin", width: 22 },
  { header: "accexp.col.childStatus", width: 20 },
  { header: "accexp.col.childRegisteredAt", width: 18 },
  { header: "accexp.col.relationKey", width: 30 },
];

const COL_COUNT = COLUMNS.length;

/** Row the column headers live on; everything above it is the title block. */
const HEADER_ROW = 5;

// GENDER LABELS — the migration-169 distinction, carried into the cell.
//   'notAsked'    -> "—": the child is real, nobody has been asked yet.
//   'unspecified' -> the words "Not specified": a parent WAS asked and declined.
//   null          -> empty: a childless parent's row, so there is no child to
//                    have an answer — the same rule the login column beside it
//                    already follows.
// A VISIBLE mark for 'notAsked' rather than an empty cell, deliberately: it
// survives a copy-paste into another sheet, it filters as its own value in the
// AutoFilter, and it is the only way an empty cell can be trusted to mean "no
// child". The legend on row 3 spells all three out in the admin's language.
// The privacy policy names this column: privacy.s5.stored tells parents the
// answer is on the child's profile, visible to staff "including in the
// internal account reports they export". Removing the column is a policy
// edit as well as a product one.
const NEVER_ASKED_MARK = "—";

function genderLabel(g: GenderCell | null, t: T): string {
  if (g === null) return "";
  if (g === "notAsked") return NEVER_ASKED_MARK;
  return t(`accexp.gender.${g}`);
}

function loginLabel(s: ChildLoginStatus | null, t: T): string {
  return s === null ? "" : t(`accexp.login.${s}`);
}

// access_status / account_status render through the SAME dictionary the
// Accounts page uses, so the file and the screen never disagree on a word.
const childStatusLabel = (s: string, t: T): string =>
  s ? t(`accounts.access.${s}`) : "";
const parentStatusLabel = (s: string, t: T): string =>
  s ? t(`accounts.status.${s}`) : "";

function writeTitleBlock(
  sheet: Worksheet,
  t: T,
  generatedAt: string,
  actorEmail: string | null,
): void {
  sheet.mergeCells(1, 1, 1, COL_COUNT);
  const title = sheet.getCell(1, 1);
  title.value = t("accexp.title");
  title.font = { name: FONT, size: 16, bold: true, color: { argb: BRAND_DARK } };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, COL_COUNT);
  const meta = sheet.getCell(2, 1);
  meta.value = [
    `${t("accexp.generated")}: ${generatedAt}`,
    actorEmail ? `${t("accexp.generatedBy")}: ${actorEmail}` : "",
    t("accexp.timezone"),
  ]
    .filter(Boolean)
    .join("   ·   ");
  meta.font = { name: FONT, size: 10, color: { argb: MUTED } };

  sheet.mergeCells(3, 1, 3, COL_COUNT);
  const legend = sheet.getCell(3, 1);
  legend.value = t("accexp.genderLegend");
  legend.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
}

function writeHeaderRow(sheet: Worksheet, t: T): void {
  const header = sheet.getRow(HEADER_ROW);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = t(col.header);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = fill(BRAND);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = BOX;
  });
  header.height = 30;
}

function buildDataSheet(wb: Workbook, data: AccountsExport, t: T, generatedAt: string, actorEmail: string | null): void {
  const sheet = wb.addWorksheet("Accounts Data", {
    // Freezing THROUGH the header row keeps the title block and the column
    // names on screen while the table scrolls.
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });

  COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  // Column-LEVEL alignment, set before any cell exists: ExcelJS merges a
  // column's style into every cell it creates afterwards, so this is three
  // style objects rather than three per row. It must run before the header is
  // written, because the header then re-states its own alignment on top.
  sheet.getColumn(6).alignment = { horizontal: "center" };
  sheet.getColumn(9).alignment = { horizontal: "center" };
  sheet.getColumn(10).alignment = { horizontal: "left" };

  writeTitleBlock(sheet, t, generatedAt, actorEmail);
  writeHeaderRow(sheet, t);

  // Body cells keep the workbook default font on purpose: styling every cell
  // of a table that may run to six figures of rows is what makes big exports
  // slow, and Calibri 11 is already the readable default. Alignment is applied
  // per COLUMN (one style object, not one per cell) where it earns its keep.
  for (const r of data.rows) {
    sheet.addRow([
      r.parentId,
      r.parentName,
      r.parentEmail,
      parentStatusLabel(r.parentStatus, t),
      r.parentRegisteredAt,
      r.childCount,
      // The 8-digit id is an IDENTIFIER, not a number: written as text so Excel
      // cannot strip a leading zero from it.
      r.childUniqueId,
      r.childName,
      genderLabel(r.childGender, t),
      loginLabel(r.childLogin, t),
      childStatusLabel(r.childStatus, t),
      r.childRegisteredAt,
      r.relationKey,
    ]);
  }

  // AutoFilter over the header row and every data row. With no rows at all the
  // range collapses onto the header, which is a valid filter and exactly what
  // an empty database should produce.
  const lastRow = HEADER_ROW + data.rows.length;
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastRow, column: COL_COUNT },
  };
}

// --------------------------------------------------------------------------
// Sheet 2 — Statistics
//
// KPI blocks: a bordered label/value pair per metric, grouped under section
// headings, every figure taken from the SAME snapshot object as sheet 1.
// --------------------------------------------------------------------------

const STAT_LABEL_COL = 1;
const STAT_VALUE_COL = 2;

type StatRow = { label: string; value: number; numFmt?: string };

function writeSection(sheet: Worksheet, row: number, title: string): number {
  sheet.mergeCells(row, STAT_LABEL_COL, row, STAT_VALUE_COL);
  const cell = sheet.getCell(row, STAT_LABEL_COL);
  cell.value = title;
  cell.font = { name: FONT, size: 12, bold: true, color: { argb: WHITE } };
  cell.fill = fill(BRAND);
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 22;
  return row + 1;
}

function writeStats(sheet: Worksheet, startRow: number, stats: StatRow[]): number {
  let row = startRow;
  for (const s of stats) {
    const label = sheet.getCell(row, STAT_LABEL_COL);
    label.value = s.label;
    label.font = { name: FONT, size: 11, color: { argb: TEXT } };
    label.fill = fill(PAPER);
    label.border = BOX;
    label.alignment = { vertical: "middle", wrapText: true };

    const value = sheet.getCell(row, STAT_VALUE_COL);
    value.value = s.value;
    value.numFmt = s.numFmt ?? "0";
    value.font = { name: FONT, size: 12, bold: true, color: { argb: BRAND_DARK } };
    value.fill = fill(BRAND_TINT);
    value.border = BOX;
    value.alignment = { vertical: "middle", horizontal: "right" };

    sheet.getRow(row).height = 20;
    row += 1;
  }
  return row + 1; // one blank row of breathing space between sections
}

function buildStatsSheet(
  wb: Workbook,
  stats: AccountsStats,
  t: T,
  generatedAt: string,
): void {
  const sheet = wb.addWorksheet("Statistics", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.getColumn(STAT_LABEL_COL).width = 52;
  sheet.getColumn(STAT_VALUE_COL).width = 18;

  sheet.mergeCells(1, 1, 1, 2);
  const title = sheet.getCell(1, 1);
  title.value = t("accexp.stats.title");
  title.font = { name: FONT, size: 16, bold: true, color: { argb: BRAND_DARK } };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, 2);
  const meta = sheet.getCell(2, 1);
  meta.value = `${t("accexp.generated")}: ${generatedAt}`;
  meta.font = { name: FONT, size: 10, color: { argb: MUTED } };

  let row = 4;

  row = writeSection(sheet, row, t("accexp.stats.parents"));
  row = writeStats(sheet, row, [
    { label: t("accexp.stats.totalParents"), value: stats.totalParents },
    { label: t("accexp.stats.activeParents"), value: stats.activeParents },
    { label: t("accexp.stats.inactiveParents"), value: stats.inactiveParents },
    {
      label: t("accexp.stats.parentsNoChildren"),
      value: stats.parentsWithoutChildren,
    },
    {
      label: t("accexp.stats.pctParentsWithChild"),
      value: stats.fracParentsWithChildren,
      numFmt: "0.0%",
    },
  ]);

  row = writeSection(sheet, row, t("accexp.stats.children"));
  row = writeStats(sheet, row, [
    { label: t("accexp.stats.totalChildren"), value: stats.totalChildren },
    { label: t("accexp.stats.activeChildren"), value: stats.activeChildren },
    { label: t("accexp.stats.inactiveChildren"), value: stats.inactiveChildren },
    {
      label: t("accexp.stats.pctActiveChildren"),
      value: stats.fracActiveChildren,
      numFmt: "0.0%",
    },
    {
      label: t("accexp.stats.avgChildren"),
      value: stats.avgChildrenPerParent,
      numFmt: "0.00",
    },
  ]);

  // Gender, INCLUDING the never-asked bucket. Four numbers, not three: folding
  // NULL into "not specified" is exactly what migration 169 forbids.
  row = writeSection(sheet, row, t("accexp.stats.gender"));
  row = writeStats(sheet, row, [
    { label: t("accexp.gender.female"), value: stats.genderFemale },
    { label: t("accexp.gender.male"), value: stats.genderMale },
    { label: t("accexp.gender.unspecified"), value: stats.genderUnspecified },
    { label: t("accexp.gender.notAsked"), value: stats.genderNotAsked },
  ]);

  // The two-way active/inactive split above hides 'trialing' inside
  // "inactive"; these breakdowns put every status back on the page.
  row = writeSection(sheet, row, t("accexp.stats.parentBreakdown"));
  row = writeStats(
    sheet,
    row,
    stats.parentStatusCounts.map(([status, count]) => ({
      label: parentStatusLabel(status, t),
      value: count,
    })),
  );

  row = writeSection(sheet, row, t("accexp.stats.childBreakdown"));
  row = writeStats(
    sheet,
    row,
    stats.childStatusCounts.map(([status, count]) => ({
      label: childStatusLabel(status, t),
      value: count,
    })),
  );

  // Definitions, so nobody has to reverse-engineer what "active" meant.
  for (const key of [
    "accexp.stats.activeNote",
    "accexp.stats.genderNote",
    "accexp.stats.loginNote",
  ]) {
    sheet.mergeCells(row, 1, row, 2);
    const note = sheet.getCell(row, 1);
    note.value = t(key);
    note.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
    note.alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(row).height = 28;
    row += 1;
  }
}

// --------------------------------------------------------------------------
// Entry point. Returns the finished .xlsx bytes.
//
// BUFFERED, not streamed, and deliberately: the Statistics sheet is computed
// from the same in-memory snapshot as the data sheet, so the whole dataset is
// already resident by construction — a streaming writer would save nothing and
// would forfeit the exact Content-Length that lets a browser show real download
// progress. The snapshot itself is what is bounded (EXPORT_MAX_ROWS in
// accounts-export-read.ts refuses rather than truncating).
// --------------------------------------------------------------------------
export async function buildAccountsWorkbook(
  data: AccountsExport,
  t: T,
  generatedAt: string,
  actorEmail: string | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new Workbook();
  wb.creator = "OlympIQ Admin Panel";
  wb.created = new Date();

  buildDataSheet(wb, data, t, generatedAt, actorEmail);
  buildStatsSheet(wb, data.stats, t, generatedAt);

  // The ArrayBuffer type argument is pinned (same reason as lib/zipWrite.ts):
  // a Response body rejects a possibly-shared backing buffer.
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}
