import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Shaped to match the report: header, run-identity strip, preservation verdict, metrics. */
export default function Loading() {
  return (
    <PageShell>
      <div className="flex items-center gap-3" aria-hidden="true">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-6 w-56" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border p-5" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div
        className="flex flex-col gap-3 rounded-xl border border-border p-6"
        role="status"
        aria-label="Loading import report"
      >
        <div className="flex items-start gap-4">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </PageShell>
  );
}
