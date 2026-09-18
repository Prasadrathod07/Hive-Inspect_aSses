import { describe, expect, it } from "vitest";
import { buildAuditPayload, allowedIssueIds, KNOWN_LIMITATIONS, type AuditableIssue } from "./audit-payload";
import type { IntegrityResult } from "@/lib/integrity/types";

/** Distinctive strings that must never appear in anything sent to a model. */
const SECRET_SECTION = "Zzyzx Crawlspace Vault";
const SECRET_ITEM = "Quimby Flue Liner";
const SECRET_COMMENT = "Homeowner Barbara Mendoza at 44 Alder Lane reports recurring damp.";

function integrity(overrides: Partial<IntegrityResult> = {}): IntegrityResult {
  return {
    status: "verified_with_warnings",
    summary: "Verified with 2 warnings.",
    reviewRequired: false,
    structure: {
      sections: { source: 3, persisted: 3, match: true },
      items: { source: 9, persisted: 9, match: true },
      comments: { source: 14, persisted: 14, match: true },
    },
    ordering: { status: "verified", mismatches: [] },
    textPreservation: { status: "verified", comparedCount: 26, mismatches: [] },
    links: { sourceLinks: 2, preservedLinks: 2, mismatches: [] },
    formattingWarnings: [
      { sourceRef: { sheet: "Sheet1", rowNumber: 12 }, explanation: `Removed <table> from ${SECRET_COMMENT}` },
    ],
    structuralWarnings: [],
    sourceCoverage: {
      meaningfulSourceRows: 26,
      mappedRows: 24,
      unsupportedRows: 2,
      ignoredRowsWithReason: 0,
      unaccountedRows: 0,
      unaccountedSourceRefs: [],
      unsupportedSourceRefs: [],
    },
    generatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function issues(): AuditableIssue[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      category: "unsupported_formatting",
      severity: "warning",
      sourceRowNumber: 12,
      explanation: `Removed unsupported tag(s): table. Text preserved from "${SECRET_SECTION}".`,
      rawSnippet: `<table><tr><td>${SECRET_COMMENT}</td></tr></table>`,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      category: "ambiguous_hierarchy",
      severity: "warning",
      sourceRowNumber: 19,
      explanation: `Item "${SECRET_ITEM}" appeared before any section was established.`,
      rawSnippet: SECRET_ITEM,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      category: "unsupported_link",
      severity: "info",
      sourceRowNumber: 21,
      explanation: "A link's URL was altered during import processing.",
      rawSnippet: `<a href="javascript:alert(1)">${SECRET_COMMENT}</a>`,
    },
  ];
}

describe("buildAuditPayload — customer content never leaves the server", () => {
  it("contains none of the template's actual text", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(SECRET_SECTION);
    expect(serialized).not.toContain(SECRET_ITEM);
    expect(serialized).not.toContain(SECRET_COMMENT);
    expect(serialized).not.toContain("Barbara Mendoza");
    expect(serialized).not.toContain("44 Alder Lane");
  });

  it("drops raw snippets and per-issue explanations entirely", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain("rawSnippet");
    expect(serialized).not.toContain("explanation");
    expect(serialized).not.toContain("<table>");
    expect(serialized).not.toContain("javascript:");
  });

  it("does not leak content through the integrity engine's warning text", () => {
    // formattingWarnings carry explanations that can embed comment text, so
    // the payload sends the COUNT, never the warnings themselves.
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    expect(payload.formattingWarningCount).toBe(1);
    expect(JSON.stringify(payload)).not.toContain("Removed <table>");
  });

  it("sends only ids, categories, groups, severities, and row numbers per issue", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    for (const issue of payload.issues) {
      expect(Object.keys(issue).sort()).toEqual([
        "category",
        "group",
        "id",
        "severity",
        "sourceRowNumber",
      ]);
    }
  });
});

describe("buildAuditPayload — carries the deterministic facts faithfully", () => {
  it("passes counts through unchanged", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });

    expect(payload.structure.sections).toEqual({ source: 3, persisted: 3, match: true });
    expect(payload.structure.comments.persisted).toBe(14);
    expect(payload.integrityStatus).toBe("verified_with_warnings");
    expect(payload.deterministicSummary).toBe("Verified with 2 warnings.");
  });

  it("passes source coverage through, including unaccounted row numbers", () => {
    const payload = buildAuditPayload({
      integrity: integrity({
        status: "review_required",
        sourceCoverage: {
          meaningfulSourceRows: 26,
          mappedRows: 23,
          unsupportedRows: 2,
          ignoredRowsWithReason: 0,
          unaccountedRows: 1,
          unaccountedSourceRefs: [{ sheet: "Sheet1", rowNumber: 31 }],
          unsupportedSourceRefs: [],
        },
      }),
      issues: issues(),
    });

    expect(payload.sourceCoverage.unaccountedRows).toBe(1);
    expect(payload.sourceCoverage.unaccountedRowNumbers).toEqual([31]);
  });

  it("groups issues using the same categories the UI shows", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    const groups = payload.issueGroups.map((g) => g.group);

    expect(groups).toContain("unmapped_rows");
    expect(groups).toContain("link_differences");
    expect(payload.issueGroups.reduce((sum, g) => sum + g.count, 0)).toBe(3);
  });

  it("states the importer's real limitations so the model doesn't invent them", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    expect(payload.knownLimitations).toEqual(KNOWN_LIMITATIONS);
    expect(payload.knownLimitations.join(" ")).toContain("Export HTML Text");
  });

  it("handles an import with no issues at all", () => {
    const payload = buildAuditPayload({ integrity: integrity({ status: "verified" }), issues: [] });
    expect(payload.issues).toEqual([]);
    expect(payload.issueGroups).toEqual([]);
  });
});

describe("allowedIssueIds", () => {
  it("returns exactly the supplied ids — the allowlist for validation", () => {
    const payload = buildAuditPayload({ integrity: integrity(), issues: issues() });
    expect(allowedIssueIds(payload)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });
});
