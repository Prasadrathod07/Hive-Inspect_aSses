"use client";

import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/patterns/save-status";
import { ViewSource } from "./view-source";
import { useAutosaveField } from "./use-autosave-field";
import type { EditActionResult } from "@/lib/persistence/template-edit-actions";
import type { EditableSourceRef } from "@/lib/persistence/get-editable-template";

interface EditableNameFieldProps {
  fieldKey: string;
  label: string;
  initialValue: string;
  sourceRef: EditableSourceRef;
  save: (value: string) => Promise<EditActionResult>;
  onSaved?: (value: string) => void;
  inputClassName?: string;
}

export function EditableNameField({
  fieldKey,
  label,
  initialValue,
  sourceRef,
  save,
  onSaved,
  inputClassName,
}: EditableNameFieldProps) {
  const { value, onChange, status, error, flush } = useAutosaveField({
    fieldKey,
    initialValue,
    save,
    onSaved,
  });

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldKey} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <input
        id={fieldKey}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        className={
          inputClassName ??
          "h-10 rounded-lg border border-border bg-surface px-3 text-base font-semibold text-text outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        }
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SaveStatus state={status} />
          {status === "error" ? (
            <Button variant="ghost" size="sm" onClick={flush}>
              Retry
            </Button>
          ) : null}
        </div>
        <ViewSource sheet={sourceRef.sheet} rowNumber={sourceRef.rowNumber} />
      </div>
      {status === "error" && error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
