import { z } from "zod";

/**
 * Pure validation + naming for template duplication. Deliberately in its own
 * module (no `server-only`, no "use server") so the dialog can reuse
 * `deriveCopyName` client-side for the proposed name, and so the schema is
 * unit-testable on its own.
 */

export const MAX_TEMPLATE_NAME_LENGTH = 500;
export const COPY_NAME_SUFFIX = " — Copy";

/**
 * "[Original Name] — Copy", truncated if needed so the result still fits the
 * same length limit every other name edit is held to.
 */
export function deriveCopyName(originalName: string): string {
  const base = originalName.trim();
  const available = MAX_TEMPLATE_NAME_LENGTH - COPY_NAME_SUFFIX.length;
  const truncated = base.length > available ? base.slice(0, available).trimEnd() : base;
  return `${truncated}${COPY_NAME_SUFFIX}`;
}

export const DuplicateTemplateSchema = z.object({
  sourceTemplateId: z.string().min(1, "Missing template id."),
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty.")
    .max(MAX_TEMPLATE_NAME_LENGTH, `Name is too long (max ${MAX_TEMPLATE_NAME_LENGTH} characters).`),
});
export type DuplicateTemplateInput = z.infer<typeof DuplicateTemplateSchema>;

/** Shape the `duplicate_template` Postgres function returns; validated before it's trusted. */
export const DuplicateRpcResultSchema = z.object({
  template_id: z.string(),
  parent_template_id: z.string(),
  name: z.string(),
  section_count: z.number().int().nonnegative(),
  item_count: z.number().int().nonnegative(),
  comment_count: z.number().int().nonnegative(),
});
export type DuplicateRpcResult = z.infer<typeof DuplicateRpcResultSchema>;
