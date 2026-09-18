"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

export type FieldSaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

interface EditorSessionContextValue {
  registerFlush: (key: string, flush: () => void) => void;
  unregisterFlush: (key: string) => void;
  reportStatus: (key: string, status: FieldSaveState) => void;
}

const EditorSessionContext = createContext<EditorSessionContextValue | null>(null);

function computeAggregate(statuses: FieldSaveState[]): FieldSaveState {
  if (statuses.some((s) => s === "saving")) return "saving";
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "unsaved")) return "unsaved";
  if (statuses.some((s) => s === "saved")) return "saved";
  return "idle";
}

interface EditorSessionProviderProps {
  children: ReactNode;
  onAggregateChange: (status: FieldSaveState) => void;
}

/**
 * Coordinates every autosaving field on the page: a registry of "flush now"
 * callbacks (for Cmd/Ctrl+S), and a status registry whose aggregate drives
 * the top-bar save indicator — "saving" if anything is saving, else "error"
 * if anything failed, else "unsaved" if anything is dirty, else "saved".
 */
export function EditorSessionProvider({ children, onAggregateChange }: EditorSessionProviderProps) {
  const flushRegistry = useRef(new Map<string, () => void>());
  const statusRegistry = useRef(new Map<string, FieldSaveState>());
  const onAggregateChangeRef = useRef(onAggregateChange);
  useEffect(() => {
    onAggregateChangeRef.current = onAggregateChange;
  }, [onAggregateChange]);

  const recompute = useCallback(() => {
    onAggregateChangeRef.current(computeAggregate([...statusRegistry.current.values()]));
  }, []);

  const registerFlush = useCallback((key: string, flush: () => void) => {
    flushRegistry.current.set(key, flush);
  }, []);

  const unregisterFlush = useCallback(
    (key: string) => {
      flushRegistry.current.delete(key);
      statusRegistry.current.delete(key);
      recompute();
    },
    [recompute]
  );

  const reportStatus = useCallback(
    (key: string, status: FieldSaveState) => {
      statusRegistry.current.set(key, status);
      recompute();
    },
    [recompute]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSaveShortcut) return;
      event.preventDefault();
      flushRegistry.current.forEach((flush) => flush());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <EditorSessionContext.Provider value={{ registerFlush, unregisterFlush, reportStatus }}>
      {children}
    </EditorSessionContext.Provider>
  );
}

export function useEditorSession(): EditorSessionContextValue {
  const ctx = useContext(EditorSessionContext);
  if (!ctx) throw new Error("useEditorSession must be used within an EditorSessionProvider.");
  return ctx;
}
