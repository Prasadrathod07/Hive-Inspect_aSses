import Link from "next/link";
import { Compass } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";

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
          <Button asChild>
            <Link href="/">Back to Templates</Link>
          </Button>
        }
        className="mt-12"
      />
    </PageShell>
  );
}
