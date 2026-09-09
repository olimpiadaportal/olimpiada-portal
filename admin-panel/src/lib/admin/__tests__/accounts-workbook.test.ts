// @vitest-environment node
//
// The Accounts workbook, verified by READING BACK the bytes it produced rather
// than by inspecting the builder's intentions. Frozen panes, an autofilter and
// a merged title block are all things a spreadsheet library will happily accept
// and then not write; the only honest check is to open the file.
//
// The label lookup below is the REAL dictionary, so this suite also fails if a
// key is missing from az, en or ru — the trilingual rule, enforced rather than
// remembered.
import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { buildAccountsWorkbook } from "../accountsWorkbook";
import { buildAccountsExport, type ExportParent } from "../accounts-export";
import { messages } from "@/i18n/messages";
import { locales, type Locale } from "@/i18n/config";

const tFor =
  (locale: Locale) =>
  (key: string): string => {
    const value = messages[locale][key];
    // A missing key would otherwise fall back silently and ship an English
    // sheet to an Azerbaijani admin.
    if (value === undefined) throw new Error(`missing ${locale} message: ${key}`);
    return value;
  };

const GENERATED_AT = "8 sen 2026, 14:32";

const sample: ExportParent[] = [
  {
    profileId: "11111111-1111-1111-1111-111111111111",
    displayName: "Aygün Əliyeva",
    email: "aygun@example.com",
    status: "active",
    createdAt: "2026-04-01T08:00:00Z",
    children: [
      {
        childUniqueId: "10000001",
        firstName: "Aysu",
        lastName: "Əliyeva",
        gender: "female",
        accessStatus: "active",
        createdAt: "2026-05-01T10:00:00Z",
        hasCredentials: true,
      },
      {
        childUniqueId: "10000002",
        firstName: "Elvin",
        lastName: "Əliyev",
        gender: "unspecified", // asked, declined
        accessStatus: "trialing",
        createdAt: "2026-05-02T10:00:00Z",
        hasCredentials: true,
      },
      {
        childUniqueId: null,
        firstName: "Nigar",
        lastName: "Əliyeva",
        gender: null, // never asked
        accessStatus: "inactive",
        createdAt: "2026-05-03T10:00:00Z",
        hasCredentials: true,
      },
    ],
  },
  {
    profileId: "22222222-2222-2222-2222-222222222222",
    displayName: "Rəşad Quliyev",
    email: "resad@example.com",
    status: "suspended",
    createdAt: "2026-04-05T08:00:00Z",
    children: [], // must still appear as a row
  },
];

async function render(locale: Locale = "en", parents = sample) {
  const data = buildAccountsExport(parents);
  const bytes = await buildAccountsWorkbook(data, tFor(locale), GENERATED_AT, "admin@example.com");
  const wb = new Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  return { wb, data, t: tFor(locale) };
}

const HEADER_ROW = 5;

describe("accounts workbook", () => {
  it("has the two sheets the owner named, spelled exactly", async () => {
    const { wb } = await render();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Accounts Data",
      "Statistics",
    ]);
  });

  it("freezes through the header row and autofilters the data table", async () => {
    const { wb, data } = await render();
    const sheet = wb.getWorksheet("Accounts Data")!;

    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: HEADER_ROW });
    // ExcelJS hands the filter back as the A1 range it wrote into the file:
    // column A (Parent ID) through M (the relation key), header row to last row.
    expect(sheet.autoFilter).toBe(`A${HEADER_ROW}:M${HEADER_ROW + data.rows.length}`);
  });

  it("gives every column a width (nothing renders as ###)", async () => {
    const { wb } = await render();
    const sheet = wb.getWorksheet("Accounts Data")!;
    for (let c = 1; c <= 13; c += 1) {
      expect(sheet.getColumn(c).width ?? 0).toBeGreaterThan(8);
    }
  });

  it("writes the localized column headers in the owner's order", async () => {
    const { wb, t } = await render();
    const header = wb.getWorksheet("Accounts Data")!.getRow(HEADER_ROW);
    expect(header.getCell(1).value).toBe(t("accexp.col.parentId"));
    expect(header.getCell(6).value).toBe(t("accexp.col.childCount"));
    expect(header.getCell(9).value).toBe(t("accexp.col.childGender"));
    expect(header.getCell(10).value).toBe(t("accexp.col.childLogin"));
    expect(header.getCell(13).value).toBe(t("accexp.col.relationKey"));
    // Styled, not bare: bold white on the brand fill.
    expect(header.getCell(1).font?.bold).toBe(true);
  });

  it("renders 'never asked' and 'declined' as DIFFERENT gender cells", async () => {
    const { wb, t } = await render();
    const sheet = wb.getWorksheet("Accounts Data")!;

    // Rows are ordered parent-by-parent, children oldest first.
    expect(sheet.getRow(HEADER_ROW + 1).getCell(9).value).toBe(
      t("accexp.gender.female"),
    );
    expect(sheet.getRow(HEADER_ROW + 2).getCell(9).value).toBe(
      t("accexp.gender.unspecified"),
    );
    // NULL is the em dash, and it is NOT the word used for 'unspecified'.
    expect(sheet.getRow(HEADER_ROW + 3).getCell(9).value).toBe("—");
    // …and the legend on row 3 promises exactly that mark, in every locale.
    expect(String(sheet.getCell(3, 1).value)).toContain("—");
    expect(sheet.getRow(HEADER_ROW + 3).getCell(9).value).not.toBe(
      t("accexp.gender.unspecified"),
    );
  });

  it("reports login status from the credential row, not from activity", async () => {
    const { wb, t } = await render();
    const sheet = wb.getWorksheet("Accounts Data")!;
    expect(sheet.getRow(HEADER_ROW + 1).getCell(10).value).toBe(
      t("accexp.login.canSignIn"),
    );
    // The child with no allocated 8-digit id has no username yet.
    expect(sheet.getRow(HEADER_ROW + 3).getCell(10).value).toBe(
      t("accexp.login.noLoginId"),
    );
  });

  it("keeps the childless parent as a row with blank child columns", async () => {
    const { wb } = await render();
    const sheet = wb.getWorksheet("Accounts Data")!;
    const row = sheet.getRow(HEADER_ROW + 4); // second parent, no children

    expect(row.getCell(3).value).toBe("resad@example.com");
    expect(row.getCell(6).value).toBe(0);
    // Gender (9) and login (10) included: a childless parent must not borrow
    // the never-asked mark a real child gets.
    for (const col of [7, 8, 9, 10, 11, 12]) {
      expect(row.getCell(col).value ?? "").toBe("");
    }
  });

  it("keeps the 8-digit child id as text so a leading zero survives", async () => {
    const { wb } = await render("en", [
      { ...sample[0], children: [{ ...sample[0].children[0], childUniqueId: "01234567" }] },
    ]);
    const cell = wb.getWorksheet("Accounts Data")!.getRow(HEADER_ROW + 1).getCell(7);
    expect(cell.value).toBe("01234567");
    expect(typeof cell.value).toBe("string");
  });

  it("puts the derived statistics on sheet 2, percentages as percentages", async () => {
    const { wb, data } = await render();
    const sheet = wb.getWorksheet("Statistics")!;

    const cells: Array<[string, unknown]> = [];
    sheet.eachRow((row) => {
      cells.push([String(row.getCell(1).value ?? ""), row.getCell(2).value]);
    });
    const lookup = new Map(cells);

    expect(lookup.get(tFor("en")("accexp.stats.totalParents"))).toBe(2);
    expect(lookup.get(tFor("en")("accexp.stats.totalChildren"))).toBe(3);
    expect(lookup.get(tFor("en")("accexp.stats.parentsNoChildren"))).toBe(1);
    // Never-asked is its own KPI line, not folded into "not specified".
    expect(lookup.get(tFor("en")("accexp.gender.notAsked"))).toBe(1);
    expect(lookup.get(tFor("en")("accexp.gender.unspecified"))).toBe(1);
    // Fractions are written as fractions with a percent number format.
    expect(lookup.get(tFor("en")("accexp.stats.pctActiveChildren"))).toBeCloseTo(
      data.stats.fracActiveChildren,
    );
  });

  it("exports a valid file from an EMPTY database", async () => {
    const { wb } = await render("az", []);
    const sheet = wb.getWorksheet("Accounts Data")!;

    expect(sheet.getRow(HEADER_ROW).getCell(1).value).toBe(
      tFor("az")("accexp.col.parentId"),
    );
    // The filter collapses onto the header row rather than becoming invalid.
    expect(sheet.autoFilter).toBe(`A${HEADER_ROW}:M${HEADER_ROW}`);
    const stats = wb.getWorksheet("Statistics")!;
    const values = new Map<string, unknown>();
    stats.eachRow((row) => {
      values.set(String(row.getCell(1).value ?? ""), row.getCell(2).value);
    });
    expect(values.get(tFor("az")("accexp.stats.avgChildren"))).toBe(0);
    expect(values.get(tFor("az")("accexp.stats.totalParents"))).toBe(0);
  });

  it("renders in all three locales without a missing key", async () => {
    for (const locale of locales) {
      await expect(render(locale)).resolves.toBeTruthy();
    }
  });
});
