import { describe, expect, it } from "vitest";
import { formatIntegrityReport } from "./format-report";
import { computeIntegrityResult } from "./compute-integrity";
import type { CanonicalTemplate, ImportIssueCandidate, SourceRowRecord } from "@/lib/import/types";
import type { PersistedTemplate } from "@/lib/persistence/read-persisted-template";

const parsedTemplate: CanonicalTemplate = {
  name: "Sample",
  sourceMetadata: {
    sourceFilename: "sample.xlsx",
    sheetNames: ["Sheet1"],
    templateNameSource: "filename",
    importedAt: "2026-01-01T00:00:00.000Z",
  },
  sections: [
    {
      id: "sec-1",
      name: "Roof",
      position: 0,
      sourceRef: { sheet: "Sheet1", rowNumber: 3 },
      items: [
        {
          id: "item-1",
          name: "Shingles",
          position: 0,
          sourceRef: { sheet: "Sheet1", rowNumber: 3 },
          comments: [
            {
              id: "c-1",
              plainText: "Good condition.",
              safeHtml: null,
              position: 0,
              sourceRef: { sheet: "Sheet1", rowNumber: 3 },
            },
          ],
        },
      ],
    },
  ],
};

const persistedTemplate: PersistedTemplate = {
  id: "db-1",
  name: "Sample",
  sections: [
    {
      name: "Roof",
      position: 0,
      items: [
        {
          name: "Shingles",
          position: 0,
          comments: [{ plain_text: "Good condition.", safe_html: null, position: 0, link_metadata: null }],
        },
      ],
    },
  ],
};

const sourceRowRecords: SourceRowRecord[] = [{ sourceRef: { sheet: "Sheet1", rowNumber: 3 } }];

describe("formatIntegrityReport", () => {
  it("renders a clean report for a verified import", () => {
    const result = computeIntegrityResult({ parsedTemplate, persistedTemplate, issues: [], sourceRowRecords });
    const text = formatIntegrityReport(result);

    expect(text).toContain("Import Integrity");
    expect(text).toContain("Verified — nothing unaccounted for.");
    expect(text).toContain("1 / 1 sections");
    expect(text).toContain("1 / 1 items");
    expect(text).toContain("1 / 1 comments");
    expect(text).toContain("1 meaningful rows");
    expect(text).toContain("1 mapped");
    expect(text).toContain("0 unaccounted");
    expect(text).toContain("Ordering: verified");
    expect(text).toContain("Text preservation: verified");
    expect(text).toContain("Links: 0 / 0");
    expect(text).toContain("Formatting differences: 0");
    expect(text).not.toContain("REVIEW REQUIRED");
  });

  it("surfaces unsupported-row and ignored-with-reason lines only when nonzero", () => {
    const issues: ImportIssueCandidate[] = [
      {
        category: "unrecognized_row",
        severity: "warning",
        sourceRef: { sheet: "Sheet1", rowNumber: 9 },
        explanation: "unmapped",
        rawSnippet: "x",
        importedPreview: null,
      },
    ];
    const result = computeIntegrityResult({
      parsedTemplate,
      persistedTemplate,
      issues,
      sourceRowRecords: [...sourceRowRecords, { sourceRef: { sheet: "Sheet1", rowNumber: 9 } }],
    });
    const text = formatIntegrityReport(result);

    expect(text).toContain("1 preserved as unsupported");
    expect(text).not.toContain("intentionally ignored with reason");
  });

  it("prominently flags REVIEW REQUIRED when a row is unaccounted for", () => {
    const result = computeIntegrityResult({
      parsedTemplate,
      persistedTemplate,
      issues: [],
      sourceRowRecords: [...sourceRowRecords, { sourceRef: { sheet: "Sheet1", rowNumber: 12 } }],
    });
    const text = formatIntegrityReport(result);

    expect(text).toContain("Review required: 1 source row(s) could not be accounted for.");
    expect(text).toContain("REVIEW REQUIRED — see details above before trusting this import.");
  });
});
