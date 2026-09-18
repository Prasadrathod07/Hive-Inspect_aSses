import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { IntegrityResult } from "@/lib/integrity/types";

const createServiceRoleClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server-client", () => ({ createServiceRoleClient }));

const { getImportRunIssues } = await import("./get-import-run-issues");

beforeEach(() => createServiceRoleClient.mockReset());
afterEach(() => vi.restoreAllMocks());

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";

function baseIntegrityResult(unsupportedSourceRefs: { sheet: string; rowNumber: number }[]): IntegrityResult {
  return {
    status: "verified_with_warnings",
    summary: "Verified with warnings.",
    reviewRequired: false,
    structure: {
      sections: { source: 1, persisted: 1, match: true },
      items: { source: 1, persisted: 1, match: true },
      comments: { source: 1, persisted: 1, match: true },
    },
    ordering: { status: "verified", mismatches: [] },
    textPreservation: { status: "verified", comparedCount: 1, mismatches: [] },
    links: { sourceLinks: 0, preservedLinks: 0, mismatches: [] },
    formattingWarnings: [],
    structuralWarnings: [],
    sourceCoverage: {
      meaningfulSourceRows: 2,
      mappedRows: 1,
      unsupportedRows: unsupportedSourceRefs.length,
      ignoredRowsWithReason: 0,
      unaccountedRows: 0,
      unaccountedSourceRefs: [],
      unsupportedSourceRefs,
    },
    generatedAt: "2026-09-18T00:00:00.000Z",
  };
}

/** Builds a Supabase client mock whose `.from()` table calls resolve to the given canned data, in call order. */
function mockClient(integrityResult: IntegrityResult | null, issuesRows: Record<string, unknown>[]) {
  const from = vi.fn((table: string) => {
    if (table === "import_runs") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: RUN_ID,
                  template_id: TEMPLATE_ID,
                  source_filename: "export.xlsx",
                  created_at: "2026-09-18T00:00:00.000Z",
                  integrity_result: integrityResult,
                },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "templates") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: TEMPLATE_ID, name: "Sample Template", sections: [] },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "import_issues") {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: issuesRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  createServiceRoleClient.mockReturnValue({ from });
}

function issueRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "issue-1",
    category: "unrecognized_row",
    severity: "info",
    source_sheet: "Sheet1",
    source_row_number: 2,
    explanation: "extra columns",
    raw_snippet: "raw",
    imported_preview: null,
    resolution_status: "open",
    fix_safely_available: false,
    proposed_plain_text: null,
    proposed_safe_html: null,
    applied_fix_at: null,
    ...overrides,
  };
}

describe("getImportRunIssues — rowGenuinelyUnsupported derivation", () => {
  it("is true for an unrecognized_row issue whose row IS in sourceCoverage.unsupportedSourceRefs", async () => {
    mockClient(baseIntegrityResult([{ sheet: "Sheet1", rowNumber: 2 }]), [issueRow()]);
    const page = await getImportRunIssues(RUN_ID);
    expect(page?.issues[0].rowGenuinelyUnsupported).toBe(true);
  });

  it("is false for an unrecognized_row issue whose row mapped successfully (not in unsupportedSourceRefs)", async () => {
    mockClient(baseIntegrityResult([{ sheet: "Sheet1", rowNumber: 99 }]), [issueRow()]);
    const page = await getImportRunIssues(RUN_ID);
    expect(page?.issues[0].rowGenuinelyUnsupported).toBe(false);
  });

  it("is always true for a non-unrecognized_row category, regardless of sourceCoverage", async () => {
    mockClient(baseIntegrityResult([]), [issueRow({ category: "unsupported_formatting" })]);
    const page = await getImportRunIssues(RUN_ID);
    expect(page?.issues[0].rowGenuinelyUnsupported).toBe(true);
  });

  it("conservatively defaults to true (never collapses) when no integrity result exists at all", async () => {
    mockClient(null, [issueRow()]);
    const page = await getImportRunIssues(RUN_ID);
    expect(page?.issues[0].rowGenuinelyUnsupported).toBe(true);
  });
});
