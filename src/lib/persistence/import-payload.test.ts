import { describe, expect, it } from "vitest";
import { toImportPayload, parseImportRpcResult } from "./import-payload";
import type { CanonicalTemplate, ImportIssueCandidate } from "@/lib/import/types";

const template: CanonicalTemplate = {
  name: "Sample Template",
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
              id: "comment-1",
              plainText: "Good condition.",
              safeHtml: "<p>Good condition.</p>",
              position: 0,
              sourceRef: { sheet: "Sheet1", rowNumber: 3 },
              linkMetadata: [{ href: "https://example.com", text: "guide" }],
            },
            {
              id: "comment-2",
              plainText: "No links here.",
              safeHtml: null,
              position: 1,
              sourceRef: { sheet: "Sheet1", rowNumber: 4 },
            },
          ],
        },
      ],
    },
  ],
};

const issues: ImportIssueCandidate[] = [
  {
    category: "unsupported_formatting",
    severity: "info",
    sourceRef: { sheet: "Sheet1", rowNumber: 5 },
    explanation: "Removed unsupported tag(s): script.",
    rawSnippet: "<script>x</script>",
    importedPreview: "preview",
  },
];

describe("toImportPayload", () => {
  it("maps camelCase canonical fields to the snake_case RPC contract", () => {
    const payload = toImportPayload(template, { sourceFilename: "sample.xlsx", sourceFileSha256: "abc123" }, issues);

    expect(payload.source_filename).toBe("sample.xlsx");
    expect(payload.source_file_sha256).toBe("abc123");
    expect(payload.template.name).toBe("Sample Template");
    expect(payload.template.sections).toHaveLength(1);

    const section = payload.template.sections[0];
    expect(section).toMatchObject({ name: "Roof", position: 0, source_sheet: "Sheet1", source_row_number: 3 });

    const item = section.items[0];
    expect(item).toMatchObject({ name: "Shingles", position: 0, source_sheet: "Sheet1", source_row_number: 3 });

    expect(item.comments[0]).toMatchObject({
      plain_text: "Good condition.",
      safe_html: "<p>Good condition.</p>",
      link_metadata: [{ href: "https://example.com", text: "guide" }],
    });
  });

  it("maps a missing linkMetadata to null, not undefined (JSONB has no undefined)", () => {
    const payload = toImportPayload(template, { sourceFilename: "sample.xlsx", sourceFileSha256: "abc123" }, []);
    expect(payload.template.sections[0].items[0].comments[1].link_metadata).toBeNull();
  });

  it("maps issue candidates into the flat issues array", () => {
    const payload = toImportPayload(template, { sourceFilename: "sample.xlsx", sourceFileSha256: "abc123" }, issues);
    expect(payload.issues).toEqual([
      {
        category: "unsupported_formatting",
        severity: "info",
        source_sheet: "Sheet1",
        source_row_number: 5,
        explanation: "Removed unsupported tag(s): script.",
        raw_snippet: "<script>x</script>",
        imported_preview: "preview",
      },
    ]);
  });

  it("produces an empty sections/issues array for an empty template, not an error", () => {
    const emptyTemplate: CanonicalTemplate = { ...template, sections: [] };
    const payload = toImportPayload(emptyTemplate, { sourceFilename: "empty.xlsx", sourceFileSha256: "x" }, []);
    expect(payload.template.sections).toEqual([]);
    expect(payload.issues).toEqual([]);
  });
});

describe("parseImportRpcResult", () => {
  it("maps the RPC's snake_case JSON result to camelCase", () => {
    const result = parseImportRpcResult({
      template_id: "t-1",
      import_run_id: "r-1",
      section_count: 3,
      item_count: 5,
      comment_count: 8,
      issue_count: 2,
    });

    expect(result).toEqual({
      templateId: "t-1",
      importRunId: "r-1",
      sectionCount: 3,
      itemCount: 5,
      commentCount: 8,
      issueCount: 2,
    });
  });

  it("throws on a malformed RPC result rather than silently returning bad data", () => {
    expect(() => parseImportRpcResult({ template_id: "t-1" })).toThrow();
  });
});
