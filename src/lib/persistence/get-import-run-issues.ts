import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import type { IssueResolutionStatus } from "./types";
import type { IntegrityResult } from "@/lib/integrity/types";

export interface IssueHierarchyContext {
  sectionName: string | null;
  itemName: string | null;
  /** True only when this row number exactly matches a persisted section/item/comment — never guessed from surrounding rows. */
  matched: boolean;
}

export interface ImportRunIssueDetail {
  id: string;
  category: string;
  severity: string;
  sourceSheet: string;
  sourceRowNumber: number;
  explanation: string;
  rawSnippet: string;
  importedPreview: string | null;
  resolutionStatus: IssueResolutionStatus;
  hierarchy: IssueHierarchyContext;
  /** Level B ("Fix Safely") — see docs/architecture.md §5a. */
  fixSafelyAvailable: boolean;
  proposedPlainText: string | null;
  proposedSafeHtml: string | null;
  appliedFixAt: string | null;
  /**
   * Only meaningful for category "unrecognized_row": true when this row
   * produced no mapped node at all (a genuine gap), false when the row DID
   * map successfully and this issue is just an informational note about
   * additional unmodeled columns. Both share the same category, but only
   * the former represents an actual mapping problem — see
   * docs/architecture.md §5a's `unsupportedSourceRefs` note.
   */
  rowGenuinelyUnsupported: boolean;
}

export interface ImportRunIssuesPage {
  importRunId: string;
  templateId: string;
  templateName: string;
  sourceFilename: string;
  createdAt: string;
  issues: ImportRunIssueDetail[];
}

interface TreeComment {
  source_row_number: number;
}
interface TreeItem {
  name: string;
  source_row_number: number;
  comments: TreeComment[];
}
interface TreeSection {
  name: string;
  source_row_number: number;
  items: TreeItem[];
}

/**
 * Builds a row-number → hierarchy lookup by exact match only. A row that
 * created a section/item/comment maps to that node's context; anything
 * else stays unmatched rather than being guessed from neighboring rows —
 * see docs/decision-log.md on the "never infer without evidence" rule.
 */
function buildHierarchyMap(sections: TreeSection[]): Map<number, IssueHierarchyContext> {
  const map = new Map<number, IssueHierarchyContext>();
  for (const section of sections) {
    map.set(section.source_row_number, { sectionName: section.name, itemName: null, matched: true });
    for (const item of section.items) {
      map.set(item.source_row_number, { sectionName: section.name, itemName: item.name, matched: true });
      for (const comment of item.comments) {
        map.set(comment.source_row_number, { sectionName: section.name, itemName: item.name, matched: true });
      }
    }
  }
  return map;
}

const UNMATCHED_CONTEXT: IssueHierarchyContext = { sectionName: null, itemName: null, matched: false };

/** Server-only read for the Issue Review page. Returns null if the import run doesn't exist. */
export async function getImportRunIssues(importRunId: string): Promise<ImportRunIssuesPage | null> {
  const client = createServiceRoleClient();

  const { data: run, error: runError } = await client
    .from("import_runs")
    .select("id, template_id, source_filename, created_at, integrity_result")
    .eq("id", importRunId)
    .maybeSingle();

  if (runError) throw new Error(`Failed to load import run: ${runError.message}`);
  if (!run || !run.template_id) return null;

  const integrityResult = run.integrity_result as IntegrityResult | null;
  const unsupportedRowKeys = new Set(
    (integrityResult?.sourceCoverage.unsupportedSourceRefs ?? []).map(
      (ref) => `${ref.sheet} ${ref.rowNumber}`
    )
  );

  const { data: template, error: templateError } = await client
    .from("templates")
    .select("id, name, sections(name, source_row_number, items(name, source_row_number, comments(source_row_number)))")
    .eq("id", run.template_id)
    .maybeSingle();

  if (templateError) throw new Error(`Failed to load template: ${templateError.message}`);
  if (!template) return null;

  const hierarchyMap = buildHierarchyMap((template.sections ?? []) as unknown as TreeSection[]);

  const { data: issuesData, error: issuesError } = await client
    .from("import_issues")
    .select(
      "id, category, severity, source_sheet, source_row_number, explanation, raw_snippet, imported_preview, resolution_status, fix_safely_available, proposed_plain_text, proposed_safe_html, applied_fix_at"
    )
    .eq("import_run_id", importRunId)
    .order("source_row_number", { ascending: true });

  if (issuesError) throw new Error(`Failed to load import issues: ${issuesError.message}`);

  return {
    importRunId: run.id,
    templateId: template.id,
    templateName: template.name,
    sourceFilename: run.source_filename,
    createdAt: run.created_at,
    issues: (issuesData ?? []).map((issue) => ({
      id: issue.id,
      category: issue.category,
      severity: issue.severity,
      sourceSheet: issue.source_sheet,
      sourceRowNumber: issue.source_row_number,
      explanation: issue.explanation,
      rawSnippet: issue.raw_snippet,
      importedPreview: issue.imported_preview,
      resolutionStatus: issue.resolution_status as IssueResolutionStatus,
      hierarchy: hierarchyMap.get(issue.source_row_number) ?? UNMATCHED_CONTEXT,
      fixSafelyAvailable: issue.fix_safely_available,
      proposedPlainText: issue.proposed_plain_text,
      proposedSafeHtml: issue.proposed_safe_html,
      appliedFixAt: issue.applied_fix_at,
      // Conservative default: with no integrity result to check against
      // (e.g. a failed/unverifiable run), never collapse — only demote an
      // unrecognized_row issue out of "genuinely unsupported" when we have
      // positive proof (this run's own computed sourceCoverage) that its
      // row actually mapped successfully.
      rowGenuinelyUnsupported:
        issue.category !== "unrecognized_row" ||
        !integrityResult ||
        unsupportedRowKeys.has(`${issue.source_sheet} ${issue.source_row_number}`),
    })),
  };
}
