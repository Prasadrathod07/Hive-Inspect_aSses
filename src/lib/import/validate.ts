import { CanonicalTemplateSchema, type CanonicalTemplate } from "./types";

/**
 * Stage 6 (docs/architecture.md §2.7): the schema-validation gate every
 * canonical template must pass before it's allowed near persistence.
 */
export type ValidationResult =
  | { success: true; data: CanonicalTemplate }
  | { success: false; errors: string[] };

export function validateCanonicalTemplate(input: unknown): ValidationResult {
  const result = CanonicalTemplateSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
