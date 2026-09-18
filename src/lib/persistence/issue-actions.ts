"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import type { IssueResolutionStatus } from "./types";

/**
 * Human-set review state only — 'open' and 'accepted' are the two states a
 * reviewer can toggle between here. 'resolved' is reserved for when a
 * future template-edit flow actually fixes the underlying content; nothing
 * in this action sets it, so it never appears as if editing already exists.
 */
export async function setIssueResolutionStatus(
  issueId: string,
  status: Extract<IssueResolutionStatus, "open" | "accepted">,
  importRunId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("import_issues")
      .update({ resolution_status: status })
      .eq("id", issueId);

    if (error) {
      return { success: false, error: error.message };
    }
  } catch (error) {
    // Client construction (e.g. missing credentials) throws rather than
    // rejecting — caught here so the caller always gets a typed result.
    return { success: false, error: error instanceof Error ? error.message : "Failed to update issue status." };
  }

  revalidatePath(`/imports/${importRunId}/issues`);
  return { success: true };
}
