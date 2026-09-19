import { validateFile } from "./validate-file";
import { loadWorkbook } from "./workbook";
import { extractSheet, sheetHasContent } from "./extract-rows";
import { normalizeRows, isMeaningfulRow } from "./normalize";
import { buildHierarchy } from "./hierarchy";
import { validateCanonicalTemplate } from "./validate";
import type {
  CanonicalSection,
  CanonicalTemplate,
  ImportIssueCandidate,
  NormalizationEvent,
  SourceRowRecord,
  TemplateNameSource,
} from "./types";

/**
 * Orchestrates stages 1–7 of docs/architecture.md §1 (file validation
 * through schema validation). Deliberately stops short of persistence —
 * this function is a pure transform from bytes to a validated canonical
 * template plus issue candidates, so it's testable without Supabase.
 *
 * Failure handling follows architecture.md §6: a file-level problem (can't
 * read the workbook, no recognizable structure, schema validation failure)
 * returns `ok: false` with no partial template. Row-level problems become
 * issue candidates and the import continues.
 */
export interface ParseSpectoraWorkbookInput {
  buffer: ArrayBuffer | Buffer;
  filename: string;
  /** ISO timestamp; supplied by the caller so this function stays pure/deterministic. */
  importedAt?: string;
  /** Defaults to `crypto.randomUUID`; inject a deterministic generator for reproducible (golden-file) output. */
  generateId?: () => string;
}

export type ParseSpectoraWorkbookResult =
  | {
      ok: true;
      template: CanonicalTemplate;
      issues: ImportIssueCandidate[];
      /** Every meaningful source row, for the Import Integrity Engine's source-row coverage check. */
      sourceRowRecords: SourceRowRecord[];
      /** Level A silent-normalization audit trail (docs/architecture.md §5a) — never surfaced as a warning. */
      normalizationEvents: NormalizationEvent[];
    }
  | { ok: false; issues: ImportIssueCandidate[] };

function blockingIssue(
  explanation: string,
  sheet: string,
  rawSnippet: string
): ImportIssueCandidate {
  return {
    category: "malformed_workbook",
    severity: "blocking",
    sourceRef: { sheet, rowNumber: 0 },
    explanation,
    rawSnippet,
    importedPreview: null,
  };
}

const SHEET_SNIPPET_ROW_LIMIT = 5;
const SHEET_SNIPPET_CHAR_LIMIT = 300;

/**
 * A readable sample of an unimportable sheet, retained on its issue so the
 * content is inspectable rather than merely counted.
 */
function firstNonBlankRows(rows: string[][]): string {
  return rows
    .filter((row) => row.some((cell) => cell.toString().trim().length > 0))
    .slice(0, SHEET_SNIPPET_ROW_LIMIT)
    .map((row) => row.join("\t"))
    .join("\n")
    .slice(0, SHEET_SNIPPET_CHAR_LIMIT);
}

/**
 * ASSUMPTION (docs/spectora-format.md): there is no known explicit
 * "template name" cell in a flattened spreadsheet export, so we prefer a
 * meaningful sheet name, then fall back to the uploaded filename.
 */
function deriveTemplateName(
  filename: string,
  sheetName: string | null
): { name: string; source: TemplateNameSource } {
  const genericSheetName = /^sheet ?\d*$/i;
  if (sheetName && !genericSheetName.test(sheetName.trim())) {
    return { name: sheetName.trim(), source: "sheet-name" };
  }
  const base = filename.replace(/\.[^./]+$/, "").trim();
  if (base) return { name: base, source: "filename" };
  return { name: "Untitled Template", source: "fallback" };
}

export function parseSpectoraWorkbook(
  input: ParseSpectoraWorkbookInput
): ParseSpectoraWorkbookResult {
  const importedAt = input.importedAt ?? new Date().toISOString();

  const fileIssue = validateFile({ buffer: input.buffer, filename: input.filename });
  if (fileIssue) {
    return { ok: false, issues: [fileIssue] };
  }

  let workbook;
  try {
    workbook = loadWorkbook(input.buffer);
  } catch (error) {
    return {
      ok: false,
      issues: [
        blockingIssue(
          `The uploaded file could not be read as a spreadsheet: ${error instanceof Error ? error.message : String(error)}`,
          "",
          input.filename
        ),
      ],
    };
  }

  if (workbook.sheetNames.length === 0) {
    return { ok: false, issues: [blockingIssue("The workbook has no sheets.", "", input.filename)] };
  }

  // EVERY sheet is examined, not just the first one that parses.
  //
  // This used to stop at the first recognizable sheet, which meant a
  // multi-sheet export had its remaining sheets discarded with no issue
  // raised and no source rows counted — so the integrity engine saw nothing
  // missing and reported "verified" over a dropped sheet. A silent drop that
  // also defeats the check designed to catch silent drops is the single worst
  // failure this product can have.
  const extractedSheets: NonNullable<ReturnType<typeof extractSheet>>[] = [];
  const sheetIssues: ImportIssueCandidate[] = [];

  for (const sheetName of workbook.sheetNames) {
    const sheetRows = workbook.sheets[sheetName];
    const attempt = extractSheet(sheetName, sheetRows);
    if (attempt) {
      extractedSheets.push(attempt);
      continue;
    }
    // No recognizable header. If it holds content, say so rather than
    // discarding it; a blank or decorative sheet is genuinely nothing to lose.
    if (sheetHasContent(sheetRows)) {
      sheetIssues.push({
        category: "unrecognized_row",
        severity: "warning",
        sourceRef: { sheet: sheetName, rowNumber: 0 },
        explanation: `Sheet "${sheetName}" contains content but no recognizable section/item/comment header row, so none of it could be imported.`,
        rawSnippet: firstNonBlankRows(sheetRows),
        importedPreview: null,
      });
    }
  }

  if (extractedSheets.length === 0) {
    return {
      ok: false,
      issues: [
        ...sheetIssues,
        blockingIssue(
          "None of the sheets in this workbook contain a recognizable section/item/comment header row.",
          workbook.sheetNames[0],
          workbook.sheetNames.join(", ")
        ),
      ],
    };
  }

  // Hierarchy is built per sheet, then concatenated. Building across a sheet
  // boundary would let a section at the end of one sheet absorb rows from the
  // start of the next, which no export format implies.
  const sections: CanonicalSection[] = [];
  const hierarchyIssues: ImportIssueCandidate[] = [];
  const sourceRowRecords: SourceRowRecord[] = [];
  const normalizationEvents: NormalizationEvent[] = [];

  for (const sheet of extractedSheets) {
    const normalized = normalizeRows(sheet.rows);

    const built = buildHierarchy(normalized.rows, { generateId: input.generateId });
    hierarchyIssues.push(...built.issues);
    sections.push(...built.sections);
    normalizationEvents.push(...built.normalizationEvents);

    for (const row of sheet.rows) {
      if (isMeaningfulRow(row)) sourceRowRecords.push({ sourceRef: row.sourceRef });
    }
  }

  // `position` is assigned per-sheet by buildHierarchy, so renumber across the
  // merged set to keep it a globally meaningful ordering (requirement 2).
  sections.forEach((section, index) => {
    section.position = index;
  });

  const { name, source } = deriveTemplateName(input.filename, extractedSheets[0].sheet);
  const matchedSheet = extractedSheets[0].sheet;

  const templateCandidate: CanonicalTemplate = {
    name,
    sourceMetadata: {
      sourceFilename: input.filename,
      sheetNames: workbook.sheetNames,
      templateNameSource: source,
      importedAt,
    },
    sections,
  };

  const issues = [...sheetIssues, ...hierarchyIssues];
  const validation = validateCanonicalTemplate(templateCandidate);

  if (!validation.success) {
    return {
      ok: false,
      issues: [
        ...issues,
        blockingIssue(
          `The parsed template failed schema validation: ${validation.errors.join("; ")}`,
          matchedSheet,
          ""
        ),
      ],
    };
  }

  return { ok: true, template: validation.data, issues, sourceRowRecords, normalizationEvents };
}
