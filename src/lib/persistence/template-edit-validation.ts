import { z } from "zod";
import { processRichContent } from "@/lib/import/rich-content";
import type { LinkMetadata } from "@/lib/import/types";

/**
 * Pure validation + transformation for template edits. No I/O here — fully
 * unit-testable without a database, mirroring the parser's own pure/impure
 * split (docs/architecture.md).
 */

/**
 * Every id in this schema is a Postgres `uuid`, so anything that isn't one is
 * invalid by definition. Rejecting it here means a tampered or stale id fails
 * with a clear message instead of an opaque database type error.
 */
const IdSchema = z.uuid("Invalid id.");

export const UpdateNameSchema = z.object({
  id: IdSchema,
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty.")
    .max(500, "Name is too long (max 500 characters)."),
});
export type UpdateNameInput = z.infer<typeof UpdateNameSchema>;

export const UpdateCommentSchema = z.object({
  id: IdSchema,
  html: z.string().max(50_000, "Comment is too long (max 50,000 characters)."),
});
export type UpdateCommentInput = z.infer<typeof UpdateCommentSchema>;

export interface PreparedCommentUpdate {
  plainText: string;
  safeHtml: string | null;
  linkMetadata: LinkMetadata[] | null;
}

/**
 * Sanitizes edited comment HTML through the exact same allowlist the
 * importer uses (src/lib/import/rich-content.ts) and derives plain_text
 * from the result — the same pipeline stage, reused, so edited content is
 * held to the same standard as imported content, not a looser one.
 */
export function prepareCommentUpdate(html: string): PreparedCommentUpdate {
  const trimmed = html.trim();
  if (!trimmed) {
    return { plainText: "", safeHtml: null, linkMetadata: null };
  }

  const { safeHtml, plainText, links } = processRichContent(trimmed);
  return {
    plainText,
    safeHtml: safeHtml || null,
    linkMetadata: links.length > 0 ? links : null,
  };
}
