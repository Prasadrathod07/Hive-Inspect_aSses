import Link from "next/link";
import { Compass } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/patterns/empty-state";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <PageShell>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground outline-none transition-all hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Back to Templates
          </Link>
        }
        className="mt-12"
      />
    </PageShell>
  );
}
