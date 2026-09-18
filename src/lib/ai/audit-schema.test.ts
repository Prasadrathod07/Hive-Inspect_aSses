import { describe, expect, it } from "vitest";
import { validateAuditOutput, parseModelJson, AiAuditOutputSchema } from "./audit-schema";

const ALLOWED = ["issue-a", "issue-b", "issue-c"];

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Everything in your template came across. Two comments lost some styling.",
    riskLevel: "low",
    recommendedIssueIds: ["issue-a"],
    reviewMessage: "Have a quick look at the two formatting issues, then you're done.",
    limitationsMentioned: ["Images cannot be represented."],
    ...overrides,
  };
}

describe("validateAuditOutput — accepts a well-formed response", () => {
  it("returns the parsed output", () => {
    const result = validateAuditOutput(validOutput(), ALLOWED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.riskLevel).toBe("low");
    expect(result.output.recommendedIssueIds).toEqual(["issue-a"]);
  });

  it("accepts an empty recommendation list", () => {
    const result = validateAuditOutput(validOutput({ recommendedIssueIds: [] }), ALLOWED);
    expect(result.ok).toBe(true);
  });

  it("accepts every valid risk level", () => {
    for (const riskLevel of ["low", "medium", "high"]) {
      expect(validateAuditOutput(validOutput({ riskLevel }), ALLOWED).ok).toBe(true);
    }
  });
});

describe("validateAuditOutput — rejects invented issue ids", () => {
  it("rejects an id that was never supplied", () => {
    const result = validateAuditOutput(
      validOutput({ recommendedIssueIds: ["issue-a", "issue-does-not-exist"] }),
      ALLOWED
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("unknown_issue_ids");
    if (result.failure.kind !== "unknown_issue_ids") return;
    expect(result.failure.unknownIds).toEqual(["issue-does-not-exist"]);
  });

  it("rejects the WHOLE response, not just the bad id", () => {
    // A model inventing an id isn't tracking the data it was given, so the
    // prose is suspect too. We don't quietly keep the good half.
    const result = validateAuditOutput(
      validOutput({ recommendedIssueIds: ["issue-a", "fabricated"] }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
  });

  it("rejects everything when no issues were supplied at all", () => {
    const result = validateAuditOutput(validOutput({ recommendedIssueIds: ["issue-a"] }), []);
    expect(result.ok).toBe(false);
  });
});

describe("validateAuditOutput — rejects forbidden content", () => {
  it("rejects replacement template content", () => {
    const result = validateAuditOutput(
      validOutput({ sections: [{ name: "Roof", items: [] }] }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("schema");
  });

  it("rejects an attempt to restate the counts", () => {
    const result = validateAuditOutput(validOutput({ sectionCount: 12 }), ALLOWED);
    expect(result.ok).toBe(false);
  });

  it("rejects persistence instructions", () => {
    const result = validateAuditOutput(
      validOutput({ sql: "update comments set plain_text = '' where true" }),
      ALLOWED
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invented integrity status", () => {
    const result = validateAuditOutput(validOutput({ integrityStatus: "verified" }), ALLOWED);
    expect(result.ok).toBe(false);
  });
});

describe("validateAuditOutput — rejects malformed shapes", () => {
  it("rejects a missing field", () => {
    const withoutReview = validOutput();
    delete (withoutReview as Record<string, unknown>).reviewMessage;
    expect(validateAuditOutput(withoutReview, ALLOWED).ok).toBe(false);
  });

  it("rejects an unknown risk level", () => {
    expect(validateAuditOutput(validOutput({ riskLevel: "catastrophic" }), ALLOWED).ok).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(validateAuditOutput(validOutput({ summary: "   " }), ALLOWED).ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(validateAuditOutput("just a sentence", ALLOWED).ok).toBe(false);
    expect(validateAuditOutput(null, ALLOWED).ok).toBe(false);
    expect(validateAuditOutput([], ALLOWED).ok).toBe(false);
  });

  it("rejects wrong types for the id list", () => {
    expect(validateAuditOutput(validOutput({ recommendedIssueIds: "issue-a" }), ALLOWED).ok).toBe(false);
    expect(validateAuditOutput(validOutput({ recommendedIssueIds: [1, 2] }), ALLOWED).ok).toBe(false);
  });

  it("caps an absurdly long summary rather than rendering it", () => {
    expect(validateAuditOutput(validOutput({ summary: "x".repeat(5000) }), ALLOWED).ok).toBe(false);
  });
});

describe("parseModelJson", () => {
  it("parses plain JSON", () => {
    const result = parseModelJson('{"a":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("tolerates a ```json fence", () => {
    const result = parseModelJson('```json\n{"a":1}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("tolerates a bare fence", () => {
    const result = parseModelJson('```\n{"a":1}\n```');
    expect(result.ok).toBe(true);
  });

  it("fails on prose", () => {
    expect(parseModelJson("Sure! Here's what I found...").ok).toBe(false);
  });

  it("fails on truncated JSON", () => {
    expect(parseModelJson('{"summary": "it was go').ok).toBe(false);
  });
});

describe("AiAuditOutputSchema", () => {
  it("is strict — extra keys are a failure, not ignored", () => {
    expect(AiAuditOutputSchema.safeParse({ ...validOutput(), extra: true }).success).toBe(false);
  });
});
