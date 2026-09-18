import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSpectoraImport } from "@/lib/persistence/import-service";
import type { ImportResult } from "@/lib/persistence/types";

/**
 * The demo-seeding operations, factored out of `scripts/seed-demo.ts` so
 * they're unit-testable against a mocked Supabase client — the same pattern
 * `import-service.test.ts` and `run-audit.test.ts` use — rather than only
 * exercisable by actually running the CLI against a live database.
 *
 * Every write here goes through `runSpectoraImport`, the exact function
 * `POST /api/import` calls. Nothing in this file constructs a template row
 * by hand.
 */

export interface ExistingSeededTemplate {
  importRunId: string;
  templateId: string;
  integrityStatus: string | null;
}

/**
 * Finds a prior successful seed of this exact file (by content hash), so
 * seeding is idempotent: run it twice against the same bytes and the second
 * run is a no-op that reports what already exists.
 */
export async function findExistingSeededTemplate(
  client: SupabaseClient,
  sha256: string
): Promise<ExistingSeededTemplate | null> {
  const { data, error } = await client
    .from("import_runs")
    .select("id, template_id, integrity_status")
    .eq("source_file_sha256", sha256)
    .eq("status", "succeeded")
    .not("template_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.template_id) return null;
  return {
    importRunId: data.id as string,
    templateId: data.template_id as string,
    integrityStatus: (data.integrity_status as string) ?? null,
  };
}

export interface ResetResult {
  templatesDeleted: number;
  runsDeleted: number;
  failures: string[];
}

/**
 * Deletes only the import run(s) and template(s) matching this exact file's
 * content hash — never a blanket wipe. A reviewer's own duplicate of the
 * seeded template is left untouched: `templates.parent_template_id` is
 * `ON DELETE SET NULL`, not cascading, so deleting the original never
 * destroys a copy someone made from it.
 */
export async function resetSeededTemplate(client: SupabaseClient, sha256: string): Promise<ResetResult> {
  const result: ResetResult = { templatesDeleted: 0, runsDeleted: 0, failures: [] };

  const { data: runs, error } = await client
    .from("import_runs")
    .select("id, template_id")
    .eq("source_file_sha256", sha256);

  if (error) {
    result.failures.push(`Could not look up existing demo runs: ${error.message}`);
    return result;
  }

  for (const run of runs ?? []) {
    if (run.template_id) {
      // Cascades to sections/items/comments (ON DELETE CASCADE).
      const { error: templateError } = await client.from("templates").delete().eq("id", run.template_id);
      if (templateError) {
        result.failures.push(`Failed to delete template ${run.template_id}: ${templateError.message}`);
        continue;
      }
      result.templatesDeleted++;
    }

    // Cascades to import_issues and ai_audits for this run.
    const { error: runError } = await client.from("import_runs").delete().eq("id", run.id);
    if (runError) {
      result.failures.push(`Failed to delete import run ${run.id}: ${runError.message}`);
      continue;
    }
    result.runsDeleted++;
  }

  return result;
}

/** Thin pass-through to the real import pipeline — kept here only for a single import point in the seed script. */
export async function seedFromBuffer(
  client: SupabaseClient,
  input: { buffer: Buffer; filename: string }
): Promise<ImportResult> {
  return runSpectoraImport({ buffer: input.buffer, filename: input.filename, client });
}
