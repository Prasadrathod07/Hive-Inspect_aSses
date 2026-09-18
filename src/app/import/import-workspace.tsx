"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  FileSearch,
  ListChecks,
  DatabaseZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/patterns/error-state";
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE_BYTES, SUPPORTED_EXTENSIONS } from "@/lib/import/validate-file";
import type { ImportResult } from "@/lib/persistence/types";

type Stage = "idle" | "file-selected" | "uploading" | "processing" | "completed" | "failed";

interface State {
  stage: Stage;
  file: File | null;
  fileError: string | null;
  uploadProgress: number;
  serverError: string | null;
  result: Extract<ImportResult, { success: true }> | null;
}

const INITIAL_STATE: State = {
  stage: "idle",
  file: null,
  fileError: null,
  uploadProgress: 0,
  serverError: null,
  result: null,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Instant client-side feedback only — the server (validate-file.ts) is the real, authoritative check. */
function validateFileClientSide(file: File): string | null {
  if (file.size === 0) return "This file is empty.";
  const lowerName = file.name.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return `Unsupported file type. Expected ${SUPPORTED_EXTENSIONS.join(" or ")}, got "${file.name}".`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `This file is ${formatFileSize(file.size)}, which exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`;
  }
  return null;
}

function uploadFile(file: File, onProgress: (percent: number) => void): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as ImportResult);
      } catch {
        reject(new Error("The server returned an unexpected response. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Could not reach the server. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

const PROCESSING_STAGES = [
  { label: "Validating structure", icon: FileSearch },
  { label: "Parsing sections, items, and comments", icon: ListChecks },
  { label: "Preserving your template", icon: DatabaseZap },
  { label: "Verifying nothing was lost", icon: ShieldCheck },
];

export function ImportWorkspace() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(INITIAL_STATE);
  const [isDragOver, setIsDragOver] = useState(false);
  const busy = state.stage === "uploading" || state.stage === "processing";

  const selectFile = useCallback((file: File) => {
    const fileError = validateFileClientSide(file);
    setState({ ...INITIAL_STATE, stage: "file-selected", file, fileError });
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) selectFile(file);
      event.target.value = ""; // allow re-selecting the same file later
    },
    [selectFile]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      if (busy) return;
      const file = event.dataTransfer.files?.[0];
      if (file) selectFile(file);
    },
    [busy, selectFile]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const startImport = useCallback(async () => {
    if (!state.file || state.fileError) return;
    const file = state.file;

    setState((prev) => ({ ...prev, stage: "uploading", uploadProgress: 0, serverError: null }));

    try {
      const result = await uploadFile(file, (percent) => {
        setState((prev) => (prev.stage === "uploading" ? { ...prev, uploadProgress: percent } : prev));
      });

      setState((prev) => ({ ...prev, stage: "processing" }));

      if (result.success) {
        setState((prev) => ({ ...prev, stage: "completed", result }));
        toast.success("Template imported", { description: result.integritySummary });
        setTimeout(() => router.push(`/templates/${result.templateId}/import-report`), 900);
      } else {
        setState((prev) => ({ ...prev, stage: "failed", serverError: result.error }));
        toast.error("Import failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setState((prev) => ({ ...prev, stage: "failed", serverError: message }));
      toast.error("Import failed");
    }
  }, [state.file, state.fileError, router]);

  if (state.stage === "failed") {
    return (
      <ErrorState
        title="Import failed"
        description={state.serverError ?? "Something went wrong. Please try again."}
        onRetry={reset}
        retryLabel="Choose a different file"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ExpectationsCard />

      {state.stage === "idle" ? (
        <Dropzone
          isDragOver={isDragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onBrowse={() => inputRef.current?.click()}
          inputRef={inputRef}
          onInputChange={onInputChange}
        />
      ) : (
        <SelectedFilePanel
          state={state}
          onRemove={reset}
          onImport={startImport}
          onChooseAnother={() => inputRef.current?.click()}
          inputRef={inputRef}
          onInputChange={onInputChange}
        />
      )}
    </div>
  );
}

function ExpectationsCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">What we support</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-text-muted">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Spectora&apos;s &quot;Export to spreadsheet → Export HTML Text&quot; file (.xlsx or .xls)
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Plain text, preserved exactly
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Section, item, and comment hierarchy, in source order
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Basic rich text (bold, italic, underline, lists) and links
        </li>
      </ul>
      <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-text-muted">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        Anything we can&apos;t support — images, tables, embedded video, unusual formatting — is never
        silently dropped. It&apos;s preserved as text where possible and always shown for your review.
      </p>
    </div>
  );
}

interface DropzoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Dropzone({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  inputRef,
  onInputChange,
}: DropzoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a Spectora export file. Drag and drop, or press Enter to choose a file."
      onClick={onBrowse}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onBrowse();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center outline-none transition-colors cursor-pointer",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        isDragOver ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-muted"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={onInputChange}
        tabIndex={-1}
      />
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
        <UploadCloud className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text">Drag and drop your file here</p>
        <p className="text-sm text-text-muted">or click to browse — .xlsx or .xls, up to 20MB</p>
      </div>
    </div>
  );
}

interface SelectedFilePanelProps {
  state: State;
  onRemove: () => void;
  onImport: () => void;
  onChooseAnother: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function SelectedFilePanel({
  state,
  onRemove,
  onImport,
  onChooseAnother,
  inputRef,
  onInputChange,
}: SelectedFilePanelProps) {
  const { stage, file, fileError, uploadProgress, result } = state;
  if (!file) return null;
  const busy = stage === "uploading" || stage === "processing";

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={onInputChange}
        tabIndex={-1}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-text">{file.name}</span>
            <span className="text-xs text-text-muted">{formatFileSize(file.size)}</span>
          </div>
        </div>
        {!busy && stage !== "completed" ? (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove file">
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {fileError ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {fileError}
        </p>
      ) : null}

      {stage === "uploading" ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-text-muted">Uploading… {uploadProgress}%</span>
        </div>
      ) : null}

      {stage === "processing" ? (
        <ul className="flex flex-col gap-2" aria-live="polite" aria-label="Processing your import">
          {PROCESSING_STAGES.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-2 text-sm text-text-muted">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {label}
              <Loader2 className="size-3.5 shrink-0 animate-spin text-text-muted" aria-hidden="true" />
            </li>
          ))}
        </ul>
      ) : null}

      {stage === "completed" && result ? (
        <div className="flex items-center gap-2 text-sm text-success" aria-live="polite">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Imported — {result.integritySummary} Redirecting to the import report…
        </div>
      ) : null}

      {stage === "file-selected" ? (
        <div className="flex items-center gap-2">
          <Button onClick={onImport} disabled={Boolean(fileError)}>
            <UploadCloud className="size-4" aria-hidden="true" />
            Import template
          </Button>
          <Button variant="outline" onClick={onChooseAnother}>
            Choose a different file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
