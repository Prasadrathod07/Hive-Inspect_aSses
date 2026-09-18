import { describe, expect, it } from "vitest";
import { classifySampleFiles, isCandidateSampleFile } from "./classify-sample-files";

describe("isCandidateSampleFile", () => {
  it("accepts .xlsx and .xls, case-insensitively", () => {
    expect(isCandidateSampleFile("export.xlsx")).toBe(true);
    expect(isCandidateSampleFile("export.XLSX")).toBe(true);
    expect(isCandidateSampleFile("export.xls")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isCandidateSampleFile("README.md")).toBe(false);
    expect(isCandidateSampleFile("notes.txt")).toBe(false);
    expect(isCandidateSampleFile("export.xlsx.bak")).toBe(false);
  });
});

describe("classifySampleFiles", () => {
  it("classifies an empty directory as none", () => {
    expect(classifySampleFiles([])).toEqual({ kind: "none" });
  });

  it("classifies a directory with only a README as none", () => {
    expect(classifySampleFiles(["README.md"])).toEqual({ kind: "none" });
  });

  it("classifies exactly one spreadsheet as single", () => {
    expect(classifySampleFiles(["README.md", "standard-home-inspection.xlsx"])).toEqual({
      kind: "single",
      filename: "standard-home-inspection.xlsx",
    });
  });

  it("classifies two spreadsheets as ambiguous, sorted", () => {
    const result = classifySampleFiles(["b-export.xlsx", "a-export.xls"]);
    expect(result).toEqual({
      kind: "ambiguous",
      filenames: ["a-export.xls", "b-export.xlsx"],
    });
  });

  it("never picks a real file out of the synthetic/ subdirectory listing by accident", () => {
    // The caller is responsible for excluding subdirectories before calling
    // this — this test documents that a bare directory NAME (no extension)
    // is correctly rejected as not-a-spreadsheet, the one thing this
    // function itself can guard against.
    expect(classifySampleFiles(["synthetic"])).toEqual({ kind: "none" });
  });
});
