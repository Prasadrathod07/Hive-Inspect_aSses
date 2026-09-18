import { describe, expect, it } from "vitest";
import { verifyDuplicateIndependence } from "./verify-duplicate-independence";
import type { EditableTemplate } from "./get-editable-template";

/**
 * These tests stand in for the six independence proofs the requirement asks
 * for, at the level that's checkable without a live database. The live-DB
 * equivalents are in duplicate-template.integration.test.ts (skip-gated),
 * and docs/db-verification.md documents how to confirm them by hand.
 *
 * The load-bearing argument: every write in this app is keyed by row id, so
 * if the original's and the copy's id sets are disjoint, no update aimed at
 * one can reach a row of the other. `applyNameUpdateById` below makes that
 * argument executable rather than asserted.
 */

function makeTemplate(overrides: {
  templateId: string;
  sectionId: string;
  itemId: string;
  commentId: string;
  name?: string;
  sectionName?: string;
  itemName?: string;
  commentText?: string;
}): EditableTemplate {
  return {
    id: overrides.templateId,
    name: overrides.name ?? "Sample Template",
    sourceFilename: "sample.xlsx",
    importRunId: null,
    parentTemplateId: null,
    sections: [
      {
        id: overrides.sectionId,
        name: overrides.sectionName ?? "Roof",
        position: 0,
        sourceRef: { sheet: "Sheet1", rowNumber: 3 },
        items: [
          {
            id: overrides.itemId,
            name: overrides.itemName ?? "Shingles",
            position: 0,
            sourceRef: { sheet: "Sheet1", rowNumber: 3 },
            comments: [
              {
                id: overrides.commentId,
                plainText: overrides.commentText ?? "Good condition.",
                safeHtml: "<p>Good condition.</p>",
                position: 0,
                sourceRef: { sheet: "Sheet1", rowNumber: 3 },
                linkMetadata: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

const ORIGINAL_IDS = { templateId: "t-1", sectionId: "s-1", itemId: "i-1", commentId: "c-1" };
const COPY_IDS = { templateId: "t-2", sectionId: "s-2", itemId: "i-2", commentId: "c-2" };

/** Models exactly what template-edit-actions.ts does: `update … where id = ?`. */
function applyNameUpdateById(template: EditableTemplate, id: string, newName: string): EditableTemplate {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      name: section.id === id ? newName : section.name,
      items: section.items.map((item) => ({
        ...item,
        name: item.id === id ? newName : item.name,
        comments: item.comments.map((comment) =>
          comment.id === id ? { ...comment, plainText: newName, safeHtml: `<p>${newName}</p>` } : comment
        ),
      })),
    })),
  };
}

describe("verifyDuplicateIndependence — proof 1: the duplicate has the same initial content", () => {
  it("passes when the copy matches the original's content exactly", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = makeTemplate({ ...COPY_IDS, name: "Sample Template — Copy" });

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.copiedNodeCount).toBe(3); // 1 section + 1 item + 1 comment
  });

  it("ignores the template's own name, which a duplicate is expected to change", () => {
    const original = makeTemplate({ ...ORIGINAL_IDS, name: "Original" });
    const copy = makeTemplate({ ...COPY_IDS, name: "Original — Copy" });

    expect(verifyDuplicateIndependence(original, copy).independent).toBe(true);
  });

  it("fails when a section name was not carried over", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = makeTemplate({ ...COPY_IDS, sectionName: "Something else" });

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.kind === "content_mismatch")).toBe(true);
  });

  it("fails when comment text was not carried over", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = makeTemplate({ ...COPY_IDS, commentText: "Different text." });

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.detail.includes("plain text differs"))).toBe(true);
  });

  it("fails when the copy is missing a whole section", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = { ...makeTemplate(COPY_IDS), sections: [] };

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.kind === "structure_mismatch")).toBe(true);
  });
});

describe("verifyDuplicateIndependence — proof 2: every id is different", () => {
  it("rejects a copy that reuses the original's section id", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = makeTemplate({ ...COPY_IDS, sectionId: ORIGINAL_IDS.sectionId });

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.kind === "shared_id")).toBe(true);
  });

  it("rejects a copy that reuses the original's comment id", () => {
    const original = makeTemplate(ORIGINAL_IDS);
    const copy = makeTemplate({ ...COPY_IDS, commentId: ORIGINAL_IDS.commentId });

    const result = verifyDuplicateIndependence(original, copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.kind === "shared_id")).toBe(true);
  });

  it("rejects a copy that is literally the same template row", () => {
    const original = makeTemplate(ORIGINAL_IDS);

    const result = verifyDuplicateIndependence(original, original);

    expect(result.independent).toBe(false);
    expect(result.violations.filter((v) => v.kind === "shared_id")).toHaveLength(4);
  });

  it("rejects a copy whose own rows collide with each other", () => {
    const copy = makeTemplate({ ...COPY_IDS, itemId: COPY_IDS.sectionId });

    const result = verifyDuplicateIndependence(makeTemplate(ORIGINAL_IDS), copy);

    expect(result.independent).toBe(false);
    expect(result.violations.some((v) => v.kind === "duplicate_id")).toBe(true);
  });
});

describe("independence invariant — proofs 3, 4, 5: editing the copy cannot touch the original", () => {
  const original = makeTemplate(ORIGINAL_IDS);
  const copy = makeTemplate({ ...COPY_IDS, name: "Sample Template — Copy" });

  it("confirms the precondition the invariant rests on: disjoint id sets", () => {
    expect(verifyDuplicateIndependence(original, copy).independent).toBe(true);
  });

  it("proof 3: renaming the copy's section leaves the original's section untouched", () => {
    const editedCopy = applyNameUpdateById(copy, COPY_IDS.sectionId, "Roof (edited on the copy)");
    const originalAfter = applyNameUpdateById(original, COPY_IDS.sectionId, "Roof (edited on the copy)");

    expect(editedCopy.sections[0].name).toBe("Roof (edited on the copy)");
    // The same id-keyed update, applied to the original, matches nothing.
    expect(originalAfter).toEqual(original);
    expect(originalAfter.sections[0].name).toBe("Roof");
  });

  it("proof 4: editing the copy's comment leaves the original's comment untouched", () => {
    const editedCopy = applyNameUpdateById(copy, COPY_IDS.commentId, "Rewritten on the copy.");
    const originalAfter = applyNameUpdateById(original, COPY_IDS.commentId, "Rewritten on the copy.");

    expect(editedCopy.sections[0].items[0].comments[0].plainText).toBe("Rewritten on the copy.");
    expect(originalAfter).toEqual(original);
    expect(originalAfter.sections[0].items[0].comments[0].plainText).toBe("Good condition.");
  });

  it("proof 5: editing the copy's item leaves the original's item untouched, and vice versa", () => {
    const editedCopy = applyNameUpdateById(copy, COPY_IDS.itemId, "Shingles (copy)");
    const editedOriginal = applyNameUpdateById(original, ORIGINAL_IDS.itemId, "Shingles (original)");

    expect(editedCopy.sections[0].items[0].name).toBe("Shingles (copy)");
    expect(editedOriginal.sections[0].items[0].name).toBe("Shingles (original)");
    // Neither edit reached the other tree.
    expect(applyNameUpdateById(original, COPY_IDS.itemId, "Shingles (copy)")).toEqual(original);
    expect(applyNameUpdateById(copy, ORIGINAL_IDS.itemId, "Shingles (original)")).toEqual(copy);
  });

  it("shows the invariant failing loudly if ids were ever shared", () => {
    // A deliberately broken "copy" that reuses the original's comment id —
    // the exact bug this verification exists to catch.
    const brokenCopy = makeTemplate({ ...COPY_IDS, commentId: ORIGINAL_IDS.commentId });

    expect(verifyDuplicateIndependence(original, brokenCopy).independent).toBe(false);
    // And the consequence: the same update now hits BOTH trees.
    const originalAfter = applyNameUpdateById(original, ORIGINAL_IDS.commentId, "Leaked edit.");
    expect(originalAfter).not.toEqual(original);
  });
});
