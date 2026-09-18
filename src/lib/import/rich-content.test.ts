import { describe, expect, it } from "vitest";
import { processRichContent } from "./rich-content";

describe("processRichContent", () => {
  it("keeps allowlisted formatting and reports no issue", () => {
    const result = processRichContent("<p>Shingles are in <b>good</b> condition.</p>");
    expect(result.disallowedTags).toEqual([]);
    expect(result.droppedUnsafeLink).toBe(false);
    expect(result.safeHtml).toContain("<b>good</b>");
    expect(result.plainText).toBe("Shingles are in good condition.");
  });

  it("strips a disallowed tag but preserves the surrounding text and flags it", () => {
    const result = processRichContent("<p>Unit is functional. <script>alert(1)</script> Recommend flushing.</p>");
    expect(result.disallowedTags).toEqual(["script"]);
    expect(result.safeHtml).not.toContain("<script>");
    expect(result.plainText).toContain("Unit is functional.");
    expect(result.plainText).toContain("Recommend flushing.");
  });

  it("keeps a safe http(s) link and extracts its metadata", () => {
    const result = processRichContent('See <a href="https://example.com/guide">this guide</a>.');
    expect(result.droppedUnsafeLink).toBe(false);
    expect(result.links).toEqual([{ href: "https://example.com/guide", text: "this guide" }]);
    expect(result.safeHtml).toContain('rel="noopener noreferrer"');
  });

  it("drops an unsafe link scheme but keeps its visible text, and flags it", () => {
    const result = processRichContent('<p>See spec: <a href="javascript:alert(1)">click here</a></p>');
    expect(result.droppedUnsafeLink).toBe(true);
    expect(result.links).toHaveLength(0);
    expect(result.plainText).toBe("See spec: click here");
    expect(result.safeHtml).not.toContain("javascript:");
  });

  it("preserves plain text with no markup at all", () => {
    const result = processRichContent("No issues observed.");
    expect(result.disallowedTags).toEqual([]);
    expect(result.droppedUnsafeLink).toBe(false);
    expect(result.plainText).toBe("No issues observed.");
  });

  it("does not jam words together across a <br> — inserts whitespace instead", () => {
    const result = processRichContent("Line one.<br>Line two.");
    expect(result.plainText).toBe("Line one. Line two.");
  });

  it("does not jam words together across list item boundaries", () => {
    const result = processRichContent("<ul><li>First point</li><li>Second point</li></ul>");
    expect(result.plainText).toBe("First point Second point");
  });

  it("flags an <img> as unsupported (image content cannot be faithfully represented)", () => {
    const result = processRichContent('<p>See photo: <img src="https://example.com/photo.jpg"></p>');
    expect(result.disallowedTags).toContain("img");
    expect(result.safeHtml).not.toContain("<img");
    expect(result.plainText).toContain("See photo:");
  });

  it("flags a <table> as unsupported rather than pretending tabular structure survived", () => {
    const result = processRichContent("<table><tr><td>A</td><td>B</td></tr></table>");
    expect(result.disallowedTags).toEqual(expect.arrayContaining(["table", "tr", "td"]));
    expect(result.safeHtml).not.toContain("<table>");
  });

  it("flags a <video>/<iframe> embed as unsupported", () => {
    const result = processRichContent('<iframe src="https://example.com/embed"></iframe>');
    expect(result.disallowedTags).toContain("iframe");
    expect(result.safeHtml).not.toContain("<iframe");
  });

  it("does not false-positive a 'changed link' for routine ampersand entity encoding", () => {
    const result = processRichContent(
      '<a href="https://example.com/search?a=1&amp;b=2">results</a>'
    );
    expect(result.hadChangedLink).toBe(false);
    expect(result.links[0]?.href).toContain("a=1");
  });
});
