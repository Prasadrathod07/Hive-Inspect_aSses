import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import type { IntegrityResult } from "@/lib/integrity/types";

export interface TemplateReportIssue {
  id: string;
  category: string;
  severity: string;
  sourceSheet: string;
  sourceRowNumber: number;
  explanation: string;
  rawSnippet: string;
  importedPreview: string | null;
  resolutionStatus: "open" | "accepted" | "resolved";
}

export interface TemplateReport {
  templateId: string;
  templateName: string;
  sourceFilename: string;
  importRunId: string;
  status: string;
  integrityResult: IntegrityResult | null;
  issues: TemplateReportIssue[];
  createdAt: string;
  completedAt: string | null;
}

/** Server-only read for the import-report page. Returns null if the template or its run doesn't exist. */
export async function getTemplateReport(templateId: string): Promise<TemplateReport | null> {
  const client = createServiceRoleClient();

  const { data: template, error: templateError } = await client
    .from("templates")
    .select("id, name, source_filename")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) throw new Error(`Failed to load template: ${templateError.message}`);
  if (!template) return null;

  const { data: run, error: runError } = await client
    .from("import_runs")
    .select("id, status, integrity_result, created_at, completed_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) throw new Error(`Failed to load import run: ${runError.message}`);
  if (!run) return null;

  const { data: issuesData, error: issuesError } = await client
    .from("import_issues")
    .select(
      "id, category, severity, source_sheet, source_row_number, explanation, raw_snippet, imported_preview, resolution_status"
    )
    .eq("import_run_id", run.id)
    .order("source_row_number", { ascending: true });

  if (issuesError) throw new Error(`Failed to load import issues: ${issuesError.message}`);

  return {
    templateId: template.id,
    templateName: template.name,
    sourceFilename: template.source_filename,
    importRunId: run.id,
    status: run.status,
    integrityResult: (run.integrity_result as IntegrityResult | null) ?? null,
    issues: (issuesData ?? []).map((issue) => ({
      id: issue.id,
      category: issue.category,
      severity: issue.severity,
      sourceSheet: issue.source_sheet,
      sourceRowNumber: issue.source_row_number,
      explanation: issue.explanation,
      rawSnippet: issue.raw_snippet,
      importedPreview: issue.imported_preview,
      resolutionStatus: issue.resolution_status as "open" | "accepted" | "resolved",
    })),
    createdAt: run.created_at,
    completedAt: run.completed_at,
  };
}
