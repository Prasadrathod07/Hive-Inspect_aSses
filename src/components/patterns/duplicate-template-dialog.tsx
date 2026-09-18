"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { duplicateTemplate } from "@/lib/persistence/duplicate-template";
import { deriveCopyName, MAX_TEMPLATE_NAME_LENGTH } from "@/lib/persistence/duplicate-template-validation";

interface DuplicateTemplateButtonProps {
  templateId: string;
  templateName: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}

/**
 * Trigger + dialog for duplicating a template. On success it navigates to
 * the copy, so the user lands in the thing they just made rather than
 * hunting for it on the dashboard.
 *
 * On failure the dialog stays open with the typed name intact — the same
 * "never discard the user's input on a failed write" rule the editor's
 * autosave follows.
 */
export function DuplicateTemplateButton({
  templateId,
  templateName,
  variant = "ghost",
  size = "sm",
}: DuplicateTemplateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setName(deriveCopyName(templateName));
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateTemplate(templateId, name);

      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.independenceVerified) {
        toast.success("Template duplicated", {
          description: `${result.counts.sections} sections, ${result.counts.items} items, ${result.counts.comments} comments copied.`,
        });
      } else {
        // The copy exists, but the post-copy check found something wrong —
        // say so rather than reporting a clean success.
        toast.error("Duplicated, but independence could not be verified", {
          description: result.independenceSummary,
        });
      }

      setOpen(false);
      router.push(`/templates/${result.templateId}`);
    });
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={openDialog}>
        <Copy className="size-4" aria-hidden="true" />
        Duplicate
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate template</DialogTitle>
            <DialogDescription>The copy will be independent of the original.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="duplicate-template-name" className="text-xs font-medium text-text-muted">
              Name for the copy
            </label>
            <input
              id="duplicate-template-name"
              autoFocus
              value={name}
              maxLength={MAX_TEMPLATE_NAME_LENGTH}
              disabled={isPending}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim() && !isPending) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
            />
            <p className="text-xs text-text-muted">
              Editing the copy never changes the original — they share no sections, items, or comments.
            </p>
            {error ? (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending || !name.trim()}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
