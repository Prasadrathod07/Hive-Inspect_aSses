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
