import { z } from "zod";

/**
 * Canonical import domain model (docs/architecture.md §2.6, §3).
 *
 * This is the structured, typed shape every stage of the import pipeline
 * produces or consumes — never an HTML blob. Zod schemas are the runtime
 * validation gate (architecture §2.7); the inferred TS types are what the
 * rest of the app codes against.
 */

export const SourceRefSchema = z.object({
  /** Sheet name the row/cell came from. */
  sheet: z.string(),
  /** 1-indexed spreadsheet row number, as a human would see it in Excel. */
  rowNumber: z.number().int().nonnegative(),
  /** Optional column label/letter for cell-level precision. */
  column: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const LinkMetadataSchema = z.object({
  href: z.string(),
  text: z.string(),
});
export type LinkMetadata = z.infer<typeof LinkMetadataSchema>;

export const CanonicalCommentSchema = z.object({
  id: z.string(),
  /** Always the verbatim text content, HTML tags stripped — never lossy re-summarization. */
  plainText: z.string(),
  /**
   * Sanitized rich-text HTML (docs/architecture.md §5 allowlist), or null
   * when the source had no rich formatting to preserve beyond plain text.
   */
  safeHtml: z.string().nullable(),
  position: z.number().int().nonnegative(),
  sourceRef: SourceRefSchema,
  linkMetadata: z.array(LinkMetadataSchema).optional(),
});
export type CanonicalComment = z.infer<typeof CanonicalCommentSchema>;

export const CanonicalItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  sourceRef: SourceRefSchema,
  comments: z.array(CanonicalCommentSchema),
});
export type CanonicalItem = z.infer<typeof CanonicalItemSchema>;

export const CanonicalSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  sourceRef: SourceRefSchema,
  items: z.array(CanonicalItemSchema),
});
export type CanonicalSection = z.infer<typeof CanonicalSectionSchema>;

export const TemplateNameSourceSchema = z.enum([
  "explicit-cell",
  "sheet-name",
  "filename",
  "fallback",
]);
export type TemplateNameSource = z.infer<typeof TemplateNameSourceSchema>;

export const SourceMetadataSchema = z.object({
  sourceFilename: z.string(),
  sheetNames: z.array(z.string()),
  /** Where the template's display name was derived from — see docs/spectora-format.md. */
  templateNameSource: TemplateNameSourceSchema,
  /** ISO timestamp supplied by the caller, so the parser itself stays a pure function. */
  importedAt: z.string(),
});
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;

export const CanonicalTemplateSchema = z.object({
  name: z.string(),
  sourceMetadata: SourceMetadataSchema,
  sections: z.array(CanonicalSectionSchema),
});
export type CanonicalTemplate = z.infer<typeof CanonicalTemplateSchema>;

/**
 * Categories a parser stage can flag. These are candidates: the parser's
 * best account of what it saw and couldn't fully handle. The (future)
 * deterministic integrity engine is what turns candidates into the
 * persisted, authoritative import report — this type is not that report.
 */
export const ImportIssueCategorySchema = z.enum([
  /** Row content didn't match the recognized section/item/comment columns at all. */
  "unrecognized_row",
  /**
   * Rich-text markup outside the sanitizer allowlist was stripped; surrounding
   * text kept. Level C (manual review) — no deterministic fix is offered,
   * because the markup removed could carry meaning we can't safely infer
   * (a table, an image, an unknown widget, or a wrapper with attributes we
   * can't prove are cosmetic).
   */
  "unsupported_formatting",
  /**
   * Level B ("Fix Safely" — docs/architecture.md §5a). Content that could not
   * be silently normalized (Level A) but has a deterministic, PROVEN
   * text-preserving replacement available. Never auto-applied; a reviewer
   * confirms via a before/after preview on the Issue Review page. Distinct
   * from `unsupported_formatting`, which has no such proof and stays a
   * manual-review-only case.
   */
  "recoverable_formatting",
  /** A link had a missing/unsafe scheme and was dropped from the rich text. */
  "unsupported_link",
  /** A comment/item appeared before its required parent existed in the row order. */
  "ambiguous_hierarchy",
  /** The workbook itself couldn't be read or structurally understood at all. */
  "malformed_workbook",
  "other",
]);
export type ImportIssueCategory = z.infer<typeof ImportIssueCategorySchema>;

export const ImportIssueSeveritySchema = z.enum([
  /** Cosmetic — content was still fully preserved. */
  "info",
  /** Content was partially preserved or needs a human look. */
  "warning",
  /** The row/file could not be imported at all. */
  "blocking",
]);
export type ImportIssueSeverity = z.infer<typeof ImportIssueSeveritySchema>;

export const ImportIssueCandidateSchema = z.object({
  category: ImportIssueCategorySchema,
  severity: ImportIssueSeveritySchema,
  sourceRef: SourceRefSchema,
  explanation: z.string(),
  /** Original, untransformed source text this issue refers to (truncated for storage). */
  rawSnippet: z.string(),
  /** What (if anything) was actually imported despite the issue; null if nothing was. */
  importedPreview: z.string().nullable(),
  /**
   * Level B only (`category: "recoverable_formatting"`). True when a
   * deterministic transform exists whose plain text is PROVEN — by exact
   * whitespace-normalized comparison at the time this candidate was created,
   * see `src/lib/import/rich-content.ts` — to preserve every word of the raw
   * source. Absent/false for every other category; never auto-applied.
   * Optional (not `.default()`) so every other issue-construction site in
   * the codebase, none of which is Level B, is unaffected by this field's
   * addition.
   */
  fixSafelyAvailable: z.boolean().optional(),
  /** The proposed replacement plain text, only set when fixSafelyAvailable is true. */
  proposedPlainText: z.string().nullable().optional(),
  /** The proposed replacement rich HTML, only set when fixSafelyAvailable is true. */
  proposedSafeHtml: z.string().nullable().optional(),
});
export type ImportIssueCandidate = z.infer<typeof ImportIssueCandidateSchema>;

/**
 * Level A — silent, automatic, meaning-preserving normalization
 * (docs/architecture.md §5a "Safe Normalization Policy"). Never shown to the
 * customer as a warning; recorded purely for internal traceability so
 * "silent" never means "untraceable." One event per detected transform per
 * comment field — not one per character/tag — so this stays a proportionate
 * audit trail, not noise.
 */
export const NormalizationEventTypeSchema = z.enum([
  "whitespace_trimmed",
  "duplicate_whitespace_collapsed",
  "empty_tag_removed",
  "harmless_wrapper_removed",
  "line_break_normalized",
  "html_entity_decoded",
  "formatting_normalized",
  "safe_link_normalized",
]);
export type NormalizationEventType = z.infer<typeof NormalizationEventTypeSchema>;

export const NormalizationEventSchema = z.object({
  type: NormalizationEventTypeSchema,
  sourceRef: SourceRefSchema,
  /** SHA-256 of the raw source field before this normalization pass. */
  beforeHash: z.string(),
  /** SHA-256 of the imported plain text + safe HTML after normalization. */
  afterHash: z.string(),
  description: z.string(),
  /** Always true — a human-applied "Fix Safely" resolution is a separate, explicit action, never one of these. */
  automatic: z.literal(true),
});
export type NormalizationEvent = z.infer<typeof NormalizationEventSchema>;

/**
 * One entry per "meaningful" source row (docs/spectora-format.md assumption
 * 6 — pure blank spacer rows are excluded, since they carry no content to
 * account for). This is the input the Import Integrity Engine
 * (src/lib/integrity/) reconciles against the canonical template and the
 * issue candidates to compute source-row coverage — every meaningful row
 * must end up mapped, unsupported, or intentionally ignored with a reason;
 * none may simply disappear.
 */
export const SourceRowRecordSchema = z.object({
  sourceRef: SourceRefSchema,
});
export type SourceRowRecord = z.infer<typeof SourceRowRecordSchema>;
