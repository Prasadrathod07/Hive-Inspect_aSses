import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { toAppError } from "@/lib/errors/app-error";
import { PageHeader } from "@/components/patterns/page-header";
import { Breadcrumb } from "@/components/patterns/breadcrumb";
import { ErrorState } from "@/components/patterns/error-state";
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
        <ErrorState
          title="Couldn't load this template"
          error={toAppError(error, "TemplateEditorPage")}
        />
      </PageShell>
    );
  }

  if (!template) notFound();

  return (
    <PageShell className="gap-4">
      {/* Just the trail back. The editor's own sticky bar carries the
          template's identity and save state, so a second heading here would
          only repeat it. */}
      <Breadcrumb
        trail={[{ label: "Templates", href: "/" }]}
        current={template.name}
        icon={FileText}
      />
      <TemplateEditor template={template} />
    </PageShell>
  );
}
