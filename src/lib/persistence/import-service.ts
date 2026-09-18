import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { parseSpectoraWorkbook } from "@/lib/import/parse-workbook";
import { sha256HexOfBuffer } from "@/lib/import/checksum";
import type { ImportIssueCandidate, NormalizationEvent } from "@/lib/import/types";
import { computeIntegrityResult, unverifiableIntegrityResult } from "@/lib/integrity/compute-integrity";
import type { IntegrityResult } from "@/lib/integrity/types";
import { toImportPayload, parseImportRpcResult } from "./import-payload";
import { readPersistedTemplate } from "./read-persisted-template";
import { toAppError, formatAppError } from "@/lib/errors/app-error";
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
  const sha256 = sha256HexOfBuffer(input.buffer);

  // Diagnose the file BEFORE touching the database. Deciding that an upload
  // isn't a spreadsheet needs no persistence, so the person gets the real
  // reason even when the audit log is unavailable. Creating the client first
  // meant a bad upload was reported as "this workspace isn't set up yet",
  // blaming the server for what was actually a wrong file.
  const parseResult = parseSpectoraWorkbook({ buffer: input.buffer, filename: input.filename });

  if (!parseResult.ok) {
    const explanation = summarizeIssues(parseResult.issues);
    return recordFailedRun(tryCreateClient(input.client), {
      filename: input.filename,
      sha256,
      issues: parseResult.issues,
      auditMessage: explanation,
      // Parser explanations are written for people, so the same text is
      // safe to show and useful to store.
      userError: explanation,
    });
  }

  // Past this point the work genuinely requires persistence, so a missing
  // client is a real infrastructure failure and is allowed to throw.
  const client = input.client ?? createServiceRoleClient();

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
      auditMessage: rpcError?.message ?? "import_template returned no data.",
      userError: formatAppError(toAppError(rpcError, "runSpectoraImport/rpc", "persistence_failed")),
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
      auditMessage: `import_template returned an unexpected shape: ${error instanceof Error ? error.message : String(error)}`,
      userError: formatAppError(toAppError(error, "runSpectoraImport/rpcShape", "persistence_failed")),
    });
  }

  await persistNormalizationEvents(client, rpcResult.importRunId, parseResult.normalizationEvents);

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

/**
 * Best-effort, not part of the atomic write: normalization_events is a
 * purely informational audit trail (docs/architecture.md §5a), same posture
 * as the AI auditor's own writes — losing this log must never fail an
 * otherwise-successful import. A no-op for the (common) case of no events.
 */
export async function persistNormalizationEvents(
  client: SupabaseClient,
  importRunId: string,
  events: NormalizationEvent[]
): Promise<void> {
  if (events.length === 0) return;
  try {
    const { error } = await client.from("normalization_events").insert(
      events.map((event) => ({
        import_run_id: importRunId,
        event_type: event.type,
        source_sheet: event.sourceRef.sheet,
        source_row_number: event.sourceRef.rowNumber,
        description: event.description,
        before_hash: event.beforeHash,
        after_hash: event.afterHash,
      }))
    );
    if (error) toAppError(error, "runSpectoraImport/normalizationEvents");
  } catch (error) {
    toAppError(error, "runSpectoraImport/normalizationEvents");
  }
}

function summarizeIssues(issues: ImportIssueCandidate[]): string {
  const blocking = issues.find((issue) => issue.severity === "blocking");
  return blocking?.explanation ?? issues.map((issue) => issue.explanation).join(" ") ?? "Import failed.";
}

/**
 * A client for the audit write only. Returns null instead of throwing when
 * credentials are missing, because failing to *record* a rejected import must
 * never change what the person is told about their file.
 */
function tryCreateClient(provided?: SupabaseClient): SupabaseClient | null {
  if (provided) return provided;
  try {
    return createServiceRoleClient();
  } catch (error) {
    toAppError(error, "runSpectoraImport/auditClient");
    return null;
  }
}

async function recordFailedRun(
  client: SupabaseClient | null,
  params: {
    filename: string;
    sha256: string;
    issues: ImportIssueCandidate[];
    /** Full detail, stored server-side in import_runs for the operator. */
    auditMessage: string;
    /** Safe to show the person who tried the import. */
    userError: string;
  }
): Promise<ImportResult> {
  // Traceability is valuable but secondary: if it can't be written, the person
  // is still told exactly what was wrong with their file, just without a run
  // to open. The failure to record is logged for the operator instead.
  let importRunId: string | null = null;

  if (client) {
    try {
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
          error_message: params.auditMessage,
          completed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) toAppError(error, "recordFailedRun/insertRun");
      importRunId = error || !data ? null : (data.id as string);

      if (importRunId && params.issues.length > 0) {
        const { error: issuesError } = await client.from("import_issues").insert(
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
        if (issuesError) toAppError(issuesError, "recordFailedRun/insertIssues");
      }
    } catch (error) {
      toAppError(error, "recordFailedRun");
      importRunId = null;
    }
  }

  return {
    success: false,
    importRunId,
    error: params.userError,
    issueCount: params.issues.length,
  };
}
