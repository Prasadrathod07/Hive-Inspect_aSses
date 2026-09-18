import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

/** Consistent max-width content column and page gutters, shared by every route. */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  );
}
