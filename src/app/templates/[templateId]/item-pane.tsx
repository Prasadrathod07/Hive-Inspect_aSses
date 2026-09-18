import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { EditableNameField } from "./editable-name-field";
import { CommentEditor } from "./comment-editor";
import type { EditableSection, EditableItem } from "@/lib/persistence/get-editable-template";
import type { Selection } from "./selection";
import { updateItemName, updateCommentContent } from "@/lib/persistence/template-edit-actions";

interface ItemPaneProps {
  templateId: string;
  section: EditableSection;
  item: EditableItem;
  onItemNameSaved: (itemId: string, name: string) => void;
  onSelectSection: (selection: Selection) => void;
}

export function ItemPane({ templateId, section, item, onItemNameSaved, onSelectSection }: ItemPaneProps) {
  // Stable identity across re-renders — see section-pane.tsx for why.
  const saveItemName = useCallback(
    (name: string) => updateItemName(templateId, item.id, name),
    [templateId, item.id]
  );
  const handleSaved = useCallback((name: string) => onItemNameSaved(item.id, name), [onItemNameSaved, item.id]);

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => onSelectSection({ sectionId: section.id })}
        className="flex w-fit items-center gap-1 rounded-md text-xs font-medium text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {section.name || "Untitled section"}
        <ChevronRight className="size-3" aria-hidden="true" />
        <span className="text-text">{item.name || "Untitled item"}</span>
      </button>

      <EditableNameField
        fieldKey={`item:${item.id}:name`}
        label="Item name"
        initialValue={item.name}
        sourceRef={item.sourceRef}
        save={saveItemName}
        onSaved={handleSaved}
        inputClassName="h-10 rounded-lg border border-border bg-surface px-3 text-base font-semibold text-text outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50"
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-text">
          Comments ({item.comments.length})
        </h2>
        {item.comments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-muted">
            This item has no comments.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {item.comments.map((comment) => (
              <CommentEditor
                key={comment.id}
                fieldKey={`comment:${comment.id}:html`}
                initialHtml={comment.safeHtml}
                initialPlainText={comment.plainText}
                sourceRef={comment.sourceRef}
                save={(html) => updateCommentContent(templateId, comment.id, html)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
