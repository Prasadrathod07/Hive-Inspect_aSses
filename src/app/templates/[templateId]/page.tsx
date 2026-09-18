import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { getEditableTemplate } from "@/lib/persistence/get-editable-template";
import { TemplateEditor } from "./template-editor";

// Edits happen server-side and change the DB constantly — never serve a
// build-time snapshot of a template.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/templates/[templateId]">): Promise<Metadata> {
  const { templateId } = await params;
  const template = await getEditableTemplate(templateId).catch(() => null);
  return { title: template ? template.name : "Template" };
}

export default async function TemplateEditorPage({
  params,
}: PageProps<"/templates/[templateId]">) {
  const { templateId } = await params;

  let template;
  try {
    template = await getEditableTemplate(templateId);
  } catch (error) {
    return (
      <PageShell>
        <PageHeader title="Template editor" icon={FileText} backHref="/" backLabel="Templates" />
        <SectionCard
          title="Couldn't load this template"
          description={error instanceof Error ? error.message : "An unexpected error occurred."}
        />
      </PageShell>
    );
  }

  if (!template) notFound();

  return (
    <PageShell className="max-w-7xl">
      <PageHeader
        title="Template editor"
        description="Edit section names, item names, and comment text. Changes save automatically."
        icon={FileText}
        backHref="/"
        backLabel="Templates"
      />
      <TemplateEditor template={template} />
    </PageShell>
  );
}
