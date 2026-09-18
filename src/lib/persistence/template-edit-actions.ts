"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import { UpdateNameSchema, UpdateCommentSchema, prepareCommentUpdate } from "./template-edit-validation";
import { toAppError, formatAppError } from "@/lib/errors/app-error";

export type EditActionResult = { success: true } | { success: false; error: string };

/**
 * Validation messages are authored for people and pass through as-is. Anything
 * from Postgres or the client library is mapped to a safe message, with the
 * real detail logged server-side — these results are rendered in the browser.
 */
function toErrorResult(error: unknown, context: string): EditActionResult {
  return { success: false, error: formatAppError(toAppError(error, context, "save_failed")) };
}

export async function updateSectionName(
  templateId: string,
  sectionId: string,
  name: string
): Promise<EditActionResult> {
  const parsed = UpdateNameSchema.safeParse({ id: sectionId, name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  try {
    const client = createServiceRoleClient();
    const { error } = await client.from("sections").update({ name: parsed.data.name }).eq("id", parsed.data.id);
    if (error) return toErrorResult(error, "updateSectionName");
  } catch (error) {
    // Client construction (e.g. missing credentials) throws rather than
    // rejecting — caught here so the caller always gets a typed result,
    // never an unhandled rejection that leaves the UI stuck on "Saving…".
    return toErrorResult(error, "updateSectionName");
  }

  revalidatePath(`/templates/${templateId}`);
  return { success: true };
}

export async function updateItemName(
  templateId: string,
  itemId: string,
  name: string
): Promise<EditActionResult> {
  const parsed = UpdateNameSchema.safeParse({ id: itemId, name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  try {
    const client = createServiceRoleClient();
    const { error } = await client.from("items").update({ name: parsed.data.name }).eq("id", parsed.data.id);
    if (error) return toErrorResult(error, "updateItemName");
  } catch (error) {
    return toErrorResult(error, "updateItemName");
  }

  revalidatePath(`/templates/${templateId}`);
  return { success: true };
}

export async function updateCommentContent(
  templateId: string,
  commentId: string,
  html: string
): Promise<EditActionResult> {
  const parsed = UpdateCommentSchema.safeParse({ id: commentId, html });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const prepared = prepareCommentUpdate(parsed.data.html);

  try {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("comments")
      .update({
        plain_text: prepared.plainText,
        safe_html: prepared.safeHtml,
        link_metadata: prepared.linkMetadata,
      })
      .eq("id", parsed.data.id);
    if (error) return toErrorResult(error, "updateCommentContent");
  } catch (error) {
    return toErrorResult(error, "updateCommentContent");
  }

  revalidatePath(`/templates/${templateId}`);
  return { success: true };
}
