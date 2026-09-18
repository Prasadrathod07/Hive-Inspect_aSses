import { UploadCloud } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { ImportWorkspace } from "./import-workspace";

export const metadata = {
  title: "Import template",
};

export default function ImportPage() {
  return (
    <PageShell>
      <PageHeader
        title="Import from Spectora"
        description="Upload the HTML-text spreadsheet exported from Spectora."
        icon={UploadCloud}
        backHref="/"
        backLabel="Templates"
      />

      <ImportWorkspace />
    </PageShell>
  );
}
