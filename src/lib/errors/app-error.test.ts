import { describe, expect, it, vi, afterEach } from "vitest";
import { appError, toAppError, formatAppError, type AppErrorCode } from "./app-error";

afterEach(() => vi.restoreAllMocks());

/** Silences the intentional server-side log while capturing what was logged. */
function withCapturedLog<T>(run: () => T): { result: T; logged: unknown[][] } {
  const logged: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  return { result: run(), logged };
}

describe("appError", () => {
  it("gives every code a message and an actionable recovery", () => {
    const codes: AppErrorCode[] = [
      "unsupported_file_type",
      "empty_file",
      "file_too_large",
      "unreadable_workbook",
      "unrecognized_structure",
      "persistence_failed",
      "duplication_failed",
      "save_failed",
      "not_configured",
      "ai_unavailable",
      "unexpected",
    ];

    for (const code of codes) {
      const error = appError(code);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.recovery.length).toBeGreaterThan(0);
    }
  });

  it("tells the user their work is safe when a write fails", () => {
    expect(appError("save_failed").recovery).toContain("hasn't been lost");
    expect(appError("persistence_failed").recovery).toContain("Nothing partial was stored");
    expect(appError("duplication_failed").recovery).toContain("original is untouched");
  });

  it("frames an AI outage as not affecting the deterministic results", () => {
    expect(appError("ai_unavailable").recovery).toContain("computed without AI");
    expect(appError("ai_unavailable").retryable).toBe(true);
  });
});

describe("toAppError — never leaks internals to the browser", () => {
  const SENSITIVE_INPUTS: { label: string; error: Error }[] = [
    {
      label: "missing configuration",
      error: new Error(
        "Supabase server credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      ),
    },
    {
      label: "postgres schema detail",
      error: new Error('relation "public.import_runs" does not exist'),
    },
    {
      label: "connection string in the message",
      error: new Error("connect ECONNREFUSED postgresql://postgres:hunter2@db.internal:5432/postgres"),
    },
    {
      label: "a stack-carrying error",
      error: Object.assign(new Error("Unexpected token < in JSON at position 0"), {
        stack: "Error: boom\n    at /srv/app/.next/server/chunks/1234.js:5:11",
      }),
    },
  ];

  const FORBIDDEN = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "postgresql://",
    "hunter2",
    "public.import_runs",
    ".next/server",
    "ECONNREFUSED",
  ];

  for (const { label, error } of SENSITIVE_INPUTS) {
    it(`redacts ${label} from the user-facing message`, () => {
      const { result } = withCapturedLog(() => toAppError(error, "test"));
      const shown = formatAppError(result);

      for (const secret of FORBIDDEN) {
        expect(shown).not.toContain(secret);
      }
    });
  }

  it("still writes the original error to the server log, so detail isn't lost", () => {
    const original = new Error("relation \"public.templates\" does not exist");
    const { logged } = withCapturedLog(() => toAppError(original, "listTemplateSummaries"));

    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toBe("[listTemplateSummaries]");
    expect(logged[0][1]).toBe(original);
  });

  it("classifies a missing-configuration error as not_configured", () => {
    const { result } = withCapturedLog(() =>
      toAppError(new Error("Supabase server credentials are not configured."), "test")
    );
    expect(result.code).toBe("not_configured");
    expect(result.retryable).toBe(false);
  });

  it("classifies a missing table as not_configured rather than blaming the user", () => {
    const { result } = withCapturedLog(() =>
      toAppError(new Error('relation "public.templates" does not exist'), "test")
    );
    expect(result.code).toBe("not_configured");
  });

  it("uses the caller's fallback for anything it can't confidently name", () => {
    const { result } = withCapturedLog(() =>
      toAppError(new Error("something weird happened"), "test", "save_failed")
    );
    expect(result.code).toBe("save_failed");
  });

  it("handles non-Error throws without crashing", () => {
    const { result } = withCapturedLog(() => toAppError("a bare string", "test"));
    expect(result.code).toBe("unexpected");
    expect(result.message).toBe("Something went wrong.");
  });

  it("handles null/undefined throws", () => {
    const { result } = withCapturedLog(() => toAppError(undefined, "test"));
    expect(result.code).toBe("unexpected");
  });
});
