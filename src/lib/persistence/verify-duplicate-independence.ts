import type { EditableTemplate } from "./get-editable-template";

/**
 * Deterministic proof that a duplicated template is genuinely independent
 * of its original. Pure — no I/O — so it's fully unit-testable, and it runs
 * for real after every duplication (src/lib/persistence/duplicate-template.ts),
 * the same "write, then re-read and verify" posture the import pipeline uses
 * rather than trusting the write blindly.
 *
 * Two things have to hold at once:
 *   1. CONTENT: the copy says exactly what the original says.
 *   2. IDENTITY: the copy shares no row id with the original, anywhere.
 *
 * (2) is what makes independent editing safe. Every write in this app is
 * keyed by row id (`.eq("id", …)` in template-edit-actions.ts), so if the
 * two id sets are disjoint, no update aimed at one template can reach a row
 * of the other. That's the whole independence guarantee, and it's checkable.
 */

export type IndependenceViolationKind = "structure_mismatch" | "content_mismatch" | "shared_id" | "duplicate_id";

export interface IndependenceViolation {
  kind: IndependenceViolationKind;
  detail: string;
}

export interface IndependenceResult {
  independent: boolean;
  violations: IndependenceViolation[];
  /** Sections + items + comments verified on the copy (excludes the template row itself). */
  copiedNodeCount: number;
}

function collectIds(template: EditableTemplate): string[] {
  const ids: string[] = [template.id];
  for (const section of template.sections) {
    ids.push(section.id);
    for (const item of section.items) {
      ids.push(item.id);
      for (const comment of item.comments) ids.push(comment.id);
    }
  }
  return ids;
}

function compareContent(
  original: EditableTemplate,
  copy: EditableTemplate,
  violations: IndependenceViolation[]
): number {
  let nodeCount = 0;

  if (original.sections.length !== copy.sections.length) {
    violations.push({
      kind: "structure_mismatch",
      detail: `Section count differs: original has ${original.sections.length}, copy has ${copy.sections.length}.`,
    });
  }

  original.sections.forEach((originalSection, sectionIndex) => {
    const copySection = copy.sections[sectionIndex];
    if (!copySection) return;
    nodeCount++;

    if (originalSection.name !== copySection.name) {
      violations.push({
        kind: "content_mismatch",
        detail: `Section ${sectionIndex} name differs: "${originalSection.name}" vs "${copySection.name}".`,
      });
    }
    if (originalSection.position !== copySection.position) {
      violations.push({
        kind: "content_mismatch",
        detail: `Section "${originalSection.name}" position differs.`,
      });
    }
    if (originalSection.items.length !== copySection.items.length) {
      violations.push({
        kind: "structure_mismatch",
        detail: `Section "${originalSection.name}" item count differs: ${originalSection.items.length} vs ${copySection.items.length}.`,
      });
    }

    originalSection.items.forEach((originalItem, itemIndex) => {
      const copyItem = copySection.items[itemIndex];
      if (!copyItem) return;
      nodeCount++;

      if (originalItem.name !== copyItem.name) {
        violations.push({
          kind: "content_mismatch",
          detail: `Item ${itemIndex} in "${originalSection.name}" name differs: "${originalItem.name}" vs "${copyItem.name}".`,
        });
      }
      if (originalItem.comments.length !== copyItem.comments.length) {
        violations.push({
          kind: "structure_mismatch",
          detail: `Item "${originalItem.name}" comment count differs: ${originalItem.comments.length} vs ${copyItem.comments.length}.`,
        });
      }

      originalItem.comments.forEach((originalComment, commentIndex) => {
        const copyComment = copyItem.comments[commentIndex];
        if (!copyComment) return;
        nodeCount++;

        if (originalComment.plainText !== copyComment.plainText) {
          violations.push({
            kind: "content_mismatch",
            detail: `Comment ${commentIndex} in "${originalItem.name}" plain text differs.`,
          });
        }
        if ((originalComment.safeHtml ?? null) !== (copyComment.safeHtml ?? null)) {
          violations.push({
            kind: "content_mismatch",
            detail: `Comment ${commentIndex} in "${originalItem.name}" HTML differs.`,
          });
        }
        if (
          JSON.stringify(originalComment.linkMetadata ?? null) !== JSON.stringify(copyComment.linkMetadata ?? null)
        ) {
          violations.push({
            kind: "content_mismatch",
            detail: `Comment ${commentIndex} in "${originalItem.name}" link metadata differs.`,
          });
        }
      });
    });
  });

  return nodeCount;
}

/**
 * The copy's own `name` is deliberately NOT compared — a duplicate is
 * expected to be renamed. Everything else about its content must match.
 */
export function verifyDuplicateIndependence(
  original: EditableTemplate,
  copy: EditableTemplate
): IndependenceResult {
  const violations: IndependenceViolation[] = [];
  const copiedNodeCount = compareContent(original, copy, violations);

  const originalIds = new Set(collectIds(original));
  const copyIds = collectIds(copy);

  for (const id of copyIds) {
    if (originalIds.has(id)) {
      violations.push({
        kind: "shared_id",
        detail: `Copy reuses row id ${id} from the original — editing one would change the other.`,
      });
    }
  }

  const seen = new Set<string>();
  for (const id of copyIds) {
    if (seen.has(id)) {
      violations.push({ kind: "duplicate_id", detail: `Copy contains row id ${id} more than once.` });
    }
    seen.add(id);
  }

  return { independent: violations.length === 0, violations, copiedNodeCount };
}
