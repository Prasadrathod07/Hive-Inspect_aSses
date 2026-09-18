interface SourceComparisonProps {
  sourceLabel?: string;
  importedLabel?: string;
  source: string;
  imported: string | null;
}

/** Two-column (stacked on mobile) before/after view — the raw source snippet vs. what actually got imported. */
export function SourceComparison({
  sourceLabel = "Source (raw, as captured)",
  importedLabel = "Imported",
  source,
  imported,
}: SourceComparisonProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">{sourceLabel}</p>
        <p className="font-mono text-xs break-words whitespace-pre-wrap text-text">{source}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">{importedLabel}</p>
        {imported ? (
          <p className="font-mono text-xs break-words whitespace-pre-wrap text-text">{imported}</p>
        ) : (
          <p className="text-xs text-text-muted italic">Nothing was imported for this row.</p>
        )}
      </div>
    </div>
  );
}
