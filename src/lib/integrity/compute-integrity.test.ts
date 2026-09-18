import { describe, expect, it } from "vitest";
import { computeIntegrityResult, unverifiableIntegrityResult } from "./compute-integrity";
import type { CanonicalTemplate, ImportIssueCandidate, SourceRef, SourceRowRecord } from "@/lib/import/types";
import type { PersistedTemplate } from "@/lib/persistence/read-persisted-template";

function ref(rowNumber: number): SourceRef {
  return { sheet: "Sheet1", rowNumber };
}

/** One section ("Roof" > "Shingles") with two comments, spanning source rows 3 and 4. */
function baseTemplate(): CanonicalTemplate {
  return {
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
        sourceRef: ref(3),
        items: [
          {
            id: "item-1",
            name: "Shingles",
            position: 0,
            sourceRef: ref(3),
            comments: [
              {
                id: "c-1",
                plainText: "Good condition.",
                safeHtml: "<p>Good condition.</p>",
                position: 0,
                sourceRef: ref(3),
              },
              {
                id: "c-2",
                plainText: "No issues noted.",
                safeHtml: null,
                position: 1,
                sourceRef: ref(4),
              },
            ],
          },
        ],
      },
    ],
  };
}

function basePersisted(): PersistedTemplate {
  return {
    id: "db-template-1",
    name: "Sample Template",
    sections: [
      {
        name: "Roof",
        position: 0,
        items: [
          {
            name: "Shingles",
            position: 0,
            comments: [
              { plain_text: "Good condition.", safe_html: "<p>Good condition.</p>", position: 0, link_metadata: null },
              { plain_text: "No issues noted.", safe_html: null, position: 1, link_metadata: null },
            ],
          },
        ],
      },
    ],
  };
}

function baseSourceRowRecords(): SourceRowRecord[] {
  return [{ sourceRef: ref(3) }, { sourceRef: ref(4) }];
}

describe("computeIntegrityResult — perfect import", () => {
  const result = computeIntegrityResult({
    parsedTemplate: baseTemplate(),
    persistedTemplate: basePersisted(),
    issues: [],
    sourceRowRecords: baseSourceRowRecords(),
  });

  it("reports status verified with an honest, non-numeric summary", () => {
    expect(result.status).toBe("verified");
    expect(result.summary).toBe("Verified — nothing unaccounted for.");
    expect(result.reviewRequired).toBe(false);
  });

  it("reports matching structure counts", () => {
    expect(result.structure.sections).toEqual({ source: 1, persisted: 1, match: true });
    expect(result.structure.items).toEqual({ source: 1, persisted: 1, match: true });
    expect(result.structure.comments).toEqual({ source: 2, persisted: 2, match: true });
  });

  it("reports ordering and text preservation as verified", () => {
    expect(result.ordering).toEqual({ status: "verified", mismatches: [] });
    expect(result.textPreservation.status).toBe("verified");
    expect(result.textPreservation.mismatches).toEqual([]);
  });

  it("reports full source-row coverage with zero unaccounted", () => {
    expect(result.sourceCoverage).toEqual({
      meaningfulSourceRows: 2,
      mappedRows: 2,
      unsupportedRows: 0,
      ignoredRowsWithReason: 0,
      unaccountedRows: 0,
      unaccountedSourceRefs: [],
      unsupportedSourceRefs: [],
    });
  });

  it("reports no formatting warnings and no links", () => {
    expect(result.formattingWarnings).toEqual([]);
    expect(result.links).toEqual({ sourceLinks: 0, preservedLinks: 0, mismatches: [] });
  });
});

describe("computeIntegrityResult — formatting-only warning", () => {
  const issues: ImportIssueCandidate[] = [
    {
      category: "unsupported_formatting",
      severity: "info",
      sourceRef: ref(3),
      explanation: "Removed unsupported tag(s): span.",
      rawSnippet: "<span>x</span>Good condition.",
      importedPreview: "Good condition.",
    },
  ];

  const result = computeIntegrityResult({
    parsedTemplate: baseTemplate(),
    persistedTemplate: basePersisted(),
    issues,
    sourceRowRecords: baseSourceRowRecords(),
  });

  it("downgrades to verified_with_warnings without touching source coverage", () => {
    expect(result.status).toBe("verified_with_warnings");
    expect(result.summary).toBe("Verified with 1 warning.");
    expect(result.reviewRequired).toBe(false);
    // The row was still mapped — a formatting note isn't a coverage failure.
    expect(result.sourceCoverage.mappedRows).toBe(2);
    expect(result.sourceCoverage.unsupportedRows).toBe(0);
  });

  it("surfaces the formatting warning explicitly", () => {
    expect(result.formattingWarnings).toEqual([
      { sourceRef: ref(3), explanation: "Removed unsupported tag(s): span." },
    ]);
  });
});

describe("computeIntegrityResult — count mismatch", () => {
  it("fails when the persisted template is missing a comment", () => {
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments.pop();

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.status).toBe("failed");
    expect(result.reviewRequired).toBe(true);
    expect(result.structure.comments).toEqual({ source: 2, persisted: 1, match: false });
    expect(result.summary).toContain("structure counts do not match");
  });

  it("fails when the persisted template is missing an entire section", () => {
    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: { ...basePersisted(), sections: [] },
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.status).toBe("failed");
    expect(result.structure.sections.match).toBe(false);
  });
});

describe("computeIntegrityResult — order mismatch", () => {
  it("fails when persisted comment positions are out of sequence", () => {
    const persisted = basePersisted();
    // Swap stored positions without swapping the comments themselves.
    persisted.sections[0].items[0].comments[0].position = 1;
    persisted.sections[0].items[0].comments[1].position = 0;

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.status).toBe("failed");
    expect(result.ordering.status).toBe("mismatch");
    expect(result.ordering.mismatches.some((m) => m.includes("Shingles"))).toBe(true);
    expect(result.summary).toContain("ordering does not match");
  });

  it("fails when a section's persisted position drifts from its source position", () => {
    const persisted = basePersisted();
    persisted.sections[0].position = 5;

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.ordering.status).toBe("mismatch");
    expect(result.ordering.mismatches.some((m) => m.includes("position mismatch"))).toBe(true);
  });
});

describe("computeIntegrityResult — dropped source row", () => {
  it("flags review_required when a meaningful row is unaccounted for by anything", () => {
    // Row 9 exists in the source but never became model content NOR an issue —
    // simulating a parser gap. The engine must catch this independently.
    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(9) }];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues: [],
      sourceRowRecords,
    });

    expect(result.status).toBe("review_required");
    expect(result.reviewRequired).toBe(true);
    expect(result.summary).toBe("Review required: 1 source row(s) could not be accounted for.");
    expect(result.sourceCoverage.unaccountedRows).toBe(1);
    expect(result.sourceCoverage.unaccountedSourceRefs).toEqual([ref(9)]);
  });

  it("review_required takes priority over a simultaneous warning", () => {
    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(9) }];
    const issues: ImportIssueCandidate[] = [
      {
        category: "unsupported_formatting",
        severity: "info",
        sourceRef: ref(3),
        explanation: "Removed unsupported tag(s): span.",
        rawSnippet: "x",
        importedPreview: "x",
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords,
    });

    expect(result.status).toBe("review_required");
  });
});

describe("computeIntegrityResult — link mismatch", () => {
  it("flags a warning when a persisted link doesn't match the source link", () => {
    const parsed = baseTemplate();
    parsed.sections[0].items[0].comments[0].linkMetadata = [
      { href: "https://example.com/guide", text: "guide" },
    ];
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments[0].link_metadata = [
      { href: "https://example.com/different-page", text: "guide" },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: parsed,
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.links.sourceLinks).toBe(1);
    expect(result.links.preservedLinks).toBe(0);
    expect(result.links.mismatches).toEqual([
      { sourceRef: ref(3), reason: "Expected 1 link(s) to persist exactly, 0 matched." },
    ]);
    expect(result.status).toBe("verified_with_warnings");
  });

  it("reports a full match when links round-trip exactly", () => {
    const parsed = baseTemplate();
    parsed.sections[0].items[0].comments[0].linkMetadata = [{ href: "https://example.com", text: "site" }];
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments[0].link_metadata = [{ href: "https://example.com", text: "site" }];

    const result = computeIntegrityResult({
      parsedTemplate: parsed,
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.links).toEqual({ sourceLinks: 1, preservedLinks: 1, mismatches: [] });
    expect(result.status).toBe("verified");
  });
});

describe("computeIntegrityResult — unsupported row correctly accounted for", () => {
  it("counts a fully-unmapped row as unsupported, not unaccounted, when its issue is present", () => {
    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(6) }];
    const issues: ImportIssueCandidate[] = [
      {
        category: "unrecognized_row",
        severity: "warning",
        sourceRef: ref(6),
        explanation: "This row's content is entirely outside the recognized columns.",
        rawSnippet: "stray\tvalue",
        importedPreview: null,
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords,
    });

    expect(result.sourceCoverage).toMatchObject({
      meaningfulSourceRows: 3,
      mappedRows: 2,
      unsupportedRows: 1,
      ignoredRowsWithReason: 0,
      unaccountedRows: 0,
      unsupportedSourceRefs: [ref(6)],
    });
    expect(result.status).toBe("verified_with_warnings");
    expect(result.summary).toBe("Verified with 1 warning.");
  });

  it("counts an ambiguous-hierarchy row as intentionally ignored with reason, not unaccounted", () => {
    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(7) }];
    const issues: ImportIssueCandidate[] = [
      {
        category: "ambiguous_hierarchy",
        severity: "warning",
        sourceRef: ref(7),
        explanation: "Comment text appeared before any item was established.",
        rawSnippet: "orphan comment",
        importedPreview: null,
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords,
    });

    expect(result.sourceCoverage).toMatchObject({
      unsupportedRows: 0,
      ignoredRowsWithReason: 1,
      unaccountedRows: 0,
    });
    expect(result.status).toBe("verified_with_warnings");
  });

  it("still flags a structural warning even when the row also successfully maps other content", () => {
    // Row 8 starts a brand-new section (so the row counts as "mapped") but
    // also carries a comment with nowhere to attach (no item exists yet in
    // the new section) that got dropped — row-level classification alone
    // would hide this inside "mapped"; structuralWarnings must still catch it.
    const parsed = baseTemplate();
    parsed.sections.push({ id: "sec-2", name: "Electrical", position: 1, sourceRef: ref(8), items: [] });
    const persisted = basePersisted();
    persisted.sections.push({ name: "Electrical", position: 1, items: [] });

    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(8) }];
    const issues: ImportIssueCandidate[] = [
      {
        category: "ambiguous_hierarchy",
        severity: "warning",
        sourceRef: ref(8),
        explanation: "Comment text appeared before any item was established.",
        rawSnippet: "dropped comment",
        importedPreview: null,
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: parsed,
      persistedTemplate: persisted,
      issues,
      sourceRowRecords,
    });

    expect(result.sourceCoverage.mappedRows).toBe(3);
    expect(result.sourceCoverage.ignoredRowsWithReason).toBe(0);
    expect(result.structuralWarnings).toEqual([
      { sourceRef: ref(8), explanation: "Comment text appeared before any item was established." },
    ]);
    expect(result.status).toBe("verified_with_warnings");
    expect(result.summary).toBe("Verified with 1 warning.");
  });

  it("counts an info-severity unrecognized_row as unsupported, not unaccounted, when the row produced NO node at all", () => {
    // Found against a real Spectora export: a repeated section/item name
    // (Spectora's "repeat on every row" convention) with a blank comment
    // cell creates nothing new in the tree, so the row has zero footprint in
    // mappedRefs — even though its OTHER (unmapped) columns had content and
    // therefore raised an info-severity issue. Before this fix, that row
    // fell through every bucket silently: not mapped, not unsupported
    // (severity wasn't "warning"), not ignored — an unexplained gap despite
    // a real, recorded issue existing for it.
    const sourceRowRecords = [...baseSourceRowRecords(), { sourceRef: ref(9) }];
    const issues: ImportIssueCandidate[] = [
      {
        category: "unrecognized_row",
        severity: "info",
        sourceRef: ref(9),
        explanation: "This row has content in one or more columns outside the recognized columns.",
        rawSnippet: "Roof\tShingles\t\tinfo\tcheckbox",
        importedPreview: "Roof / Shingles",
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords,
    });

    expect(result.sourceCoverage.unsupportedRows).toBe(1);
    expect(result.sourceCoverage.unaccountedRows).toBe(0);
    expect(result.status).toBe("verified_with_warnings");
  });

  it("an info-severity unrecognized_row (extra unmapped column) does not demote an already-mapped row", () => {
    // Row 3 already carries the section/item/first comment (mapped). An
    // info-severity issue on that same row (e.g. an extra unmapped column)
    // must not reclassify it as unsupported.
    const issues: ImportIssueCandidate[] = [
      {
        category: "unrecognized_row",
        severity: "info",
        sourceRef: ref(3),
        explanation: "Extra column content was not imported.",
        rawSnippet: "Roof\tShingles\t...\textra",
        importedPreview: "Roof / Shingles",
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.sourceCoverage.mappedRows).toBe(2);
    expect(result.sourceCoverage.unsupportedRows).toBe(0);
    expect(result.sourceCoverage.unaccountedRows).toBe(0);
  });
});

describe("unverifiableIntegrityResult", () => {
  it("is a conservative 'failed' result, never silently treated as success", () => {
    const result = unverifiableIntegrityResult("network error");
    expect(result.status).toBe("failed");
    expect(result.reviewRequired).toBe(true);
    expect(result.summary).toContain("network error");
  });
});

/**
 * The most important preservation check in the product: the text that came
 * out must be the text that went in. Its passing direction was covered from
 * the start; these cover the direction that actually matters — that a
 * corruption is DETECTED rather than waved through.
 */
describe("computeIntegrityResult — text mismatch", () => {
  function withPersistedComment(plainText: string) {
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments[0].plain_text = plainText;
    return computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });
  }

  it("fails when a persisted comment's text differs from the source", () => {
    const result = withPersistedComment("Good condition, mostly.");

    expect(result.textPreservation.status).toBe("mismatch");
    expect(result.textPreservation.mismatches).toHaveLength(1);
    expect(result.status).toBe("failed");
    expect(result.reviewRequired).toBe(true);
  });

  it("names the exact source row whose text drifted", () => {
    const result = withPersistedComment("Something else entirely.");
    expect(result.textPreservation.mismatches[0].sourceRef).toEqual(ref(3));
  });

  it("detects truncation, not just replacement", () => {
    const result = withPersistedComment("Good");
    expect(result.textPreservation.status).toBe("mismatch");
  });

  it("detects a comment that persisted as empty", () => {
    const result = withPersistedComment("");
    expect(result.textPreservation.status).toBe("mismatch");
  });

  it("tolerates pure whitespace differences, which are not content changes", () => {
    // Normalization is deliberate: a trailing space or a newline→space change
    // isn't data loss, and flagging it would bury real mismatches in noise.
    const result = withPersistedComment("  Good   condition.  ");
    expect(result.textPreservation.status).toBe("verified");
  });

  it("does NOT tolerate a punctuation change", () => {
    const result = withPersistedComment("Good condition!");
    expect(result.textPreservation.status).toBe("mismatch");
  });

  it("fails when a section NAME was altered in persistence", () => {
    const persisted = basePersisted();
    persisted.sections[0].name = "Roofing";
    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.textPreservation.status).toBe("mismatch");
    expect(result.status).toBe("failed");
  });

  it("fails when an item NAME was altered in persistence", () => {
    const persisted = basePersisted();
    persisted.sections[0].items[0].name = "Shingle";
    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.textPreservation.status).toBe("mismatch");
  });

  it("counts every comparison it made, so 'verified' can't mean 'compared nothing'", () => {
    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    // 1 section name + 1 item name + 2 comments.
    expect(result.textPreservation.comparedCount).toBe(4);
  });
});

describe("computeIntegrityResult — safe normalization vs. genuine meaning loss", () => {
  // docs/architecture.md §5a / §6 of the safe-normalization spec: a source
  // field run through the approved Level-A pipeline (rich-content.ts) is what
  // the parser hands this engine as `plainText` — the persisted side is
  // exactly that same string round-tripped through Postgres. No approved
  // normalization can ever look like data loss here, because both sides of
  // the comparison are the SAME already-normalized string.
  it("an approved whitespace/entity normalization is preserved — the parsed side already reflects it", () => {
    const parsed = baseTemplate();
    // What the parser actually produces for source HTML like
    // "<p>Roof&nbsp;&nbsp;condition</p>" — see rich-content.test.ts.
    parsed.sections[0].items[0].comments[0].plainText = "Roof condition";
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments[0].plain_text = "Roof condition";

    const result = computeIntegrityResult({
      parsedTemplate: parsed,
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.textPreservation.status).toBe("verified");
  });

  it("still FAILS when meaningful text was lost, even inside formatting tags — normalization is never a licence to drop wording", () => {
    // Source: "<strong>Unsafe electrical panel</strong>" → parser correctly
    // preserves the full wording as plainText.
    const parsed = baseTemplate();
    parsed.sections[0].items[0].comments[0].plainText = "Unsafe electrical panel";
    // Persisted: "Electrical panel" — a word went missing somewhere in the
    // write path. This is real data loss, not normalization, and must fail.
    const persisted = basePersisted();
    persisted.sections[0].items[0].comments[0].plain_text = "Electrical panel";

    const result = computeIntegrityResult({
      parsedTemplate: parsed,
      persistedTemplate: persisted,
      issues: [],
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.textPreservation.status).toBe("mismatch");
    expect(result.status).toBe("failed");
    expect(result.reviewRequired).toBe(true);
  });
});

describe("computeIntegrityResult — recoverable_formatting issues", () => {
  it("counts a recoverable_formatting issue as a formatting warning, same as unsupported_formatting", () => {
    const issues: ImportIssueCandidate[] = [
      {
        category: "recoverable_formatting",
        severity: "info",
        sourceRef: ref(3),
        explanation: "This markup is not directly supported by the editor, but its content can be converted safely.",
        rawSnippet: '<div class="x">Good condition.</div>',
        importedPreview: "Good condition.",
        fixSafelyAvailable: true,
        proposedPlainText: "Good condition.",
        proposedSafeHtml: "Good condition.",
      },
    ];

    const result = computeIntegrityResult({
      parsedTemplate: baseTemplate(),
      persistedTemplate: basePersisted(),
      issues,
      sourceRowRecords: baseSourceRowRecords(),
    });

    expect(result.formattingWarnings).toHaveLength(1);
    expect(result.status).toBe("verified_with_warnings");
  });
});
