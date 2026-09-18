import type { RawSourceRow } from "./extract-rows";
import type { ImportIssueCandidate, SourceRef } from "./types";

/**
 * Stage 3 (docs/architecture.md §2.3): trims and classifies raw rows.
 * Every row either becomes a NormalizedRow or an ImportIssueCandidate —
 * nothing is dropped without one or the other (requirement 3).
 */
export interface NormalizedRow {
  sourceRef: SourceRef;
  section: string | null;
  item: string | null;
  /** Raw (unsanitized) HTML — sanitization happens later, in the rich-content stage. */
  commentRawHtml: string | null;
}

const RAW_SNIPPET_LIMIT = 300;

/**
 * True for any row that carries content worth accounting for — mapped or
 * not. Pure blank spacer rows (docs/spectora-format.md assumption 6) are
 * the only rows this excludes; used both here and by the Import Integrity
 * Engine's source-row coverage calculation (src/lib/integrity/), so the two
 * never quietly disagree about what counts as "meaningful."
 */
export function isMeaningfulRow(row: RawSourceRow): boolean {
  const hasMappedContent = Boolean(
    row.cells.section?.trim() || row.cells.item?.trim() || row.cells.comment?.trim()
  );
  return hasMappedContent || row.hasUnmappedContent;
}

export function normalizeRows(rawRows: RawSourceRow[]): {
  rows: NormalizedRow[];
  issues: ImportIssueCandidate[];
} {
  const rows: NormalizedRow[] = [];
  const issues: ImportIssueCandidate[] = [];

  for (const raw of rawRows) {
    const section = raw.cells.section?.trim() || null;
    const item = raw.cells.item?.trim() || null;
    const commentRawHtml = raw.cells.comment?.trim() || null;
    const hasMappedContent = Boolean(section || item || commentRawHtml);

    if (!isMeaningfulRow(raw)) {
      continue; // genuinely empty spacer row — no content exists to lose
    }

    if (raw.hasUnmappedContent) {
      issues.push({
        category: "unrecognized_row",
        severity: hasMappedContent ? "info" : "warning",
        sourceRef: raw.sourceRef,
        explanation: hasMappedContent
          ? "This row has content in one or more columns outside the recognized section/item/comment columns; that extra content was not imported."
          : "This row's content is entirely outside the recognized section/item/comment columns and could not be mapped to the template structure.",
        rawSnippet: raw.rawRowText.slice(0, RAW_SNIPPET_LIMIT),
        importedPreview: hasMappedContent
          ? [section, item, commentRawHtml].filter(Boolean).join(" / ")
          : null,
      });
      if (!hasMappedContent) continue;
    }

    rows.push({ sourceRef: raw.sourceRef, section, item, commentRawHtml });
  }

  return { rows, issues };
}
