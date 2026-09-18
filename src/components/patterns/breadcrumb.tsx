import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbProps {
  /** Ancestors, outermost first. */
  trail: { label: string; href: string }[];
  /** The current page. Not a link — you're already here. */
  current: string;
  icon?: LucideIcon;
  className?: string;
}

/**
 * Where you are, and the way back.
 *
 * Used on pages reached from somewhere else, where a full PageHeader would
 * just repeat a heading the page already shows. Rendered as a real `nav` with
 * an ordered list so assistive tech announces it as navigation rather than as
 * loose text with arrows in it.
 */
export function Breadcrumb({ trail, current, icon: Icon, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {Icon ? (
          <li className="mr-1 flex items-center">
            <Icon className="size-4 text-text-muted" aria-hidden="true" />
          </li>
        ) : null}

        {trail.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1">
            <Link
              href={crumb.href}
              className="rounded-md px-1 py-0.5 font-medium text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {crumb.label}
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-text-muted/60" aria-hidden="true" />
          </li>
        ))}

        <li className="min-w-0">
          <span aria-current="page" className="block truncate px-1 py-0.5 font-medium text-text">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
