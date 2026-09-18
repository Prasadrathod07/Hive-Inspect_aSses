"use client";

import type { ReactNode } from "react";
import { AlertTriangle, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppError } from "@/lib/errors/app-error";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  /** Plain description, for failures that aren't modeled as an AppError. */
  description?: string;
  /**
   * A typed failure. Preferred over `description`: its `message` and its
   * `recovery` are shown as separate things, because "what went wrong" and
   * "what you can do about it" are separate questions, and running them
   * together into one sentence buries the answer to the second.
   */
  error?: AppError;
  onRetry?: () => void;
  retryLabel?: string;
  actions?: ReactNode;
  className?: string;
}

/** Honest failure surface — never hides what went wrong behind a spinner. */
export function ErrorState({
  title = "Something went wrong",
  description,
  error,
  onRetry,
  retryLabel = "Try again",
  actions,
  className,
}: ErrorStateProps) {
  const message = error?.message ?? description;
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
        {message ? <p className="max-w-sm text-sm text-text-muted">{message}</p> : null}
      </div>
      {error ? (
        <p className="flex max-w-md items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-text">
          <LifeBuoy className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
          {error.recovery}
        </p>
      ) : null}
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
