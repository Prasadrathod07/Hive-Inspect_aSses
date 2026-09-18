"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { toAppError, formatAppError } from "@/lib/errors/app-error";

/**
 * Level B ("Fix Safely") — docs/architecture.md §5a. Applies exactly the
 * proposed replacement content computed and shown to the reviewer at import
 * time (`import_issues.proposed_plain_text`/`proposed_safe_html`), never a
 * value re-derived here — what gets applied is provably identical to what
 * was previewed.
 *
 * `apply_issue_fix` (supabase/migrations/20260918000000_safe_normalization.sql)
 * is one Postgres function call, so the comment update and the issue's
 * resolution commit together or not at all — same atomicity posture as
 * `import_template`/`duplicate_template` (docs/decision-log.md D7).
 */
export async function applySafeFix(
  issueId: string,
  importRunId: string,
  templateId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const client = createServiceRoleClient();
    const { error } = await client.rpc("apply_issue_fix", { p_issue_id: issueId });

    if (error) {
      return { success: false, error: formatAppError(toAppError(error, "applySafeFix", "save_failed")) };
    }
  } catch (error) {
    // Client construction (e.g. missing credentials) throws rather than
    // rejecting — caught here so the caller always gets a typed result.
    return { success: false, error: formatAppError(toAppError(error, "applySafeFix", "save_failed")) };
  }

  revalidatePath(`/imports/${importRunId}/issues`);
  revalidatePath(`/templates/${templateId}/import-report`);
  revalidatePath(`/templates/${templateId}`);
  return { success: true };
}
