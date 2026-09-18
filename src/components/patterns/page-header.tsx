import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

/** Title + description + actions row used at the top of every workspace page. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          ) : null}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-text">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm text-text-muted">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
