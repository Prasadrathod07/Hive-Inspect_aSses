"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorSession, type FieldSaveState } from "./editor-session";
import type { EditActionResult } from "@/lib/persistence/template-edit-actions";

interface UseAutosaveFieldParams {
  fieldKey: string;
  initialValue: string;
  save: (value: string) => Promise<EditActionResult>;
  debounceMs?: number;
  /** Called only after a confirmed successful save — e.g. to update a sidebar label once the name is actually persisted, not on every keystroke. */
  onSaved?: (value: string) => void;
}

interface UseAutosaveFieldResult {
  value: string;
  onChange: (next: string) => void;
  status: FieldSaveState;
  error: string | null;
  /** Saves immediately, bypassing the debounce — used by Cmd/Ctrl+S and a manual retry. */
  flush: () => void;
}

/**
 * Debounced autosave for one field (a section/item name, or a comment's
 * HTML). Registers itself with the page's EditorSessionProvider so Cmd/Ctrl+S
 * flushes it and its status feeds the top-bar aggregate.
 *
 * On save failure, `value` is never rolled back or cleared — the user's
 * edit stays exactly as typed, and `status` becomes "error" so the UI can
 * show it without losing anything.
 */
export function useAutosaveField({
  fieldKey,
  initialValue,
  save,
  debounceMs = 800,
  onSaved,
}: UseAutosaveFieldParams): UseAutosaveFieldResult {
  const { registerFlush, unregisterFlush, reportStatus } = useEditorSession();

  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<FieldSaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(initialValue);
  const savedValueRef = useRef(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (valueRef.current === savedValueRef.current) return;

    const valueToSave = valueRef.current;
    setStatus("saving");

    // Defense in depth: a `save` that rejects/throws instead of resolving
    // with { success: false } must still resolve to a visible "error" state
    // here — never leave the UI stuck on "Saving…" forever.
    let result: EditActionResult;
    try {
      result = await save(valueToSave);
    } catch (caught) {
      result = { success: false, error: caught instanceof Error ? caught.message : "Something went wrong." };
    }

    if (result.success) {
      savedValueRef.current = valueToSave;
      setStatus(valueRef.current === valueToSave ? "saved" : "unsaved"); // value may have changed again mid-save
      setError(null);
      onSavedRef.current?.(valueToSave);
    } else {
      setStatus("error");
      setError(result.error);
    }
  }, [save]);

  // Deliberately one effect, not two: registering the flush callback and
  // reporting status must always happen together. Splitting them let a
  // re-render that only changes `flush`'s identity (e.g. an inline `save`
  // prop from a parent re-render) unregister-then-reregister the flush
  // callback without re-reporting the current status, silently dropping
  // this field out of the top-bar aggregate.
  useEffect(() => {
    registerFlush(fieldKey, flush);
    reportStatus(fieldKey, status);
    return () => unregisterFlush(fieldKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey, flush, status]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onChange = useCallback(
    (next: string) => {
      valueRef.current = next;
      setValue(next);
      setStatus(next === savedValueRef.current ? "idle" : "unsaved");
      if (timerRef.current) clearTimeout(timerRef.current);
      if (next !== savedValueRef.current) {
        timerRef.current = setTimeout(flush, debounceMs);
      }
    },
    [flush, debounceMs]
  );

  return { value, onChange, status, error, flush };
}
