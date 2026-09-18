import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkMetadata } from "@/lib/import/types";

/**
 * The "re-read persisted template" step (docs/architecture.md §2.9-§2.10).
 * This is the only function in the persistence layer that touches the
 * database for verification purposes — the actual comparison logic lives
 * in src/lib/integrity/ (the Import Integrity Engine) and is pure/unit-tested.
 */

export interface PersistedComment {
  plain_text: string;
  safe_html: string | null;
  position: number;
  link_metadata: LinkMetadata[] | null;
}
export interface PersistedItem {
  name: string;
  position: number;
  comments: PersistedComment[];
}
export interface PersistedSection {
  name: string;
  position: number;
  items: PersistedItem[];
}
export interface PersistedTemplate {
  id: string;
  name: string;
  sections: PersistedSection[];
}

export async function readPersistedTemplate(
  client: SupabaseClient,
  templateId: string
): Promise<PersistedTemplate> {
  // The DB column is order_index (see the migration's note on avoiding the
  // "position" reserved word); aliased back to `position` here so the rest
  // of the codebase can use the same field name as the canonical TS model.
  const { data, error } = await client
    .from("templates")
    .select(
      "id, name, sections(name, position:order_index, items(name, position:order_index, comments(plain_text, safe_html, position:order_index, link_metadata)))"
    )
    .eq("id", templateId)
    .order("order_index", { referencedTable: "sections" })
    .order("order_index", { referencedTable: "sections.items" })
    .order("order_index", { referencedTable: "sections.items.comments" })
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to re-read persisted template ${templateId}: ${error?.message ?? "not found"}`
    );
  }

  return data as unknown as PersistedTemplate;
}
