import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle, HelpCircle } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/patterns/status-badge";
import type { IntegrityStatus } from "@/lib/integrity/types";

const STATUS_PRESENTATION: Record<
  IntegrityStatus,
  { label: string; tone: StatusTone; icon: typeof CheckCircle2 }
> = {
  verified: { label: "Verified", tone: "success", icon: CheckCircle2 },
  verified_with_warnings: { label: "Verified with warnings", tone: "warning", icon: AlertTriangle },
  review_required: { label: "Review required", tone: "destructive", icon: ShieldAlert },
  failed: { label: "Failed", tone: "destructive", icon: XCircle },
};

interface IntegrityStatusBadgeProps {
  status: IntegrityStatus | null;
  className?: string;
}

/** Consistent status → tone/icon/label mapping, shared by the dashboard and the import report. */
export function IntegrityStatusBadge({ status, className }: IntegrityStatusBadgeProps) {
  if (!status) {
    return (
      <StatusBadge tone="neutral" icon={HelpCircle} className={className}>
        No integrity result
      </StatusBadge>
    );
  }

  const { label, tone, icon } = STATUS_PRESENTATION[status];
  return (
    <StatusBadge tone={tone} icon={icon} className={className}>
      {label}
    </StatusBadge>
  );
}

/**
 * The report page's top banner uses a simpler 3-phrase vocabulary than the
 * 4-status detail panel below it — "verified" and "verified_with_warnings"
 * both collapse to "Import complete" (the import DID complete; the panel
 * is where warnings get their own detail), but the tone still distinguishes
 * a pristine import from one with caveats.
 */
export function getImportHeadline(status: IntegrityStatus): { text: string; tone: StatusTone } {
  switch (status) {
    case "verified":
      return { text: "Import complete", tone: "success" };
    case "verified_with_warnings":
      return { text: "Import complete", tone: "warning" };
    case "review_required":
      return { text: "Import needs review", tone: "destructive" };
    case "failed":
      return { text: "Import failed", tone: "destructive" };
  }
}
