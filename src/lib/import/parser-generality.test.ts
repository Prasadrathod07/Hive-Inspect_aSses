import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSpectoraWorkbook } from "./parse-workbook";
import { extractSheet } from "./extract-rows";
import { createSequentialIdGenerator } from "./id-generator";

/**
 * The importer must work on ANY export in the Spectora HTML-text shape, not
 * on the one fixture committed to this repo (requirement 10). A reviewer is
 * expected to upload a different file.
 *
 * Every workbook here is constructed in-test and is explicitly synthetic — no
 * file in this suite is, or claims to be, a real Spectora export. See
 * `tests/fixtures/README.md`.
 */

function workbook(sheets: { name: string; rows: string[][] }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function parse(buffer: Buffer, filename = "export.xlsx") {
  return parseSpectoraWorkbook({
    buffer,
    filename,
    importedAt: "2026-01-01T00:00:00.000Z",
    generateId: createSequentialIdGenerator(),
  });
}

describe("header wording — detection by keyword, never by position", () => {
  const WORDINGS: { label: string; header: string[] }[] = [
    { label: "plain", header: ["Section", "Item", "Comment"] },
    { label: "with suffixes", header: ["Section Name", "Item Name", "Comment Text"] },
    { label: "parenthesised", header: ["Section", "Item", "Comment (HTML)"] },
    { label: "punctuated", header: ["Section:", "Item:", "Comment/Narrative"] },
    { label: "upper case", header: ["SECTION", "ITEM", "COMMENT"] },
    { label: "synonyms", header: ["Area", "Component", "Narrative"] },
    { label: "alternate synonyms", header: ["Category", "Component", "Observation"] },
    { label: "notes wording", header: ["Section", "Item", "Notes"] },
  ];

  for (const { label, header } of WORDINGS) {
    it(`recognizes ${label} headers`, () => {
      const result = parse(workbook([{ name: "Data", rows: [header, ["Roof", "Shingles", "Looks fine."]] }]));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.template.sections[0].name).toBe("Roof");
      expect(result.template.sections[0].items[0].name).toBe("Shingles");
      expect(result.template.sections[0].items[0].comments[0].plainText).toBe("Looks fine.");
    });
  }

  it("finds the header when it isn't the first row", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["My Inspection Company"],
            ["Exported 2026-01-01"],
            [],
            ["Section", "Item", "Comment"],
            ["Roof", "Shingles", "Looks fine."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].name).toBe("Roof");
  });

  it("does not depend on column ORDER", () => {
    const result = parse(
      workbook([
        { name: "Data", rows: [["Comment", "Section", "Item"], ["Looks fine.", "Roof", "Shingles"]] },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].name).toBe("Roof");
    expect(result.template.sections[0].items[0].comments[0].plainText).toBe("Looks fine.");
  });

  it("tolerates extra columns it doesn't understand, and says so", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["Section", "Item", "Comment", "Photos", "Rating"],
            ["Roof", "Shingles", "Looks fine.", "photo1.jpg", "Good"],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The known structure still imports...
    expect(result.template.sections[0].items[0].comments[0].plainText).toBe("Looks fine.");
    // ...and the unmapped columns are reported, not dropped in silence.
    const unmapped = result.issues.find((issue) => issue.category === "unrecognized_row");
    expect(unmapped).toBeDefined();
    expect(unmapped?.rawSnippet).toContain("photo1.jpg");
    expect(unmapped?.rawSnippet).toContain("Good");
  });
});

/**
 * REGRESSION: "Item Text" matches the `item` keyword AND the `comment`
 * keyword ("text"). Before the fix, one column was assigned both roles, so
 * every item name was ALSO imported as a comment underneath itself —
 * duplicated content, on any export using that wording.
 */
describe("column roles — one column can never hold two roles", () => {
  it("does not duplicate an item name into a comment", () => {
    const extracted = extractSheet("Data", [
      ["Section", "Item Text", "Extra"],
      ["Roof", "Shingles", "x"],
    ]);

    expect(extracted?.columnRoles.item).toBe(1);
    expect(extracted?.columnRoles.comment).toBeUndefined();
    expect(extracted?.rows[0].cells.comment).toBeUndefined();
  });

  it("imports such a sheet without inventing comments", () => {
    const result = parse(
      workbook([{ name: "Data", rows: [["Section", "Item Text"], ["Roof", "Shingles"]] }])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.template.sections[0].items[0];
    expect(item.name).toBe("Shingles");
    expect(item.comments).toHaveLength(0);
  });

  /**
   * REGRESSION — found against a real Spectora template export: its header
   * pairs a short "Comment Name" label (a boilerplate entry's title, e.g.
   * "Cracking - Major") with a separate "Comment Text" column holding the
   * actual HTML narrative. "Comment Name" appears first and matches the bare
   * "comment" keyword, so before this fix it silently won the comment role —
   * every imported "comment" was actually just a label, and the real
   * narrative in "Comment Text" was never read at all.
   */
  it("prefers a 'Comment Text' column over an earlier 'Comment Name' label column", () => {
    const extracted = extractSheet("Data", [
      ["Section Name", "Item Name", "Comment Name", "Comment Text"],
      ["Exterior", "Siding", "Cracking - Major", "Moderate cracking was observed."],
    ]);

    expect(extracted?.columnRoles.comment).toBe(3);
    expect(extracted?.rows[0].cells.comment).toBe("Moderate cracking was observed.");
  });

  it("imports the real narrative text, not the label, when both columns exist", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["Section Name", "Item Name", "Comment Name", "Comment Text"],
            ["Exterior", "Siding", "Cracking - Major", "Moderate cracking was observed."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.plainText).toBe("Moderate cracking was observed.");
  });

  it("still falls back to a bare 'Comment' column when no stronger candidate exists", () => {
    const extracted = extractSheet("Data", [
      ["Section", "Item", "Comment"],
      ["Roof", "Shingles", "Looks good."],
    ]);

    expect(extracted?.columnRoles.comment).toBe(2);
  });

  it("gives each role a distinct column when wordings overlap", () => {
    const extracted = extractSheet("Data", [
      ["Section Area", "Item Component", "Comment Description"],
      ["a", "b", "c"],
    ]);

    const indices = Object.values(extracted?.columnRoles ?? {});
    expect(new Set(indices).size).toBe(indices.length);
  });
});

/**
 * REGRESSION: parsing used to stop at the FIRST sheet with a recognizable
 * header. Every later sheet was discarded with no issue raised and its rows
 * absent from sourceRowRecords — so the integrity engine saw nothing missing
 * and would report "verified" over a silently dropped sheet.
 */
describe("multi-sheet workbooks — no sheet is silently discarded", () => {
  it("imports content from every recognizable sheet", () => {
    const result = parse(
      workbook([
        { name: "Part 1", rows: [["Section", "Item", "Comment"], ["Exterior", "Siding", "Vinyl."]] },
        {
          name: "Part 2",
          rows: [
            ["Section", "Item", "Comment"],
            ["Interior", "Flooring", "Hardwood."],
            ["Interior", "Walls", "Minor cracks."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections.map((s) => s.name)).toEqual(["Exterior", "Interior"]);
    expect(result.template.sections[1].items.map((i) => i.name)).toEqual(["Flooring", "Walls"]);
  });

  it("counts source rows from every sheet, so integrity can detect a loss", () => {
    const result = parse(
      workbook([
        { name: "Part 1", rows: [["Section", "Item", "Comment"], ["Exterior", "Siding", "Vinyl."]] },
        {
          name: "Part 2",
          rows: [
            ["Section", "Item", "Comment"],
            ["Interior", "Flooring", "Hardwood."],
            ["Interior", "Walls", "Minor cracks."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceRowRecords).toHaveLength(3);
    // Row provenance survives the merge — a row is identified by sheet AND number.
    expect(result.sourceRowRecords.map((r) => r.sourceRef.sheet)).toEqual(["Part 1", "Part 2", "Part 2"]);
  });

  it("assigns globally sequential section positions across sheets", () => {
    const result = parse(
      workbook([
        { name: "A", rows: [["Section", "Item", "Comment"], ["One", "i", "c"]] },
        { name: "B", rows: [["Section", "Item", "Comment"], ["Two", "i", "c"]] },
        { name: "C", rows: [["Section", "Item", "Comment"], ["Three", "i", "c"]] },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("never merges a section across a sheet boundary", () => {
    // Same section name on two sheets stays two sections: no export format
    // implies a section continues into the next sheet.
    const result = parse(
      workbook([
        { name: "A", rows: [["Section", "Item", "Comment"], ["Roof", "Shingles", "c"]] },
        { name: "B", rows: [["Section", "Item", "Comment"], ["Roof", "Flashing", "c"]] },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toHaveLength(2);
    expect(result.template.sections.map((s) => s.sourceRef.sheet)).toEqual(["A", "B"]);
  });

  it("reports a content-bearing sheet it cannot read, instead of ignoring it", () => {
    const result = parse(
      workbook([
        { name: "Template", rows: [["Section", "Item", "Comment"], ["Roof", "Shingles", "Fine."]] },
        { name: "Cover Page", rows: [["Prepared for"], ["Barbara"], ["123 Main St"]] },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const issue = result.issues.find((i) => i.explanation.includes("Cover Page"));
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    // Its content is retained on the issue so it can be inspected.
    expect(issue?.rawSnippet).toContain("Barbara");
  });

  it("stays silent about a genuinely empty sheet — there is nothing to lose", () => {
    const result = parse(
      workbook([
        { name: "Template", rows: [["Section", "Item", "Comment"], ["Roof", "Shingles", "Fine."]] },
        { name: "Blank", rows: [[], ["", ""]] },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.filter((i) => i.explanation.includes("Blank"))).toHaveLength(0);
  });
});

describe("structural variation — shape is read from the file, not assumed", () => {
  it("handles a single section with many items", () => {
    const rows = [["Section", "Item", "Comment"]];
    for (let i = 1; i <= 25; i++) rows.push(["Roof", `Item ${i}`, `Comment ${i}`]);

    const result = parse(workbook([{ name: "Data", rows }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toHaveLength(1);
    expect(result.template.sections[0].items).toHaveLength(25);
  });

  it("handles many sections with one item each", () => {
    const rows = [["Section", "Item", "Comment"]];
    for (let i = 1; i <= 25; i++) rows.push([`Section ${i}`, "Only", "Comment"]);

    const result = parse(workbook([{ name: "Data", rows }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toHaveLength(25);
  });

  it("handles an item carrying many comments", () => {
    const rows = [["Section", "Item", "Comment"], ["Roof", "Shingles", "First."]];
    for (let i = 2; i <= 10; i++) rows.push(["", "", `Comment ${i}`]);

    const result = parse(workbook([{ name: "Data", rows }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments).toHaveLength(10);
  });

  it("handles a section that returns later in the file as a separate section", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["Section", "Item", "Comment"],
            ["Roof", "Shingles", "a"],
            ["Attic", "Insulation", "b"],
            ["Roof", "Flashing", "c"],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Flattened order is the source of truth; we don't re-merge by name.
    expect(result.template.sections.map((s) => s.name)).toEqual(["Roof", "Attic", "Roof"]);
  });

  it("imports a sheet whose section/item values repeat on every row", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["Section", "Item", "Comment"],
            ["Roof", "Shingles", "First."],
            ["Roof", "Shingles", "Second."],
            ["Roof", "Gutters", "Third."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toHaveLength(1);
    expect(result.template.sections[0].items[0].comments).toHaveLength(2);
    expect(result.template.sections[0].items[1].comments).toHaveLength(1);
  });

  it("keeps row numbers aligned to the spreadsheet through blank rows", () => {
    const result = parse(
      workbook([
        {
          name: "Data",
          rows: [
            ["Section", "Item", "Comment"],
            ["Roof", "Shingles", "First."],
            ["", "", ""],
            ["", "", "After a blank row."],
          ],
        },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comments = result.template.sections[0].items[0].comments;
    // Spreadsheet row 4, not 3 — a dropped blank row would shift traceability.
    expect(comments[1].sourceRef.rowNumber).toBe(4);
  });
});

describe("determinism — the same bytes always produce the same template", () => {
  it("produces identical output across repeated parses", () => {
    const buffer = workbook([
      {
        name: "Data",
        rows: [
          ["Section", "Item", "Comment"],
          ["Roof", "Shingles", "<b>Good</b> condition."],
          ["", "Gutters", "See <a href='https://example.com'>guide</a>."],
        ],
      },
    ]);

    const first = parse(buffer);
    const second = parse(buffer);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
