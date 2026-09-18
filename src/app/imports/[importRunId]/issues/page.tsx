import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListTodo, LayoutTemplate, ChevronRight, MapPin, Archive, Filter } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { toAppError } from "@/lib/errors/app-error";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState } from "@/components/patterns/error-state";
import { SectionCard } from "@/components/patterns/section-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { SourceComparison } from "@/components/patterns/source-comparison";
import { IssueResolutionControl } from "@/components/patterns/issue-resolution-control";
import { FixSafelyControl } from "@/components/patterns/fix-safely-control";
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

/**
 * A row inside the "unsupported_source_content" group whose content WAS
 * mapped successfully (`rowGenuinelyUnsupported: false`) has nothing wrong
 * with it — the issue is purely an informational note about extra
 * spreadsheet columns this importer doesn't model. Rendering one full card
 * per such row (this real Spectora template export has 300+) buries the
 * handful of rows that actually need attention. Collapsed by default, never
 * hidden: every row and its full raw text stays reachable by expanding.
 */
function MappedRowsWithExtraColumns({ issues }: { issues: ImportRunIssueDetail[] }) {
  if (issues.length === 0) return null;
  return (
    <details className="group rounded-lg border border-border bg-surface-muted p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text marker:content-none">
        <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
        {issues.length} row{issues.length === 1 ? "" : "s"} mapped successfully, with additional columns not
        imported
      </summary>
      <p className="mt-2 text-xs text-text-muted">
        These rows&apos; section/item/comment content imported correctly. Each also has extra spreadsheet
        columns (answer type, defaults, multiple-choice options, photo slots, etc.) that this importer
        doesn&apos;t model — the raw text for each is retained below, never discarded.
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {issues.map((issue) => (
          <details key={issue.id} className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
            <summary className="cursor-pointer list-none text-text-muted marker:content-none">
              {issue.sourceSheet} · row {issue.sourceRowNumber}
              {issue.hierarchy.matched
                ? ` — ${issue.hierarchy.sectionName}${issue.hierarchy.itemName ? ` / ${issue.hierarchy.itemName}` : ""}`
                : ""}
            </summary>
            <p className="mt-1.5 font-mono whitespace-pre-wrap break-words text-text">{issue.rawSnippet}</p>
          </details>
        ))}
      </div>
    </details>
  );
}

function IssueCard({
  issue,
  importRunId,
  templateId,
}: {
  issue: ImportRunIssueDetail;
  importRunId: string;
  templateId: string;
}) {
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
        {issue.fixSafelyAvailable ? (
          <FixSafelyControl
            issueId={issue.id}
            importRunId={importRunId}
            templateId={templateId}
            rawSnippet={issue.rawSnippet}
            proposedPlainText={issue.proposedPlainText}
            alreadyApplied={issue.resolutionStatus === "resolved"}
          />
        ) : (
          <IssueResolutionControl
            issueId={issue.id}
            importRunId={importRunId}
            initialStatus={issue.resolutionStatus}
          />
        )}
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

type RowFilter = "all" | "needs-attention";

/** Preserves whichever of `category`/`rows` isn't being changed by a given link. */
function issuesHref(importRunId: string, params: { category?: IssueGroupKey; rows?: RowFilter }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.rows && params.rows !== "all") sp.set("rows", params.rows);
  const qs = sp.toString();
  return `/imports/${importRunId}/issues${qs ? `?${qs}` : ""}`;
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
  const rowsParam = (
    Array.isArray(resolvedSearchParams.rows) ? resolvedSearchParams.rows[0] : resolvedSearchParams.rows
  ) as RowFilter | undefined;
  const rowFilter: RowFilter = rowsParam === "needs-attention" ? "needs-attention" : "all";

  let page;
  try {
    page = await getImportRunIssues(importRunId);
  } catch (error) {
    return (
      <PageShell>
        <PageHeader title="Import issues" icon={ListTodo} backHref="/" backLabel="Templates" />
        <ErrorState title="Couldn't load these issues" error={toAppError(error, "ImportIssuesPage")} />
      </PageShell>
    );
  }

  if (!page) notFound();

  const groups = groupIssues(page.issues);
  const visibleGroups = categoryFilter ? groups.filter((g) => g.group.key === categoryFilter) : groups;
  const activeGroupMeta = categoryFilter ? getIssueGroupMeta(categoryFilter) : null;

  const needsAttentionCount = page.issues.filter((issue) => issue.rowGenuinelyUnsupported).length;

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

      <div className="flex flex-wrap items-center gap-3">
        {categoryFilter && activeGroupMeta ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone="info">{activeGroupMeta.label}</StatusBadge>
            <Button variant="ghost" size="sm" asChild>
              <Link href={issuesHref(importRunId, { rows: rowFilter })}>Show all categories</Link>
            </Button>
          </div>
        ) : null}

        {needsAttentionCount < page.issues.length ? (
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="size-3.5 text-text-muted" aria-hidden="true" />
            <Link
              href={issuesHref(importRunId, { category: categoryFilter, rows: "needs-attention" })}
              className={
                rowFilter === "needs-attention"
                  ? "rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                  : "rounded-full px-2.5 py-1 text-text-muted hover:text-text"
              }
            >
              Needs attention ({needsAttentionCount})
            </Link>
            <Link
              href={issuesHref(importRunId, { category: categoryFilter, rows: "all" })}
              className={
                rowFilter === "all"
                  ? "rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                  : "rounded-full px-2.5 py-1 text-text-muted hover:text-text"
              }
            >
              All ({page.issues.length})
            </Link>
          </div>
        ) : null}
      </div>

      {rowFilter === "needs-attention" ? (
        <p className="text-xs text-text-muted">
          Showing only rows that need a look. Rows that mapped successfully but also had extra unmodeled
          columns are hidden here — nothing was deleted, switch to &quot;All&quot; to see them.
        </p>
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
      ) : rowFilter === "needs-attention" && needsAttentionCount === 0 ? (
        <SectionCard
          title="Nothing needs attention"
          description={`Every remaining issue (${page.issues.length}) is a row that mapped successfully with only extra, unmodeled columns noted — switch to "All" to review them.`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {visibleGroups.map(({ group, issues }) => {
            const genuinelyUnsupported = issues.filter((issue) => issue.rowGenuinelyUnsupported);
            const mappedWithExtraColumns = issues.filter((issue) => !issue.rowGenuinelyUnsupported);
            if (rowFilter === "needs-attention" && genuinelyUnsupported.length === 0) return null;
            const visibleCount = rowFilter === "needs-attention" ? genuinelyUnsupported.length : issues.length;
            return (
              <SectionCard
                key={group.key}
                title={`${group.label} (${visibleCount})`}
                description={group.description}
              >
                <div className="flex flex-col gap-3">
                  {genuinelyUnsupported.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} importRunId={importRunId} templateId={page.templateId} />
                  ))}
                  {rowFilter === "all" ? <MappedRowsWithExtraColumns issues={mappedWithExtraColumns} /> : null}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
