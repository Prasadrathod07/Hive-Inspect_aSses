import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one content-column definition in the app.
 *
 * Exported so `AppHeader` uses the literal same value: when these drifted
 * apart, the header's logo no longer lined up with the page content beneath
 * it on wider routes, which reads as sloppiness before anyone can say why.
 */
export const CONTENT_WIDTH = "mx-auto w-full max-w-6xl px-6 lg:px-8";

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

/** Consistent max-width content column and page gutters, shared by every route. */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn(CONTENT_WIDTH, "flex flex-col gap-6 py-8", className)}>
      {children}
    </div>
  );
}
