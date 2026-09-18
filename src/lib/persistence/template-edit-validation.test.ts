import { describe, expect, it } from "vitest";
import { UpdateNameSchema, UpdateCommentSchema, prepareCommentUpdate } from "./template-edit-validation";

describe("UpdateNameSchema", () => {
  it("accepts a trimmed valid name", () => {
    const result = UpdateNameSchema.safeParse({ id: "sec-1", name: "  Roof  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Roof");
  });

  it("rejects an empty name", () => {
    const result = UpdateNameSchema.safeParse({ id: "sec-1", name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name that's only whitespace", () => {
    const result = UpdateNameSchema.safeParse({ id: "sec-1", name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a name over 500 characters", () => {
    const result = UpdateNameSchema.safeParse({ id: "sec-1", name: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts a name at exactly the 500 character limit", () => {
    const result = UpdateNameSchema.safeParse({ id: "sec-1", name: "x".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects a missing id", () => {
    const result = UpdateNameSchema.safeParse({ id: "", name: "Roof" });
    expect(result.success).toBe(false);
  });
});

describe("UpdateCommentSchema", () => {
  it("accepts ordinary HTML content", () => {
    const result = UpdateCommentSchema.safeParse({ id: "c-1", html: "<p>Looks <b>good</b>.</p>" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty string (clearing a comment)", () => {
    const result = UpdateCommentSchema.safeParse({ id: "c-1", html: "" });
    expect(result.success).toBe(true);
  });

  it("rejects content over the 50,000 character limit", () => {
    const result = UpdateCommentSchema.safeParse({ id: "c-1", html: "x".repeat(50_001) });
    expect(result.success).toBe(false);
  });
});

describe("prepareCommentUpdate", () => {
  it("sanitizes through the same allowlist the importer uses", () => {
    const result = prepareCommentUpdate("<p>Looks <b>good</b>. <script>alert(1)</script></p>");
    expect(result.safeHtml).not.toContain("<script>");
    expect(result.safeHtml).toContain("<b>good</b>");
    expect(result.plainText).toBe("Looks good.");
  });

  it("derives plainText consistently from the sanitized HTML", () => {
    const result = prepareCommentUpdate("<p>Line one.</p><p>Line two.</p>");
    expect(result.plainText).toBe("Line one. Line two.");
  });

  it("extracts link metadata from an edited comment", () => {
    const result = prepareCommentUpdate('<p>See <a href="https://example.com">this</a>.</p>');
    expect(result.linkMetadata).toEqual([{ href: "https://example.com", text: "this" }]);
  });

  it("returns null safeHtml and empty plainText for an empty/whitespace-only edit", () => {
    const result = prepareCommentUpdate("   ");
    expect(result).toEqual({ plainText: "", safeHtml: null, linkMetadata: null });
  });

  it("returns null linkMetadata when there are no links", () => {
    const result = prepareCommentUpdate("<p>No links here.</p>");
    expect(result.linkMetadata).toBeNull();
  });

  it("drops an unsafe link but keeps its visible text, consistent with import behavior", () => {
    const result = prepareCommentUpdate('<p>See <a href="javascript:alert(1)">this</a>.</p>');
    expect(result.safeHtml).not.toContain("javascript:");
    expect(result.plainText).toBe("See this.");
    expect(result.linkMetadata).toBeNull();
  });
});
