"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hexagon, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Templates" },
  { href: "/import", label: "Import" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-backdrop-filter:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Hexagon
              className="size-5 fill-primary/10 text-primary"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-text">
                Hive Template Migrator
              </span>
              <span className="hidden text-xs text-text-muted sm:inline">
                Spectora template migration workspace
              </span>
            </span>
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? "bg-accent text-primary"
                      : "text-text-muted hover:bg-surface-muted hover:text-text"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <Link
          href="/import"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground outline-none transition-all hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Upload className="size-4" aria-hidden="true" />
          Import template
        </Link>
      </div>
    </header>
  );
}
