/**
 * Pure decision logic for picking the one real Spectora export to seed from.
 * Kept separate from the filesystem read (`scripts/seed-demo.ts`) so the
 * "none / one / too many" branching is unit-testable without touching disk.
 */
export type SampleFileClassification =
  | { kind: "none" }
  | { kind: "single"; filename: string }
  | { kind: "ambiguous"; filenames: string[] };

const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls"];

/** True for a real spreadsheet file at the top level of sample-data/spectora/. */
export function isCandidateSampleFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * `entries` is every directory entry found in `sample-data/spectora/`
 * (files only — the caller filters out subdirectories like `synthetic/`
 * before calling this, since a directory named `notes.xlsx` should never
 * happen but isn't this function's job to guard against).
 */
export function classifySampleFiles(entries: string[]): SampleFileClassification {
  const candidates = entries.filter(isCandidateSampleFile).sort();

  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "single", filename: candidates[0] };
  return { kind: "ambiguous", filenames: candidates };
}
