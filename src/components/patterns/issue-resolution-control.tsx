"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/patterns/status-badge";
import { setIssueResolutionStatus } from "@/lib/persistence/issue-actions";
import type { IssueResolutionStatus } from "@/lib/persistence/types";

interface IssueResolutionControlProps {
  issueId: string;
  importRunId: string;
  initialStatus: IssueResolutionStatus;
}

/**
 * 'open' <-> 'accepted' is the only transition a reviewer can trigger here.
 * 'resolved' is reserved for a future template-edit flow that doesn't exist
 * yet — it's rendered as a read-only badge, never a clickable button, so
 * this never pretends to fix content it can't actually fix.
 */
export function IssueResolutionControl({ issueId, importRunId, initialStatus }: IssueResolutionControlProps) {
  const [status, setStatus] = useState<IssueResolutionStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(next: Extract<IssueResolutionStatus, "open" | "accepted">) {
    setError(null);
    startTransition(async () => {
      const result = await setIssueResolutionStatus(issueId, next, importRunId);
      if (result.success) {
        setStatus(next);
      } else {
        setError(result.error);
      }
    });
  }

  if (status === "resolved") {
    return (
      <StatusBadge tone="success" icon={Wrench}>
        Resolved via edit
      </StatusBadge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status === "accepted" ? (
        <>
          <StatusBadge tone="success" icon={CheckCircle2}>
            Reviewed
          </StatusBadge>
          <Button variant="ghost" size="sm" onClick={() => apply("open")} disabled={isPending}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
            Mark as open
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => apply("accepted")} disabled={isPending}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
          Mark reviewed
        </Button>
      )}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
