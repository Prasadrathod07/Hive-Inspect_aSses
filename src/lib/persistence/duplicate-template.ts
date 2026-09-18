"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { getEditableTemplate } from "./get-editable-template";
import { verifyDuplicateIndependence } from "./verify-duplicate-independence";
import { DuplicateTemplateSchema, DuplicateRpcResultSchema } from "./duplicate-template-validation";

export type DuplicateTemplateResult =
  | {
      success: true;
      templateId: string;
      name: string;
      counts: { sections: number; items: number; comments: number };
      /**
       * False only if the post-copy re-read found the copy sharing rows with
       * the original — a bug, not an expected outcome. Surfaced rather than
       * swallowed; the copy still exists and is returned either way.
       */
      independenceVerified: boolean;
      independenceSummary: string;
    }
  | { success: false; error: string };

/**
 * Duplicates a template into a fully independent copy.
 *
 * The copy itself is made by one call to the `duplicate_template` Postgres
 * function — one function body, one implicit transaction, so a failure part
 * way through rolls back every row it wrote, including the new template row
 * (docs/decision-log.md D7). There is no compensating-delete cleanup path
 * because there is never a half-duplicated template to clean up.
 *
 * After the write commits, both templates are re-read and compared
 * (`verifyDuplicateIndependence`) — the same "don't trust the write, check
 * it" posture the import pipeline uses.
 */
export async function duplicateTemplate(
  sourceTemplateId: string,
  name: string
): Promise<DuplicateTemplateResult> {
  const parsed = DuplicateTemplateSchema.safeParse({ sourceTemplateId, name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid duplication request." };
  }

  try {
    const client = createServiceRoleClient();

    const { data, error } = await client.rpc("duplicate_template", {
      source_template_id: parsed.data.sourceTemplateId,
      new_name: parsed.data.name,
    });

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "duplicate_template returned no data." };

    const rpcResult = DuplicateRpcResultSchema.safeParse(data);
    if (!rpcResult.success) {
      return { success: false, error: "duplicate_template returned an unexpected shape." };
    }

    const [original, copy] = await Promise.all([
      getEditableTemplate(parsed.data.sourceTemplateId),
      getEditableTemplate(rpcResult.data.template_id),
    ]);

    let independenceVerified = false;
    let independenceSummary = "Could not re-read both templates to verify independence.";

    if (original && copy) {
      const verification = verifyDuplicateIndependence(original, copy);
      independenceVerified = verification.independent;
      independenceSummary = verification.independent
        ? `Verified independent: ${verification.copiedNodeCount} copied rows, none shared with the original.`
        : verification.violations.map((violation) => violation.detail).join(" ");
    }

    revalidatePath("/");

    return {
      success: true,
      templateId: rpcResult.data.template_id,
      name: rpcResult.data.name,
      counts: {
        sections: rpcResult.data.section_count,
        items: rpcResult.data.item_count,
        comments: rpcResult.data.comment_count,
      },
      independenceVerified,
      independenceSummary,
    };
  } catch (error) {
    // Client construction and RPC exceptions both land here, so the caller
    // always gets a typed result rather than an unhandled rejection.
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to duplicate this template.",
    };
  }
}
