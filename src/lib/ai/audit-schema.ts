import { z } from "zod";

/**
 * The contract a model's output must satisfy before any of it is shown.
 *
 * `.strict()` is doing real work here, not tidiness. It is the mechanism that
 * rejects a model returning replacement template content, invented sections,
 * corrected counts, or "here's the SQL to fix it" — any key not listed below
 * fails validation outright, and a failed validation shows nothing. The model
 * therefore has no field through which it could smuggle a change to the
 * migration, even if it tried.
 *
 * Note what is absent by design: no counts, no status, no pass/fail. Those are
 * the deterministic engine's to state, and the AI is not given a slot to
 * disagree with them.
 */
export const AiAuditOutputSchema = z
  .object({
    /** Plain-language restatement of the deterministic result, for a non-technical inspector. */
    summary: z.string().trim().min(1).max(1200),
    /** The model's read of how much attention this import needs. Advisory only. */
    riskLevel: z.enum(["low", "medium", "high"]),
    /** Must be a subset of the issue ids supplied in the payload — enforced separately. */
    recommendedIssueIds: z.array(z.string().trim().min(1)).max(50),
    /** What the person should actually do next. */
    reviewMessage: z.string().trim().min(1).max(800),
    /** Which of the known limitations are relevant here. */
    limitationsMentioned: z.array(z.string().trim().min(1)).max(20),
  })
  .strict();

export type AiAuditOutput = z.infer<typeof AiAuditOutputSchema>;

export type AuditValidationFailure =
  | { kind: "unparseable"; detail: string }
  | { kind: "schema"; detail: string }
  | { kind: "unknown_issue_ids"; detail: string; unknownIds: string[] };

export type AuditValidationResult =
  | { ok: true; output: AiAuditOutput }
  | { ok: false; failure: AuditValidationFailure };

/**
 * Parses and validates a raw model response.
 *
 * Two gates, both of which must pass:
 *   1. The shape matches the strict schema (nothing extra, nothing missing).
 *   2. Every recommended issue id was one we actually supplied.
 *
 * Gate 2 exists because a recommendation pointing at a fabricated id is worse
 * than no recommendation: it sends someone looking for a problem that doesn't
 * exist, and it's the clearest possible signal the output isn't grounded. We
 * reject the whole response rather than silently filtering the bad ids, since
 * a model inventing an id has already demonstrated it isn't tracking the data
 * it was given, which makes the prose suspect too.
 */
export function validateAuditOutput(raw: unknown, allowedIssueIds: string[]): AuditValidationResult {
  const parsed = AiAuditOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        kind: "schema",
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; "),
      },
    };
  }

  const allowed = new Set(allowedIssueIds);
  const unknownIds = parsed.data.recommendedIssueIds.filter((id) => !allowed.has(id));
  if (unknownIds.length > 0) {
    return {
      ok: false,
      failure: {
        kind: "unknown_issue_ids",
        detail: `Response referenced ${unknownIds.length} issue id(s) that were not supplied.`,
        unknownIds,
      },
    };
  }

  return { ok: true, output: parsed.data };
}

/** Extracts JSON from a model response, tolerating a ```json fence. */
export function parseModelJson(text: string): { ok: true; value: unknown } | { ok: false; detail: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Response was not valid JSON." };
  }
}
