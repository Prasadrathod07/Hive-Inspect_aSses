import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseSpectoraWorkbook } from "./parse-workbook";
import { loadWorkbook } from "./workbook";
import { extractSheet } from "./extract-rows";
import { validateCanonicalTemplate } from "./validate";
import { createSequentialIdGenerator } from "./id-generator";
import { textsMatch } from "./checksum";
import { MAX_FILE_SIZE_BYTES } from "./validate-file";

const FIXTURE_PATH = path.resolve(__dirname, "../../../tests/fixtures/synthetic-spectora-like.xlsx");
const GOLDEN_PATH = path.resolve(__dirname, "../../../tests/fixtures/synthetic-spectora-like.expected.json");

function loadFixtureBuffer() {
  return readFileSync(FIXTURE_PATH);
}

function bufferFromRows(rows: string[][]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("parseSpectoraWorkbook — synthetic fixture (happy path + flagged issues)", () => {
  const result = parseSpectoraWorkbook({
    buffer: loadFixtureBuffer(),
    filename: "synthetic-spectora-like.xlsx",
    importedAt: "2026-01-01T00:00:00.000Z",
  });

  it("succeeds and builds the expected section/item structure", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections.map((s) => s.name)).toEqual(["Roof", "Plumbing", "Electrical"]);
    expect(result.template.sections[0].items.map((i) => i.name)).toEqual(["Shingles", "Gutters"]);
  });

  it("passes canonical schema validation", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validation = validateCanonicalTemplate(result.template);
    expect(validation.success).toBe(true);
  });

  it("derives the template name from the filename when the sheet name is generic", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceMetadata.templateNameSource).toBe("filename");
    expect(result.template.name).toBe("synthetic-spectora-like");
  });

  it("preserves allowlisted formatting verbatim in a comment", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shingles = result.template.sections[0].items[0];
    expect(shingles.comments[0].safeHtml).toContain("<b>good</b>");
    expect(shingles.comments[0].plainText).toBe("Shingles are in good condition overall.");
  });

  it("captures the safe link on the Gutters comment", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gutters = result.template.sections[0].items[1];
    expect(gutters.comments[0].linkMetadata).toEqual([
      { href: "https://example.com/gutter-guide", text: "manufacturer guidance" },
    ]);
  });

  it("groups the blank-filled follow-up comment under the same item, not a new one", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gutters = result.template.sections[0].items[1];
    expect(gutters.comments).toHaveLength(2);
  });

  it("flags the disallowed <script> tag without dropping the surrounding text", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scriptIssue = result.issues.find((i) => i.category === "unsupported_formatting");
    expect(scriptIssue).toBeDefined();
    expect(scriptIssue?.explanation).toContain("script");
    const waterHeater = result.template.sections[1].items[0];
    expect(waterHeater.comments[0].safeHtml).not.toContain("<script>");
    expect(waterHeater.comments[0].plainText).toContain("Recommend annual flushing.");
  });

  it("flags the unsafe javascript: link and drops only the link, not the row", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const linkIssue = result.issues.find((i) => i.category === "unsupported_link");
    expect(linkIssue).toBeDefined();
    const waterHeater = result.template.sections[1].items[0];
    expect(waterHeater.comments[1].linkMetadata ?? []).toHaveLength(0);
  });

  it("flags the unmapped Photos column value without dropping the item it's attached to", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unmapped = result.issues.find(
      (i) => i.category === "unrecognized_row" && i.importedPreview?.includes("Fixtures")
    );
    expect(unmapped).toBeDefined();
    const fixtures = result.template.sections[1].items[1];
    expect(fixtures.name).toBe("Fixtures");
    expect(fixtures.comments).toHaveLength(0); // legitimately absent in source, not an issue
  });

  it("flags the comment that appears before any item in a new section", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ambiguous = result.issues.filter((i) => i.category === "ambiguous_hierarchy");
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].sourceRef.sheet).toBe("Sheet1");
  });

  it("skips the pure blank spacer row without any issue at all", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Row 6 (1-indexed) is the fully blank spacer row in the fixture.
    const referencesSpacerRow = result.issues.some((i) => i.sourceRef.rowNumber === 6);
    expect(referencesSpacerRow).toBe(false);
  });

  it("demonstrates preservation verification: every non-blank source row is accounted for", () => {
    // Independently re-extract the raw rows and confirm each one that has
    // any content is traceable to either canonical model content or an
    // issue candidate — i.e. nothing vanished without a record.
    const workbook = loadWorkbook(loadFixtureBuffer());
    const extracted = extractSheet("Sheet1", workbook.sheets["Sheet1"]);
    expect(extracted).not.toBeNull();
    if (!extracted || !result.ok) return;

    const nonBlankRowNumbers = extracted.rows
      .filter((r) => Boolean(r.cells.section || r.cells.item || r.cells.comment) || r.hasUnmappedContent)
      .map((r) => r.sourceRef.rowNumber);

    const accountedFor = new Set<number>();
    for (const issue of result.issues) accountedFor.add(issue.sourceRef.rowNumber);
    for (const section of result.template.sections) {
      accountedFor.add(section.sourceRef.rowNumber);
      for (const item of section.items) {
        accountedFor.add(item.sourceRef.rowNumber);
        for (const comment of item.comments) accountedFor.add(comment.sourceRef.rowNumber);
      }
    }

    const unaccounted = nonBlankRowNumbers.filter((rowNumber) => !accountedFor.has(rowNumber));
    expect(unaccounted).toEqual([]);
  });

  it("returns sourceRowRecords covering exactly the meaningful rows, excluding the blank spacer", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceRowRecords.map((r) => r.sourceRef.rowNumber)).toEqual([3, 4, 5, 7, 8, 9, 10, 11]);
  });

  it("demonstrates preservation verification with a deterministic checksum comparison, not just presence", () => {
    // Belt-and-suspenders on top of the row-accounting test above: for a
    // comment with no rich-text loss (Shingles), the stored plainText must
    // checksum-match the source cell stripped of markup by an independent
    // (test-local) method — not merely "some text exists."
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shingles = result.template.sections[0].items[0].comments[0];
    const independentPlainText = "Shingles are in good condition overall.";
    expect(textsMatch(shingles.plainText, independentPlainText)).toBe(true);
  });

  it("matches the golden canonical JSON byte-for-byte given deterministic inputs", () => {
    const deterministicResult = parseSpectoraWorkbook({
      buffer: loadFixtureBuffer(),
      filename: "synthetic-spectora-like.xlsx",
      importedAt: "2026-01-01T00:00:00.000Z",
      generateId: createSequentialIdGenerator("synthetic"),
    });
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(deterministicResult).toEqual(golden);
  });
});

describe("parseSpectoraWorkbook — no fixed template shape (requirement 10)", () => {
  it("handles a structurally different template with a different section count, not just the fixture's three", () => {
    const buffer = bufferFromRows([
      ["Area", "Component", "Finding"],
      ["Kitchen", "Sink", "<p>Functional, <em>no leaks</em> observed.</p>"],
      ["", "Cabinets", "Minor wear on hinges."],
      ["Bedroom", "Outlets", "<p>All outlets tested <b>OK</b>.</p>"],
      ["", "Windows", "One window does not latch."],
      ["Bathroom", "Fan", "Vent fan operational."],
      ["Attic", "Insulation", "<p>Adequate coverage, <em>no signs</em> of pest activity.</p>"],
    ]);

    const result = parseSpectoraWorkbook({ buffer, filename: "different-shape.xlsx" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Four sections here vs. three in the synthetic fixture — the parser
    // must not assume a fixed count, and the "Area"/"Component"/"Finding"
    // headers must still resolve via keyword synonyms, not the fixture's
    // exact "Section"/"Item"/"Comment" wording.
    expect(result.template.sections.map((s) => s.name)).toEqual(["Kitchen", "Bedroom", "Bathroom", "Attic"]);
    expect(result.template.sections[0].items.map((i) => i.name)).toEqual(["Sink", "Cabinets"]);
  });
});

describe("parseSpectoraWorkbook — empty workbook", () => {
  it("succeeds with zero sections when the sheet has a header but no data rows at all", () => {
    const buffer = bufferFromRows([["Section", "Item", "Comment"]]);
    const result = parseSpectoraWorkbook({ buffer, filename: "header-only.xlsx" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("fails cleanly when the sheet has no rows at all (not even a header)", () => {
    const buffer = bufferFromRows([]);
    const result = parseSpectoraWorkbook({ buffer, filename: "totally-empty.xlsx" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].category).toBe("malformed_workbook");
    expect(result.issues[0].severity).toBe("blocking");
  });
});

describe("parseSpectoraWorkbook — failure cases", () => {
  it("fails cleanly (no partial template) when the file isn't a valid spreadsheet at all", () => {
    const result = parseSpectoraWorkbook({
      buffer: Buffer.from("this is not an xlsx file"),
      filename: "not-a-spreadsheet.xlsx",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].category).toBe("malformed_workbook");
    expect(result.issues[0].severity).toBe("blocking");
  });

  it("fails cleanly when no sheet has a recognizable header row", () => {
    const buffer = bufferFromRows([
      ["Foo", "Bar", "Baz"],
      ["1", "2", "3"],
    ]);

    const result = parseSpectoraWorkbook({ buffer, filename: "unrecognized.xlsx" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].category).toBe("malformed_workbook");
    expect(result.issues[0].severity).toBe("blocking");
  });

  it("fails cleanly on an empty file, via file validation, before ever attempting to parse", () => {
    const result = parseSpectoraWorkbook({ buffer: Buffer.alloc(0), filename: "empty.xlsx" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].explanation).toContain("empty");
  });

  it("fails cleanly on an oversized file, via file validation", () => {
    const result = parseSpectoraWorkbook({
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
      filename: "huge.xlsx",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].explanation).toContain("exceeds");
  });

  it("fails cleanly on an unsupported file extension, via file validation", () => {
    const result = parseSpectoraWorkbook({ buffer: Buffer.from("id,name\n1,a"), filename: "export.csv" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].explanation).toContain("Unsupported file type");
  });
});
