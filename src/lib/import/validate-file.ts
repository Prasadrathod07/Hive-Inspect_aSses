import type { ImportIssueCandidate } from "./types";

/**
 * Stage 1 (docs/architecture.md §2.1): file-level validation, before any
 * attempt to parse spreadsheet structure. Deliberately separate from
 * "readable workbook" (stage 2, `workbook.ts`) so a bad upload gets a
 * precise, honest reason rather than a generic parser error.
 *
 * ASSUMPTION (docs/spectora-format.md): 20MB is a generous ceiling for a
 * spreadsheet-only export (no embedded photos) — unverified against a real
 * Spectora file, adjust once one is available.
 */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = [".xlsx", ".xls"];

function blockingFileIssue(explanation: string, filename: string): ImportIssueCandidate {
  return {
    category: "malformed_workbook",
    severity: "blocking",
    sourceRef: { sheet: "", rowNumber: 0 },
    explanation,
    rawSnippet: filename,
    importedPreview: null,
  };
}

export interface ValidateFileInput {
  buffer: ArrayBuffer | Buffer;
  filename: string;
}

/** Returns null when the file passes basic validation, or a blocking issue explaining why it doesn't. */
export function validateFile(input: ValidateFileInput): ImportIssueCandidate | null {
  const size = Buffer.isBuffer(input.buffer) ? input.buffer.length : input.buffer.byteLength;

  if (size === 0) {
    return blockingFileIssue("The uploaded file is empty.", input.filename);
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return blockingFileIssue(
      `The uploaded file is ${sizeMb}MB, which exceeds the ${limitMb}MB limit.`,
      input.filename
    );
  }

  const lowerName = input.filename.toLowerCase();
  const hasSupportedExtension = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasSupportedExtension) {
    return blockingFileIssue(
      `Unsupported file type "${input.filename}". Expected one of: ${SUPPORTED_EXTENSIONS.join(", ")}.`,
      input.filename
    );
  }

  return null;
}
