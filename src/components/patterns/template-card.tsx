import Link from "next/link";
import { FileText, ShieldCheck, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrityStatusBadge } from "@/components/patterns/integrity-status-badge";
import { DuplicateTemplateButton } from "@/components/patterns/duplicate-template-dialog";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { TemplateSummary } from "@/types/template";

interface TemplateCardProps {
  template: TemplateSummary;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-semibold tabular-nums text-text">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

export function TemplateCard({ template }: TemplateCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/templates/${template.id}`}
            className="truncate text-sm font-semibold text-text outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
          >
            {template.name}
          </Link>
          <span className="inline-flex h-5 items-center rounded-full bg-surface-muted px-2 text-xs font-medium text-text-muted">
            Source: Spectora
          </span>
          {template.parentTemplateId ? (
            // A copy was never independently imported, so it has no integrity
            // result of its own — saying where it came from is the honest
            // substitute for a status badge it doesn't have.
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-muted px-2 text-xs font-medium text-text-muted">
              <GitBranch className="size-3" aria-hidden="true" />
              Copy
            </span>
          ) : (
            <IntegrityStatusBadge status={template.integrityStatus} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Stat label="sections" value={template.sectionCount} />
          <Stat label="items" value={template.itemCount} />
          <Stat label="comments" value={template.commentCount} />
        </div>

        <p className="text-xs text-text-muted">
          {template.sourceFilename} · updated {formatRelativeTime(template.updatedAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/templates/${template.id}`}>
            <FileText className="size-4" aria-hidden="true" />
            Open
          </Link>
        </Button>
        {template.importRunId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/templates/${template.id}/import-report`}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              Import report
            </Link>
          </Button>
        ) : null}
        <DuplicateTemplateButton templateId={template.id} templateName={template.name} />
      </div>
    </div>
  );
}
