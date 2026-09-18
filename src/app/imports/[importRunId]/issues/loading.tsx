import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Shaped to match the issue review page: header, banner, grouped issue cards. */
export default function Loading() {
  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>

      <Skeleton className="h-16 w-full rounded-xl" aria-hidden="true" />

      <div className="flex flex-col gap-4" role="status" aria-label="Loading issues">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <Skeleton className="mb-3 h-5 w-48" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
