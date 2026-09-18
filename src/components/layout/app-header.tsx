"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hexagon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTENT_WIDTH } from "./page-shell";
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
      <div className={cn(CONTENT_WIDTH, "flex h-14 items-center justify-between")}>
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

        {/* Omitted on /import itself — the page's own primary action already
            is this, so repeating it in the header would be pure noise. */}
        {isActive(pathname, "/import") ? null : (
          <Button asChild>
            <Link href="/import">
              <Upload className="size-4" aria-hidden="true" />
              Import template
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
