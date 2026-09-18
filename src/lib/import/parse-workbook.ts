import { validateFile } from "./validate-file";
import { loadWorkbook } from "./workbook";
import { extractSheet } from "./extract-rows";
import { normalizeRows, isMeaningfulRow } from "./normalize";
import { buildHierarchy } from "./hierarchy";
import { validateCanonicalTemplate } from "./validate";
import type {
  CanonicalTemplate,
  ImportIssueCandidate,
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

  let matchedSheet: string | null = null;
  let extracted: ReturnType<typeof extractSheet> = null;
  for (const sheetName of workbook.sheetNames) {
    const attempt = extractSheet(sheetName, workbook.sheets[sheetName]);
    if (attempt) {
      extracted = attempt;
      matchedSheet = sheetName;
      break;
    }
  }

  if (!extracted || !matchedSheet) {
    return {
      ok: false,
      issues: [
        blockingIssue(
          "None of the sheets in this workbook contain a recognizable section/item/comment header row.",
          workbook.sheetNames[0],
          workbook.sheetNames.join(", ")
        ),
      ],
    };
  }

  const { rows: normalizedRows, issues: normalizeIssues } = normalizeRows(extracted.rows);
  const { sections, issues: hierarchyIssues } = buildHierarchy(normalizedRows, {
    generateId: input.generateId,
  });
  const { name, source } = deriveTemplateName(input.filename, matchedSheet);
  const sourceRowRecords: SourceRowRecord[] = extracted.rows
    .filter(isMeaningfulRow)
    .map((row) => ({ sourceRef: row.sourceRef }));

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

  const issues = [...normalizeIssues, ...hierarchyIssues];
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

  return { ok: true, template: validation.data, issues, sourceRowRecords };
}
