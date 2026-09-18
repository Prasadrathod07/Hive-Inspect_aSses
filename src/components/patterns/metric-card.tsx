import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

/** Compact stat tile for dashboard/report summary rows. */
export function MetricCard({ label, value, hint, icon: Icon, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        {Icon ? <Icon className="size-4 text-text-muted" aria-hidden="true" /> : null}
      </div>
      <span className="text-2xl font-semibold tracking-tight text-text">{value}</span>
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </div>
  );
}
