/**
 * CLI entrypoint for seeding (or resetting) the reviewer-facing demo
 * template. All the actual decision logic lives in `src/lib/seed/` — pure
 * where possible, unit-tested there — so this file is just argv parsing,
 * filesystem reads, and console output.
 *
 * Run with: npm run seed
 *           npm run seed -- --reset
 *           npm run seed -- --allow-synthetic
 *
 * See src/lib/seed/seed-demo-template.ts and
 * src/lib/seed/classify-sample-files.ts for what each step actually does
 * and why. Short version: this seeds through the exact same
 * `runSpectoraImport` function `POST /api/import` calls — never a
 * hand-built template row — and refuses to silently substitute synthetic
 * data for the real assessment export.
 */

import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { sha256HexOfBuffer } from "@/lib/import/checksum";
import { classifySampleFiles } from "@/lib/seed/classify-sample-files";
import {
  findExistingSeededTemplate,
  resetSeededTemplate,
  seedFromBuffer,
} from "@/lib/seed/seed-demo-template";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const REAL_SAMPLE_DIR = path.join(REPO_ROOT, "sample-data", "spectora");
const SYNTHETIC_FIXTURE_PATH = path.join(REPO_ROOT, "tests", "fixtures", "synthetic-spectora-like.xlsx");

// Deliberately impossible to mistake for a real export, wherever it ends up
// displayed — dashboard card, report header, "Source file" field.
const SYNTHETIC_DEMO_FILENAME =
  "SYNTHETIC DEMO -- NOT the real Spectora export (see sample-data-spectora-README).xlsx";

interface ResolvedSource {
  buffer: Buffer;
  filename: string;
  kind: "real" | "synthetic-demo";
}

function printBlocker(): void {
  console.error(`
BLOCKER: no real Spectora export in sample-data/spectora/

Assessment requirement 16 requires the repo to include the actual Spectora
"Export to spreadsheet -> Export HTML Text" file used for this submission,
committed at sample-data/spectora/<filename>.xlsx.

Nothing was seeded. This command does not fall back to synthetic data,
because a synthetic demo does not satisfy that requirement — pretending it
does would be worse than an honest failure here.

To seed the real demo template:
  1. Obtain the real Spectora export for the assessment's template.
  2. Place it, unmodified, at sample-data/spectora/<filename>.xlsx
  3. Fill in sample-data/spectora/README.md (template name, export method,
     confirmation of no customer PII).
  4. Run: npm run seed

To exercise the demo mechanics locally before the real file exists (this
does NOT satisfy the requirement, and is clearly labeled as such wherever
it appears in the app):
  npm run seed -- --allow-synthetic
`);
}

function resolveSource(allowSynthetic: boolean): ResolvedSource | null {
  let entries: string[];
  try {
    entries = readdirSync(REAL_SAMPLE_DIR).filter((name) => {
      // Files only — a subdirectory (e.g. synthetic/) is never a candidate.
      return !name.startsWith(".") && name !== "synthetic" && name !== "README.md";
    });
  } catch {
    entries = [];
  }

  const classification = classifySampleFiles(entries);

  if (classification.kind === "ambiguous") {
    console.error(
      `Found ${classification.filenames.length} files in sample-data/spectora/: ` +
        `${classification.filenames.join(", ")}\n` +
        "An assessment submission should have exactly one real export. Remove the extras, " +
        "or move anything that isn't the real export under sample-data/spectora/synthetic/."
    );
    return null;
  }

  if (classification.kind === "single") {
    const buffer = readFileSync(path.join(REAL_SAMPLE_DIR, classification.filename));
    return { buffer, filename: classification.filename, kind: "real" };
  }

  if (allowSynthetic) {
    console.warn(
      "\n⚠ No real Spectora export found. Seeding the SYNTHETIC fixture instead, " +
        "clearly labeled, because --allow-synthetic was passed.\n" +
        "  This does NOT satisfy requirement 15/16. It exists only to exercise the\n" +
        "  demo mechanics (dashboard, report, editor, duplicate) locally.\n"
    );
    const buffer = readFileSync(SYNTHETIC_FIXTURE_PATH);
    return { buffer, filename: SYNTHETIC_DEMO_FILENAME, kind: "synthetic-demo" };
  }

  return null;
}

async function runSeed(client: ReturnType<typeof createServiceRoleClient>, source: ResolvedSource): Promise<void> {
  const sha256 = sha256HexOfBuffer(source.buffer);

  const existing = await findExistingSeededTemplate(client, sha256);
  if (existing) {
    console.log(
      `Already seeded — nothing to do.\n` +
        `  Template:   ${existing.templateId}\n` +
        `  Import run: ${existing.importRunId}\n` +
        `  Integrity:  ${existing.integrityStatus ?? "(pending)"}\n` +
        `Run "npm run seed -- --reset" first if you want to reseed from scratch.`
    );
    return;
  }

  console.log(
    `Seeding from ${source.kind === "real" ? "the real Spectora export" : "the synthetic fixture"}: ${source.filename}`
  );

  const result = await seedFromBuffer(client, { buffer: source.buffer, filename: source.filename });

  if (!result.success) {
    console.error(`\nSeed import failed: ${result.error}`);
    if (result.importRunId) {
      console.error(`(Recorded as failed import run ${result.importRunId} for inspection.)`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nSeeded successfully.\n` +
      `  Template:   ${result.templateId}\n` +
      `  Import run: ${result.importRunId}\n` +
      `  Sections/Items/Comments: ${result.counts.sections}/${result.counts.items}/${result.counts.comments}\n` +
      `  Integrity:  ${result.integrityStatus} — ${result.integritySummary}\n` +
      `  Issues:     ${result.issueCount}\n\n` +
      `Open the app at "/" — the seeded template should be the first thing a reviewer sees.`
  );

  if (source.kind === "synthetic-demo") {
    console.warn(
      "\n⚠ Reminder: this was seeded from SYNTHETIC data. It demonstrates the demo\n" +
        "  mechanics but does not satisfy assessment requirements 15/16. Reset it\n" +
        "  (npm run seed -- --reset --allow-synthetic) once the real export is added,\n" +
        "  then run a plain `npm run seed`.\n"
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const doReset = args.includes("--reset");
  const allowSynthetic = args.includes("--allow-synthetic");

  const source = resolveSource(allowSynthetic);

  if (!source) {
    if (doReset) {
      console.log("Nothing to reset — no source file resolved (real export absent, --allow-synthetic not passed).");
      return;
    }
    printBlocker();
    process.exitCode = 1;
    return;
  }

  let client;
  try {
    client = createServiceRoleClient();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
    process.exitCode = 1;
    return;
  }

  const sha256 = sha256HexOfBuffer(source.buffer);

  if (doReset) {
    const result = await resetSeededTemplate(client, sha256);
    if (result.failures.length > 0) {
      for (const failure of result.failures) console.error(failure);
      process.exitCode = 1;
    }
    console.log(
      `Reset complete: ${result.templatesDeleted} template(s), ${result.runsDeleted} import run(s) removed.`
    );
    return;
  }

  await runSeed(client, source);
}

main().catch((error) => {
  console.error("Unexpected error while seeding:", error);
  process.exitCode = 1;
});
