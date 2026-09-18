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
  comment: ["comment", "narrative", "limitation", "finding", "description", "text", "deficiency", "observation"],
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

function detectColumnRoles(headerRow: string[]): Partial<Record<ColumnRole, number>> {
  const roles: Partial<Record<ColumnRole, number>> = {};
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) return;
    for (const role of Object.keys(ROLE_KEYWORDS) as ColumnRole[]) {
      if (role in roles) continue; // first matching column wins
      if (ROLE_KEYWORDS[role].some((keyword) => normalized.includes(keyword))) {
        roles[role] = index;
      }
    }
  });
  return roles;
}

/** A header row must identify at least two of the three roles to be trusted. */
function isPlausibleHeader(roles: Partial<Record<ColumnRole, number>>): boolean {
  return Object.keys(roles).length >= 2;
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
