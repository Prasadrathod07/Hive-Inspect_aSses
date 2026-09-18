import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAuditPayload, allowedIssueIds, type AuditableIssue } from "./audit-payload";
import { parseModelJson, validateAuditOutput, type AiAuditOutput } from "./audit-schema";
import {
  resolveProvider,
  buildUserPrompt,
  AUDIT_SYSTEM_PROMPT,
  AI_AUDIT_TIMEOUT_MS,
  type AiProvider,
} from "./provider";
import type { IntegrityResult } from "@/lib/integrity/types";
import { toAppError } from "@/lib/errors/app-error";

/**
 * Orchestrates one AI audit.
 *
 * The invariant every branch below preserves: this function has no write path
 * to template data. It reads a deterministic result, sends a derived payload
 * out, validates what comes back, and writes one row to `ai_audits`. Whatever
 * happens — timeout, garbage response, invented issue ids, provider outage —
 * the worst outcome is that the explanation is missing. The integrity report
 * it was explaining is already computed, already persisted, and already on
 * screen before this ever runs.
 *
 * Nothing here throws. Callers get a state to render, never an exception to
 * handle, because an AI failure must not be able to take a page down.
 */

export type AiAuditState =
  /** Not enabled or not configured. The expected state for a fresh checkout. */
  | { status: "unavailable" }
  /** Validated, safe to show. */
  | { status: "ok"; output: AiAuditOutput; model: string; generatedAt: string }
  /** The model answered, but the answer failed validation. */
  | { status: "invalid" }
  /** No usable answer: transport error, timeout, or HTTP failure. */
  | { status: "error" };

export interface RunAuditInput {
  importRunId: string;
  integrity: IntegrityResult;
  issues: AuditableIssue[];
  client: SupabaseClient | null;
  /** Injectable for tests. Defaults to the environment-configured provider. */
  provider?: AiProvider;
  timeoutMs?: number;
}

export async function runAiAudit(input: RunAuditInput): Promise<AiAuditState> {
  const provider = input.provider ?? resolveConfiguredProvider();
  if (!provider) return { status: "unavailable" };

  const payload = buildAuditPayload({ integrity: input.integrity, issues: input.issues });
  const allowed = allowedIssueIds(payload);
  const startedAt = Date.now();

  let rawText: string;
  try {
    rawText = await callWithTimeout(provider, payload, input.timeoutMs ?? AI_AUDIT_TIMEOUT_MS);
  } catch (error) {
    toAppError(error, "runAiAudit/provider", "ai_unavailable");
    await recordAudit(input.client, {
      importRunId: input.importRunId,
      status: "provider_error",
      provider: provider.name,
      model: provider.model,
      failureReason: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    return { status: "error" };
  }

  const json = parseModelJson(rawText);
  if (!json.ok) {
    await recordAudit(input.client, {
      importRunId: input.importRunId,
      status: "invalid_output",
      provider: provider.name,
      model: provider.model,
      failureReason: `Unparseable response: ${json.detail}`,
      durationMs: Date.now() - startedAt,
    });
    return { status: "invalid" };
  }

  const validation = validateAuditOutput(json.value, allowed);
  if (!validation.ok) {
    const { failure } = validation;
    await recordAudit(input.client, {
      importRunId: input.importRunId,
      status: "invalid_output",
      provider: provider.name,
      model: provider.model,
      failureReason:
        failure.kind === "unknown_issue_ids"
          ? `${failure.detail} Unknown ids: ${failure.unknownIds.join(", ")}`
          : `${failure.kind}: ${failure.detail}`,
      durationMs: Date.now() - startedAt,
    });
    return { status: "invalid" };
  }

  const generatedAt = new Date().toISOString();
  await recordAudit(input.client, {
    importRunId: input.importRunId,
    status: "succeeded",
    provider: provider.name,
    model: provider.model,
    riskLevel: validation.output.riskLevel,
    output: validation.output,
    durationMs: Date.now() - startedAt,
  });

  return { status: "ok", output: validation.output, model: provider.model, generatedAt };
}

function resolveConfiguredProvider(): AiProvider | null {
  const resolution = resolveProvider();
  if (!resolution.available) {
    // Expected on any checkout without keys — a log line, not an error.
    console.info(`[runAiAudit] AI auditor unavailable: ${resolution.reason}`);
    return null;
  }
  return resolution.provider;
}

async function callWithTimeout(provider: AiProvider, payload: Parameters<typeof buildUserPrompt>[0], timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.complete({
      system: AUDIT_SYSTEM_PROMPT,
      user: buildUserPrompt(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort metadata write. Failing to record an audit must never change
 * what the person sees, so this swallows its own errors into the server log.
 */
async function recordAudit(
  client: SupabaseClient | null,
  row: {
    importRunId: string;
    status: "succeeded" | "invalid_output" | "provider_error";
    provider: string;
    model: string;
    riskLevel?: "low" | "medium" | "high";
    output?: AiAuditOutput;
    failureReason?: string;
    durationMs: number;
  }
): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.from("ai_audits").insert({
      import_run_id: row.importRunId,
      status: row.status,
      provider: row.provider,
      model: row.model,
      risk_level: row.riskLevel ?? null,
      output: row.output ?? null,
      failure_reason: row.failureReason ?? null,
      duration_ms: row.durationMs,
    });
    if (error) toAppError(error, "runAiAudit/recordAudit");
  } catch (error) {
    toAppError(error, "runAiAudit/recordAudit");
  }
}
