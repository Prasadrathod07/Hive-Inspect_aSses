"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewSourceProps {
  sheet: string;
  rowNumber: number;
  className?: string;
}

/** Subtle, click-to-reveal origin locator — collapsed by default so it never competes with the primary editing surface. */
export function ViewSource({ sheet, rowNumber, className }: ViewSourceProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      title="View source"
      aria-expanded={revealed}
      className={cn(
        "inline-flex items-center gap-1 rounded-md text-xs text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
    >
      <MapPin className="size-3" aria-hidden="true" />
      {revealed ? `${sheet} · row ${rowNumber}` : "View source"}
    </button>
  );
}
