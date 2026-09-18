"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  actions?: ReactNode;
  className?: string;
}

/** Honest failure surface — never hides what went wrong behind a spinner. */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  actions,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-destructive-muted bg-destructive-muted/40 px-6 py-16 text-center",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive-muted text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description ? (
          <p className="max-w-sm text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {onRetry || actions ? (
        <div className="mt-2 flex items-center gap-2">
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
