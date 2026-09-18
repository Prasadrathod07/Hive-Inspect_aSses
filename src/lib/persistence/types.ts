import type { IntegrityStatus } from "@/lib/integrity/types";

export interface ImportSuccessResult {
  success: true;
  templateId: string;
  importRunId: string;
  counts: { sections: number; items: number; comments: number };
  issueCount: number;
  integrityStatus: IntegrityStatus;
  integritySummary: string;
}

export interface ImportFailureResult {
  success: false;
  /** null only in the (should-be-impossible) case where even the failure-record insert itself failed. */
  importRunId: string | null;
  error: string;
  issueCount: number;
}

export type ImportResult = ImportSuccessResult | ImportFailureResult;

export type IssueResolutionStatus = "open" | "accepted" | "resolved";
