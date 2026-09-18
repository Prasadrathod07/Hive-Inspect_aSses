"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditableSection } from "@/lib/persistence/get-editable-template";
import type { Selection } from "./selection";

interface TemplateTreeProps {
  sections: EditableSection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

/** Left-pane hierarchy nav — sections expand to their items; selecting either drives the main pane. Never both selected at once, so there's no ambiguity about what's being edited. */
export function TemplateTree({ sections, selection, onSelect }: TemplateTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selection ? [selection.sectionId] : [])
  );

  function expand(sectionId: string) {
    setExpanded((prev) => {
      if (prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
  }

  function toggle(sectionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  if (sections.length === 0) {
    return <p className="px-2 py-4 text-sm text-text-muted">No sections in this template.</p>;
  }

  return (
    <nav aria-label="Template sections" className="flex flex-col gap-0.5">
      {sections.map((section) => {
        const isExpanded = expanded.has(section.id);
        const isSectionSelected = selection?.itemId === undefined && selection?.sectionId === section.id;

        return (
          <div key={section.id}>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-label={isExpanded ? `Collapse ${section.name}` : `Expand ${section.name}`}
                aria-expanded={isExpanded}
                className="flex size-6 shrink-0 items-center justify-center text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
              >
                <ChevronRight
                  className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelect({ sectionId: section.id });
                  expand(section.id);
                }}
                aria-current={isSectionSelected ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isSectionSelected
                    ? "bg-accent font-semibold text-primary"
                    : "font-medium text-text hover:bg-surface-muted"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{section.name || "Untitled section"}</span>
                <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">
                  {section.items.length}
                </span>
              </button>
            </div>

            {isExpanded ? (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-border py-0.5 pl-3">
                {section.items.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-text-muted italic">No items</p>
                ) : (
                  section.items.map((item) => {
                    const isItemSelected = selection?.itemId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect({ sectionId: section.id, itemId: item.id })}
                        aria-current={isItemSelected ? "true" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          isItemSelected
                            ? "bg-accent font-medium text-primary"
                            : "text-text-muted hover:bg-surface-muted hover:text-text"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.name || "Untitled item"}</span>
                        {item.comments.length > 0 ? (
                          <span className="shrink-0 text-xs tabular-nums text-text-muted">
                            {item.comments.length}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
