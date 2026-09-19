import { describe, expect, it } from "vitest";
import { buildHierarchy } from "./hierarchy";
import { createSequentialIdGenerator } from "./id-generator";
import type { NormalizedRow } from "./normalize";

function row(partial: Partial<NormalizedRow> & { rowNumber: number }): NormalizedRow {
  return {
    sourceRef: { sheet: "Sheet1", rowNumber: partial.rowNumber },
    section: partial.section ?? null,
    item: partial.item ?? null,
    commentRawHtml: partial.commentRawHtml ?? null,
    hasUnmappedContent: partial.hasUnmappedContent ?? false,
    unmappedFields: partial.unmappedFields ?? [],
    rawRowText: partial.rawRowText ?? "",
  };
}

describe("buildHierarchy", () => {
  it("groups rows under blank-filled section/item values", () => {
    const { sections, issues } = buildHierarchy([
      row({ rowNumber: 2, section: "Roof", item: "Shingles", commentRawHtml: "Comment A" }),
      row({ rowNumber: 3, item: "Gutters", commentRawHtml: "Comment B" }),
      row({ rowNumber: 4, commentRawHtml: "Comment C" }), // still Gutters — blank means "same group"
    ]);

    expect(issues).toHaveLength(0);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Roof");
    expect(sections[0].items).toHaveLength(2);
    expect(sections[0].items[1].name).toBe("Gutters");
    expect(sections[0].items[1].comments).toHaveLength(2);
  });

  it("also groups correctly when section/item are repeated on every row instead of blank-filled", () => {
    const { sections } = buildHierarchy([
      row({ rowNumber: 2, section: "Roof", item: "Shingles", commentRawHtml: "A" }),
      row({ rowNumber: 3, section: "Roof", item: "Shingles", commentRawHtml: "B" }),
      row({ rowNumber: 4, section: "Roof", item: "Gutters", commentRawHtml: "C" }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(2);
    expect(sections[0].items[0].comments).toHaveLength(2);
    expect(sections[0].items[1].comments).toHaveLength(1);
  });

  it("assigns stable, source-order position indices", () => {
    const { sections } = buildHierarchy([
      row({ rowNumber: 2, section: "A", item: "A1", commentRawHtml: "x" }),
      row({ rowNumber: 3, section: "B", item: "B1", commentRawHtml: "y" }),
    ]);

    expect(sections.map((s) => s.position)).toEqual([0, 1]);
    expect(sections[0].items.map((i) => i.position)).toEqual([0]);
  });

  it("flags an item appearing before any section as ambiguous, without crashing", () => {
    const { sections, issues } = buildHierarchy([
      row({ rowNumber: 2, item: "Orphan item", commentRawHtml: "text" }),
    ]);

    expect(sections).toHaveLength(0);
    expect(issues).toHaveLength(2); // the orphan item, and the comment that also has nowhere to go
    expect(issues[0].category).toBe("ambiguous_hierarchy");
  });

  it("flags a comment appearing before any item in a new section, without dropping it silently", () => {
    const { sections, issues } = buildHierarchy([
      row({ rowNumber: 2, section: "Electrical", commentRawHtml: "General section note" }),
      row({ rowNumber: 3, item: "Panel", commentRawHtml: "Panel-specific note" }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("ambiguous_hierarchy");
    expect(sections[0].items).toHaveLength(1);
    expect(sections[0].items[0].comments).toHaveLength(1);
  });

  it("leaves an item with no comment as a valid item with zero comments (absent in source, not an issue)", () => {
    const { sections, issues } = buildHierarchy([
      row({ rowNumber: 2, section: "Roof", item: "Flashing" }),
    ]);

    expect(issues).toHaveLength(0);
    expect(sections[0].items[0].comments).toHaveLength(0);
  });

  it("uses crypto.randomUUID by default, producing a unique id per node", () => {
    const { sections } = buildHierarchy([
      row({ rowNumber: 2, section: "A", item: "A1", commentRawHtml: "x" }),
    ]);
    const ids = [sections[0].id, sections[0].items[0].id, sections[0].items[0].comments[0].id];
    expect(new Set(ids).size).toBe(3);
  });

  it("collects normalization events with the originating row's sourceRef attached, and raises no issue for them", () => {
    const { issues, normalizationEvents } = buildHierarchy([
      row({ rowNumber: 2, section: "Roof", item: "Shingles", commentRawHtml: "<div>Looks fine.</div>" }),
    ]);

    expect(issues).toHaveLength(0);
    expect(normalizationEvents.length).toBeGreaterThan(0);
    expect(normalizationEvents[0].sourceRef).toEqual({ sheet: "Sheet1", rowNumber: 2 });
    expect(normalizationEvents[0].automatic).toBe(true);
  });

  it("raises a recoverable_formatting issue (Level B) for a wrapper with an attribute, with a proposed fix attached", () => {
    const { sections, issues } = buildHierarchy([
      row({
        rowNumber: 2,
        section: "Roof",
        item: "Shingles",
        commentRawHtml: '<div class="custom-wrapper">Roof condition appears good.</div>',
      }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("recoverable_formatting");
    expect(issues[0].fixSafelyAvailable).toBe(true);
    expect(issues[0].proposedPlainText).toBe("Roof condition appears good.");
    // Not applied yet: the persisted comment still has no safe HTML.
    expect(sections[0].items[0].comments[0].safeHtml).toBeNull();
    expect(sections[0].items[0].comments[0].plainText).toBe("Roof condition appears good.");
  });

  it("still raises unsupported_formatting (Level C) for genuinely unsupported markup, never offering a fix", () => {
    const { issues } = buildHierarchy([
      row({ rowNumber: 2, section: "Roof", item: "Shingles", commentRawHtml: "<table><tr><td>A</td></tr></table>" }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("unsupported_formatting");
    expect(issues[0].fixSafelyAvailable).toBeFalsy();
  });

  it("classifies a mapped row's extra columns as unsupported_metadata, never as unsupported primary content", () => {
    const { sections, issues } = buildHierarchy([
      row({
        rowNumber: 2,
        section: "Inspection Details",
        item: "General",
        hasUnmappedContent: true,
        unmappedFields: [{ label: "Answer Type", value: "checkbox" }, { label: "Options", value: "Occupied, Vacant" }],
        rawRowText: "Inspection Details\tGeneral\t\tcheckbox\tOccupied, Vacant",
      }),
    ]);

    expect(sections[0].name).toBe("Inspection Details");
    expect(sections[0].items[0].name).toBe("General");
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("unsupported_metadata");
    expect(issues[0].severity).toBe("info");
    expect(issues[0].explanation).toContain("Answer Type: checkbox");
    expect(issues[0].explanation).toContain("Options: Occupied, Vacant");
    expect(issues[0].importedPreview).toBe("Inspection Details / General");
  });

  it("classifies a row that produced no mapped node at all as unrecognized_row (genuinely unsupported)", () => {
    // A repeated section/item name (Spectora's "repeat on every row"
    // convention) with no new comment produces nothing new in the tree, even
    // though its own section/item cells are non-blank.
    const { sections, issues } = buildHierarchy([
      row({ rowNumber: 2, section: "Inspection Details", item: "General" }),
      row({
        rowNumber: 3,
        section: "Inspection Details",
        item: "General",
        hasUnmappedContent: true,
        unmappedFields: [{ label: "Comment Name", value: "Vacant" }],
        rawRowText: "Inspection Details\tGeneral\tVacant",
      }),
    ]);

    expect(sections[0].items).toHaveLength(1); // no second item/section created
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("unrecognized_row");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].sourceRef.rowNumber).toBe(3);
    expect(issues[0].importedPreview).toBeNull();
  });

  it("does not double-count a metadata-only issue against the row's own mapped status when a comment is also present", () => {
    const { issues } = buildHierarchy([
      row({
        rowNumber: 2,
        section: "Roof",
        item: "Shingles",
        commentRawHtml: "Looks fine.",
        hasUnmappedContent: true,
        unmappedFields: [{ label: "Photos", value: "3" }],
      }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("unsupported_metadata");
    expect(issues[0].importedPreview).toBe("Roof / Shingles / Looks fine.");
  });

  it("produces fully deterministic, reproducible ids when a generator is injected", () => {
    const rows: NormalizedRow[] = [
      row({ rowNumber: 2, section: "A", item: "A1", commentRawHtml: "x" }),
      row({ rowNumber: 3, section: "B", item: "B1", commentRawHtml: "y" }),
    ];

    const run1 = buildHierarchy(rows, { generateId: createSequentialIdGenerator("id") });
    const run2 = buildHierarchy(rows, { generateId: createSequentialIdGenerator("id") });

    expect(run1).toEqual(run2);
    expect(run1.sections[0].id).toBe("id-0");
    expect(run1.sections[0].items[0].id).toBe("id-1");
    expect(run1.sections[0].items[0].comments[0].id).toBe("id-2");
  });
});
