"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/patterns/save-status";
import { DuplicateTemplateButton } from "@/components/patterns/duplicate-template-dialog";
import { EditorSessionProvider, type FieldSaveState } from "./editor-session";
import { TemplateTree } from "./template-tree";
import { SectionPane } from "./section-pane";
import { ItemPane } from "./item-pane";
import type { Selection } from "./selection";
import type { EditableTemplate, EditableSection } from "@/lib/persistence/get-editable-template";

interface TemplateEditorProps {
  template: EditableTemplate;
}

export function TemplateEditor({ template }: TemplateEditorProps) {
  const [sections, setSections] = useState<EditableSection[]>(template.sections);
  const [selection, setSelection] = useState<Selection>(
    template.sections[0] ? { sectionId: template.sections[0].id } : null
  );
  const [saveState, setSaveState] = useState<FieldSaveState>("idle");

  const handleSectionNameSaved = useCallback((sectionId: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, name } : s)));
  }, []);

  const handleItemNameSaved = useCallback((itemId: string, name: string) => {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === itemId ? { ...i, name } : i)),
      }))
    );
  }, []);

  const activeSection = useMemo(
    () => (selection ? sections.find((s) => s.id === selection.sectionId) ?? null : null),
    [sections, selection]
  );
  const activeItem = useMemo(
    () => (selection?.itemId ? activeSection?.items.find((i) => i.id === selection.itemId) ?? null : null),
    [activeSection, selection]
  );

  return (
    <EditorSessionProvider onAggregateChange={setSaveState}>
      <div className="flex flex-col gap-4">
        {/* Sticky: save status is the one thing that must never scroll out of
            sight while editing, since it's the only signal that work is safe. */}
        <div className="sticky top-14 z-30 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-background/95 px-1 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base font-semibold text-text">{template.name}</h1>
            <p className="truncate text-xs text-text-muted">{template.sourceFilename}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SaveStatus state={saveState} className="mr-1" />
            {template.importRunId ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/templates/${template.id}/import-report`}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Import report
                </Link>
              </Button>
            ) : null}
            <DuplicateTemplateButton templateId={template.id} templateName={template.name} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-border bg-surface lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-border bg-surface px-3 py-2">
              <h2 className="text-xs font-semibold tracking-wide text-text-muted uppercase">Hierarchy</h2>
              <span className="text-xs tabular-nums text-text-muted">
                {sections.length} section{sections.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="p-2">
              <TemplateTree sections={sections} selection={selection} onSelect={setSelection} />
            </div>
          </aside>

          <main className="min-w-0 rounded-xl border border-border bg-surface p-5">
            {activeItem && activeSection ? (
              <ItemPane
                templateId={template.id}
                section={activeSection}
                item={activeItem}
                onItemNameSaved={handleItemNameSaved}
                onSelectSection={setSelection}
              />
            ) : activeSection ? (
              <SectionPane
                templateId={template.id}
                section={activeSection}
                onSectionNameSaved={handleSectionNameSaved}
                onSelectItem={setSelection}
              />
            ) : (
              <p className="text-sm text-text-muted">This template has no sections yet.</p>
            )}
          </main>
        </div>
      </div>
    </EditorSessionProvider>
  );
}
