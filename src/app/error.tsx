"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { ErrorState } from "@/components/patterns/error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred while rendering this page. Your data has not been modified."
        onRetry={reset}
      />
    </PageShell>
  );
}
