import * as XLSX from "xlsx";

/**
 * Stage 1 of the pipeline (docs/architecture.md §2.1–§2.2): turns raw file
 * bytes into a plain grid of strings per sheet. Knows nothing about
 * Spectora's layout — only "is this readable as a spreadsheet."
 */
export interface LoadedWorkbook {
  sheetNames: string[];
  /** Row-major array-of-arrays per sheet, 0-indexed, every cell coerced to a display string. */
  sheets: Record<string, string[][]>;
}

export function loadWorkbook(input: ArrayBuffer | Buffer): LoadedWorkbook {
  const workbook = XLSX.read(input, {
    type: Buffer.isBuffer(input) ? "buffer" : "array",
  });

  const sheets: Record<string, string[][]> = {};
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    sheets[sheetName] = rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
    );
  }

  return { sheetNames: workbook.SheetNames, sheets };
}
