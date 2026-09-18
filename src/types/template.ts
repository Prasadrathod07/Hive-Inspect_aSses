import type { IntegrityStatus } from "@/lib/integrity/types";

/**
 * Typed shapes the dashboard and report routes read. Backed by real
 * Supabase queries (src/lib/persistence/list-templates.ts,
 * get-template-report.ts) — not placeholders.
 */

export type TemplateId = string;
export type ImportRunId = string;

export interface TemplateSummary {
  id: TemplateId;
  name: string;
  sourceFilename: string;
  sectionCount: number;
  itemCount: number;
  commentCount: number;
  /** Null only if the template's import run somehow has no integrity result yet (shouldn't happen in steady state). */
  integrityStatus: IntegrityStatus | null;
  integritySummary: string | null;
  importRunId: ImportRunId | null;
  /** Set when this template is a duplicate — it has lineage instead of an import run of its own. */
  parentTemplateId: TemplateId | null;
  /** ISO timestamp — the import's completion time, falling back to the template's creation time. */
  updatedAt: string;
}
