import { randomUUID } from "node:crypto";
import type { NormalizedRow } from "./normalize";
import { processRichContent } from "./rich-content";
import type { CanonicalSection, CanonicalItem, ImportIssueCandidate, NormalizationEvent, SourceRef } from "./types";

const RAW_SNIPPET_LIMIT = 300;

/**
 * Stage 4 (docs/architecture.md §2.4): assembles the section → item →
 * comment tree, assigning explicit `position` indices so ordering is a
 * first-class, testable property rather than implicit array order
 * (requirement 2).
 *
 * Grouping rule (see docs/spectora-format.md — ASSUMPTION): a row's
 * `section`/`item` value starts a new group when non-empty AND different
 * from the current group's name. A blank value means "still part of the
 * current group." This tolerates both a flattened export that blank-fills
 * repeated values and one that repeats them on every row — either shape
 * produces the same tree.
 */
export interface BuildHierarchyOptions {
  /** Defaults to `crypto.randomUUID`; inject a deterministic generator for reproducible (golden-file) output. */
  generateId?: () => string;
}

function toNormalizationEvent(
  input: { type: NormalizationEvent["type"]; description: string; beforeHash: string; afterHash: string },
  sourceRef: SourceRef
): NormalizationEvent {
  return { ...input, sourceRef, automatic: true };
}

const UNSUPPORTED_METADATA_EXPLANATION_BASE =
  "The template content was imported successfully, but this Spectora row contains additional source metadata that the current editor does not represent.";

/** Never guesses at field meaning — lists exactly the header label + value pairs genuinely present in the source (docs/decision-log.md D17). */
function buildUnsupportedMetadataExplanation(fields: NormalizedRow["unmappedFields"]): string {
  if (fields.length === 0) return UNSUPPORTED_METADATA_EXPLANATION_BASE;
  const list = fields.map((field) => `${field.label}: ${field.value}`).join("; ");
  return `${UNSUPPORTED_METADATA_EXPLANATION_BASE} Additional fields: ${list}.`;
}

const UNSUPPORTED_ROW_EXPLANATION =
  "This meaningful source content could not be represented in the current section/item/comment model. The original source remains retained for review.";

export function buildHierarchy(
  rows: NormalizedRow[],
  options: BuildHierarchyOptions = {}
): {
  sections: CanonicalSection[];
  issues: ImportIssueCandidate[];
  /** Level A audit trail (docs/architecture.md §5a) — never surfaced as a warning. */
  normalizationEvents: NormalizationEvent[];
} {
  const generateId = options.generateId ?? randomUUID;
  const sections: CanonicalSection[] = [];
  const issues: ImportIssueCandidate[] = [];
  const normalizationEvents: NormalizationEvent[] = [];

  let currentSection: CanonicalSection | null = null;
  let currentItem: CanonicalItem | null = null;

  for (const row of rows) {
    let producedMappedNode = false;

    const currentSectionName: string | undefined = currentSection?.name;
    if (row.section && row.section !== currentSectionName) {
      const newSection: CanonicalSection = {
        id: generateId(),
        name: row.section,
        position: sections.length,
        sourceRef: row.sourceRef,
        items: [],
      };
      sections.push(newSection);
      currentSection = newSection;
      currentItem = null; // a new section always starts a fresh item context
      producedMappedNode = true;
    }

    const currentItemName: string | undefined = currentItem?.name;
    if (row.item && row.item !== currentItemName) {
      if (!currentSection) {
        issues.push({
          category: "ambiguous_hierarchy",
          severity: "warning",
          sourceRef: row.sourceRef,
          explanation: `Item "${row.item}" appeared before any section was established and could not be placed in the hierarchy.`,
          rawSnippet: row.item.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: null,
        });
      } else {
        const newItem: CanonicalItem = {
          id: generateId(),
          name: row.item,
          position: currentSection.items.length,
          sourceRef: row.sourceRef,
          comments: [],
        };
        currentSection.items.push(newItem);
        currentItem = newItem;
        producedMappedNode = true;
      }
    }

    if (row.commentRawHtml) {
      if (!currentItem) {
        issues.push({
          category: "ambiguous_hierarchy",
          severity: "warning",
          sourceRef: row.sourceRef,
          explanation: "Comment text appeared before any item was established and could not be placed in the hierarchy.",
          rawSnippet: row.commentRawHtml.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: null,
        });
        continue;
      }

      const { safeHtml, plainText, links, disallowedTags, droppedUnsafeLink, hadChangedLink, normalizationEvents: fieldEvents, fixSafely } =
        processRichContent(row.commentRawHtml);

      for (const event of fieldEvents) {
        normalizationEvents.push(toNormalizationEvent(event, row.sourceRef));
      }

      if (fixSafely) {
        // Level B: a deterministic, PROVEN text-preserving fix exists but is
        // never applied here — only a reviewer's explicit "Fix Safely"
        // confirms it (src/lib/persistence/issue-fix-actions.ts).
        issues.push({
          category: "recoverable_formatting",
          severity: "info",
          sourceRef: row.sourceRef,
          explanation:
            "This markup is not directly supported by the editor, but its content can be converted safely without changing wording or meaning.",
          rawSnippet: row.commentRawHtml.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: plainText.slice(0, RAW_SNIPPET_LIMIT),
          fixSafelyAvailable: true,
          proposedPlainText: fixSafely.proposedPlainText,
          proposedSafeHtml: fixSafely.proposedSafeHtml,
        });
      } else if (disallowedTags.length > 0) {
        issues.push({
          category: "unsupported_formatting",
          severity: "info",
          sourceRef: row.sourceRef,
          explanation: `Removed unsupported tag(s): ${disallowedTags.join(", ")}. The surrounding text was preserved.`,
          rawSnippet: row.commentRawHtml.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: plainText.slice(0, RAW_SNIPPET_LIMIT),
        });
      }

      if (droppedUnsafeLink) {
        issues.push({
          category: "unsupported_link",
          severity: "info",
          sourceRef: row.sourceRef,
          explanation:
            "Removed a link with a missing or unsupported URL scheme (only http/https are supported). The link's visible text was preserved.",
          rawSnippet: row.commentRawHtml.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: plainText.slice(0, RAW_SNIPPET_LIMIT),
        });
      }

      if (hadChangedLink) {
        issues.push({
          category: "unsupported_link",
          severity: "warning",
          sourceRef: row.sourceRef,
          explanation: "A link's URL was altered during import processing and may no longer match the source.",
          rawSnippet: row.commentRawHtml.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: plainText.slice(0, RAW_SNIPPET_LIMIT),
        });
      }

      currentItem.comments.push({
        id: generateId(),
        plainText,
        safeHtml: safeHtml || null,
        position: currentItem.comments.length,
        sourceRef: row.sourceRef,
        linkMetadata: links.length > 0 ? links : undefined,
      });
      producedMappedNode = true;
    }

    // Extra spreadsheet columns this row carries outside section/item/comment
    // (docs/decision-log.md D17). Which category applies depends on whether
    // THIS row actually landed anything new in the tree above — a repeated
    // section/item name with a blank comment produces nothing new even
    // though its own cells are non-blank, so `producedMappedNode` (not the
    // row's raw cell content) is what decides "mapped" vs "genuinely
    // unsupported." This is exactly what keeps sourceCoverage's mapped/
    // unsupported counts mathematically correct: a row only ever lands here
    // when it did NOT already flow into `currentSection`, `currentItem`, or
    // a fresh comment above.
    if (row.hasUnmappedContent) {
      if (producedMappedNode) {
        issues.push({
          category: "unsupported_metadata",
          severity: "info",
          sourceRef: row.sourceRef,
          explanation: buildUnsupportedMetadataExplanation(row.unmappedFields),
          rawSnippet: row.rawRowText.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview:
            [currentSection?.name, currentItem?.name, row.commentRawHtml].filter(Boolean).join(" / ") || null,
        });
      } else {
        issues.push({
          category: "unrecognized_row",
          severity: "warning",
          sourceRef: row.sourceRef,
          explanation: UNSUPPORTED_ROW_EXPLANATION,
          rawSnippet: row.rawRowText.slice(0, RAW_SNIPPET_LIMIT),
          importedPreview: null,
        });
      }
    }
  }

  return { sections, issues, normalizationEvents };
}
