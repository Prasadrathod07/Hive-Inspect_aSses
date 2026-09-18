/**
 * Builds the ONLY thing ever sent to a language model.
 *
 * The hard rule this file enforces: **no customer template content leaves the
 * server.** Not section names, not item names, not comment text, not raw
 * snippets, not the source filename. What goes out is counts, statuses,
 * category keys, row numbers, and description strings this repository authored
 * itself (`issue-presentation.ts`, and the integrity engine's own summary,
 * which is composed purely from counts).
 *
 * That's a deliberate trade. A model that could read the actual comment text
 * might write a slightly richer explanation — but the thing being explained
 * here is the *integrity result*, which is entirely numeric and categorical.
 * The content adds nothing the model needs, so sending it would be pure risk.
 *
 * Because this is a pure function over deterministic input, the exact payload
 * is unit-testable and asserted against leaks in `audit-payload.test.ts`.
 *
 * THIS IS NOT the migration path. Nothing here feeds back into template data.
 */

import type { IntegrityResult } from "@/lib/integrity/types";
import { classifyIssueGroup, getIssueGroupMeta, ISSUE_GROUP_ORDER } from "@/lib/integrity/issue-presentation";
import type { IssueGroupKey } from "@/lib/integrity/issue-presentation";

/** The subset of an issue the auditor is allowed to know about. */
export interface AuditableIssue {
  id: string;
  category: string;
  severity: string;
  sourceRowNumber: number;
  /** Used only for local grouping. Never copied into the payload. */
  rawSnippet: string;
  /** Used only for local grouping. Never copied into the payload. */
  explanation: string;
}

export interface AuditPayloadIssue {
  id: string;
  category: string;
  group: IssueGroupKey;
  severity: string;
  sourceRowNumber: number;
}

export interface AuditPayloadGroup {
  group: IssueGroupKey;
  label: string;
  /** Our own authored description of the category — never per-issue text. */
  description: string;
  count: number;
}

export interface AuditPayload {
  integrityStatus: IntegrityResult["status"];
  /** The engine's own headline. Composed from counts only. */
  deterministicSummary: string;
  reviewRequired: boolean;
  structure: {
    sections: { source: number; persisted: number; match: boolean };
    items: { source: number; persisted: number; match: boolean };
    comments: { source: number; persisted: number; match: boolean };
  };
  sourceCoverage: {
    meaningfulSourceRows: number;
    mappedRows: number;
    unsupportedRows: number;
    ignoredRowsWithReason: number;
    unaccountedRows: number;
    unaccountedRowNumbers: number[];
  };
  ordering: { status: string; mismatchCount: number };
  textPreservation: { status: string; comparedCount: number; mismatchCount: number };
  links: { sourceLinks: number; preservedLinks: number; mismatchCount: number };
  formattingWarningCount: number;
  structuralWarningCount: number;
  issueGroups: AuditPayloadGroup[];
  issues: AuditPayloadIssue[];
  /** Stated up front so the model explains within them instead of guessing. */
  knownLimitations: string[];
}

/**
 * What this importer genuinely cannot do. Sent to the model so its
 * `limitationsMentioned` are grounded in fact rather than invented, and so it
 * never implies support we don't have.
 */
export const KNOWN_LIMITATIONS: string[] = [
  "Only Spectora's \"Export to spreadsheet → Export HTML Text\" format is supported.",
  "Rich text is limited to an allowlist (bold, italic, underline, line breaks, paragraphs, lists, and http/https links). Anything outside it is removed and recorded as an issue, with the original text kept.",
  "Images, tables, and embedded media cannot be represented and are recorded as unsupported rather than approximated.",
  "Links using schemes other than http/https are removed for safety; their visible text is kept.",
  "A row whose position makes its place in the hierarchy ambiguous is recorded as an issue rather than being guessed into a section or item.",
  "Integrity findings describe this import only. They say nothing about content that was never in the export in the first place.",
];

export function buildAuditPayload(input: {
  integrity: IntegrityResult;
  issues: AuditableIssue[];
}): AuditPayload {
  const { integrity, issues } = input;

  const counts = new Map<IssueGroupKey, number>();
  const payloadIssues: AuditPayloadIssue[] = issues.map((issue) => {
    const group = classifyIssueGroup(issue);
    counts.set(group, (counts.get(group) ?? 0) + 1);
    return {
      id: issue.id,
      category: issue.category,
      group,
      severity: issue.severity,
      sourceRowNumber: issue.sourceRowNumber,
    };
  });

  const issueGroups: AuditPayloadGroup[] = ISSUE_GROUP_ORDER.filter((key) => counts.has(key)).map((key) => {
    const meta = getIssueGroupMeta(key);
    return { group: key, label: meta.label, description: meta.description, count: counts.get(key) ?? 0 };
  });

  return {
    integrityStatus: integrity.status,
    deterministicSummary: integrity.summary,
    reviewRequired: integrity.reviewRequired,
    structure: {
      sections: pickCount(integrity.structure.sections),
      items: pickCount(integrity.structure.items),
      comments: pickCount(integrity.structure.comments),
    },
    sourceCoverage: {
      meaningfulSourceRows: integrity.sourceCoverage.meaningfulSourceRows,
      mappedRows: integrity.sourceCoverage.mappedRows,
      unsupportedRows: integrity.sourceCoverage.unsupportedRows,
      ignoredRowsWithReason: integrity.sourceCoverage.ignoredRowsWithReason,
      unaccountedRows: integrity.sourceCoverage.unaccountedRows,
      unaccountedRowNumbers: integrity.sourceCoverage.unaccountedSourceRefs.map((ref) => ref.rowNumber),
    },
    ordering: {
      status: integrity.ordering.status,
      mismatchCount: integrity.ordering.mismatches.length,
    },
    textPreservation: {
      status: integrity.textPreservation.status,
      comparedCount: integrity.textPreservation.comparedCount,
      mismatchCount: integrity.textPreservation.mismatches.length,
    },
    links: {
      sourceLinks: integrity.links.sourceLinks,
      preservedLinks: integrity.links.preservedLinks,
      mismatchCount: integrity.links.mismatches.length,
    },
    formattingWarningCount: integrity.formattingWarnings.length,
    structuralWarningCount: integrity.structuralWarnings.length,
    issueGroups,
    issues: payloadIssues,
    knownLimitations: KNOWN_LIMITATIONS,
  };
}

function pickCount(count: { source: number; persisted: number; match: boolean }) {
  return { source: count.source, persisted: count.persisted, match: count.match };
}

/** Every issue id the model is permitted to reference. */
export function allowedIssueIds(payload: AuditPayload): string[] {
  return payload.issues.map((issue) => issue.id);
}
