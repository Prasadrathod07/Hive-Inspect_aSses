import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runSpectoraImport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/persistence/import-service", () => ({ runSpectoraImport }));

const { findExistingSeededTemplate, resetSeededTemplate, seedFromBuffer } = await import(
  "./seed-demo-template"
);

beforeEach(() => {
  runSpectoraImport.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const HASH = "abc123";

describe("findExistingSeededTemplate", () => {
  it("returns the prior run when one succeeded with this hash", () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "run-1", template_id: "tpl-1", integrity_status: "verified" },
      error: null,
    });
    const client = chainableClient(maybeSingle);

    return findExistingSeededTemplate(client, HASH).then((result) => {
      expect(result).toEqual({ importRunId: "run-1", templateId: "tpl-1", integrityStatus: "verified" });
    });
  });

  it("returns null when nothing matches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = chainableClient(maybeSingle);

    expect(await findExistingSeededTemplate(client, HASH)).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    const client = chainableClient(maybeSingle);

    expect(await findExistingSeededTemplate(client, HASH)).toBeNull();
  });

  it("returns null when the matched run has no template_id (a failed run can't have succeeded, but be defensive)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "run-1", template_id: null, integrity_status: null },
      error: null,
    });
    const client = chainableClient(maybeSingle);

    expect(await findExistingSeededTemplate(client, HASH)).toBeNull();
  });

  /** Builds a client whose .from().select().eq().eq().not().order().limit().maybeSingle() chain resolves via `maybeSingle`. */
  function chainableClient(maybeSingle: ReturnType<typeof vi.fn>) {
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const not = vi.fn().mockReturnValue({ order });
    const eq2 = vi.fn().mockReturnValue({ not });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    return { from } as never;
  }
});

describe("resetSeededTemplate", () => {
  function chainableSelectClient(runs: { id: string; template_id: string | null }[]) {
    const eq = vi.fn().mockResolvedValue({ data: runs, error: null });
    const select = vi.fn().mockReturnValue({ eq });
    return { select };
  }

  /** Records every `.delete().eq(column, value)` call as `table:column:value`. */
  function recordingFrom(runs: { id: string; template_id: string | null }[], calls: string[]) {
    return vi.fn((table: string) => {
      const deleteHandler = {
        delete: () => ({
          eq: (column: string, value: string) => {
            calls.push(`${table}:${column}:${value}`);
            return Promise.resolve({ error: null });
          },
        }),
      };
      if (table === "import_runs") return { ...chainableSelectClient(runs), ...deleteHandler };
      if (table === "templates") return deleteHandler;
      throw new Error(`unexpected table ${table}`);
    });
  }

  it("deletes the template and the run for each matching row", async () => {
    const calls: string[] = [];
    const from = recordingFrom([{ id: "run-1", template_id: "tpl-1" }], calls);

    const result = await resetSeededTemplate({ from } as never, HASH);

    expect(result).toEqual({ templatesDeleted: 1, runsDeleted: 1, failures: [] });
    expect(calls).toEqual(["templates:id:tpl-1", "import_runs:id:run-1"]);
  });

  it("deletes only the run when template_id is already null", async () => {
    const calls: string[] = [];
    const from = recordingFrom([{ id: "run-1", template_id: null }], calls);

    const result = await resetSeededTemplate({ from } as never, HASH);
    expect(result).toEqual({ templatesDeleted: 0, runsDeleted: 1, failures: [] });
    expect(calls).toEqual(["import_runs:id:run-1"]);
  });

  it("is a no-op with zero counts when nothing matches", async () => {
    const from = vi.fn(() => chainableSelectClient([]));
    const result = await resetSeededTemplate({ from } as never, HASH);
    expect(result).toEqual({ templatesDeleted: 0, runsDeleted: 0, failures: [] });
  });

  it("reports the lookup failure without throwing", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: new Error("connection reset") });
    const from = vi.fn(() => ({ select: () => ({ eq }) }));

    const result = await resetSeededTemplate({ from } as never, HASH);
    expect(result.failures[0]).toContain("connection reset");
    expect(result.templatesDeleted).toBe(0);
  });

  it("never touches a duplicate's row — only the exact template_id the hash-scoped query returned", async () => {
    // Documents the safety property by construction: the only id ever passed
    // to templates.delete().eq(...) is one that came out of the SELECT
    // scoped to this file's hash. A reviewer's duplicate has a different
    // template id and no import_run of its own, so it can never appear here.
    const calls: string[] = [];
    const from = recordingFrom([{ id: "run-1", template_id: "tpl-original" }], calls);

    await resetSeededTemplate({ from } as never, HASH);

    expect(calls).toContain("templates:id:tpl-original");
    expect(calls.some((c) => c.includes("tpl-duplicate"))).toBe(false);
  });
});

describe("seedFromBuffer", () => {
  it("delegates straight to runSpectoraImport with the given buffer/filename/client", async () => {
    runSpectoraImport.mockResolvedValue({
      success: true,
      templateId: "tpl-1",
      importRunId: "run-1",
      counts: { sections: 1, items: 1, comments: 1 },
      issueCount: 0,
      integrityStatus: "verified",
      integritySummary: "Verified — nothing unaccounted for.",
    });

    const client = { marker: "the-client" };
    const buffer = Buffer.from("bytes");
    const result = await seedFromBuffer(client as never, { buffer, filename: "demo.xlsx" });

    expect(runSpectoraImport).toHaveBeenCalledWith({ buffer, filename: "demo.xlsx", client });
    expect(result.success).toBe(true);
  });

  it("passes a failure straight through, unmodified", async () => {
    runSpectoraImport.mockResolvedValue({
      success: false,
      importRunId: null,
      error: "That file is empty.",
      issueCount: 1,
    });

    const result = await seedFromBuffer({} as never, { buffer: Buffer.alloc(0), filename: "empty.xlsx" });
    expect(result.success).toBe(false);
  });
});
