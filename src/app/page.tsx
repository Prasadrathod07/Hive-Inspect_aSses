import Link from "next/link";
import { FileStack, LayoutTemplate, ShieldAlert, Upload } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { MetricCard } from "@/components/patterns/metric-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { TemplateCard } from "@/components/patterns/template-card";
import { listTemplateSummaries } from "@/lib/persistence/list-templates";
import { formatRelativeTime } from "@/lib/format-relative-time";

export const metadata = {
  title: { absolute: "Hive Template Migrator" },
};

// This reads live Supabase data (new imports change it constantly) — never
// serve a build-time snapshot.
export const dynamic = "force-dynamic";

const IMPORT_BUTTON_CLASSNAME =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground outline-none transition-all hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function TemplatesPage() {
  let templates: Awaited<ReturnType<typeof listTemplateSummaries>> = [];
  let loadError: string | null = null;

  try {
    templates = await listTemplateSummaries();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load templates.";
  }

  const needsReview = templates.filter(
    (t) => t.integrityStatus === "review_required" || t.integrityStatus === "failed"
  ).length;
  const lastImport = templates[0]?.updatedAt;

  return (
    <PageShell>
      <PageHeader
        title="Templates"
        description="Import, edit, and verify Spectora template migrations."
        icon={LayoutTemplate}
        actions={
          <Link href="/import" className={IMPORT_BUTTON_CLASSNAME}>
            <Upload className="size-4" aria-hidden="true" />
            Import template
          </Link>
        }
      />

      {loadError ? (
        <ErrorState
          title="Couldn't load templates"
          description={loadError}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard label="Templates imported" value={String(templates.length)} icon={FileStack} />
            <MetricCard
              label="Needs review"
              value={String(needsReview)}
              hint={needsReview > 0 ? "Review required or failed integrity check" : "Nothing flagged"}
              icon={ShieldAlert}
            />
            <MetricCard
              label="Last import"
              value={lastImport ? formatRelativeTime(lastImport) : "—"}
              hint={templates.length === 0 ? "No imports yet" : undefined}
              icon={Upload}
            />
          </div>

          {templates.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No templates yet"
              description="Import a Spectora “Export to spreadsheet → Export HTML Text” file to create your first editable template."
              action={
                <Link href="/import" className={IMPORT_BUTTON_CLASSNAME}>
                  <Upload className="size-4" aria-hidden="true" />
                  Import template
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
