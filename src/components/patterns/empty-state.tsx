import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Honest "nothing here yet" state — used instead of fabricated sample data. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-text-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description ? (
          <p className="max-w-sm text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
