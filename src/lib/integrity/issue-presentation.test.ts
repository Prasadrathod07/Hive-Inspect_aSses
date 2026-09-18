import { describe, expect, it } from "vitest";
import { classifyIssueGroup, groupIssues } from "./issue-presentation";

describe("classifyIssueGroup", () => {
  it("splits unsupported_formatting into sanitized-unsafe vs formatting-changed", () => {
    expect(
      classifyIssueGroup({
        category: "unsupported_formatting",
        rawSnippet: "<script>alert(1)</script>",
        explanation: "Removed unsupported tag(s): script.",
      })
    ).toBe("sanitized_unsafe_html");

    expect(
      classifyIssueGroup({
        category: "unsupported_formatting",
        rawSnippet: "<img src=x>",
        explanation: "Removed unsupported tag(s): img.",
      })
    ).toBe("formatting_changed");
  });

  it("maps unrecognized_row to unsupported source content", () => {
    expect(
      classifyIssueGroup({ category: "unrecognized_row", rawSnippet: "x", explanation: "x" })
    ).toBe("unsupported_source_content");
  });

  it("maps ambiguous_hierarchy to unmapped rows", () => {
    expect(
      classifyIssueGroup({ category: "ambiguous_hierarchy", rawSnippet: "x", explanation: "x" })
    ).toBe("unmapped_rows");
  });

  it("maps unsupported_link to link differences", () => {
    expect(
      classifyIssueGroup({ category: "unsupported_link", rawSnippet: "x", explanation: "x" })
    ).toBe("link_differences");
  });

  it("maps malformed_workbook and other to validation issues", () => {
    expect(
      classifyIssueGroup({ category: "malformed_workbook", rawSnippet: "x", explanation: "x" })
    ).toBe("validation_issues");
    expect(classifyIssueGroup({ category: "other", rawSnippet: "x", explanation: "x" })).toBe(
      "validation_issues"
    );
  });
});

describe("groupIssues", () => {
  it("groups and orders issues, omitting empty groups", () => {
    const grouped = groupIssues([
      { category: "unsupported_link", rawSnippet: "x", explanation: "x" },
      { category: "ambiguous_hierarchy", rawSnippet: "x", explanation: "x" },
      { category: "unsupported_link", rawSnippet: "x", explanation: "x" },
    ]);

    expect(grouped.map((g) => g.group.key)).toEqual(["unmapped_rows", "link_differences"]);
    expect(grouped.find((g) => g.group.key === "link_differences")?.issues).toHaveLength(2);
  });

  it("returns an empty array for no issues", () => {
    expect(groupIssues([])).toEqual([]);
  });
});
