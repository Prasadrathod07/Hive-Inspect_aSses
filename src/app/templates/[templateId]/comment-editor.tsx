"use client";

import { useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/patterns/save-status";
import { ViewSource } from "./view-source";
import { useAutosaveField } from "./use-autosave-field";
import type { EditActionResult } from "@/lib/persistence/template-edit-actions";
import type { EditableSourceRef } from "@/lib/persistence/get-editable-template";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ active, disabled, label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection/focus while clicking
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-accent text-primary" : "text-text-muted hover:bg-surface-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-3.5" aria-hidden="true" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" aria-hidden="true" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label={editor.isActive("link") ? "Remove link" : "Add link"}
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          setLinkUrl("");
          setLinkPromptOpen(true);
        }}
      >
        <LinkIcon className="size-3.5" aria-hidden="true" />
      </ToolbarButton>

      {linkPromptOpen ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const url = linkUrl.trim();
            if (url) editor.chain().focus().setLink({ href: url }).run();
            setLinkPromptOpen(false);
          }}
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLinkPromptOpen(false);
            }}
            placeholder="https://…"
            aria-label="Link URL"
            className="h-6 w-40 rounded border border-border bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
          />
          <Button type="submit" size="icon-xs" variant="ghost" aria-label="Confirm link">
            <Check className="size-3" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Cancel"
            onClick={() => setLinkPromptOpen(false)}
          >
            <X className="size-3" aria-hidden="true" />
          </Button>
        </form>
      ) : null}
    </div>
  );
}

interface CommentEditorProps {
  fieldKey: string;
  initialHtml: string | null;
  initialPlainText: string;
  sourceRef: EditableSourceRef;
  save: (html: string) => Promise<EditActionResult>;
}

/**
 * A small, reliable Tiptap setup scoped to exactly what the server sanitizer
 * allows (src/lib/import/rich-content.ts): bold, italic, underline, lists,
 * links. Headings/blockquotes/code/strike/horizontal rules are disabled so
 * the toolbar never offers formatting the server would silently strip.
 */
export function CommentEditor({ fieldKey, initialHtml, initialPlainText, sourceRef, save }: CommentEditorProps) {
  const initialContent = initialHtml ?? (initialPlainText ? `<p>${escapeHtml(initialPlainText)}</p>` : "<p></p>");

  const { onChange, status, error, flush } = useAutosaveField({
    fieldKey,
    initialValue: initialContent,
    save,
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "min-h-24 px-3 py-2.5 text-sm text-text outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_p]:mb-1.5 last:[&_p]:mb-0",
      },
    },
    onUpdate: ({ editor: updated }) => {
      onChange(updated.getHTML());
    },
    onBlur: () => {
      flush();
    },
  });

  if (!editor) {
    return <div className="h-32 animate-pulse rounded-lg border border-border bg-surface-muted" />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-lg border border-border bg-surface focus-within:border-primary">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
