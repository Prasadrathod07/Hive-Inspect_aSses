"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Wrench, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/patterns/status-badge";
import { applySafeFix } from "@/lib/persistence/issue-fix-actions";

interface FixSafelyControlProps {
  issueId: string;
  importRunId: string;
  templateId: string;
  rawSnippet: string;
  proposedPlainText: string | null;
  /** true once a reviewer has already applied this fix — renders a resolved badge instead of the action. */
  alreadyApplied: boolean;
}

/**
 * Level B ("Fix Safely") — docs/architecture.md §5a. Never applies a change
 * on click: opens a before/after preview first, and only calls the server
 * action when the reviewer explicitly confirms. The proposed content shown
 * here is exactly what was computed deterministically at import time
 * (`proposed_plain_text`/`proposed_safe_html`) — this component cannot
 * invent or alter it, only ask whether to apply it.
 */
export function FixSafelyControl({
  issueId,
  importRunId,
  templateId,
  rawSnippet,
  proposedPlainText,
  alreadyApplied,
}: FixSafelyControlProps) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState(alreadyApplied);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (resolved) {
    return (
      <div className="flex flex-col gap-1">
        <StatusBadge tone="success" icon={CheckCircle2}>
          Resolved safely
        </StatusBadge>
        <p className="text-xs text-text-muted">Original Spectora source remains retained for traceability.</p>
      </div>
    );
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applySafeFix(issueId, importRunId, templateId);
      if (result.success) {
        setResolved(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Wrench className="size-3.5" aria-hidden="true" />
        Fix safely
      </Button>

      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Safe fix preview</DialogTitle>
            <DialogDescription>This change preserves the original text and meaning.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">Before</p>
              <p className="font-mono text-xs break-words whitespace-pre-wrap text-text">{rawSnippet}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">After</p>
              <p className="font-mono text-xs break-words whitespace-pre-wrap text-text">
                {proposedPlainText ?? "(nothing)"}
              </p>
            </div>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wrench className="size-4" aria-hidden="true" />
              )}
              Apply fix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
