import { MAX_FILE_SIZE_BYTES } from "@/lib/import/validate-file";

/**
 * Centralized, typed failure model.
 *
 * Two audiences, two levels of detail, and they must not be confused:
 *
 *   - The PERSON gets `message` + `recovery`: what went wrong in their terms,
 *     and what they can do about it. Safe to render anywhere, including on a
 *     public unauthenticated deployment.
 *   - The OPERATOR gets the original error, written to the server log by
 *     `toAppError`. Stack traces, Postgres detail, and configuration hints
 *     stay there and never reach the browser.
 *
 * This exists because the app is deployed publicly with no auth (decision-log
 * D6). Before this, a misconfigured server told every anonymous visitor
 * exactly which environment variables were missing.
 */

export type AppErrorCode =
  /** 1. The upload isn't a spreadsheet we accept. */
  | "unsupported_file_type"
  /** 2. Zero bytes, or a workbook with nothing in it. */
  | "empty_file"
  /** File exceeded the size ceiling. */
  | "file_too_large"
  /** Named like a spreadsheet, but the bytes aren't one. */
  | "unreadable_workbook"
  /** 3. Readable spreadsheet, but no recognizable section/item/comment layout. */
  | "unrecognized_structure"
  /** 7. The atomic write to Postgres failed — nothing partial survives. */
  | "persistence_failed"
  /** 8. Duplication failed — no partial copy survives. */
  | "duplication_failed"
  /** 9. An edit could not be saved. The local edit is never discarded. */
  | "save_failed"
  /** Server is missing credentials/schema. Detail is for the operator only. */
  | "not_configured"
  /**
   * 10. Reserved for the optional AI auditor (docs/architecture.md §7, §2.10).
   * Nothing produces this yet because no AI code exists — it's here so the
   * contract is explicit: an AI outage is a normal, recoverable, non-blocking
   * failure of an explanatory layer, never of import/edit/duplicate.
   */
  | "ai_unavailable"
  /** Anything unclassified. Never carries the original message. */
  | "unexpected";

export interface AppError {
  code: AppErrorCode;
  /** Safe for any audience. Never contains internal detail. */
  message: string;
  /** Concretely what the person can do next. */
  recovery: string;
  /** Whether retrying the same action could plausibly succeed. */
  retryable: boolean;
}

const CATALOG: Record<AppErrorCode, Omit<AppError, "code">> = {
  unsupported_file_type: {
    message: "That file isn't a supported spreadsheet.",
    recovery: "Export your template from Spectora as a spreadsheet (.xlsx or .xls) and upload that file.",
    retryable: true,
  },
  empty_file: {
    message: "That file is empty.",
    recovery: "Check the export completed in Spectora, then upload it again.",
    retryable: true,
  },
  file_too_large: {
    message: `That file is larger than the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`,
    recovery: "Re-export the template on its own, without any extra sheets or embedded media.",
    retryable: true,
  },
  unreadable_workbook: {
    message: "That file is named like a spreadsheet, but its contents couldn't be read as one.",
    recovery: "Re-export from Spectora rather than renaming an existing file, then try again.",
    retryable: true,
  },
  unrecognized_structure: {
    message: "We couldn't find a section, item, and comment layout in that spreadsheet.",
    recovery:
      'Use Spectora\'s "Export to spreadsheet → Export HTML Text" option — other exports don\'t carry the structure we need. Nothing was imported.',
    retryable: true,
  },
  persistence_failed: {
    message: "The import couldn't be saved.",
    recovery: "Nothing partial was stored, so it's safe to try the import again.",
    retryable: true,
  },
  duplication_failed: {
    message: "The template couldn't be duplicated.",
    recovery: "No partial copy was created, and the original is untouched. Try again.",
    retryable: true,
  },
  save_failed: {
    message: "That change couldn't be saved.",
    recovery: "Your edit is still here and hasn't been lost. Try saving again.",
    retryable: true,
  },
  not_configured: {
    message: "This workspace isn't finished setting up yet.",
    recovery: "Nothing you did caused this. If it persists, the server needs attention.",
    retryable: false,
  },
  ai_unavailable: {
    message: "The plain-language explanation isn't available right now.",
    recovery: "The integrity results below are unaffected — they're computed without AI.",
    retryable: true,
  },
  unexpected: {
    message: "Something went wrong.",
    recovery: "Nothing was changed. Try again, and if it keeps happening the server needs attention.",
    retryable: true,
  },
};

export function appError(code: AppErrorCode): AppError {
  return { code, ...CATALOG[code] };
}

/**
 * Recognizes the failures we can name from an error's own text. Deliberately
 * narrow — anything unrecognized becomes the caller's fallback code rather
 * than being guessed at, so a surprise never gets a confidently wrong label.
 */
function classify(error: unknown): AppErrorCode | null {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!text) return null;

  if (/credentials are not configured|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/i.test(text)) {
    return "not_configured";
  }
  // PostgREST reports a missing table/function this way when migrations
  // haven't been applied — an operator problem, not a user one.
  if (/does not exist|schema cache|relation .* does not exist/i.test(text)) {
    return "not_configured";
  }
  return null;
}

/**
 * Converts anything thrown into a safe AppError, and writes the original to
 * the server log so the detail isn't lost — just not shown.
 *
 * `context` is a short label for the log line (e.g. "listTemplateSummaries").
 */
export function toAppError(error: unknown, context: string, fallback: AppErrorCode = "unexpected"): AppError {
  console.error(`[${context}]`, error);
  return appError(classify(error) ?? fallback);
}

/** Convenience for surfaces that show one line: "Message Recovery". */
export function formatAppError(error: AppError): string {
  return `${error.message} ${error.recovery}`;
}
