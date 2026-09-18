import type { IntegrityResult } from "./types";

/**
 * Human-readable rendering of an IntegrityResult, matching the report
 * format this engine was specified against. A thin presentation layer over
 * already-computed data — it doesn't decide anything itself.
 */
export function formatIntegrityReport(result: IntegrityResult): string {
  const lines: string[] = [];

  lines.push("Import Integrity");
  lines.push(result.summary);
  lines.push("");

  lines.push("Structure");
  lines.push(`${result.structure.sections.persisted} / ${result.structure.sections.source} sections`);
  lines.push(`${result.structure.items.persisted} / ${result.structure.items.source} items`);
  lines.push(`${result.structure.comments.persisted} / ${result.structure.comments.source} comments`);
  lines.push("");

  lines.push("Source coverage");
  lines.push(`${result.sourceCoverage.meaningfulSourceRows} meaningful rows`);
  lines.push(`${result.sourceCoverage.mappedRows} mapped`);
  if (result.sourceCoverage.unsupportedRows > 0) {
    lines.push(`${result.sourceCoverage.unsupportedRows} preserved as unsupported`);
  }
  if (result.sourceCoverage.ignoredRowsWithReason > 0) {
    lines.push(`${result.sourceCoverage.ignoredRowsWithReason} intentionally ignored with reason`);
  }
  lines.push(`${result.sourceCoverage.unaccountedRows} unaccounted`);
  lines.push("");

  lines.push(`Ordering: ${result.ordering.status}`);
  lines.push(`Text preservation: ${result.textPreservation.status}`);
  lines.push(`Links: ${result.links.preservedLinks} / ${result.links.sourceLinks}`);
  lines.push(`Formatting differences: ${result.formattingWarnings.length}`);
  if (result.structuralWarnings.length > 0) {
    lines.push(`Structural warnings (content dropped for a specific, recorded reason): ${result.structuralWarnings.length}`);
  }

  if (result.reviewRequired) {
    lines.push("");
    lines.push("REVIEW REQUIRED — see details above before trusting this import.");
  }

  return lines.join("\n");
}
