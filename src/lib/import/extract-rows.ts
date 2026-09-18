import type { SourceRef } from "./types";

/**
 * Stage 2 (docs/architecture.md §2.2): finds the header row and maps
 * columns to structural roles by keyword, not by fixed position. This is
 * what keeps the importer from being hard-coded to one sample file
 * (requirement 10) — see docs/spectora-format.md for the keyword
 * assumptions and why they're assumptions, not observed fact.
 */
export type ColumnRole = "section" | "item" | "comment";

export interface RawSourceRow {
  sourceRef: SourceRef;
  cells: Partial<Record<ColumnRole, string>>;
  /** True if any column *outside* the mapped roles has non-blank content. */
  hasUnmappedContent: boolean;
  /** Full row, tab-joined, for issue reporting — never used for parsing logic. */
  rawRowText: string;
}

export interface ExtractedSheet {
  sheet: string;
  headerRowIndex: number;
  columnRoles: Partial<Record<ColumnRole, number>>;
  rows: RawSourceRow[];
}

const ROLE_KEYWORDS: Record<ColumnRole, string[]> = {
  section: ["section", "area", "category"],
  item: ["item", "component"],
  comment: [
    "comment",
    "narrative",
    "limitation",
    "finding",
    "description",
    "text",
    "deficiency",
    "observation",
    "note",
  ],
};

const HEADER_SCAN_LIMIT = 15;

/**
 * Resilient header normalization: strips punctuation (so "Comment (HTML)",
 * "Comment:", and "Comment/Narrative" all normalize the same way a plain
 * "Comment" header would) and collapses whitespace, before keyword
 * matching. Real header wording is unverified (docs/spectora-format.md) —
 * this is what "resilient" means in practice: tolerate formatting noise
 * around a recognizable word, not guess at unrelated wording.
 */
function normalizeHeaderCell(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comment-content keywords that signal genuine free-text narrative, as
 * opposed to the bare word "comment" — which a real export can also use for
 * an identifying LABEL column (observed: a real Spectora template export
 * pairs a short "Comment Name" per boilerplate entry with a separate
 * "Comment Text" column holding the actual HTML narrative). "comment" alone
 * is deliberately excluded here so a "*Name" column doesn't outrank the
 * column that actually holds the content.
 */
const STRONG_COMMENT_KEYWORDS = ROLE_KEYWORDS.comment.filter((keyword) => keyword !== "comment");

/** Matches a header ending in the word "name" — an identifying label, not narrative content (e.g. "Comment Name", "Section Name"). */
const NAME_LABEL_PATTERN = /(^|\s)name(\s|$)/;

/**
 * Maps columns to roles by keyword.
 *
 * Three rules, all load-bearing:
 *   - Section/item: the first column matching a role wins that role.
 *   - A column can hold only ONE role. Without this, a header like
 *     "Item Text" matches `item` ("item") *and* `comment` ("text"), and the
 *     same cell gets imported twice — once as the item's name and again as a
 *     comment under it. Section/item are detected before comment, so the
 *     narrower match claims the column first.
 *   - Comment: among all NOT-YET-CLAIMED columns matching a comment keyword,
 *     the one with a strong content keyword (narrative/finding/description/
 *     text/deficiency/observation/note/limitation) wins over one that only
 *     matches the bare word "comment" while also looking like a "*Name"
 *     label column. Without this, "Comment Name" (a short boilerplate label,
 *     always present) would win the comment role over "Comment Text" (the
 *     actual narrative, often the only place real content lives) simply for
 *     appearing first — silently importing labels as if they were customer
 *     narrative and never reading the real text at all.
 */
function detectColumnRoles(headerRow: string[]): Partial<Record<ColumnRole, number>> {
  const roles: Partial<Record<ColumnRole, number>> = {};
  const claimedColumns = new Set<number>();

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) return;
    for (const role of ["section", "item"] as ColumnRole[]) {
      if (role in roles) continue; // this role already has a column
      if (claimedColumns.has(index)) break; // this column already has a role
      if (ROLE_KEYWORDS[role].some((keyword) => normalized.includes(keyword))) {
        roles[role] = index;
        claimedColumns.add(index);
      }
    }
  });

  let bestCommentIndex: number | undefined;
  let bestCommentPriority = -1;
  headerRow.forEach((cell, index) => {
    if (claimedColumns.has(index)) return;
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) return;
    if (!ROLE_KEYWORDS.comment.some((keyword) => normalized.includes(keyword))) return;

    const isStrongContent = STRONG_COMMENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
    const isNameLabel = NAME_LABEL_PATTERN.test(normalized);
    const priority = isStrongContent ? 2 : isNameLabel ? 0 : 1;

    if (priority > bestCommentPriority) {
      bestCommentPriority = priority;
      bestCommentIndex = index;
    }
  });
  if (bestCommentIndex !== undefined) {
    roles.comment = bestCommentIndex;
    claimedColumns.add(bestCommentIndex);
  }

  return roles;
}

/** A header row must identify at least two of the three roles to be trusted. */
function isPlausibleHeader(roles: Partial<Record<ColumnRole, number>>): boolean {
  return Object.keys(roles).length >= 2;
}

/** True if any cell anywhere in the sheet has non-blank content. */
export function sheetHasContent(rows: string[][]): boolean {
  return rows.some((row) => row.some((cell) => cell.toString().trim().length > 0));
}

export function extractSheet(sheet: string, rows: string[][]): ExtractedSheet | null {
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT);

  for (let headerIndex = 0; headerIndex < scanLimit; headerIndex++) {
    const roles = detectColumnRoles(rows[headerIndex]);
    if (!isPlausibleHeader(roles)) continue;

    const mappedIndexes = new Set(Object.values(roles));
    const dataRows = rows.slice(headerIndex + 1);

    const extractedRows: RawSourceRow[] = dataRows.map((row, offset) => {
      const rowNumber = headerIndex + 2 + offset; // 1-indexed; header occupies headerIndex+1
      const cells: Partial<Record<ColumnRole, string>> = {};
      for (const role of Object.keys(roles) as ColumnRole[]) {
        const columnIndex = roles[role]!;
        cells[role] = (row[columnIndex] ?? "").toString();
      }
      const hasUnmappedContent = row.some(
        (cell, index) => !mappedIndexes.has(index) && cell.toString().trim().length > 0
      );

      return {
        sourceRef: { sheet, rowNumber },
        cells,
        hasUnmappedContent,
        rawRowText: row.join("\t"),
      };
    });

    return { sheet, headerRowIndex: headerIndex, columnRoles: roles, rows: extractedRows };
  }

  return null;
}
