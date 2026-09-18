import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListTodo, LayoutTemplate, ChevronRight, MapPin, Archive } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { SourceComparison } from "@/components/patterns/source-comparison";
import { IssueResolutionControl } from "@/components/patterns/issue-resolution-control";
import { Button } from "@/components/ui/button";
import { getImportRunIssues } from "@/lib/persistence/get-import-run-issues";
import type { ImportRunIssueDetail } from "@/lib/persistence/get-import-run-issues";
import {
  groupIssues,
  getIssueGroupMeta,
  type IssueGroupKey,
} from "@/lib/integrity/issue-presentation";

export async function generateMetadata({
  params,
}: PageProps<"/imports/[importRunId]/issues">): Promise<Metadata> {
  const { importRunId } = await params;
  const page = await getImportRunIssues(importRunId).catch(() => null);
  return { title: page ? `Import issues · ${page.templateName}` : "Import issues" };
}

const SEVERITY_TONE = { info: "info", warning: "warning", blocking: "destructive" } as const;

function IssueHierarchyBreadcrumb({ hierarchy }: { hierarchy: ImportRunIssueDetail["hierarchy"] }) {
  if (!hierarchy.matched) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        <MapPin className="size-3.5" aria-hidden="true" />
        Not part of any mapped section or item
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-text-muted">
      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
      {hierarchy.sectionName}
      {hierarchy.itemName ? (
        <>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          {hierarchy.itemName}
        </>
      ) : null}
    </span>
  );
}

function IssueCard({ issue, importRunId }: { issue: ImportRunIssueDetail; importRunId: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={SEVERITY_TONE[issue.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>
            {issue.severity}
          </StatusBadge>
          <span className="text-xs text-text-muted">
            {issue.sourceSheet} · row {issue.sourceRowNumber}
          </span>
        </div>
        <IssueResolutionControl
          issueId={issue.id}
          importRunId={importRunId}
          initialStatus={issue.resolutionStatus}
        />
      </div>

      <IssueHierarchyBreadcrumb hierarchy={issue.hierarchy} />

      <p className="text-sm text-text">{issue.explanation}</p>

      <SourceComparison source={issue.rawSnippet} imported={issue.importedPreview} />

      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Archive className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Present in source, unsupported by this importer — the original raw text above is retained in full
        for your records, never discarded.
      </p>
    </div>
  );
}

export default async function ImportIssuesPage({
  params,
  searchParams,
}: PageProps<"/imports/[importRunId]/issues">) {
  const { importRunId } = await params;
  const resolvedSearchParams = await searchParams;
  const categoryFilter = (
    Array.isArray(resolvedSearchParams.category) ? resolvedSearchParams.category[0] : resolvedSearchParams.category
  ) as IssueGroupKey | undefined;

  let page;
  try {
    page = await getImportRunIssues(importRunId);
  } catch (error) {
    return (
      <PageShell>
        <PageHeader title="Import issues" icon={ListTodo} backHref="/" backLabel="Templates" />
        <SectionCard
          title="Couldn't load these issues"
          description={error instanceof Error ? error.message : "An unexpected error occurred."}
        />
      </PageShell>
    );
  }

  if (!page) notFound();

  const groups = groupIssues(page.issues);
  const visibleGroups = categoryFilter ? groups.filter((g) => g.group.key === categoryFilter) : groups;
  const activeGroupMeta = categoryFilter ? getIssueGroupMeta(categoryFilter) : null;

  return (
    <PageShell>
      <PageHeader
        title="Import issues"
        description={`${page.templateName} — imported from ${page.sourceFilename}`}
        icon={ListTodo}
        backHref={`/templates/${page.templateId}/import-report`}
        backLabel="Import report"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/templates/${page.templateId}`}>
                <LayoutTemplate className="size-4" aria-hidden="true" />
                Open template
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Back to templates</Link>
            </Button>
          </>
        }
      />

      <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm text-text-muted">
        <p>
          Every item below is something we found direct evidence of in your source file — we never claim
          content is <span className="font-medium text-text">&quot;not present in source&quot;</span>{" "}
          without proof. What you see here is content that <span className="font-medium text-text">was
          present in source but unsupported by this importer</span>, with the original raw text retained
          in full.
        </p>
      </div>

      {categoryFilter && activeGroupMeta ? (
        <div className="flex items-center gap-2">
          <StatusBadge tone="info">{activeGroupMeta.label}</StatusBadge>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/imports/${importRunId}/issues`}>Show all categories</Link>
          </Button>
        </div>
      ) : null}

      {page.issues.length === 0 ? (
        <SectionCard
          title="No issues to review"
          description="Every meaningful row from the source file was mapped cleanly — nothing needs your attention here."
        />
      ) : visibleGroups.length === 0 ? (
        <SectionCard
          title="No issues in this category"
          description="This filter doesn't match any issues from this import."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {visibleGroups.map(({ group, issues }) => (
            <SectionCard key={group.key} title={`${group.label} (${issues.length})`} description={group.description}>
              <div className="flex flex-col gap-3">
                {issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} importRunId={importRunId} />
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
