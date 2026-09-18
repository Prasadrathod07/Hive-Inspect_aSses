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
  /** Rich-text markup outside the sanitizer allowlist was stripped; surrounding text kept. */
  "unsupported_formatting",
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
});
export type ImportIssueCandidate = z.infer<typeof ImportIssueCandidateSchema>;

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
