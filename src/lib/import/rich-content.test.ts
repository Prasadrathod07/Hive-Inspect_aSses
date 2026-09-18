import { describe, expect, it } from "vitest";
import { processRichContent } from "./rich-content";

describe("processRichContent", () => {
  it("keeps allowlisted formatting and reports no issue", () => {
    const result = processRichContent("<p>Shingles are in <b>good</b> condition.</p>");
    expect(result.disallowedTags).toEqual([]);
    expect(result.droppedUnsafeLink).toBe(false);
    expect(result.safeHtml).toContain("<strong>good</strong>");
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

  it("decodes a literal ampersand to plain text, not HTML-escaped '&amp;' — found against a real Spectora export", () => {
    const result = processRichContent("Flashing & trim pieces were improperly installed.");
    expect(result.plainText).toBe("Flashing & trim pieces were improperly installed.");
    expect(result.plainText).not.toContain("&amp;");
  });

  it("decodes literal < and > to plain text the same way", () => {
    const result = processRichContent("Clearance was 5 < 10 inches, code requires > 12.");
    expect(result.plainText).toContain("5 < 10");
    expect(result.plainText).toContain("> 12");
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

describe("processRichContent — Level A: silent safe normalization", () => {
  it("silently unwraps a bare <div> wrapper — no issue, content fully preserved", () => {
    const result = processRichContent("<div>Roof condition appears good.</div>");
    expect(result.disallowedTags).toEqual([]);
    expect(result.fixSafely).toBeNull();
    expect(result.safeHtml).not.toContain("<div>");
    expect(result.plainText).toBe("Roof condition appears good.");
  });

  it("silently unwraps a bare <span> wrapper the same way", () => {
    const result = processRichContent("<span>Fine as-is.</span>");
    expect(result.disallowedTags).toEqual([]);
    expect(result.fixSafely).toBeNull();
    expect(result.plainText).toBe("Fine as-is.");
  });

  it("records a harmless_wrapper_removed normalization event for a bare wrapper, never an issue", () => {
    const result = processRichContent("<div>No problem here.</div>");
    const types = result.normalizationEvents.map((e) => e.type);
    expect(types).toContain("harmless_wrapper_removed");
  });

  it("records whitespace_trimmed for leading/trailing whitespace", () => {
    const result = processRichContent("  Trailing space text.  ");
    expect(result.normalizationEvents.map((e) => e.type)).toContain("whitespace_trimmed");
    expect(result.plainText).toBe("Trailing space text.");
  });

  it("records duplicate_whitespace_collapsed for repeated internal spaces", () => {
    const result = processRichContent("Roof   condition   good.");
    expect(result.normalizationEvents.map((e) => e.type)).toContain("duplicate_whitespace_collapsed");
    expect(result.plainText).toBe("Roof condition good.");
  });

  it("records empty_tag_removed and strips a genuinely empty tag", () => {
    const result = processRichContent("<p>Real content.</p><p></p>");
    expect(result.normalizationEvents.map((e) => e.type)).toContain("empty_tag_removed");
    expect(result.safeHtml).not.toContain("<p></p>");
    expect(result.plainText).toBe("Real content.");
  });

  it("never removes <br> as though it were an empty tag", () => {
    const result = processRichContent("Line one.<br>Line two.");
    expect(result.safeHtml).toContain("<br");
  });

  it("records html_entity_decoded and decodes &nbsp; into a normal space", () => {
    const result = processRichContent("<p>Roof&nbsp;&nbsp;condition</p>");
    expect(result.normalizationEvents.map((e) => e.type)).toContain("html_entity_decoded");
    expect(result.plainText).toBe("Roof condition");
  });

  it("records formatting_normalized and rewrites b/i to strong/em", () => {
    const result = processRichContent("<b>Bold</b> and <i>italic</i>.");
    expect(result.normalizationEvents.map((e) => e.type)).toContain("formatting_normalized");
    expect(result.safeHtml).toContain("<strong>Bold</strong>");
    expect(result.safeHtml).toContain("<em>italic</em>");
  });

  it("records safe_link_normalized for an ordinary safe link", () => {
    const result = processRichContent('<a href="https://example.com">docs</a>');
    expect(result.normalizationEvents.map((e) => e.type)).toContain("safe_link_normalized");
  });

  it("never emits a normalization event for a field with no normalization to do", () => {
    const result = processRichContent("Plain text, nothing to change.");
    expect(result.normalizationEvents).toEqual([]);
  });
});

describe("processRichContent — Level B: recoverable content ('Fix Safely')", () => {
  it("offers a Fix Safely proposal for a div wrapper WITH an attribute, and withholds safeHtml until applied", () => {
    const result = processRichContent('<div class="custom-wrapper">Roof   condition<br>appears good.</div>');
    expect(result.fixSafely).not.toBeNull();
    expect(result.safeHtml).toBe("");
    expect(result.disallowedTags).toEqual([]);
  });

  it("the Fix Safely proposal's plain text exactly matches what plainText already contains — proven, not guessed", () => {
    const result = processRichContent('<div class="custom-wrapper">Roof condition appears good.</div>');
    expect(result.fixSafely?.proposedPlainText).toBe(result.plainText);
    expect(result.plainText).toBe("Roof condition appears good.");
  });

  it("the Fix Safely proposal keeps nested allowed formatting", () => {
    const result = processRichContent('<div class="note">See <strong>attached</strong> report.</div>');
    expect(result.fixSafely?.proposedSafeHtml).toContain("<strong>attached</strong>");
  });

  it("does NOT offer Fix Safely when a genuinely unsupported tag is mixed in with the wrapper", () => {
    const result = processRichContent('<div class="wrap"><table><tr><td>A</td></tr></table></div>');
    expect(result.fixSafely).toBeNull();
    expect(result.disallowedTags).toEqual(expect.arrayContaining(["table"]));
  });

  it("plain text is never withheld even while a fix is pending", () => {
    const result = processRichContent('<span style="color:red">Important finding.</span>');
    expect(result.plainText).toBe("Important finding.");
    expect(result.fixSafely).not.toBeNull();
  });
});

describe("processRichContent — Level C: still requires manual review, never silently normalized", () => {
  it("still flags <table> as unsupported with no Fix Safely offered", () => {
    const result = processRichContent("<table><tr><td>A</td></tr></table>");
    expect(result.disallowedTags).toEqual(expect.arrayContaining(["table"]));
    expect(result.fixSafely).toBeNull();
  });

  it("still flags <img> as unsupported with no Fix Safely offered", () => {
    const result = processRichContent('<img src="https://example.com/a.jpg">');
    expect(result.disallowedTags).toContain("img");
    expect(result.fixSafely).toBeNull();
  });

  it("still flags <iframe>/embeds as unsupported with no Fix Safely offered", () => {
    const result = processRichContent('<iframe src="https://example.com/embed"></iframe>');
    expect(result.disallowedTags).toContain("iframe");
    expect(result.fixSafely).toBeNull();
  });

  it("still flags an unknown/unrecognized tag as unsupported", () => {
    const result = processRichContent("<marquee>data</marquee>");
    expect(result.disallowedTags).toContain("marquee");
    expect(result.fixSafely).toBeNull();
  });

  it("an unsafe link (javascript:) is still dropped, never silently normalized or offered as a fix", () => {
    const result = processRichContent('<a href="javascript:alert(1)">click</a>');
    expect(result.droppedUnsafeLink).toBe(true);
    expect(result.fixSafely).toBeNull();
  });
});
