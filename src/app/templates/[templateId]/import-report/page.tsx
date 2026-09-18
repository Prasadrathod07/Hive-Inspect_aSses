import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, LayoutTemplate, ListTodo, Sparkles } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { toAppError } from "@/lib/errors/app-error";
import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState } from "@/components/patterns/error-state";
import { SectionCard } from "@/components/patterns/section-card";
import { MetricCard } from "@/components/patterns/metric-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { IntegrityStatusBadge, getImportHeadline } from "@/components/patterns/integrity-status-badge";
import { Button } from "@/components/ui/button";
import { getTemplateReport } from "@/lib/persistence/get-template-report";
import { AiImportReview } from "./ai-import-review";
import { PreservationVerdict } from "./preservation-verdict";
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

function countLabel(count: number, noun: string): string {
  if (count === 0) return "None";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const NORMALIZATION_EVENT_LABELS: Record<string, string> = {
  whitespace_trimmed: "Whitespace cleanup",
  duplicate_whitespace_collapsed: "Whitespace cleanup",
  empty_tag_removed: "HTML wrapper cleanup",
  harmless_wrapper_removed: "HTML wrapper cleanup",
  line_break_normalized: "Line break normalization",
  html_entity_decoded: "Entity normalization",
  formatting_normalized: "Supported formatting normalization",
  safe_link_normalized: "Link normalization",
};

function formatNormalizationEventType(type: string): string {
  return NORMALIZATION_EVENT_LABELS[type] ?? type;
}

/** Several raw event types share one display label (e.g. two whitespace-related types) — merge their counts so the expandable breakdown reads as one line per label, not one per internal type. */
function groupNormalizationCountsByLabel(byType: Record<string, number>): Array<[string, number]> {
  const byLabel = new Map<string, number>();
  for (const [type, count] of Object.entries(byType)) {
    const label = formatNormalizationEventType(type);
    byLabel.set(label, (byLabel.get(label) ?? 0) + count);
  }
  return [...byLabel.entries()];
}

/**
 * One verification result.
 *
 * `tone` separates "this check failed" from "this check found something worth
 * knowing". A formatting change is expected, recorded, reversible-by-reading,
 * and not a failure — painting it the same red as a text-preservation
 * mismatch would teach reviewers to ignore the colour that actually matters.
 */
function CheckRow({
  label,
  ok,
  detail,
  tone = "destructive",
}: {
  label: string;
  ok: boolean;
  detail: string;
  tone?: "warning" | "destructive";
}) {
  const Icon = ok ? CheckCircle2 : tone === "warning" ? Info : AlertTriangle;
  const iconClass = ok ? "text-success" : tone === "warning" ? "text-warning" : "text-destructive";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-3 py-2.5 last:border-b-0">
      <dt className="flex min-w-0 items-center gap-2 text-sm text-text">
        <Icon className={cn("size-4 shrink-0", iconClass)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular-nums",
          ok ? "text-text-muted" : tone === "warning" ? "text-warning" : "text-destructive"
        )}
      >
        {detail}
      </dd>
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
        <ErrorState title="Couldn't load this report" error={toAppError(error, "ImportReportPage")} />
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

      {/* Run identity stays quiet and factual — a caption, not an alarm. The
          status word carries the tone; the surrounding chrome stays neutral so
          an import "with warnings" doesn't read as a failure. */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text">{headline.text}</h2>
          <IntegrityStatusBadge status={integrity.status} />
        </div>
        <p className="max-w-3xl text-sm text-text-muted">{integrity.summary}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-3 text-xs">
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-text-muted">Source file</dt>
            <dd className="min-w-0 truncate font-medium text-text">{report.sourceFilename}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-text-muted">Imported</dt>
            <dd className="font-medium text-text">{formatTimestamp(timestamp)}</dd>
          </div>
        </dl>
      </div>

      <PreservationVerdict coverage={integrity.sourceCoverage} />

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
            <h3 className="mb-2 text-sm font-semibold text-text">Verification checks</h3>
            <dl className="rounded-lg border border-border">
              <CheckRow
                label="Ordering"
                ok={integrity.ordering.status === "verified"}
                detail={integrity.ordering.status === "verified" ? "Preserved" : "Mismatch"}
              />
              <CheckRow
                label="Text preservation"
                ok={integrity.textPreservation.status === "verified"}
                detail={
                  integrity.textPreservation.status === "verified"
                    ? `${integrity.textPreservation.comparedCount} compared, all identical`
                    : `${integrity.textPreservation.mismatches.length} of ${integrity.textPreservation.comparedCount} differ`
                }
              />
              <CheckRow
                label="Links"
                ok={integrity.links.preservedLinks === integrity.links.sourceLinks}
                detail={`${integrity.links.preservedLinks} of ${integrity.links.sourceLinks} preserved`}
              />
              <CheckRow
                label="Formatting changes"
                ok={integrity.formattingWarnings.length === 0}
                tone="warning"
                detail={countLabel(integrity.formattingWarnings.length, "change")}
              />
              <CheckRow
                label="Structural warnings"
                ok={integrity.structuralWarnings.length === 0}
                tone="warning"
                detail={countLabel(integrity.structuralWarnings.length, "warning")}
              />
            </dl>
          </div>
        </div>
      </SectionCard>

      {report.normalizationEvents.total > 0 ? (
        <details className="group rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-text-muted open:pb-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text marker:content-none">
            <Sparkles className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            Automatic cleanup — {report.normalizationEvents.total} harmless formatting{" "}
            {report.normalizationEvents.total === 1 ? "difference was" : "differences were"} normalized
            automatically.
          </summary>
          <p className="mt-2 max-w-3xl text-xs text-text-muted">
            Whitespace, empty HTML tags, standard entities, and equivalent supported formatting were
            cleaned up automatically — none of this changed customer-authored wording or meaning, so it
            was never treated as a warning. See <code className="font-mono">docs/architecture.md</code> §5a
            for the full policy.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {groupNormalizationCountsByLabel(report.normalizationEvents.byType).map(([label, count]) => (
              <li key={label} className="flex items-center justify-between gap-4 border-t border-border pt-1.5 first:border-t-0 first:pt-0">
                <span className="text-text-muted">{label}</span>
                <span className="tabular-nums text-text">{count}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Below the deterministic metrics, deliberately. The integrity result
          is rendered and complete before this component even mounts. */}
      <AiImportReview
        importRunId={report.importRunId}
        issueLinkBase={`/imports/${report.importRunId}/issues`}
      />

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
