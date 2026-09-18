import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Shaped to match the Templates dashboard (app/page.tsx) — the only route this segment's Suspense boundary actually covers. */
export default function Loading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      <div className="flex flex-col gap-3" role="status" aria-label="Loading templates">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl sm:h-20" />
        ))}
      </div>
    </PageShell>
  );
}
