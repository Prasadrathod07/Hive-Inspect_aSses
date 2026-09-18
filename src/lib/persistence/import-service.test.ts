import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const createServiceRoleClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server-client", () => ({ createServiceRoleClient }));

const { runSpectoraImport, persistNormalizationEvents } = await import("./import-service");

const NO_CREDENTIALS = () => {
  throw new Error(
    "Supabase server credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
};

beforeEach(() => {
  createServiceRoleClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

/**
 * Deciding that an upload isn't a usable spreadsheet is pure deterministic
 * work. It must not depend on the database being reachable — a regression here
 * told people "this workspace isn't finished setting up yet" when the real
 * problem was that they had uploaded a .txt file.
 */
describe("runSpectoraImport — file diagnosis does not depend on persistence", () => {
  const CASES = [
    {
      label: "an unsupported extension",
      buffer: Buffer.from("just some text"),
      filename: "notes.txt",
      expected: "Unsupported file type",
    },
    {
      label: "a renamed non-spreadsheet",
      buffer: Buffer.from("%PDF-1.7 definitely not a workbook"),
      filename: "spectora-export.xlsx",
      expected: "named like a spreadsheet",
    },
    {
      label: "an empty file",
      buffer: Buffer.alloc(0),
      filename: "export.xlsx",
      expected: "empty",
    },
  ];

  for (const { label, buffer, filename, expected } of CASES) {
    it(`reports ${label} honestly even with no database available`, async () => {
      createServiceRoleClient.mockImplementation(NO_CREDENTIALS);

      const result = await runSpectoraImport({ buffer, filename });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain(expected);
      // No run could be recorded, and that's reported plainly rather than faked.
      expect(result.importRunId).toBeNull();
      expect(result.issueCount).toBeGreaterThan(0);
    });
  }

  it("never blames the server for a bad upload", async () => {
    createServiceRoleClient.mockImplementation(NO_CREDENTIALS);

    const result = await runSpectoraImport({
      buffer: Buffer.from("just some text"),
      filename: "notes.txt",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).not.toContain("workspace isn't finished setting up");
    expect(result.error).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("does not throw when the audit write itself fails", async () => {
    // A rejected import is still reported even if recording it blows up.
    createServiceRoleClient.mockReturnValue({
      from: () => {
        throw new Error("connection reset");
      },
    });

    const result = await runSpectoraImport({
      buffer: Buffer.from("just some text"),
      filename: "notes.txt",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unsupported file type");
    expect(result.importRunId).toBeNull();
  });

  it("returns the recorded run id when the audit write succeeds", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "run-9" }, error: null }) }),
    });
    createServiceRoleClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    const result = await runSpectoraImport({
      buffer: Buffer.from("just some text"),
      filename: "notes.txt",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.importRunId).toBe("run-9");
  });
});

describe("persistNormalizationEvents — best-effort, never fails an otherwise-successful import", () => {
  const EVENT = {
    type: "harmless_wrapper_removed" as const,
    sourceRef: { sheet: "Sheet1", rowNumber: 3 },
    beforeHash: "before",
    afterHash: "after",
    description: "Removed a bare wrapper.",
    automatic: true as const,
  };

  it("does nothing when there are no events — no insert call at all", async () => {
    const from = vi.fn();
    await persistNormalizationEvents({ from } as never, "run-1", []);
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts one row per event, mapped to snake_case columns", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });

    await persistNormalizationEvents({ from } as never, "run-1", [EVENT]);

    expect(from).toHaveBeenCalledWith("normalization_events");
    expect(insert).toHaveBeenCalledWith([
      {
        import_run_id: "run-1",
        event_type: "harmless_wrapper_removed",
        source_sheet: "Sheet1",
        source_row_number: 3,
        description: "Removed a bare wrapper.",
        before_hash: "before",
        after_hash: "after",
      },
    ]);
  });

  it("swallows a DB error instead of throwing", async () => {
    const from = vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: new Error("boom") }) });
    await expect(persistNormalizationEvents({ from } as never, "run-1", [EVENT])).resolves.toBeUndefined();
  });

  it("swallows a thrown error instead of propagating it", async () => {
    const from = vi.fn(() => {
      throw new Error("connection reset");
    });
    await expect(persistNormalizationEvents({ from } as never, "run-1", [EVENT])).resolves.toBeUndefined();
  });
});

describe("runSpectoraImport — a parseable file still requires persistence", () => {
  it("surfaces a persistence failure rather than pretending the import worked", async () => {
    // A real, parseable workbook: the failure here is genuinely the database's,
    // so it must NOT be reported as a problem with the file.
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/synthetic-spectora-like.xlsx")
    );
    createServiceRoleClient.mockImplementation(NO_CREDENTIALS);

    await expect(
      runSpectoraImport({ buffer: fixture, filename: "synthetic-spectora-like.xlsx" })
    ).rejects.toThrow();
  });
});
