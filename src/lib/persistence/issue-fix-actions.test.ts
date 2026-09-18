import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const createServiceRoleClient = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server-client", () => ({ createServiceRoleClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { applySafeFix } = await import("./issue-fix-actions");

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  createServiceRoleClient.mockReset();
  revalidatePath.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("applySafeFix — the happy path", () => {
  it("calls apply_issue_fix with the issue id and revalidates the affected pages", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createServiceRoleClient.mockReturnValue({ rpc });

    const result = await applySafeFix(ISSUE_ID, RUN_ID, TEMPLATE_ID);

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("apply_issue_fix", { p_issue_id: ISSUE_ID });
    expect(revalidatePath).toHaveBeenCalledWith(`/imports/${RUN_ID}/issues`);
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${TEMPLATE_ID}/import-report`);
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${TEMPLATE_ID}`);
  });
});

describe("applySafeFix — failure cases", () => {
  it("returns a typed failure instead of throwing when the RPC rejects the fix", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: new Error("Issue has already been resolved") });
    createServiceRoleClient.mockReturnValue({ rpc });

    const result = await applySafeFix(ISSUE_ID, RUN_ID, TEMPLATE_ID);

    expect(result.success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("never leaks the database's own words to the browser", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: new Error('relation "comments" violates constraint xyz') });
    createServiceRoleClient.mockReturnValue({ rpc });

    const result = await applySafeFix(ISSUE_ID, RUN_ID, TEMPLATE_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).not.toContain("xyz");
    expect(result.error).not.toContain("relation");
  });

  it("returns a typed failure when the client itself can't be constructed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createServiceRoleClient.mockImplementation(() => {
      throw new Error("Supabase server credentials are not configured.");
    });

    const result = await applySafeFix(ISSUE_ID, RUN_ID, TEMPLATE_ID);

    expect(result.success).toBe(false);
  });
});
