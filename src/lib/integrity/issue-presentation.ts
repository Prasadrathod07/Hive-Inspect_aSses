/**
 * Presentation-layer grouping over ImportIssueCandidate categories. Purely
 * derived from data already captured deterministically (category +
 * rawSnippet/explanation) — this reclassifies for display, it never
 * invents new facts. THIS IS NOT AI.
 */

export type IssueGroupKey =
  | "sanitized_unsafe_html"
  | "recoverable_content"
  | "formatting_changed"
  | "unsupported_source_content"
  | "unmapped_rows"
  | "link_differences"
  | "validation_issues";

export interface IssueGroupMeta {
  key: IssueGroupKey;
  label: string;
  description: string;
}

const GROUPS: Record<IssueGroupKey, IssueGroupMeta> = {
  sanitized_unsafe_html: {
    key: "sanitized_unsafe_html",
    label: "Sanitized unsafe HTML",
    description: "Markup that could run code or alter the page was removed for safety.",
  },
  recoverable_content: {
    key: "recoverable_content",
    label: "Recoverable content",
    description:
      "Content the editor doesn't directly support, but with a deterministic safe fix available — review the before/after preview and apply it if it looks right.",
  },
  formatting_changed: {
    key: "formatting_changed",
    label: "Formatting changed",
    description: "Rich-text formatting outside our supported allowlist was removed; the underlying text was kept.",
  },
  unsupported_source_content: {
    key: "unsupported_source_content",
    label: "Unsupported source content",
    description: "Content existed in the source but couldn't be mapped into the section/item/comment structure.",
  },
  unmapped_rows: {
    key: "unmapped_rows",
    label: "Unmapped/unknown rows",
    description: "Content that had nowhere to attach, given its position in the row order.",
  },
  link_differences: {
    key: "link_differences",
    label: "Link differences",
    description: "A link was removed (unsafe scheme) or its URL came out different from the source.",
  },
  validation_issues: {
    key: "validation_issues",
    label: "Validation issues",
    description: "Problems with the file or workbook itself, found before parsing began.",
  },
};

/** Ordered by how urgently each group tends to need attention. */
export const ISSUE_GROUP_ORDER: IssueGroupKey[] = [
  "validation_issues",
  "sanitized_unsafe_html",
  "recoverable_content",
  "unmapped_rows",
  "unsupported_source_content",
  "link_differences",
  "formatting_changed",
];

const UNSAFE_TAG_PATTERN = /<\s*\/?\s*(script|iframe|object|embed)\b|on\w+\s*=/i;

interface ClassifiableIssue {
  category: string;
  rawSnippet: string;
  explanation: string;
}

export function classifyIssueGroup(issue: ClassifiableIssue): IssueGroupKey {
  switch (issue.category) {
    case "unsupported_formatting":
      return UNSAFE_TAG_PATTERN.test(issue.rawSnippet) || UNSAFE_TAG_PATTERN.test(issue.explanation)
        ? "sanitized_unsafe_html"
        : "formatting_changed";
    case "recoverable_formatting":
      return "recoverable_content";
    case "unrecognized_row":
      return "unsupported_source_content";
    case "ambiguous_hierarchy":
      return "unmapped_rows";
    case "unsupported_link":
      return "link_differences";
    case "malformed_workbook":
    case "other":
    default:
      return "validation_issues";
  }
}

export function getIssueGroupMeta(key: IssueGroupKey): IssueGroupMeta {
  return GROUPS[key];
}

export function groupIssues<T extends ClassifiableIssue>(
  issues: T[]
): { group: IssueGroupMeta; issues: T[] }[] {
  const buckets = new Map<IssueGroupKey, T[]>();
  for (const issue of issues) {
    const key = classifyIssueGroup(issue);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(issue);
    else buckets.set(key, [issue]);
  }
  return ISSUE_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    group: GROUPS[key],
    issues: buckets.get(key) as T[],
  }));
}
