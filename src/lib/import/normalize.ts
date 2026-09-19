import type { RawSourceRow, UnmappedField } from "./extract-rows";
import type { SourceRef } from "./types";

/**
 * Stage 3 (docs/architecture.md §2.3): trims rows and carries forward
 * exactly the detail buildHierarchy (stage 4) needs to classify each row
 * correctly. Every row either ends up mapped or produces an issue — nothing
 * is dropped without one or the other (requirement 3) — but that
 * classification itself now happens in buildHierarchy, not here: only that
 * stage knows whether a row's section/item value actually started something
 * new or merely repeated the current group (docs/decision-log.md D17).
 */
export interface NormalizedRow {
  sourceRef: SourceRef;
  section: string | null;
  item: string | null;
  /** Raw (unsanitized) HTML — sanitization happens later, in the rich-content stage. */
  commentRawHtml: string | null;
  /** True if any column outside section/item/comment has non-blank content. */
  hasUnmappedContent: boolean;
  /** The genuine, source-derived detail behind `hasUnmappedContent` — never guessed. */
  unmappedFields: UnmappedField[];
  /** Full row, tab-joined — retained for issue traceability. */
  rawRowText: string;
}

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

export function normalizeRows(rawRows: RawSourceRow[]): { rows: NormalizedRow[] } {
  const rows: NormalizedRow[] = [];

  for (const raw of rawRows) {
    if (!isMeaningfulRow(raw)) {
      continue; // genuinely empty spacer row — no content exists to lose
    }

    rows.push({
      sourceRef: raw.sourceRef,
      section: raw.cells.section?.trim() || null,
      item: raw.cells.item?.trim() || null,
      commentRawHtml: raw.cells.comment?.trim() || null,
      hasUnmappedContent: raw.hasUnmappedContent,
      unmappedFields: raw.unmappedFields,
      rawRowText: raw.rawRowText,
    });
  }

  return { rows };
}
