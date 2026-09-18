/**
 * Reusable workbook inspector — this is the "programmatically inspect it"
 * tool for docs/spectora-format.md. Run it against ANY .xlsx/.xls file,
 * real or synthetic:
 *
 *   npx tsx scripts/inspect-workbook.ts <path-to-file>
 *
 * It never assumes Spectora's exact layout — it reports what it finds
 * (sheet names, a plausible header row, detected column roles, row
 * patterns, HTML/link signals, blank rows, unusually long values) so a
 * human can decide what's real structure vs. what's specific to one file.
 *
 * IMPORTANT: this script only prints to stdout. When run against a real
 * customer export, review the output before pasting it anywhere — cell
 * text is echoed verbatim (truncated) and could contain real customer
 * content.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadWorkbook } from "../src/lib/import/workbook";
import { extractSheet } from "../src/lib/import/extract-rows";

const HTML_TAG_PATTERN = /<[a-z][\s\S]*?>/i;
const LINK_PATTERN = /<a\s+[^>]*href="([^"]*)"/gi;
const LONG_VALUE_THRESHOLD = 300;

function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/inspect-workbook.ts <path-to-xlsx>");
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  const buffer = readFileSync(resolved);
  const workbook = loadWorkbook(buffer);

  console.log(`\n=== Workbook: ${resolved} ===`);
  console.log(`Sheets: ${workbook.sheetNames.join(", ")}`);

  for (const sheetName of workbook.sheetNames) {
    const rawRows = workbook.sheets[sheetName];
    console.log(`\n--- Sheet "${sheetName}" ---`);
    console.log(`Row count: ${rawRows.length}`);

    console.log("First 5 raw rows:");
    rawRows.slice(0, 5).forEach((row, i) => {
      console.log(`  [${i}] ${row.map((c) => truncate(c, 60)).join(" | ")}`);
    });

    const extracted = extractSheet(sheetName, rawRows);
    if (!extracted) {
      console.log("No plausible header row found (needs >=2 of section/item/comment keywords).");
      continue;
    }

    console.log(`Detected header row index: ${extracted.headerRowIndex}`);
    console.log(
      `Detected column roles: ${Object.entries(extracted.columnRoles)
        .map(([role, index]) => `${role}=col${index}`)
        .join(", ")}`
    );

    let blankRows = 0;
    let unmappedContentRows = 0;
    let htmlCommentRows = 0;
    let linkCount = 0;
    let longValueRows = 0;
    const uniqueSections = new Set<string>();
    const uniqueLinks = new Set<string>();

    for (const row of extracted.rows) {
      const { section, item, comment } = row.cells;
      const hasMapped = Boolean(section || item || comment);
      if (!hasMapped && !row.hasUnmappedContent) blankRows++;
      if (row.hasUnmappedContent) unmappedContentRows++;
      if (section) uniqueSections.add(section.trim());

      if (comment) {
        if (HTML_TAG_PATTERN.test(comment)) htmlCommentRows++;
        LINK_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = LINK_PATTERN.exec(comment))) {
          linkCount++;
          uniqueLinks.add(m[1]);
        }
        if (comment.length > LONG_VALUE_THRESHOLD) longValueRows++;
      }
    }

    console.log(`Data rows: ${extracted.rows.length}`);
    console.log(`Blank/spacer rows: ${blankRows}`);
    console.log(`Rows with content outside mapped columns: ${unmappedContentRows}`);
    console.log(`Rows where comment contains HTML tags: ${htmlCommentRows}`);
    console.log(`Links found: ${linkCount} (${[...uniqueLinks].map((l) => truncate(l, 60)).join(", ") || "none"})`);
    console.log(`Comment values over ${LONG_VALUE_THRESHOLD} chars: ${longValueRows}`);
    console.log(`Distinct section names seen: ${uniqueSections.size} (${[...uniqueSections].join(", ")})`);
  }
}

main();
