"use server";

import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { runAiAudit, type AiAuditState } from "@/lib/ai/run-audit";
import { AiAuditOutputSchema } from "@/lib/ai/audit-schema";
import { IntegrityResultSchema } from "@/lib/integrity/types";
import { resolveProvider } from "@/lib/ai/provider";
import type { AuditableIssue } from "@/lib/ai/audit-payload";
import { toAppError } from "@/lib/errors/app-error";
import { z } from "zod";

const ImportRunIdSchema = z.uuid("Invalid import run id.");

/**
 * Produces the AI explanation for one import run.
 *
 * Called from the client AFTER the deterministic report has rendered, never
 * during it — the integrity result must never wait on, or be gated by, a model
 * call. Every failure path returns a renderable state rather than throwing.
 */
export async function requestAiAudit(importRunId: string): Promise<AiAuditState> {
  const parsedId = ImportRunIdSchema.safeParse(importRunId);
  if (!parsedId.success) return { status: "unavailable" };

  // Cheap check first: skip all the work if there's no provider configured.
  if (!resolveProvider().available) return { status: "unavailable" };

  try {
    const client = createServiceRoleClient();

    const cached = await readLatestSucceededAudit(client, parsedId.data);
    if (cached) return cached;

    const context = await readAuditContext(client, parsedId.data);
    if (!context) return { status: "unavailable" };

    return await runAiAudit({
      importRunId: parsedId.data,
      integrity: context.integrity,
      issues: context.issues,
      client,
    });
  } catch (error) {
    // Includes the no-credentials case. The deterministic report is already
    // on screen; this section just degrades.
    toAppError(error, "requestAiAudit", "ai_unavailable");
    return { status: "error" };
  }
}

/**
 * Reuses a previously validated audit for this run. An explanation of a fixed,
 * already-computed integrity result doesn't change between page views, so
 * re-calling the model would spend money to re-derive the same thing — and
 * would make the section's wording flicker between visits.
 */
async function readLatestSucceededAudit(
  client: ReturnType<typeof createServiceRoleClient>,
  importRunId: string
): Promise<AiAuditState | null> {
  const { data, error } = await client
    .from("ai_audits")
    .select("output, model, created_at")
    .eq("import_run_id", importRunId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.output) return null;

  // Re-validate on the way out. Stored output was validated when written, but
  // this costs nothing and means a hand-edited row still can't reach the UI.
  const parsed = AiAuditOutputSchema.safeParse(data.output);
  if (!parsed.success) return null;

  return {
    status: "ok",
    output: parsed.data,
    model: (data.model as string) ?? "unknown",
    generatedAt: (data.created_at as string) ?? new Date().toISOString(),
  };
}

async function readAuditContext(
  client: ReturnType<typeof createServiceRoleClient>,
  importRunId: string
): Promise<{ integrity: ReturnType<typeof IntegrityResultSchema.parse>; issues: AuditableIssue[] } | null> {
  const { data: run, error: runError } = await client
    .from("import_runs")
    .select("integrity_result")
    .eq("id", importRunId)
    .maybeSingle();

  if (runError || !run?.integrity_result) return null;

  const integrity = IntegrityResultSchema.safeParse(run.integrity_result);
  if (!integrity.success) return null;

  const { data: issueRows, error: issuesError } = await client
    .from("import_issues")
    .select("id, category, severity, source_row_number, explanation, raw_snippet")
    .eq("import_run_id", importRunId)
    .order("source_row_number", { ascending: true });

  if (issuesError) return null;

  const issues: AuditableIssue[] = (issueRows ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    severity: row.severity as string,
    sourceRowNumber: (row.source_row_number as number) ?? 0,
    // Used only to classify the issue into a display group. The payload
    // builder never copies either of these into what gets sent.
    explanation: (row.explanation as string) ?? "",
    rawSnippet: (row.raw_snippet as string) ?? "",
  }));

  return { integrity: integrity.data, issues };
}
