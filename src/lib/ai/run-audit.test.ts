import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiAudit } from "./run-audit";
import type { AiProvider } from "./provider";
import type { AuditableIssue } from "./audit-payload";
import type { IntegrityResult } from "@/lib/integrity/types";

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "99999999-9999-4999-8999-999999999999";

const INTEGRITY: IntegrityResult = {
  status: "verified_with_warnings",
  summary: "Verified with 1 warning.",
  reviewRequired: false,
  structure: {
    sections: { source: 3, persisted: 3, match: true },
    items: { source: 9, persisted: 9, match: true },
    comments: { source: 14, persisted: 14, match: true },
  },
  ordering: { status: "verified", mismatches: [] },
  textPreservation: { status: "verified", comparedCount: 26, mismatches: [] },
  links: { sourceLinks: 1, preservedLinks: 1, mismatches: [] },
  formattingWarnings: [],
  structuralWarnings: [],
  sourceCoverage: {
    meaningfulSourceRows: 26,
    mappedRows: 25,
    unsupportedRows: 1,
    ignoredRowsWithReason: 0,
    unaccountedRows: 0,
    unaccountedSourceRefs: [],
    unsupportedSourceRefs: [],
  },
  generatedAt: "2026-09-17T00:00:00.000Z",
};

const ISSUES: AuditableIssue[] = [
  {
    id: ISSUE_ID,
    category: "unsupported_formatting",
    severity: "warning",
    sourceRowNumber: 12,
    explanation: "Removed unsupported tag(s): table.",
    rawSnippet: "<table>secret customer text</table>",
  },
];

const GOOD_RESPONSE = JSON.stringify({
  summary: "All 3 sections, 9 items and 14 comments came across.",
  riskLevel: "low",
  recommendedIssueIds: [ISSUE_ID],
  reviewMessage: "Take a look at the one formatting change, then you're set.",
  limitationsMentioned: ["Images, tables, and embedded media cannot be represented."],
});

function mockProvider(behavior: () => Promise<string>): AiProvider {
  return { name: "mock", model: "mock-model-1", complete: behavior };
}

/** Captures rows written to ai_audits. */
function mockClient() {
  const rows: Record<string, unknown>[] = [];
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    rows.push(row);
    return { error: null };
  });
  return { client: { from: vi.fn().mockReturnValue({ insert }) }, rows };
}

function run(provider: AiProvider | undefined, client: unknown = null, timeoutMs?: number) {
  return runAiAudit({
    importRunId: RUN_ID,
    integrity: INTEGRITY,
    issues: ISSUES,
    client: client as SupabaseClient | null,
    provider,
    timeoutMs,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("runAiAudit — valid structured response", () => {
  it("returns the validated output", async () => {
    const state = await run(mockProvider(async () => GOOD_RESPONSE));

    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    expect(state.output.riskLevel).toBe("low");
    expect(state.output.recommendedIssueIds).toEqual([ISSUE_ID]);
    expect(state.model).toBe("mock-model-1");
  });

  it("records success metadata in ai_audits", async () => {
    const { client, rows } = mockClient();
    await run(mockProvider(async () => GOOD_RESPONSE), client);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].import_run_id).toBe(RUN_ID);
    expect(rows[0].risk_level).toBe("low");
    expect(rows[0].output).toBeTruthy();
  });

  it("never sends the customer's content to the provider", async () => {
    let sent = "";
    const capturing: AiProvider = {
      name: "mock",
      model: "mock-model-1",
      async complete({ system, user }) {
        sent = `${system}\n${user}`;
        return GOOD_RESPONSE;
      },
    };

    await run(capturing);

    expect(sent).not.toBe("");
    expect(sent).not.toContain("secret customer text");
    expect(sent).not.toContain("<table>");
    // The deterministic facts it DOES need are present.
    expect(sent).toContain("verified_with_warnings");
  });
});

describe("runAiAudit — malformed response", () => {
  it("returns invalid for prose instead of JSON", async () => {
    const state = await run(mockProvider(async () => "Sure! Everything looks great."));
    expect(state.status).toBe("invalid");
  });

  it("returns invalid for JSON that misses the schema", async () => {
    const state = await run(mockProvider(async () => JSON.stringify({ summary: "hi" })));
    expect(state.status).toBe("invalid");
  });

  it("returns invalid when the model tries to return replacement content", async () => {
    const state = await run(
      mockProvider(async () =>
        JSON.stringify({
          summary: "Fixed it for you.",
          riskLevel: "low",
          recommendedIssueIds: [],
          reviewMessage: "Done.",
          limitationsMentioned: [],
          sections: [{ name: "Roof", items: ["Gutters"] }],
        })
      )
    );
    expect(state.status).toBe("invalid");
  });

  it("records the failure reason for the operator", async () => {
    const { client, rows } = mockClient();
    await run(mockProvider(async () => "not json"), client);

    expect(rows[0].status).toBe("invalid_output");
    expect(String(rows[0].failure_reason)).toContain("Unparseable");
    // A rejected response is never stored as though it were usable.
    expect(rows[0].output).toBeNull();
  });
});

describe("runAiAudit — invented issue id", () => {
  it("rejects a recommendation pointing at an id that doesn't exist", async () => {
    const state = await run(
      mockProvider(async () =>
        JSON.stringify({
          summary: "Two things need attention.",
          riskLevel: "medium",
          recommendedIssueIds: [ISSUE_ID, "issue-that-never-existed"],
          reviewMessage: "Check both.",
          limitationsMentioned: [],
        })
      )
    );

    expect(state.status).toBe("invalid");
  });

  it("names the unknown ids in the operator record", async () => {
    const { client, rows } = mockClient();
    await run(
      mockProvider(async () =>
        JSON.stringify({
          summary: "Attention needed.",
          riskLevel: "high",
          recommendedIssueIds: ["totally-made-up"],
          reviewMessage: "Check it.",
          limitationsMentioned: [],
        })
      ),
      client
    );

    expect(rows[0].status).toBe("invalid_output");
    expect(String(rows[0].failure_reason)).toContain("totally-made-up");
  });
});

describe("runAiAudit — provider timeout and errors", () => {
  it("returns error when the provider throws", async () => {
    const state = await run(
      mockProvider(async () => {
        throw new Error("503 Service Unavailable");
      })
    );
    expect(state.status).toBe("error");
  });

  it("aborts a hanging provider rather than waiting forever", async () => {
    const hanging: AiProvider = {
      name: "mock",
      model: "mock-model-1",
      complete: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
        }),
    };

    const startedAt = Date.now();
    const state = await run(hanging, null, 50);

    expect(state.status).toBe("error");
    // Proves the timeout fired rather than the promise resolving on its own.
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it("records provider errors without exposing them to the caller", async () => {
    const { client, rows } = mockClient();
    const state = await run(
      mockProvider(async () => {
        throw new Error("api key sk-secret-123 rejected");
      }),
      client
    );

    expect(state).toEqual({ status: "error" });
    // Detail is kept server-side for the operator...
    expect(String(rows[0].failure_reason)).toContain("sk-secret-123");
    // ...and the returned state carries no detail at all.
    expect(JSON.stringify(state)).not.toContain("sk-secret");
  });

  it("still returns a state when recording the audit itself fails", async () => {
    const brokenClient = {
      from: () => {
        throw new Error("db down");
      },
    };
    const state = await run(mockProvider(async () => GOOD_RESPONSE), brokenClient);
    expect(state.status).toBe("ok");
  });
});

describe("runAiAudit — disabled", () => {
  it("reports unavailable when no provider is configured", async () => {
    // No provider injected and no env configuration → unavailable, not an error.
    const previous = process.env.AI_AUDITOR_ENABLED;
    process.env.AI_AUDITOR_ENABLED = "false";

    const state = await run(undefined);
    expect(state).toEqual({ status: "unavailable" });

    process.env.AI_AUDITOR_ENABLED = previous;
  });

  it("never calls a provider when disabled", async () => {
    const previous = process.env.AI_AUDITOR_ENABLED;
    process.env.AI_AUDITOR_ENABLED = "false";

    const { client, rows } = mockClient();
    await run(undefined, client);
    // Nothing attempted means nothing recorded.
    expect(rows).toHaveLength(0);

    process.env.AI_AUDITOR_ENABLED = previous;
  });
});

describe("runAiAudit — the deterministic result is never at risk", () => {
  it("never throws, whatever the provider does", async () => {
    const behaviors: (() => Promise<string>)[] = [
      async () => {
        throw new Error("network");
      },
      async () => "",
      async () => "null",
      async () => "[]",
      async () => JSON.stringify({ recommendedIssueIds: ["x"] }),
    ];

    for (const behavior of behaviors) {
      await expect(run(mockProvider(behavior))).resolves.toBeDefined();
    }
  });

  it("leaves the integrity result object untouched", async () => {
    const snapshot = JSON.stringify(INTEGRITY);
    await run(mockProvider(async () => GOOD_RESPONSE));
    expect(JSON.stringify(INTEGRITY)).toBe(snapshot);
  });

  it("only ever writes to ai_audits, never to template tables", async () => {
    const { client, rows } = mockClient();
    await run(mockProvider(async () => GOOD_RESPONSE), client);

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("ai_audits");
    expect(rows).toHaveLength(1);
  });
});
