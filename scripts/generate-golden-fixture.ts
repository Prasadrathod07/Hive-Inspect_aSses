/**
 * Regenerates tests/fixtures/synthetic-spectora-like.expected.json — the
 * golden canonical output for the synthetic fixture, produced BY the
 * parser itself (not hand-typed) using a deterministic ID generator and a
 * fixed importedAt timestamp, so the file is fully reproducible.
 *
 * parse-workbook.test.ts re-runs the parser with the same deterministic
 * inputs and deep-equals the result against this file. If you change
 * parser behavior on purpose, regenerate this file and review the diff —
 * that diff IS the change under review, which is the point of a golden file.
 *
 * Run with: npx tsx scripts/generate-golden-fixture.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseSpectoraWorkbook } from "../src/lib/import/parse-workbook";
import { createSequentialIdGenerator } from "../src/lib/import/id-generator";

const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/synthetic-spectora-like.xlsx");
const GOLDEN_PATH = path.resolve(__dirname, "../tests/fixtures/synthetic-spectora-like.expected.json");

const buffer = readFileSync(FIXTURE_PATH);
const result = parseSpectoraWorkbook({
  buffer,
  filename: "synthetic-spectora-like.xlsx",
  importedAt: "2026-01-01T00:00:00.000Z",
  generateId: createSequentialIdGenerator("synthetic"),
});

writeFileSync(GOLDEN_PATH, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote golden fixture to ${GOLDEN_PATH}`);
