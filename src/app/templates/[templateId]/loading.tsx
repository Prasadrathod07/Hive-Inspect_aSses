import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped to match the editor (template-editor.tsx): breadcrumb, sticky
 * toolbar, tree pane + main pane. Without this, the app-wide dashboard-shaped
 * skeleton would flash here instead — the wrong shape settling into the
 * right one reads as a glitch, not as loading.
 */
export default function Loading() {
  return (
    <PageShell className="gap-4">
      <Skeleton className="h-5 w-48" aria-hidden="true" />

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3" aria-hidden="true">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]" role="status" aria-label="Loading template">
        <div className="rounded-xl border border-border p-2">
          <div className="flex flex-col gap-1.5 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </PageShell>
  );
}
