import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { parseSpectoraWorkbook } from "@/lib/import/parse-workbook";
import { sha256HexOfBuffer } from "@/lib/import/checksum";
import type { ImportIssueCandidate } from "@/lib/import/types";
import { computeIntegrityResult, unverifiableIntegrityResult } from "@/lib/integrity/compute-integrity";
import type { IntegrityResult } from "@/lib/integrity/types";
import { toImportPayload, parseImportRpcResult } from "./import-payload";
import { readPersistedTemplate } from "./read-persisted-template";
import type { ImportResult } from "./types";

/**
 * The whole "upload → validate → parse → canonical schema validation →
 * create import run → atomic template persistence → persist source-row
 * traceability → persist import issues → re-read persisted template →
 * integrity verification → mark import run complete" pipeline
 * (docs/architecture.md §1), server-side only.
 *
 * GOAL, restated: this function either returns a fully-persisted,
 * queryable template, or it persists nothing but an audit record of why —
 * never a half-imported template. See the transaction-strategy note on
 * `import_template` in the migration for how that's actually enforced
 * (a Postgres function body, not client-side compensating deletes).
 */
export async function runSpectoraImport(input: {
  buffer: Buffer;
  filename: string;
  client?: SupabaseClient;
}): Promise<ImportResult> {
  const client = input.client ?? createServiceRoleClient();
  const sha256 = sha256HexOfBuffer(input.buffer);

  const parseResult = parseSpectoraWorkbook({ buffer: input.buffer, filename: input.filename });

  if (!parseResult.ok) {
    return recordFailedRun(client, {
      filename: input.filename,
      sha256,
      issues: parseResult.issues,
      errorMessage: summarizeIssues(parseResult.issues),
    });
  }

  const payload = toImportPayload(
    parseResult.template,
    { sourceFilename: input.filename, sourceFileSha256: sha256 },
    parseResult.issues
  );

  const { data: rpcData, error: rpcError } = await client.rpc("import_template", { payload });

  if (rpcError || !rpcData) {
    return recordFailedRun(client, {
      filename: input.filename,
      sha256,
      issues: parseResult.issues,
      errorMessage: rpcError?.message ?? "import_template returned no data.",
    });
  }

  let rpcResult;
  try {
    rpcResult = parseImportRpcResult(rpcData);
  } catch (error) {
    return recordFailedRun(client, {
      filename: input.filename,
      sha256,
      issues: parseResult.issues,
      errorMessage: `import_template returned an unexpected shape: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // The write already committed at this point (the function returned
  // successfully) — this is a genuine post-commit re-read, not a
  // within-transaction snapshot, so it actually proves the data survived.
  // THIS IS NOT AI: computeIntegrityResult is a pure, deterministic
  // comparison — see docs/architecture.md §2.8 and src/lib/integrity/.
  let integrityResult: IntegrityResult;
  try {
    const persisted = await readPersistedTemplate(client, rpcResult.templateId);
    integrityResult = computeIntegrityResult({
      parsedTemplate: parseResult.template,
      persistedTemplate: persisted,
      issues: parseResult.issues,
      sourceRowRecords: parseResult.sourceRowRecords,
    });
  } catch (error) {
    integrityResult = unverifiableIntegrityResult(error instanceof Error ? error.message : String(error));
  }

  await client
    .from("import_runs")
    .update({
      integrity_status: integrityResult.status,
      integrity_result: integrityResult,
      completed_at: new Date().toISOString(),
      ...(integrityResult.reviewRequired ? { error_message: integrityResult.summary } : {}),
    })
    .eq("id", rpcResult.importRunId);

  return {
    success: true,
    templateId: rpcResult.templateId,
    importRunId: rpcResult.importRunId,
    counts: {
      sections: rpcResult.sectionCount,
      items: rpcResult.itemCount,
      comments: rpcResult.commentCount,
    },
    issueCount: rpcResult.issueCount,
    integrityStatus: integrityResult.status,
    integritySummary: integrityResult.summary,
  };
}

function summarizeIssues(issues: ImportIssueCandidate[]): string {
  const blocking = issues.find((issue) => issue.severity === "blocking");
  return blocking?.explanation ?? issues.map((issue) => issue.explanation).join(" ") ?? "Import failed.";
}

async function recordFailedRun(
  client: SupabaseClient,
  params: { filename: string; sha256: string; issues: ImportIssueCandidate[]; errorMessage: string }
): Promise<ImportResult> {
  const { data, error } = await client
    .from("import_runs")
    .insert({
      source_filename: params.filename,
      source_file_sha256: params.sha256,
      status: "failed",
      section_count: 0,
      item_count: 0,
      comment_count: 0,
      issue_count: params.issues.length,
      error_message: params.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const importRunId: string | null = error || !data ? null : (data.id as string);

  if (importRunId && params.issues.length > 0) {
    await client.from("import_issues").insert(
      params.issues.map((issue) => ({
        import_run_id: importRunId,
        category: issue.category,
        severity: issue.severity,
        source_sheet: issue.sourceRef.sheet,
        source_row_number: issue.sourceRef.rowNumber,
        explanation: issue.explanation,
        raw_snippet: issue.rawSnippet,
        imported_preview: issue.importedPreview,
      }))
    );
  }

  return {
    success: false,
    importRunId,
    error: params.errorMessage,
    issueCount: params.issues.length,
  };
}
