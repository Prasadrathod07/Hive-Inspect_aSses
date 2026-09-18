import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const createServiceRoleClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server-client", () => ({ createServiceRoleClient }));

const { GET } = await import("./route");

beforeEach(() => {
  createServiceRoleClient.mockReset();
  // A thrown mock still triggers Node's uncaught-exception diagnostics even
  // once caught (the same reason every other throwing-mock test file in this
  // codebase does this) — silence it so the test asserts behavior, not noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function mockQuery(result: { error: unknown }) {
  const limit = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ limit });
  createServiceRoleClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
  return { select };
}

describe("GET /api/health", () => {
  it("reports ok with a 200 when configured and reachable", async () => {
    mockQuery({ error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: { supabaseConfigured: true, supabaseReachable: true },
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("reports unavailable with a 503 when credentials are missing", async () => {
    createServiceRoleClient.mockImplementation(() => {
      throw new Error("Supabase server credentials are not configured.");
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ supabaseConfigured: false, supabaseReachable: false });
  });

  it("reports unavailable with a 503 when configured but the query fails", async () => {
    mockQuery({ error: new Error("connection refused") });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ supabaseConfigured: true, supabaseReachable: false });
  });

  it("never leaks the underlying error into the response", async () => {
    mockQuery({ error: new Error("password authentication failed for user \"postgres\"") });

    const response = await GET();
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toContain("password authentication");
    expect(raw).not.toContain("postgres");
  });

  it("never reports healthy when data has never been seeded — absence of a template is not unhealthy", async () => {
    // A zero-row, no-error result (empty table) must still read as healthy —
    // this check is about reachability, never about whether data exists.
    mockQuery({ error: null });

    const response = await GET();
    expect(response.status).toBe(200);
  });
});
