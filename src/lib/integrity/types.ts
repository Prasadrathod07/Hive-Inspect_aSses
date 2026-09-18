import { z } from "zod";
import { SourceRefSchema } from "@/lib/import/types";

/**
 * The Import Integrity Engine's output contract. THIS IS NOT AI — every
 * field here is computed by deterministic comparison and arithmetic over
 * the parsed template, the persisted template, the issue candidates, and
 * the source-row records. No model call anywhere in this file or in
 * compute-integrity.ts.
 *
 * Deliberately no single "trust score." Four honest, discrete statuses
 * instead — see docs/decision-log.md D9 for why.
 */
export const IntegrityStatusSchema = z.enum([
  /** Everything reconciled with zero warnings of any kind. */
  "verified",
  /** Nothing unaccounted for, but some content is known-unsupported/reviewed. */
  "verified_with_warnings",
  /** At least one meaningful source row could not be accounted for at all. */
  "review_required",
  /** The persisted template itself doesn't match what was parsed — a persistence bug, not a source limitation. */
  "failed",
]);
export type IntegrityStatus = z.infer<typeof IntegrityStatusSchema>;

export const StructureCountSchema = z.object({
  source: z.number().int().nonnegative(),
  persisted: z.number().int().nonnegative(),
  match: z.boolean(),
});
export type StructureCount = z.infer<typeof StructureCountSchema>;

export const StructureCountsSchema = z.object({
  sections: StructureCountSchema,
  items: StructureCountSchema,
  comments: StructureCountSchema,
});
export type StructureCounts = z.infer<typeof StructureCountsSchema>;

export const OrderingResultSchema = z.object({
  status: z.enum(["verified", "mismatch"]),
  mismatches: z.array(z.string()),
});
export type OrderingResult = z.infer<typeof OrderingResultSchema>;

export const TextMismatchSchema = z.object({
  sourceRef: SourceRefSchema,
  reason: z.string(),
});
export type TextMismatch = z.infer<typeof TextMismatchSchema>;

export const TextPreservationResultSchema = z.object({
  status: z.enum(["verified", "mismatch"]),
  /** How many section/item/comment nodes were actually compared (pairs that existed on both sides). */
  comparedCount: z.number().int().nonnegative(),
  mismatches: z.array(TextMismatchSchema),
});
export type TextPreservationResult = z.infer<typeof TextPreservationResultSchema>;

export const LinkMismatchSchema = z.object({
  sourceRef: SourceRefSchema,
  reason: z.string(),
});
export type LinkMismatch = z.infer<typeof LinkMismatchSchema>;

export const LinkPreservationResultSchema = z.object({
  sourceLinks: z.number().int().nonnegative(),
  preservedLinks: z.number().int().nonnegative(),
  mismatches: z.array(LinkMismatchSchema),
});
export type LinkPreservationResult = z.infer<typeof LinkPreservationResultSchema>;

export const FormattingWarningSchema = z.object({
  sourceRef: SourceRefSchema,
  explanation: z.string(),
});
export type FormattingWarning = z.infer<typeof FormattingWarningSchema>;

/**
 * Source-row coverage (the core "nothing disappeared silently" proof).
 * mappedRows + unsupportedRows + ignoredRowsWithReason + unaccountedRows
 * always equals meaningfulSourceRows — every meaningful row is classified,
 * with no fourth silent bucket.
 */
export const SourceRowCoverageSchema = z.object({
  meaningfulSourceRows: z.number().int().nonnegative(),
  mappedRows: z.number().int().nonnegative(),
  unsupportedRows: z.number().int().nonnegative(),
  ignoredRowsWithReason: z.number().int().nonnegative(),
  unaccountedRows: z.number().int().nonnegative(),
  /** Exactly which rows are unaccounted for — never just a count when the count is nonzero. */
  unaccountedSourceRefs: z.array(SourceRefSchema),
  /**
   * Exactly which rows are genuinely unsupported (produced no mapped node at
   * all). Lets a presentation layer distinguish this from a row that DID map
   * successfully but also carries an informational issue (e.g. extra
   * unmodeled columns) — the same `unrecognized_row` category covers both,
   * but only rows in this list represent an actual mapping gap.
   */
  unsupportedSourceRefs: z.array(SourceRefSchema),
});
export type SourceRowCoverage = z.infer<typeof SourceRowCoverageSchema>;

export const IntegrityResultSchema = z.object({
  status: IntegrityStatusSchema,
  /** One-line, human-readable headline — never a percentage or an opaque score. */
  summary: z.string(),
  /** True whenever a human should look before trusting this import (review_required or failed). */
  reviewRequired: z.boolean(),
  structure: StructureCountsSchema,
  ordering: OrderingResultSchema,
  textPreservation: TextPreservationResultSchema,
  links: LinkPreservationResultSchema,
  formattingWarnings: z.array(FormattingWarningSchema),
  /**
   * One entry per `ambiguous_hierarchy` issue — content that couldn't be
   * placed in the tree due to its position in the row order. Tracked
   * separately from sourceCoverage.ignoredRowsWithReason: a row can create
   * a new section successfully (so the ROW counts as "mapped") while its
   * own comment is still dropped for this reason — this field is what
   * keeps that dropped comment from disappearing into the "mapped" count.
   */
  structuralWarnings: z.array(FormattingWarningSchema),
  sourceCoverage: SourceRowCoverageSchema,
  generatedAt: z.string(),
});
export type IntegrityResult = z.infer<typeof IntegrityResultSchema>;
