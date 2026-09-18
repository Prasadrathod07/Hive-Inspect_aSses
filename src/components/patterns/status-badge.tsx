import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "destructive" | "info" | "neutral";

const TONE_STYLES: Record<StatusTone, string> = {
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  destructive: "bg-destructive-muted text-destructive",
  info: "bg-accent text-primary",
  neutral: "bg-surface-muted text-text-muted",
};

interface StatusBadgeProps {
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

/**
 * Status pill for import-integrity states: preserved, changed, unsupported,
 * needs review, absent-in-source, skipped, etc. Tone carries meaning —
 * reserve `destructive`/`warning` for states that actually need attention.
 */
export function StatusBadge({
  tone = "neutral",
  icon: Icon,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
