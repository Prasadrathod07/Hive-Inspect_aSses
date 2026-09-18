import { CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceRowCoverage } from "@/lib/integrity/types";

/**
 * The single most important claim this product makes, given the room it
 * deserves: every meaningful row in the customer's file is accounted for.
 *
 * Deliberately built around the literal phrase "N unaccounted source rows",
 * because that number is the honest, checkable version of "nothing was lost" —
 * and it is the one thing a reviewer should be able to find without reading.
 *
 * Note what this is NOT: a percentage, a score, or a confidence rating. The
 * bar below encodes real row counts and every segment is labelled with its
 * absolute number (docs/decision-log.md D9).
 */

interface PreservationVerdictProps {
  coverage: SourceRowCoverage;
}

const SEGMENTS = [
  { key: "mapped", label: "Mapped", className: "bg-success" },
  { key: "unsupported", label: "Unsupported", className: "bg-warning" },
  { key: "ignored", label: "Ignored, with reason", className: "bg-text-muted/40" },
  { key: "unaccounted", label: "Unaccounted", className: "bg-destructive" },
] as const;

export function PreservationVerdict({ coverage }: PreservationVerdictProps) {
  const clean = coverage.unaccountedRows === 0;
  const counts: Record<(typeof SEGMENTS)[number]["key"], number> = {
    mapped: coverage.mappedRows,
    unsupported: coverage.unsupportedRows,
    ignored: coverage.ignoredRowsWithReason,
    unaccounted: coverage.unaccountedRows,
  };
  const total = coverage.meaningfulSourceRows;

  return (
    <section
      aria-labelledby="preservation-verdict-heading"
      className={cn(
        "rounded-xl border p-6",
        clean ? "border-success-muted bg-success-muted/30" : "border-destructive-muted bg-destructive-muted/30"
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            clean ? "bg-success-muted text-success" : "bg-destructive-muted text-destructive"
          )}
        >
          {clean ? (
            <CheckCircle2 className="size-6" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-6" aria-hidden="true" />
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="preservation-verdict-heading"
            className={cn(
              "text-2xl font-semibold tracking-tight",
              clean ? "text-success" : "text-destructive"
            )}
          >
            {coverage.unaccountedRows} unaccounted source row
            {coverage.unaccountedRows === 1 ? "" : "s"}
          </h2>
          <p className="text-sm text-text">
            {clean
              ? `Every one of the ${total} meaningful row${total === 1 ? "" : "s"} in your file is accounted for — mapped into the template, or explicitly recorded as unsupported or skipped with a reason.`
              : `${coverage.unaccountedRows} row${coverage.unaccountedRows === 1 ? "" : "s"} from your file could not be accounted for. Review before trusting this import.`}
          </p>
        </div>
      </div>

      {total > 0 ? (
        <div className="mt-5">
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted"
            role="img"
            aria-label={SEGMENTS.filter((s) => counts[s.key] > 0)
              .map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`)
              .join(", ")}
          >
            {SEGMENTS.map((segment) =>
              counts[segment.key] > 0 ? (
                <div
                  key={segment.key}
                  className={segment.className}
                  style={{ width: `${(counts[segment.key] / total) * 100}%` }}
                />
              ) : null
            )}
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {SEGMENTS.map((segment) => (
              <div key={segment.key} className="flex items-center gap-1.5">
                <span
                  className={cn("size-2 shrink-0 rounded-full", segment.className)}
                  aria-hidden="true"
                />
                <dt className="text-xs text-text-muted">{segment.label}</dt>
                <dd className="text-xs font-semibold tabular-nums text-text">{counts[segment.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
