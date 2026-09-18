import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ShieldCheck, LayoutTemplate, ListTodo } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { MetricCard } from "@/components/patterns/metric-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { IntegrityStatusBadge, getImportHeadline } from "@/components/patterns/integrity-status-badge";
import { Button } from "@/components/ui/button";
import { getTemplateReport } from "@/lib/persistence/get-template-report";
import { groupIssues } from "@/lib/integrity/issue-presentation";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/templates/[templateId]/import-report">): Promise<Metadata> {
  const { templateId } = await params;
  const report = await getTemplateReport(templateId).catch(() => null);
  return { title: report ? `Import report · ${report.templateName}` : "Import report" };
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="flex items-center gap-2 text-sm text-text">
        <Icon className={cn("size-4 shrink-0", ok ? "text-success" : "text-warning")} aria-hidden="true" />
        {label}
      </span>
      <span className="text-sm text-text-muted">{detail}</span>
    </div>
  );
}

export default async function ImportReportPage({
  params,
}: PageProps<"/templates/[templateId]/import-report">) {
  const { templateId } = await params;

  let report;
  try {
    report = await getTemplateReport(templateId);
  } catch (error) {
    return (
      <PageShell>
        <PageHeader title="Import integrity report" icon={ShieldCheck} backHref="/" backLabel="Templates" />
        <SectionCard
          title="Couldn't load this report"
          description={error instanceof Error ? error.message : "An unexpected error occurred."}
        />
      </PageShell>
    );
  }

  if (!report) notFound();

  const integrity = report.integrityResult;
  const headerActions = (
    <>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/templates/${templateId}`}>
          <LayoutTemplate className="size-4" aria-hidden="true" />
          Open template
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href="/">Back to templates</Link>
      </Button>
    </>
  );

  if (!integrity) {
    return (
      <PageShell>
        <PageHeader
          title="Import integrity report"
          description={`${report.templateName} — imported from ${report.sourceFilename}`}
          icon={ShieldCheck}
          actions={headerActions}
        />
        <SectionCard
          title="Integrity result not available"
          description="This import run doesn't have a computed integrity result yet."
        />
      </PageShell>
    );
  }

  const headline = getImportHeadline(integrity.status);
  const groups = groupIssues(report.issues);
  const timestamp = report.completedAt ?? report.createdAt;

  return (
    <PageShell>
      <PageHeader title={report.templateName} icon={ShieldCheck} actions={headerActions} />

      <div
        className={cn(
          "flex flex-col gap-1 rounded-xl border p-5",
          headline.tone === "success" && "border-success-muted bg-success-muted/40",
          headline.tone === "warning" && "border-warning-muted bg-warning-muted/40",
          headline.tone === "destructive" && "border-destructive-muted bg-destructive-muted/40"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className={cn(
              "text-lg font-semibold",
              headline.tone === "success" && "text-success",
              headline.tone === "warning" && "text-warning",
              headline.tone === "destructive" && "text-destructive"
            )}
          >
            {headline.text}
          </h1>
          <IntegrityStatusBadge status={integrity.status} />
        </div>
        <p className="text-sm text-text">{integrity.summary}</p>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
          <div className="flex gap-1">
            <dt className="font-medium text-text">Template:</dt>
            <dd>{report.templateName}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium text-text">Source file:</dt>
            <dd>{report.sourceFilename}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium text-text">Imported:</dt>
            <dd>{formatTimestamp(timestamp)}</dd>
          </div>
        </dl>
      </div>

      <SectionCard title="Import Integrity" description="Every number below is computed deterministically — never an AI estimate, never a percentage score.">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Sections imported / source"
              value={`${integrity.structure.sections.persisted} / ${integrity.structure.sections.source}`}
            />
            <MetricCard
              label="Items imported / source"
              value={`${integrity.structure.items.persisted} / ${integrity.structure.items.source}`}
            />
            <MetricCard
              label="Comments imported / source"
              value={`${integrity.structure.comments.persisted} / ${integrity.structure.comments.source}`}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Source-row coverage</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard label="Meaningful rows" value={String(integrity.sourceCoverage.meaningfulSourceRows)} />
              <MetricCard label="Mapped" value={String(integrity.sourceCoverage.mappedRows)} />
              <MetricCard label="Unsupported" value={String(integrity.sourceCoverage.unsupportedRows)} />
              <MetricCard label="Ignored (reasoned)" value={String(integrity.sourceCoverage.ignoredRowsWithReason)} />
            </div>
            <p
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-sm font-medium",
                integrity.sourceCoverage.unaccountedRows > 0
                  ? "border-destructive-muted bg-destructive-muted/40 text-destructive"
                  : "border-success-muted bg-success-muted/40 text-success"
              )}
            >
              {integrity.sourceCoverage.unaccountedRows} unaccounted source row
              {integrity.sourceCoverage.unaccountedRows === 1 ? "" : "s"}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Verification checks</h3>
            <CheckRow
              label="Ordering"
              ok={integrity.ordering.status === "verified"}
              detail={integrity.ordering.status}
            />
            <CheckRow
              label="Text preservation"
              ok={integrity.textPreservation.status === "verified"}
              detail={`${integrity.textPreservation.status} (${integrity.textPreservation.comparedCount} compared)`}
            />
            <CheckRow
              label="Links imported / source"
              ok={integrity.links.preservedLinks === integrity.links.sourceLinks}
              detail={`${integrity.links.preservedLinks} / ${integrity.links.sourceLinks}`}
            />
            <CheckRow
              label="Formatting issues"
              ok={integrity.formattingWarnings.length === 0}
              detail={String(integrity.formattingWarnings.length)}
            />
            <CheckRow
              label="Structural warnings"
              ok={integrity.structuralWarnings.length === 0}
              detail={String(integrity.structuralWarnings.length)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Issues for review"
        description={
          groups.length === 0
            ? "Nothing to review — every meaningful row mapped cleanly."
            : 'Every group below reflects content "present in source but unsupported by this importer" — never content we assumed was missing. The original raw text is retained for each one.'
        }
      >
        {groups.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            No issues were recorded for this import.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map(({ group, issues }) => (
              <Link
                key={group.key}
                href={`/imports/${report.importRunId}/issues?category=${group.key}`}
                className="flex flex-col gap-1 rounded-lg border border-border p-3 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text">{group.label}</span>
                  <StatusBadge tone="warning">{issues.length}</StatusBadge>
                </div>
                <p className="text-xs text-text-muted">{group.description}</p>
              </Link>
            ))}
          </div>
        )}
        {groups.length > 0 ? (
          <div className="mt-4">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/imports/${report.importRunId}/issues`}>
                <ListTodo className="size-4" aria-hidden="true" />
                Review all issues
              </Link>
            </Button>
          </div>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
