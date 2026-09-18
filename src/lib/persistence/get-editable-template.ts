import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import type { LinkMetadata } from "@/lib/import/types";

export interface EditableSourceRef {
  sheet: string;
  rowNumber: number;
}

export interface EditableComment {
  id: string;
  plainText: string;
  safeHtml: string | null;
  position: number;
  sourceRef: EditableSourceRef;
  linkMetadata: LinkMetadata[] | null;
}

export interface EditableItem {
  id: string;
  name: string;
  position: number;
  sourceRef: EditableSourceRef;
  comments: EditableComment[];
}

export interface EditableSection {
  id: string;
  name: string;
  position: number;
  sourceRef: EditableSourceRef;
  items: EditableItem[];
}

export interface EditableTemplate {
  id: string;
  name: string;
  sourceFilename: string;
  importRunId: string | null;
  /** Set when this template was created by duplicating another one — lineage, not a fresh import. */
  parentTemplateId: string | null;
  sections: EditableSection[];
}

interface RawComment {
  id: string;
  plain_text: string;
  safe_html: string | null;
  position: number;
  source_sheet: string;
  source_row_number: number;
  link_metadata: LinkMetadata[] | null;
}
interface RawItem {
  id: string;
  name: string;
  position: number;
  source_sheet: string;
  source_row_number: number;
  comments: RawComment[];
}
interface RawSection {
  id: string;
  name: string;
  position: number;
  source_sheet: string;
  source_row_number: number;
  items: RawItem[];
}

/** Server-only read for the template editor. Returns null if the template doesn't exist. */
export async function getEditableTemplate(templateId: string): Promise<EditableTemplate | null> {
  const client = createServiceRoleClient();

  const { data: template, error: templateError } = await client
    .from("templates")
    .select(
      "id, name, source_filename, parent_template_id, sections(id, name, position:order_index, source_sheet, source_row_number, items(id, name, position:order_index, source_sheet, source_row_number, comments(id, plain_text, safe_html, position:order_index, source_sheet, source_row_number, link_metadata)))"
    )
    .eq("id", templateId)
    .order("order_index", { referencedTable: "sections" })
    .order("order_index", { referencedTable: "sections.items" })
    .order("order_index", { referencedTable: "sections.items.comments" })
    .maybeSingle();

  if (templateError) throw new Error(`Failed to load template: ${templateError.message}`);
  if (!template) return null;

  const { data: run } = await client
    .from("import_runs")
    .select("id")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawSections = (template.sections ?? []) as unknown as RawSection[];

  return {
    id: template.id,
    name: template.name,
    sourceFilename: template.source_filename,
    importRunId: run?.id ?? null,
    parentTemplateId: template.parent_template_id ?? null,
    sections: rawSections.map((section) => ({
      id: section.id,
      name: section.name,
      position: section.position,
      sourceRef: { sheet: section.source_sheet, rowNumber: section.source_row_number },
      items: section.items.map((item) => ({
        id: item.id,
        name: item.name,
        position: item.position,
        sourceRef: { sheet: item.source_sheet, rowNumber: item.source_row_number },
        comments: item.comments.map((comment) => ({
          id: comment.id,
          plainText: comment.plain_text,
          safeHtml: comment.safe_html,
          position: comment.position,
          sourceRef: { sheet: comment.source_sheet, rowNumber: comment.source_row_number },
          linkMetadata: comment.link_metadata,
        })),
      })),
    })),
  };
}
