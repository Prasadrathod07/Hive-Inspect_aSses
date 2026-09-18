import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server-client";
import type { IntegrityStatus } from "@/lib/integrity/types";
import type { TemplateSummary } from "@/types/template";

interface TemplateRow {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
  parent_template_id: string | null;
  import_runs: {
    id: string;
    status: string;
    integrity_status: IntegrityStatus | null;
    integrity_result: { summary: string } | null;
    completed_at: string | null;
    created_at: string;
  }[];
  sections: { id: string; items: { id: string; comments: { id: string }[] }[] }[];
}

/**
 * Reads every template for the dashboard, server-side only (service-role
 * client bypasses RLS — see supabase/migrations' RLS note).
 *
 * Counts come from the actual section/item/comment rows, not from the
 * import run's stored counts. Two reasons: a duplicated template has no
 * import run at all (it wasn't imported), and now that editing exists,
 * import-time counts are a snapshot rather than current truth. The cost is
 * fetching one id per row; fine at inspection-template scale, and worth
 * swapping for an aggregate view if a template ever gets large enough to
 * notice.
 */
export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from("templates")
    .select(
      "id, name, source_filename, created_at, parent_template_id, import_runs(id, status, integrity_status, integrity_result, completed_at, created_at), sections(id, items(id, comments(id)))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list templates: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TemplateRow[];

  return rows.map((row) => {
    const latestRun = [...row.import_runs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] as TemplateRow["import_runs"][number] | undefined;

    const sections = row.sections ?? [];
    const items = sections.flatMap((section) => section.items ?? []);
    const commentCount = items.reduce((total, item) => total + (item.comments?.length ?? 0), 0);

    return {
      id: row.id,
      name: row.name,
      sourceFilename: row.source_filename,
      sectionCount: sections.length,
      itemCount: items.length,
      commentCount,
      integrityStatus: latestRun?.integrity_status ?? null,
      integritySummary: latestRun?.integrity_result?.summary ?? null,
      importRunId: latestRun?.id ?? null,
      parentTemplateId: row.parent_template_id,
      updatedAt: latestRun?.completed_at ?? row.created_at,
    };
  });
}
