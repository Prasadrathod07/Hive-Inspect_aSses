import { z } from "zod";
import type { CanonicalTemplate, ImportIssueCandidate } from "@/lib/import/types";

/**
 * Pure mapping layer between the parser's camelCase canonical model and the
 * snake_case JSONB contract the `import_template` Postgres function expects
 * (see supabase/migrations/20260915000000_import_pipeline.sql for the
 * matching SQL side). No I/O here — fully unit-testable without a database.
 */

export interface ImportRpcPayload {
  source_filename: string;
  source_file_sha256: string;
  template: {
    name: string;
    sections: Array<{
      name: string;
      position: number;
      source_sheet: string;
      source_row_number: number;
      items: Array<{
        name: string;
        position: number;
        source_sheet: string;
        source_row_number: number;
        comments: Array<{
          plain_text: string;
          safe_html: string | null;
          position: number;
          source_sheet: string;
          source_row_number: number;
          link_metadata: CanonicalTemplate["sections"][number]["items"][number]["comments"][number]["linkMetadata"] | null;
        }>;
      }>;
    }>;
  };
  issues: Array<{
    category: string;
    severity: string;
    source_sheet: string;
    source_row_number: number;
    explanation: string;
    raw_snippet: string;
    imported_preview: string | null;
  }>;
}

export interface ImportPayloadMeta {
  sourceFilename: string;
  sourceFileSha256: string;
}

export function toImportPayload(
  template: CanonicalTemplate,
  meta: ImportPayloadMeta,
  issues: ImportIssueCandidate[]
): ImportRpcPayload {
  return {
    source_filename: meta.sourceFilename,
    source_file_sha256: meta.sourceFileSha256,
    template: {
      name: template.name,
      sections: template.sections.map((section) => ({
        name: section.name,
        position: section.position,
        source_sheet: section.sourceRef.sheet,
        source_row_number: section.sourceRef.rowNumber,
        items: section.items.map((item) => ({
          name: item.name,
          position: item.position,
          source_sheet: item.sourceRef.sheet,
          source_row_number: item.sourceRef.rowNumber,
          comments: item.comments.map((comment) => ({
            plain_text: comment.plainText,
            safe_html: comment.safeHtml,
            position: comment.position,
            source_sheet: comment.sourceRef.sheet,
            source_row_number: comment.sourceRef.rowNumber,
            link_metadata: comment.linkMetadata ?? null,
          })),
        })),
      })),
    },
    issues: issues.map((issue) => ({
      category: issue.category,
      severity: issue.severity,
      source_sheet: issue.sourceRef.sheet,
      source_row_number: issue.sourceRef.rowNumber,
      explanation: issue.explanation,
      raw_snippet: issue.rawSnippet,
      imported_preview: issue.importedPreview,
    })),
  };
}

/** Validates the JSONB the `import_template` function returns before trusting its shape. */
export const ImportRpcResultSchema = z.object({
  template_id: z.string(),
  import_run_id: z.string(),
  section_count: z.number().int().nonnegative(),
  item_count: z.number().int().nonnegative(),
  comment_count: z.number().int().nonnegative(),
  issue_count: z.number().int().nonnegative(),
});
export type ImportRpcResult = z.infer<typeof ImportRpcResultSchema>;

export interface ImportRunCounts {
  templateId: string;
  importRunId: string;
  sectionCount: number;
  itemCount: number;
  commentCount: number;
  issueCount: number;
}

export function parseImportRpcResult(raw: unknown): ImportRunCounts {
  const result = ImportRpcResultSchema.parse(raw);
  return {
    templateId: result.template_id,
    importRunId: result.import_run_id,
    sectionCount: result.section_count,
    itemCount: result.item_count,
    commentCount: result.comment_count,
    issueCount: result.issue_count,
  };
}
