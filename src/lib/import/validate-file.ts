import type { ImportIssueCandidate } from "./types";

/**
 * Stage 1 (docs/architecture.md §2.1): file-level validation, before any
 * attempt to parse spreadsheet structure. Deliberately separate from
 * "readable workbook" (stage 2, `workbook.ts`) so a bad upload gets a
 * precise, honest reason rather than a generic parser error.
 *
 * SIZE LIMIT: capped by the deployment platform, not by an assumption about
 * spreadsheet size. Vercel Functions hard-reject any request body over
 * 4.5MB with a platform-level 413 (FUNCTION_PAYLOAD_TOO_LARGE) before this
 * code — or even the Content-Length pre-check in the API route — ever runs;
 * that limit is not configurable on any plan
 * (https://vercel.com/docs/functions/limitations#request-body-size,
 * confirmed 2026-09). 4MB leaves headroom under that ceiling for
 * multipart/form-data overhead (boundary, headers, filename field) so our
 * own honest "file too large" error is always the one a person sees,
 * never an opaque platform rejection. A spreadsheet-only export (no
 * embedded photos) should comfortably fit; if a real Spectora export
 * turns out to need more, the fix is raising the *platform* limit (Vercel
 * Blob / a presigned direct upload), not this constant — see
 * docs/deployment.md.
 */
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = [".xlsx", ".xls"];

/**
 * An extension is a claim, not evidence — anyone can rename a file to
 * `.xlsx`. These are the actual container signatures:
 *   - .xlsx is a ZIP archive: "PK\x03\x04"
 *   - .xls is an OLE2 compound file: D0 CF 11 E0 A1 B1 1A E1
 * Checking them means a renamed PDF/script/image is rejected with a clear
 * reason before SheetJS is ever handed arbitrary bytes to parse.
 */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** True if the bytes actually look like a spreadsheet container, whatever the file is called. */
export function hasSpreadsheetSignature(buffer: ArrayBuffer | Buffer): boolean {
  const bytes = Buffer.isBuffer(buffer) ? buffer : new Uint8Array(buffer);
  return startsWith(bytes, ZIP_SIGNATURE) || startsWith(bytes, OLE2_SIGNATURE);
}

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

  if (!hasSpreadsheetSignature(input.buffer)) {
    return blockingFileIssue(
      `"${input.filename}" is named like a spreadsheet, but its contents aren't one. Re-export from Spectora rather than renaming a file.`,
      input.filename
    );
  }

  return null;
}
