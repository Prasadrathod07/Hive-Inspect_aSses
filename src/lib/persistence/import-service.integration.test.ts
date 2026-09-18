import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runSpectoraImport } from "./import-service";

/**
 * Live-database integration tests. These write real rows through the real
 * `import_template` Postgres function, so they're gated behind an explicit
 * opt-in — not just having credentials present — and are never part of a
 * normal `npm run test`.
 *
 * To run them:
 *   1. Apply both migrations in supabase/migrations/, in order, to your
 *      Supabase project (SQL Editor, or `supabase db push`):
 *        20260915000000_import_pipeline.sql
 *        20260915010000_import_integrity.sql
 *   2. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 *      (see .env / README).
 *   3. RUN_SUPABASE_INTEGRATION_TESTS=1 npx vitest run import-service.integration
 *
 * Without that opt-in flag, this whole suite is skipped — not failed — so
 * `npm run test` stays green in any environment without a live database.
 */
const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const isOptedIn = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";
const shouldRun = hasCredentials && isOptedIn;

if (!shouldRun) {
  console.log(
    "[import-service.integration.test] Skipped — requires NEXT_PUBLIC_SUPABASE_URL, " +
      "SUPABASE_SERVICE_ROLE_KEY, and RUN_SUPABASE_INTEGRATION_TESTS=1 (opt-in, since it writes " +
      "real rows and requires the migration to already be applied). See this file's header comment."
  );
}

const FIXTURE_PATH = path.resolve(__dirname, "../../../tests/fixtures/synthetic-spectora-like.xlsx");

describe.skipIf(!shouldRun)("runSpectoraImport — live Supabase integration", () => {
  const client = shouldRun
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;

  it("persists the synthetic fixture atomically and verifies integrity", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const result = await runSpectoraImport({
      buffer,
      filename: "synthetic-spectora-like.xlsx",
      client: client!,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.counts.sections).toBe(3);
    expect(result.counts.items).toBeGreaterThan(0);
    // The synthetic fixture deliberately contains an unrecognized row and an
    // ambiguous-hierarchy comment — a real, honest "warnings" status, not "verified".
    expect(result.integrityStatus).toBe("verified_with_warnings");

    // Clean up what this test just wrote — cascades to sections/items/comments.
    await client!.from("templates").delete().eq("id", result.templateId);
    await client!.from("import_runs").delete().eq("id", result.importRunId);
  });

  it("records a failed import run with no template for an unreadable file", async () => {
    const result = await runSpectoraImport({
      buffer: Buffer.from("not a spreadsheet"),
      filename: "bad.xlsx",
      client: client!,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.importRunId).not.toBeNull();
    expect(result.error).toContain("could not be read");

    if (result.importRunId) {
      await client!.from("import_runs").delete().eq("id", result.importRunId);
    }
  });
});
