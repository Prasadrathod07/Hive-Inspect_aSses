import { AlertCircle, CheckCircle2, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

const CONFIG: Record<
  SaveState,
  { label: string; className: string; icon: typeof Loader2 | null }
> = {
  idle: { label: "No changes", className: "text-text-muted", icon: null },
  unsaved: { label: "Unsaved changes", className: "text-warning", icon: AlertCircle },
  saving: { label: "Saving…", className: "text-text-muted", icon: Loader2 },
  saved: { label: "Saved ✓", className: "text-success", icon: CheckCircle2 },
  error: { label: "Save failed", className: "text-destructive", icon: CloudOff },
};

interface SaveStatusProps {
  state: SaveState;
  className?: string;
}

/**
 * Inline save indicator for the template editor. Deliberately narrow: it
 * only ever reflects a real persistence result, never a guess about whether
 * a write is safe to assume.
 */
export function SaveStatus({ state, className }: SaveStatusProps) {
  const { label, className: toneClassName, icon: Icon } = CONFIG[state];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", toneClassName, className)}
    >
      {Icon ? (
        <Icon className={cn("size-3.5", state === "saving" && "animate-spin")} aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}
