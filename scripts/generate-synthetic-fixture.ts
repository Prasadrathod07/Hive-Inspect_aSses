/**
 * Generates tests/fixtures/synthetic-spectora-like.xlsx — a SYNTHETIC,
 * hand-authored fixture used only for engineering scaffolding. It is NOT a
 * real Spectora export and must never be treated as one. See
 * docs/spectora-format.md for why it exists and what it deliberately does
 * and does not prove about the real format.
 *
 * Run with: npx tsx scripts/generate-synthetic-fixture.ts
 */
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Row 0 is a preamble row (no recognizable header keywords) — real exports
// may have a title/notes row above the header, so the fixture deliberately
// includes one to exercise that the parser scans past it.
const rows: string[][] = [
  ["SYNTHETIC TEST FIXTURE — NOT A REAL SPECTORA EXPORT", "", "", ""],
  ["Section", "Item", "Comment (HTML)", "Photos"],
  ["Roof", "Shingles", "<p>Shingles are in <b>good</b> condition overall.</p>", ""],
  [
    "",
    "Gutters",
    'Minor <i>debris</i> noted;<br>recommend cleaning. See <a href="https://example.com/gutter-guide">manufacturer guidance</a>.',
    "",
  ],
  [
    "",
    "",
    "Additional note: <ul><li>Downspout partially detached</li><li>Recommend resecuring</li></ul>",
    "",
  ],
  ["", "", "", ""], // pure spacer row — must be skipped without becoming an issue
  [
    "Plumbing",
    "Water Heater",
    "<p>Unit is functional. <script>alert('unsupported tag')</script> Recommend annual flushing.</p>",
    "",
  ],
  ["", "Water Heater", '<p>See spec sheet: <a href="javascript:alert(1)">click here</a></p>', ""],
  ["", "Fixtures", "", "3"], // mapped item + unmapped "Photos" value, no comment (absent in source)
  [
    "Electrical",
    "",
    "<p>Panel is a mix of breaker types; further evaluation by a licensed electrician recommended.</p>",
    "",
  ], // comment with no item yet in a brand-new section — deliberately ambiguous
  ["", "Panel", "<p>200A panel observed. Condition acceptable.</p>", ""],
];

const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

const outPath = path.resolve(__dirname, "../tests/fixtures/synthetic-spectora-like.xlsx");
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
writeFileSync(outPath, buffer);

console.log(`Wrote synthetic fixture to ${outPath}`);
