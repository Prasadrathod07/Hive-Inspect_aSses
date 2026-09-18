import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

/** Full-region loading indicator with an optional skeleton-row preview. */
export function LoadingState({
  label = "Loading…",
  rows = 0,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-4 py-16", className)}
    >
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {rows > 0 ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
