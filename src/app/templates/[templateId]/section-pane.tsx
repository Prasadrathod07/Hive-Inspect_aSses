import { useCallback } from "react";
import { EditableNameField } from "./editable-name-field";
import type { EditableSection } from "@/lib/persistence/get-editable-template";
import type { Selection } from "./selection";
import { updateSectionName } from "@/lib/persistence/template-edit-actions";

interface SectionPaneProps {
  templateId: string;
  section: EditableSection;
  onSectionNameSaved: (sectionId: string, name: string) => void;
  onSelectItem: (selection: Selection) => void;
}

export function SectionPane({ templateId, section, onSectionNameSaved, onSelectItem }: SectionPaneProps) {
  // Stable identity across re-renders (not a new closure every render) —
  // avoids needlessly re-triggering the autosave hook's registration effect.
  const saveSectionName = useCallback(
    (name: string) => updateSectionName(templateId, section.id, name),
    [templateId, section.id]
  );
  const handleSaved = useCallback(
    (name: string) => onSectionNameSaved(section.id, name),
    [onSectionNameSaved, section.id]
  );

  return (
    <div className="flex flex-col gap-6">
      <EditableNameField
        fieldKey={`section:${section.id}:name`}
        label="Section name"
        initialValue={section.name}
        sourceRef={section.sourceRef}
        save={saveSectionName}
        onSaved={handleSaved}
        inputClassName="h-11 rounded-lg border border-border bg-surface px-3 text-lg font-semibold text-text outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50"
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-text">Items ({section.items.length})</h2>
        {section.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-muted">
            This section has no items.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem({ sectionId: section.id, itemId: item.id })}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-text outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="truncate">{item.name || "Untitled item"}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {item.comments.length} comment{item.comments.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
